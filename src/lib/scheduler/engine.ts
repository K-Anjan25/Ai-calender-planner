import {
  SNAP_MINUTES,
  type BusyEvent,
  type Pin,
  type PlacedBlock,
  type PlanProposal,
  type Preferences,
  type Reason,
  type Task,
  type Weekday,
} from '@/lib/types'
import {
  buildFreeSlots,
  buildWeekFrame,
  clamp,
  fmtDuration,
  minutesOfIso,
  overlaps,
  staticOccupancy,
  workingHoursFor,
  type FreeSlot,
  type WeekFrame,
} from '@/lib/scheduler/slots'
import {
  MAX_MERGED_MINUTES,
  absMinuteOf,
  chunkTask,
  contiguitySignal,
  criticalRatio,
  dayBalanceSignal,
  deadlineFitSignal,
  fragmentationSignal,
  occurrenceDays,
  orderTasks,
  reasonLabel,
  rhythmSignal,
  totalDemandMinutes,
  scorePlacement,
  type Chunk,
  type OrderingContext,
} from '@/lib/scheduler/policies'
import { repairPlan } from '@/lib/scheduler/conflicts'
import { evaluatePlan } from '@/lib/scheduler/score'

/**
 * The placement engine — `ARCHITECTURE.md` §5.1 stages 2–3.
 *
 * Deterministic by construction (INV-7): no clock reads, no RNG, total tie-breaks. It never mutates
 * its inputs, and it never silently drops work: anything it cannot place is reported by `evaluatePlan`
 * with the minutes it lost (INV-6).
 */

export type GenerateInput = {
  tasks: Task[]
  preferences: Preferences
  busy: BusyEvent[]
  pins: Pin[]
  /** ISO instant used for urgency maths — injected so the engine stays pure (RULES.md L6). */
  nowISO: string
  weekStartDate: string
  engine?: 'deterministic' | 'agent'
  generatedAt?: string
}

export type PlacementContext = {
  frame: WeekFrame
  prefs: Preferences
  busy: BusyEvent[]
  slots: FreeSlot[]
  blocks: PlacedBlock[]
  /** Minutes of task work planned per date key. */
  plannedByDate: Map<string, number>
  deepByDate: Map<string, number>
  meetingByDate: Map<string, number>
  ordering: OrderingContext
  droppedPins: string[]
  notices: string[]
  prerequisiteIds?: Set<string>
  requiredByTask?: Map<string, number>
}

/* ------------------------------------------------------------------ *
 * Pins → immovable blocks (INV-8)
 * ------------------------------------------------------------------ */

function materialisePins(
  pins: Pin[],
  tasks: Task[],
  ctx: { frame: WeekFrame; prefs: Preferences; busy: BusyEvent[] },
): { blocks: PlacedBlock[]; dropped: string[] } {
  const blocks: PlacedBlock[] = []
  const dropped: string[] = []
  for (const pin of pins) {
    const task = tasks.find((t) => t.id === pin.taskId)
    const dayIndex = ctx.frame.days.findIndex((d) => d.date === pin.date)
    const day = ctx.frame.days[dayIndex]
    if (!task || !day || dayIndex < 0) {
      dropped.push(pin.taskId)
      continue
    }
    const start = clamp(Math.round(pin.startMin / SNAP_MINUTES) * SNAP_MINUTES, 0, 24 * 60)
    const end = start + Math.max(SNAP_MINUTES, pin.minutes)
    const hours = workingHoursFor(ctx.prefs, day.weekday)
    const blocked = !hours || start < hours.start || end > hours.end
    const collides = staticOccupancy(day.weekday, day.date, ctx.prefs, ctx.busy).some(event => overlaps(start, end, event.start, event.end)) ||
      blocks.some(block => block.date === pin.date && overlaps(start, end, block.startMin, block.endMin))
    const minutes = end - start
    const abs = (value: string) => (Date.parse(`${value.slice(0, 10)}T00:00:00Z`) - Date.parse(`${ctx.frame.weekStartDate}T00:00:00Z`)) / 60000 + Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))
    const cadence = occurrenceDays(task, ctx.frame.weekStartDate)
    const repeating = cadence.length > 1
    const already = blocks.filter(block => block.taskId === task.id && (!repeating || block.date === pin.date)).reduce((sum, block) => sum + block.minutes, 0)
    const badPin = minutes < ctx.prefs.minBlockMinutes || minutes % SNAP_MINUTES !== 0 ||
      already + minutes > task.estimateMinutes ||
      (task.recurrence && !cadence.length) || (cadence.length > 0 && !cadence.includes(day.weekday)) ||
      (task.deadline && dayIndex * 1440 + end > abs(task.deadline)) ||
      (task.earliestStart && dayIndex * 1440 + start < abs(task.earliestStart)) ||
      blocks.filter(block => block.date === pin.date).reduce((sum, block) => sum + block.minutes, 0) + minutes > ctx.prefs.maxPlannedMinutesPerDay ||
      (task.energy === 'deep' && blocks.filter(block => block.date === pin.date && block.energy === 'deep').reduce((sum, block) => sum + block.minutes, 0) + minutes > ctx.prefs.maxDeepWorkMinutesPerDay)
    if (blocked || collides || badPin) {
      dropped.push(pin.taskId)
      continue
    }
    blocks.push({
      id: `blk_pin_${task.id}_${pin.date}`,
      taskId: task.id,
      title: task.title,
      notes: task.notes,
      kind: 'task',
      date: day.date,
      dayIndex,
      weekday: day.weekday,
      startMin: start,
      endMin: end,
      minutes: end - start,
      priority: task.priority,
      energy: task.energy,
      category: task.category,
      chunkIndex: 0,
      chunkCount: 1,
      reasonText: 'You placed this block yourself.',
      reasons: [{ code: 'pinned', label: reasonLabel('pinned'), weight: 1 }],
      score: 1,
      pinned: true,
    })
  }
  return { blocks, dropped }
}

/* ------------------------------------------------------------------ *
 * Chunk building (handles repeating tasks)
 * ------------------------------------------------------------------ */

export function chunksForTask(task: Task, prefs: Preferences, weekStart?: string): Chunk[] {
  // An occurrence week with no occurrence days in it produces no work at all (T-601).
  if (task.recurrence && occurrenceDays(task, weekStart).length === 0) return []
  const days = occurrenceDays(task, weekStart)
  if (days.length < 2) return chunkTask(task, prefs)
  // Repeating work: `estimateMinutes` is per occurrence, and each occurrence is bound to its day.
  return days.map((weekday, index) => ({
    task,
    index,
    count: days.length,
    minutes: task.estimateMinutes,
    weekday,
  }))
}

/** Session numbers are cosmetic but they must be truthful: derive them from the final layout. */
function renumberChunks(blocks: PlacedBlock[]): PlacedBlock[] {
  const byTask = new Map<string, PlacedBlock[]>()
  for (const block of blocks) {
    if (block.kind !== 'task') continue
    const list = byTask.get(block.taskId)
    if (list) list.push(block)
    else byTask.set(block.taskId, [block])
  }
  const meta = new Map<string, { index: number; count: number }>()
  for (const [taskId, list] of byTask.entries()) {
    const ordered = [...list].sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startMin - b.startMin,
    )
    ordered.forEach((block, index) => {
      meta.set(block.id, { index, count: ordered.length })
    })
    void taskId
  }
  return blocks.map((block) => {
    const found = meta.get(block.id)
    return found ? { ...block, chunkIndex: found.index, chunkCount: found.count } : block
  })
}

/* ------------------------------------------------------------------ *
 * Feasibility gate — the ONE place hard constraints live (RULES.md §5)
 * ------------------------------------------------------------------ */

export type FeasibilityInput = {
  start: number
  end: number
  minutes: number
  date: string
  weekday: Weekday
  task: Task
  slot: FreeSlot
  allowOverCap?: boolean
  allowPastDeadline?: boolean
}

export type Feasibility = { ok: true } | { ok: false; code: string }

function blocksOnDate(ctx: PlacementContext, date: string, ignoreTaskId?: string): PlacedBlock[] {
  return ctx.blocks.filter((b) => b.date === date && (!ignoreTaskId || b.taskId !== ignoreTaskId))
}

function busyOnDate(ctx: PlacementContext, date: string): BusyEvent[] {
  return ctx.busy.filter((e) => e.date === date)
}

/**
 * Absolute minute (week axis) at which a task's prerequisites are all done, or null when none of
 * them have been placed yet — in which case there is nothing to enforce.
 */
export function dependencyReadyAbs(ctx: PlacementContext, task: Task): number | null {
  if (!task.dependsOn?.length) return null
  let ready = 0
  for (const id of task.dependsOn) {
    if (ctx.requiredByTask && !ctx.requiredByTask.has(id)) continue
    const placed = ctx.blocks.filter(block => block.kind === 'task' && block.taskId === id)
    if (!placed.length || placed.reduce((sum, block) => sum + block.minutes, 0) < (ctx.requiredByTask?.get(id) ?? 0)) return Infinity
    ready = Math.max(ready, ...placed.map(block => block.dayIndex * 1440 + block.endMin))
  }
  return ready
}

export function isFeasible(ctx: PlacementContext, input: FeasibilityInput): Feasibility {
  const { start, end, minutes, task, slot } = input
  const snapOk = start % SNAP_MINUTES === 0 && minutes % SNAP_MINUTES === 0

  // INV-5 granularity
  if (!snapOk) return { ok: false, code: 'GRANULARITY' }
  if (minutes < ctx.prefs.minBlockMinutes) return { ok: false, code: 'TOO_SHORT' }

  // INV-2 containment
  if (start < slot.start || end > slot.end) return { ok: false, code: 'OUTSIDE_SLOT' }

  // INV-3 deadline
  if (task.deadline) {
    const deadlineAbs = absMinuteOf(task.deadline, ctx.ordering)
    const dayAbs = slot.dayIndex * 1440
    if (deadlineAbs !== null && dayAbs + end > deadlineAbs) return { ok: false, code: 'PAST_DEADLINE' }
  }

  // Dependency ordering (T-602): a task may not begin before every prerequisite it depends on has
  // finished. Only prerequisites that were actually placed constrain anything — an unscheduled
  // dependency is reported after the fact instead of silently freezing the work behind it.
  if (task.dependsOn?.length) {
    const readyAbs = dependencyReadyAbs(ctx, task)
    if (readyAbs !== null && slot.dayIndex * 1440 + start < readyAbs) return { ok: false, code: 'AWAITING_DEPENDENCY' }
  }

  // INV-4 earliest start
  if (task.earliestStart) {
    const earliestAbs = absMinuteOf(task.earliestStart, ctx.ordering)
    if (earliestAbs !== null && slot.dayIndex * 1440 + start < earliestAbs) return { ok: false, code: 'TOO_EARLY' }
  }

  // INV-1 no overlap + buffer discipline (MEMORY.md §5.6)
  const buffer = ctx.prefs.bufferMinutes
  for (const block of blocksOnDate(ctx, input.date)) {
    if (overlaps(start, end, block.startMin, block.endMin)) return { ok: false, code: 'OVERLAP' }
    if (block.taskId === task.id) continue // continuing the same task may sit flush
    const gap = start >= block.endMin ? start - block.endMin : block.startMin - end
    if (gap < buffer) return { ok: false, code: 'BUFFER' }
  }
  for (const event of busyOnDate(ctx, input.date)) {
    if (overlaps(start, end, event.startMin, event.endMin)) return { ok: false, code: 'MEETING' }
    // Starting straight after a meeting is normal life; ending flush against one is how you
    // arrive late. So the buffer applies on the way *into* a meeting, not out of it.
    if (end <= event.startMin) {
      const gap = event.startMin - end
      if (gap > 0 && gap < Math.min(buffer, 10)) return { ok: false, code: 'MEETING_BUFFER' }
    }
  }

  // Daily caps are soft: they only hard-fail outside the escalation ladder.
  { // Daily limits are never silently relaxed.
    const planned = ctx.plannedByDate.get(input.date) ?? 0
    if (planned + minutes > ctx.prefs.maxPlannedMinutesPerDay) return { ok: false, code: 'DAILY_CAP' }
    if (task.energy === 'deep') {
      const deep = ctx.deepByDate.get(input.date) ?? 0
      if (deep + minutes > ctx.prefs.maxDeepWorkMinutesPerDay) return { ok: false, code: 'DEEP_CAP' }
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Candidate generation
 * ------------------------------------------------------------------ */

function candidateStarts(slot: FreeSlot, minutes: number, preferred: number[] = []): number[] {
  const latest = slot.end - minutes
  if (latest < slot.start) return []
  const starts = new Set<number>([slot.start, latest])
  for (const p of preferred) {
    if (p >= slot.start && p <= latest && p % SNAP_MINUTES === 0) starts.add(p)
  }
  // Align to clock hours inside the slot so blocks look hand-placed rather than floating.
  const firstHour = Math.ceil(slot.start / 60) * 60
  for (let t = firstHour; t <= latest; t += 60) starts.add(t)
  const total = latest - slot.start
  const stride = Math.max(SNAP_MINUTES, Math.ceil(total / SNAP_MINUTES / 6) * SNAP_MINUTES)
  for (let t = slot.start; t <= latest; t += stride) starts.add(t)
  return [...starts].sort((a, b) => a - b).slice(0, 16)
}

type Placement = {
  block: PlacedBlock
  slot: FreeSlot
  score: number
  reasons: Reason[]
}

export function tryPlaceChunk(
  ctx: PlacementContext,
  chunk: Chunk,
  options: {
    allowOverCap?: boolean
    allowPastDeadline?: boolean
    onlyDate?: string
    isShoulder?: boolean
  } = {},
): Placement | null {
  const { task } = chunk
  const allChunks = chunksForTask(task, ctx.prefs, ctx.frame.weekStartDate)
  const remainingAfter = allChunks.filter((c) => c.index > chunk.index).reduce((sum, c) => sum + c.minutes, 0)

  let best: Placement | null = null

  for (const slot of ctx.slots) {
    if (chunk.weekday && slot.weekday !== chunk.weekday) continue
    if (options.onlyDate && slot.date !== options.onlyDate) continue
    if (slot.minutes < chunk.minutes) continue

    const preferred: number[] = []
    for (const block of ctx.blocks) {
      if (block.date !== slot.date) continue
      if (block.taskId === task.id) {
        preferred.push(block.endMin, block.startMin - chunk.minutes)
      }
    }

    for (const start of candidateStarts(slot, chunk.minutes, preferred)) {
      const end = start + chunk.minutes
      const feasible = isFeasible(ctx, {
        start,
        end,
        minutes: chunk.minutes,
        date: slot.date,
        weekday: slot.weekday,
        task,
        slot,
        allowOverCap: options.allowOverCap,
        allowPastDeadline: options.allowPastDeadline,
      })
      if (!feasible.ok) continue

      const sameDayBlocks = blocksOnDate(ctx, slot.date)
      const neighbourBefore = sameDayBlocks.find((b) => b.endMin === start)
      const neighbourAfter = sameDayBlocks.find((b) => b.startMin === end)
      const sameCategoryToday = sameDayBlocks.filter((b) => b.category === task.category).length
      const sameLocationToday = task.location ? sameDayBlocks.filter((b) => b.location === task.location).length : 0

      const contiguity = contiguitySignal({
        slot,
        task,
        neighbourBefore,
        neighbourAfter,
        sameCategoryToday,
        sameLocationToday,
      })

      const plannedToday = ctx.plannedByDate.get(slot.date) ?? 0
      const hours = workingHoursFor(ctx.prefs, slot.weekday)
      const dayEnd = hours?.end ?? slot.end
      // Gap left on either side of the placement, used by the fragmentation signal.
      const gapBefore = start - slot.start
      const gapAfter = slot.end - end

      const breakdown = scorePlacement({
        slot,
        energy: task.energy,
        priority: task.priority,
        signals: {
          deadlineFit: deadlineFitSignal({
            slotEndAbs: slot.dayIndex * 1440 + end,
            deadlineAbs: task.deadline ? absMinuteOf(task.deadline, ctx.ordering) : null,
            remainingWorkAfter: remainingAfter,
          }),
          contiguity: contiguity.signal,
          dayBalance: dayBalanceSignal(plannedToday, ctx.prefs.maxPlannedMinutesPerDay),
          fragmentation: fragmentationSignal({
            gapBefore,
            gapAfter,
            minBlock: ctx.prefs.minBlockMinutes,
          }),
          rhythm: rhythmSignal({
            slot,
            dayEnd,
            bufferMinutes: ctx.prefs.bufferMinutes,
            meetsBuffer: true,
          }),
          contextMatch: sameLocationToday > 0 ? 1 : sameCategoryToday > 0 ? 0.6 : 0.3,
        },
        extraCodes: contiguity.codes,
        overDailyCap:
          Boolean(options.allowOverCap) &&
          (ctx.plannedByDate.get(slot.date) ?? 0) + chunk.minutes > ctx.prefs.maxPlannedMinutesPerDay,
        spillover: Boolean(options.allowPastDeadline),
        sameTaskChunksToday: sameDayBlocks.filter((b) => b.taskId === task.id).length,
        isShoulder: options.isShoulder,
      })

      const reasons: Reason[] = [
        ...breakdown.codes.map((code) => ({ code, label: reasonLabel(code), weight: breakdown.score })),
      ]
      if (chunk.count > 1) {
        reasons.push({
          code: chunk.index === 0 ? 'deadline-protected' : 'contiguous',
          label: chunk.index === 0 ? `Session 1 of ${chunk.count}` : `Session ${chunk.index + 1} of ${chunk.count}`,
        })
      }
      if (!sameDayBlocks.length) reasons.push({ code: 'early-in-week', label: 'First work placed on this day' })
      // If this task waits on something else, say so — the reason is part of the promise (L3).
      if (task.dependsOn?.length && dependencyReadyAbs(ctx, task) !== null) {
        reasons.push({ code: 'after-dependency', label: reasonLabel('after-dependency') })
      }

      const placement: Placement = {
        slot,
        score: breakdown.score - (ctx.prerequisiteIds?.has(task.id) ? slot.dayIndex * 0.15 : 0),
        reasons,
        block: {
          id: `blk_${task.id}_${chunk.index}`,
          taskId: task.id,
          title: task.title,
          notes: task.notes,
          kind: 'task',
          date: slot.date,
          dayIndex: slot.dayIndex,
          weekday: slot.weekday,
          startMin: start,
          endMin: end,
          minutes: chunk.minutes,
          priority: task.priority,
          energy: task.energy,
          category: task.category,
          location: task.location,
          chunkIndex: chunk.index,
          chunkCount: chunk.count,
          reasonText: '',
          reasons,
          score: breakdown.score,
          pinned: false,
          conflict: options.allowPastDeadline ? 'deadline-risk' : undefined,
        },
      }
      best = betterPlacement(best, placement)
    }
  }

  if (best) {
    best.block.reasonText = humaniseReasons(best)
    commit(ctx, best.block)
  }
  return best
}

/** Deterministic tie-breaks: score desc, then earlier absolute start, then id (MEMORY.md §5.2). */
function betterPlacement(a: Placement | null, b: Placement): Placement {
  if (!a) return b
  if (b.score > a.score) return b
  if (b.score < a.score) return a
  const aAbs = a.slot.dayIndex * 1440 + a.block.startMin
  const bAbs = b.slot.dayIndex * 1440 + b.block.startMin
  if (aAbs !== bAbs) return bAbs < aAbs ? b : a
  return a.block.id <= b.block.id ? a : b
}

export function humaniseReasons(placement: Placement): string {
  const labels = placement.reasons
    .filter((r) => r.code !== 'contiguous' || placement.block.chunkCount > 1)
    .slice(0, 3)
    .map((r) => r.label.toLowerCase())
  if (!labels.length) return 'Best available slot.'
  return `Placed here: ${labels.join(' · ')}.`
}

function commit(ctx: PlacementContext, block: PlacedBlock) {
  ctx.blocks.push(block)
  ctx.plannedByDate.set(block.date, (ctx.plannedByDate.get(block.date) ?? 0) + block.minutes)
  if (block.energy === 'deep') ctx.deepByDate.set(block.date, (ctx.deepByDate.get(block.date) ?? 0) + block.minutes)
}

/* ------------------------------------------------------------------ *
 * Escalation ladder (PRD §7)
 * ------------------------------------------------------------------ */

function extendIntoExistingBlock(ctx: PlacementContext, chunk: Chunk): Placement | null {
  const candidates = ctx.blocks.filter((b) => b.taskId === chunk.task.id && !b.pinned)
  const best: Placement | null = null
  for (const block of candidates) {
    // Never grow a session past the point where it stops being a session.
    if (block.minutes + chunk.minutes > MAX_MERGED_MINUTES) continue
    const slot = ctx.slots.find((s) => s.date === block.date && s.start <= block.startMin && s.end >= block.endMin)
    if (!slot) continue
    const tryForward = block.endMin + chunk.minutes <= slot.end
    const tryBackward = block.startMin - chunk.minutes >= slot.start
    const start = tryForward ? block.endMin : tryBackward ? block.startMin - chunk.minutes : null
    if (start === null) continue
    const feasibility = isFeasible(ctx, {
      start,
      end: start + chunk.minutes,
      minutes: chunk.minutes,
      date: block.date,
      weekday: block.weekday,
      task: chunk.task,
      slot,
    })
    if (!feasibility.ok) continue
    const merged: PlacedBlock = {
      ...block,
      id: `blk_${chunk.task.id}_${chunk.index}`,
      startMin: Math.min(start, block.startMin),
      endMin: Math.max(start + chunk.minutes, block.endMin),
      minutes: block.minutes + chunk.minutes,
      chunkIndex: chunk.index,
      chunkCount: chunk.count,
      reasons: [
        ...block.reasons,
        { code: 'contiguous', label: 'Joined onto the same session', weight: 1 },
      ],
    }
    const placement: Placement = {
      slot,
      score: block.score,
      reasons: merged.reasons,
      block: merged,
    }
    merged.reasonText = humaniseReasons(placement)
    // Replace the old block with the extended one.
    ctx.blocks = ctx.blocks.filter((b) => b.id !== block.id)
    commit(ctx, merged)
    return placement
  }
  return best
}

/**
 * Trim-to-fit: before the ladder reaches for compromised hours, let splittable work shrink into the
 * largest gap that actually exists. The remainder is re-queued, so nothing is lost (INV-6).
 */
export function splitToFit(
  ctx: PlacementContext,
  chunk: Chunk,
): { placement: Placement; remainder: number } | null {
  if (!chunk.task.splittable) return null
  const minChunk = Math.max(SNAP_MINUTES, chunk.task.minChunkMinutes)
  if (chunk.minutes <= minChunk) return null

  const span = chunk.minutes - minChunk
  const steps = Math.min(10, Math.floor(span / SNAP_MINUTES))
  if (steps < 1) return null

  for (let step = 1; step <= steps; step += 1) {
    const minutes = chunk.minutes - step * SNAP_MINUTES
    if (minutes < minChunk) break
    const placement = tryPlaceChunk(ctx, { ...chunk, minutes })
    if (placement) {
      placement.block.reasons = [
        ...placement.block.reasons,
        { code: 'split-to-fit', label: reasonLabel('split-to-fit') },
      ]
      placement.block.reasonText = humaniseReasons(placement)
      return { placement, remainder: chunk.minutes - minutes }
    }
  }
  return null
}

/** Hard invariants take precedence over overflow suggestions: never relax hours/caps/deadlines. */
export function escalateChunk(ctx: PlacementContext, chunk: Chunk): { placement: Placement | null; failure?: string } {
  const extended = extendIntoExistingBlock(ctx, chunk)
  return extended ? { placement: extended } : { placement: null, failure: 'no-fit' }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function generatePlan(input: GenerateInput): PlanProposal {
  const { tasks, preferences, busy, pins, nowISO, weekStartDate } = input
  const frame = buildWeekFrame(weekStartDate, preferences.weekStartsOn)
  const daysByDate = new Map(frame.days.map((d) => [d.date, { dayIndex: d.dayIndex }]))
  const nowDayIndex = Math.max(0, (() => {
    const key = nowISO.slice(0, 10)
    const found = daysByDate.get(key)
    return found ? found.dayIndex : 0
  })())
  const orderingCtx: OrderingContext = {
    nowAbs: nowDayIndex * 1440 + minutesOfIso(nowISO),
    frameStartDate: frame.weekStartDate,
    daysByDate,
  }

  const pinnedResult = materialisePins(pins, tasks, { frame, prefs: preferences, busy })
  const pinnedBlocks = pinnedResult.blocks

  const slots = buildFreeSlots({
    frame,
    preferences,
    busy,
    pinnedBlocks,
    minBlockMinutes: Math.min(preferences.minBlockMinutes, 30),
  })

  const plannedByDate = new Map<string, number>()
  const deepByDate = new Map<string, number>()
  const meetingByDate = new Map<string, number>()
  for (const event of busy) {
    meetingByDate.set(event.date, (meetingByDate.get(event.date) ?? 0) + Math.max(0, event.endMin - event.startMin))
  }
  for (const block of pinnedBlocks) {
    plannedByDate.set(block.date, (plannedByDate.get(block.date) ?? 0) + block.minutes)
    if (block.energy === 'deep') deepByDate.set(block.date, (deepByDate.get(block.date) ?? 0) + block.minutes)
  }

  const ctx: PlacementContext = {
    frame,
    prefs: preferences,
    busy,
    slots,
    blocks: [...pinnedBlocks],
    plannedByDate,
    deepByDate,
    meetingByDate,
    ordering: orderingCtx,
    droppedPins: pinnedResult.dropped,
    notices: [],
    prerequisiteIds: new Set(tasks.flatMap(task => task.dependsOn ?? [])),
    requiredByTask: new Map(tasks.map(task => [task.id, totalDemandMinutes(task, weekStartDate)])),
  }

  const ordered = orderTasks(tasks, orderingCtx)
  const failures = new Map<string, string>()

  // Pass 1 — clean placement inside real working hours for every chunk of every task.
  const pending: Chunk[] = []
  for (const task of ordered) {
    const pinned = pinnedBlocks.filter(block => block.taskId === task.id)
    const repeating = occurrenceDays(task, weekStartDate).length > 1
    let pinnedRemaining = pinned.reduce((sum, block) => sum + block.minutes, 0)
    const pinnedByDay = new Map<Weekday, number>()
    for (const block of pinned) pinnedByDay.set(block.weekday, (pinnedByDay.get(block.weekday) ?? 0) + block.minutes)
    for (const original of chunksForTask(task, preferences, frame.weekStartDate)) {
      const accounted = Math.min(original.minutes, repeating && original.weekday ? (pinnedByDay.get(original.weekday) ?? 0) : pinnedRemaining)
      if (repeating && original.weekday) pinnedByDay.set(original.weekday, (pinnedByDay.get(original.weekday) ?? 0) - accounted)
      else pinnedRemaining -= accounted
      const chunk = { ...original, minutes: original.minutes - accounted }
      if (!chunk.minutes) continue
      const placed = tryPlaceChunk(ctx, chunk)
      if (!placed) pending.push(chunk)
    }
  }

  // Pass 2 — trim-to-fit, then the escalation ladder, for what the clean pass could not hold.
  const queue = [...pending]
  let guard = 0
  while (queue.length > 0 && guard < 500) {
    guard += 1
    const chunk = queue.shift()
    if (!chunk) break

    if (tryPlaceChunk(ctx, chunk)) continue
    const trimmed = splitToFit(ctx, chunk)
    if (trimmed) {
      if (trimmed.remainder >= Math.max(SNAP_MINUTES, chunk.task.minChunkMinutes)) {
        queue.push({
          ...chunk,
          index: chunk.count,
          count: chunk.count + 1,
          minutes: trimmed.remainder,
          weekday: undefined,
        })
      } else {
        failures.set(
          chunk.task.id,
          `${fmtDuration(trimmed.remainder)} could not be placed — the leftover gaps are too small`,
        )
      }
      continue
    }

    const escalated = escalateChunk(ctx, chunk)
    if (escalated.placement) continue
    const cr = criticalRatio(chunk.task, orderingCtx)
    failures.set(
      chunk.task.id,
      cr < 1
        ? `Deadline in ${formatSlack(chunk.task, orderingCtx)} — not enough working time left`
        : 'No free window large enough inside your working hours',
    )
  }

  ctx.blocks = renumberChunks(ctx.blocks)

  const repaired = repairPlan({
    ctx,
    failures,
  })

  // Pins are immovable only when valid. A pin cannot bypass an incomplete prerequisite;
  // remove invalid dependent work to a visible remainder, cascading through dependency chains.
  for (let pass = 0; pass < tasks.length; pass++) {
    const invalid = new Set<string>()
    for (const task of tasks) {
      const dependencies = (task.dependsOn ?? []).filter(id => tasks.some(candidate => candidate.id === id))
      if (!dependencies.length) continue
      let ready = 0
      for (const id of dependencies) {
        const placed = repaired.blocks.filter(block => block.kind === 'task' && block.taskId === id)
        if (placed.reduce((sum, block) => sum + block.minutes, 0) < (ctx.requiredByTask?.get(id) ?? 0)) { ready = Infinity; break }
        ready = Math.max(ready, ...placed.map(block => block.dayIndex * 1440 + block.endMin))
      }
      for (const block of repaired.blocks.filter(block => block.kind === 'task' && block.taskId === task.id)) {
        if (block.dayIndex * 1440 + block.startMin < ready) {
          invalid.add(block.id)
          if (block.pinned && !ctx.droppedPins.includes(task.id)) ctx.droppedPins.push(task.id)
          repaired.failures.set(task.id, 'A prerequisite must be fully completed before this task can start')
        }
      }
    }
    if (!invalid.size) break
    repaired.blocks = repaired.blocks.filter(block => !invalid.has(block.id))
  }

  return evaluatePlan({
    frame,
    prefs: preferences,
    tasks,
    busy,
    blocks: repaired.blocks,
    slots,
    droppedPins: ctx.droppedPins,
    pins,
    failures: repaired.failures,
    engine: input.engine ?? 'deterministic',
    generatedAt: input.generatedAt ?? nowISO,
  })
}

function formatSlack(task: Task, ctx: OrderingContext): string {
  if (!task.deadline) return 'no deadline'
  const deadlineAbs = absMinuteOf(task.deadline, ctx)
  if (deadlineAbs === null) return 'no deadline'
  const slack = deadlineAbs - ctx.nowAbs
  return slack <= 0 ? 'the past' : fmtDuration(slack)
}
