import {
  PRIORITY_ORDER,
  SNAP_MINUTES,
  type Energy,
  type PlacedBlock,
  type Preferences,
  type Priority,
  type ReasonCode,
  type Task,
  type Weekday,
} from '@/lib/types'
import { clamp, snapUp, type EnergyProfile, type FreeSlot } from '@/lib/scheduler/slots'

/**
 * Scheduling policy — weights, ordering and chunking (`ARCHITECTURE.md` §5.2).
 *
 * Every magic number in the scheduler lives here. Changing behaviour is a one-line edit here,
 * and because the engine derives its reason payload from the same functions, the UI explanation
 * can never drift from the algorithm (RULES.md §5, decision D-003).
 */

export const WEIGHTS = {
  /** Deep work into the focus peak, admin into the trough. */
  energyMatch: 0.3,
  /** Put work as early as it can be without wasting the days before its deadline. */
  deadlineFit: 0.22,
  /** Sit next to work of the same task / category / place. */
  contiguity: 0.16,
  /** Spread load instead of overloading one day. */
  dayBalance: 0.12,
  /** Do not create unusable slivers of free time. */
  fragmentation: 0.1,
  /** Keep breathing room around dense stretches. */
  rhythm: 0.06,
  /** Batch same-location work. */
  contextMatch: 0.04,
} as const

export const PENALTIES = {
  overDailyCap: 0.45,
  weekendUse: 0.1,
  lateEvening: 0.08,
  spilloverPastDeadline: 0.25,
  /** A second session of the same task on a day that already has one. Spreading beats stacking. */
  sameTaskSameDay: 0.16,
  /** Eating the evening: only the escalation ladder should ever do this. */
  shoulderHours: 0.12,
} as const

/** Longest a merged session may grow when the ladder joins chunks together. */
export const MAX_MERGED_MINUTES = 120

/** Chunk size ceiling per energy type — long cognitive work fragments badly past 90 minutes. */
export const MAX_CHUNK_MINUTES: Record<Energy, number> = {
  deep: 90,
  admin: 60,
  light: 120,
  social: 120,
  physical: 90,
}

export const MAX_CHUNKS_PER_TASK = 8

export const PRIORITY_URGENCY: Record<Priority, number> = {
  P0: 1,
  P1: 0.75,
  P2: 0.45,
  P3: 0.2,
}

/** Whole-day helpers, kept local so the engine never does timezone maths (MEMORY.md §5.8). */
function isoToUtcDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

/**
 * Which days of `weekStart`'s week this task occurs on, in week order.
 *
 * The single answer the rest of the engine asks for, so `repeatDays` (the simple form) and
 * `recurrence` (the RRULE-ish form) can never drift apart.
 */
export function occurrenceDays(task: Task, weekStart?: string, weekOrder: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']): Weekday[] {
  const recurrence = task.recurrence
  if (!recurrence) return task.repeatDays ?? []

  if (recurrence.interval > 1 && recurrence.anchorWeek && weekStart) {
    const weeks = Math.round(
      (isoToUtcDate(weekStart).getTime() - isoToUtcDate(recurrence.anchorWeek).getTime()) / (7 * 24 * 60 * 60 * 1000),
    )
    if (weeks >= 0 && weeks % recurrence.interval !== 0) return []
  }

  const orderIndex = new Map(weekOrder.map((day, index) => [day, index]))
  let days = [...recurrence.byWeekday].sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))

  if (recurrence.until && weekStart) {
    const until = isoToUtcDate(recurrence.until)
    days = days.filter((day) => {
      const date = new Date(isoToUtcDate(weekStart).getTime() + (orderIndex.get(day) ?? 0) * 24 * 60 * 60 * 1000)
      return date.getTime() <= until.getTime()
    })
  }

  if (recurrence.count) days = days.slice(0, recurrence.count)
  return days
}

/** Short human phrasing for a task's cadence, for the UI ("Mon, Wed, Fri" / "every 2 weeks"). */
export function recurrenceLabel(task: Task, weekStart?: string): string | null {
  const days = occurrenceDays(task, weekStart)
  if (days.length === 0) return 'not this week'
  const names = days.map((day) => day.charAt(0).toUpperCase() + day.slice(1))
  if (task.recurrence?.interval && task.recurrence.interval > 1) {
    return `every ${task.recurrence.interval} weeks, ${names.join(', ')}`
  }
  if (days.length === 1) return names[0] ?? null
  if (names.length === 5 && days.join() === 'mon,tue,wed,thu,fri') return 'weekdays'
  if (names.length === 7) return 'every day'
  return names.join(', ')
}

/** How many times this task occurs in the week (repeating tasks occur once per listed day). */
export function occurrenceCount(task: Task, weekStart?: string): number {
  const days = occurrenceDays(task, weekStart)
  return Math.max(1, days.length)
}

/**
 * Repeating tasks express `estimateMinutes` **per occurrence** ("gym, 60 min, Mon/Wed/Fri"),
 * so the week's true demand is per-occurrence minutes × occurrences (INV-6).
 */
export function totalDemandMinutes(task: Task, weekStart?: string): number {
  // A recurring task that does not occur this week demands nothing this week (T-601).
  if (task.recurrence && occurrenceDays(task, weekStart).length === 0) return 0
  return task.estimateMinutes * occurrenceCount(task, weekStart)
}

export type Chunk = {
  task: Task
  index: number
  count: number
  minutes: number
  /** For repeating tasks ("review PRs daily"): the weekday this chunk is bound to. */
  weekday?: Weekday
}

/* ------------------------------------------------------------------ *
 * Chunking
 * ------------------------------------------------------------------ */

/**
 * Split a task into placeable chunks. Guarantees:
 *  - Σ chunk.minutes === task.estimateMinutes (INV-6)
 *  - every chunk ≥ minChunkMinutes (except a single chunk for tiny tasks)
 *  - every chunk ≤ MAX_CHUNK_MINUTES[energy]
 */
export function chunkTask(task: Task, prefs: Preferences): Chunk[] {
  const minChunk = Math.max(SNAP_MINUTES, Math.min(task.minChunkMinutes, prefs.minBlockMinutes * 4))
  const maxChunk = Math.max(minChunk, MAX_CHUNK_MINUTES[task.energy])
  const estimate = task.estimateMinutes

  if (!task.splittable || estimate <= maxChunk) {
    return [{ task, index: 0, count: 1, minutes: estimate }]
  }

  const count = clamp(Math.ceil(estimate / maxChunk), 2, MAX_CHUNKS_PER_TASK)
  const chunks: Chunk[] = []
  let remaining = estimate
  for (let i = 0; i < count; i += 1) {
    const slotsLeft = count - i
    if (slotsLeft === 1) {
      chunks.push({ task, index: i, count, minutes: remaining })
      remaining = 0
      break
    }
    let take = clamp(snapUp(remaining / slotsLeft), minChunk, maxChunk)
    const mustLeave = (slotsLeft - 1) * minChunk
    if (remaining - take < mustLeave) take = remaining - mustLeave
    if (take < minChunk) {
      // Fold the remainder into the previous chunk rather than emitting a sliver.
      const prev = chunks[chunks.length - 1]
      if (prev) {
        prev.minutes += remaining
        prev.count = chunks.length
        remaining = 0
        break
      }
      take = remaining
    }
    chunks.push({ task, index: i, count, minutes: take })
    remaining -= take
  }

  // INV-6 safety net: never lose or invent minutes.
  const placed = chunks.reduce((sum, c) => sum + c.minutes, 0)
  if (placed !== estimate) {
    const last = chunks[chunks.length - 1]
    if (last) last.minutes += estimate - placed
  }
  return chunks.map((c, i) => ({ ...c, index: i, count: chunks.length }))
}

/* ------------------------------------------------------------------ *
 * Urgency ordering (Critical Ratio)
 * ------------------------------------------------------------------ */

export type OrderingContext = {
  /** "Now" on the week axis: dayIndex * 1440 + minute-of-day. */
  nowAbs: number
  frameStartDate: string
  daysByDate: Map<string, { dayIndex: number }>
}

/** Absolute minute on the week axis for an ISO instant. */
export function absMinuteOf(iso: string, ctx: OrderingContext): number | null {
  const date = iso.slice(0, 10)
  const day = ctx.daysByDate.get(date)
  if (!day) return null
  const d = new Date(iso)
  return day.dayIndex * 1440 + d.getHours() * 60 + d.getMinutes()
}

/**
 * Critical Ratio — classic scheduling heuristic: time still available divided by work still required.
 * CR < 1 means the work is already late unless capacity is added.
 */
export function criticalRatio(task: Task, ctx: OrderingContext): number {
  const workRemaining = Math.max(SNAP_MINUTES, task.estimateMinutes)
  if (!task.deadline) return Number.POSITIVE_INFINITY
  const deadlineAbs = absMinuteOf(task.deadline, ctx)
  if (deadlineAbs === null) return Number.POSITIVE_INFINITY
  const timeRemaining = Math.max(0, deadlineAbs - ctx.nowAbs)
  return timeRemaining / workRemaining
}

/**
 * How deep a task sits in the dependency graph: 0 for a task nothing blocks, 1 for one waiting on a
 * single prerequisite, and so on. Cycles are broken by depth-first traversal (a task that depends on
 * itself, directly or through a loop, simply keeps the depth it reached) — the engine must never
 * hang or throw because a user typed a circular plan.
 */
export function dependencyDepth(tasks: Task[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const depths = new Map<string, number>()

  const depthOf = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 0 // cycle: stop, do not recurse
    const task = byId.get(id)
    if (!task?.dependsOn?.length) {
      depths.set(id, 0)
      return 0
    }
    seen.add(id)
    let depth = 0
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) continue // a dangling reference is simply not a constraint
      depth = Math.max(depth, depthOf(dependency, seen) + 1)
    }
    seen.delete(id)
    depths.set(id, depth)
    return depth
  }

  for (const task of tasks) depthOf(task.id, new Set())
  return depths
}

/** The prerequisites of a task that are actually present in this plan. */
export function dependenciesOf(task: Task, tasks: Task[]): Task[] {
  if (!task.dependsOn?.length) return []
  const ids = new Set(task.dependsOn)
  return tasks.filter((other) => other.id !== task.id && ids.has(other.id))
}

/**
 * Deterministic task ordering: prerequisites first, then urgency, then priority, then deadline,
 * then biggest-first, then id.
 */
export function orderTasks(tasks: Task[], ctx: OrderingContext): Task[] {
  const depths = dependencyDepth(tasks)
  return [...tasks].sort((a, b) => {
    const depthA = depths.get(a.id) ?? 0
    const depthB = depths.get(b.id) ?? 0
    // A dependent task is never considered before what it depends on (T-602).
    if (depthA !== depthB) return depthA - depthB
    const crA = criticalRatio(a, ctx)
    const crB = criticalRatio(b, ctx)
    if (crA !== crB) return crA - crB
    const pA = PRIORITY_ORDER[a.priority]
    const pB = PRIORITY_ORDER[b.priority]
    if (pA !== pB) return pA - pB
    const dA = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY
    const dB = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY
    if (dA !== dB) return dA - dB
    if (a.estimateMinutes !== b.estimateMinutes) return b.estimateMinutes - a.estimateMinutes
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/* ------------------------------------------------------------------ *
 * Signals (all normalised to [0, 1] — RULES.md §5)
 * ------------------------------------------------------------------ */

/** How well a slot's time-of-day energy fits the work being placed. */
export function energyMatchSignal(profile: EnergyProfile, energy: Energy): number {
  if (energy === 'deep') {
    if (profile === 'peak') return 1
    if (profile === 'normal') return 0.5
    return 0.05
  }
  if (energy === 'admin') {
    if (profile === 'trough') return 1
    if (profile === 'normal') return 0.75
    return 0.35
  }
  if (energy === 'light') {
    if (profile === 'trough') return 0.95
    if (profile === 'normal') return 0.8
    return 0.5
  }
  if (energy === 'social') {
    if (profile === 'normal') return 0.9
    if (profile === 'peak') return 0.6
    return 0.7
  }
  // physical — best outside the cognitive peak, when the body is warm
  if (profile === 'normal') return 0.85
  if (profile === 'trough') return 0.8
  return 0.45
}

/**
 * Deadline fit: how much head-room the placement leaves, relative to the work that still has to
 * happen before that deadline. Placing early scores well; placing with no room left scores zero.
 */
export function deadlineFitSignal(input: {
  slotEndAbs: number
  deadlineAbs: number | null
  remainingWorkAfter: number
}): number {
  const { slotEndAbs, deadlineAbs, remainingWorkAfter } = input
  if (deadlineAbs === null) return 0.5
  const room = deadlineAbs - slotEndAbs
  if (room < 0) return 0
  const need = Math.max(SNAP_MINUTES, remainingWorkAfter)
  // Ideal: finish with roughly a day of breathing room after the remaining work is accounted for.
  // Less room is risky; far more room means work is being stacked needlessly early in the week.
  const ideal = need + 8 * 60
  if (room <= ideal) return clamp(0.55 + 0.45 * (room / ideal), 0, 1)
  return clamp(1 - (room - ideal) / (ideal * 2), 0.6, 1)
}

/** Adjacency: same task (visual continuity) > same place > same category. */
export function contiguitySignal(input: {
  slot: FreeSlot
  task: Task
  neighbourBefore?: PlacedBlock
  neighbourAfter?: PlacedBlock
  sameCategoryToday: number
  sameLocationToday: number
}): { signal: number; codes: ReasonCode[] } {
  const codes: ReasonCode[] = []
  let signal = 0.35
  const { neighbourBefore, neighbourAfter } = input
  const adjacentTask = [neighbourBefore, neighbourAfter].find((b) => b && b.taskId === input.task.id)
  if (adjacentTask) {
    signal = 1
    codes.push('contiguous')
  } else if (input.sameLocationToday > 0 && input.task.location) {
    signal = 0.8
    codes.push('context-batch')
  } else if (input.sameCategoryToday > 0) {
    signal = 0.6
    codes.push('context-batch')
  }
  return { signal, codes }
}

export function dayBalanceSignal(plannedToday: number, cap: number): number {
  if (cap <= 0) return 0
  return clamp(1 - plannedToday / cap, 0, 1)
}

/**
 * Fragmentation: prefer placements that do not leave unusable slivers, and that use up the
 * awkward tail of a day. A leftover gap is "dead" when it is smaller than a minimum block.
 */
export function fragmentationSignal(input: {
  gapBefore: number
  gapAfter: number
  minBlock: number
}): number {
  const dead = (gap: number) => gap > 0 && gap < input.minBlock
  const before = input.gapBefore === 0 ? 0 : dead(input.gapBefore) ? 1 : 0.15
  const after = input.gapAfter === 0 ? 0 : dead(input.gapAfter) ? 1 : 0.15
  return clamp(1 - Math.max(before, after), 0, 1)
}

/**
 * Rhythm: reward placements that keep a buffer around dense stretches and never land in the
 * last 45 minutes of a working day (where nothing meaningful fits).
 */
export function rhythmSignal(input: {
  slot: FreeSlot
  dayEnd: number
  bufferMinutes: number
  meetsBuffer: boolean
}): number {
  let signal = input.meetsBuffer ? 1 : 0.4
  const tailStart = input.dayEnd - 45
  if (input.slot.start >= tailStart) signal -= 0.35
  if (input.slot.start < 7 * 60) signal -= 0.15
  return clamp(signal, 0, 1)
}

export function weekendPenalty(slot: FreeSlot, priority: Priority): number {
  if (!slot.weekend) return 0
  if (priority === 'P0') return PENALTIES.weekendUse * 0.4
  if (priority === 'P1') return PENALTIES.weekendUse * 0.7
  return PENALTIES.weekendUse
}

export type ScoreBreakdown = {
  score: number
  signals: Record<keyof typeof WEIGHTS, number>
  penalties: number
  codes: ReasonCode[]
}

export function scorePlacement(input: {
  slot: FreeSlot
  energy: Energy
  priority: Priority
  signals: {
    deadlineFit: number
    contiguity: number
    dayBalance: number
    fragmentation: number
    rhythm: number
    contextMatch: number
  }
  extraCodes?: ReasonCode[]
  overDailyCap?: boolean
  spillover?: boolean
  /** Number of chunks of the same task already on this day. */
  sameTaskChunksToday?: number
  isShoulder?: boolean
}): ScoreBreakdown {
  const energy = energyMatchSignal(input.slot.profile, input.energy)
  const signals = {
    energyMatch: energy,
    deadlineFit: input.signals.deadlineFit,
    contiguity: input.signals.contiguity,
    dayBalance: input.signals.dayBalance,
    fragmentation: input.signals.fragmentation,
    rhythm: input.signals.rhythm,
    contextMatch: input.signals.contextMatch,
  }
  let score = 0
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    score += WEIGHTS[key] * signals[key]
  }
  let penalties = 0
  if (input.overDailyCap) penalties += PENALTIES.overDailyCap
  penalties += weekendPenalty(input.slot, input.priority)
  if (input.spillover) penalties += PENALTIES.spilloverPastDeadline
  if (input.slot.start >= 20 * 60) penalties += PENALTIES.lateEvening
  penalties += PENALTIES.sameTaskSameDay * (input.sameTaskChunksToday ?? 0)
  if (input.isShoulder) penalties += PENALTIES.shoulderHours

  const codes: ReasonCode[] = []
  if (input.slot.profile === 'peak' && input.energy === 'deep') {
    codes.push('energy-peak')
  } else if (input.slot.profile === 'trough' && (input.energy === 'admin' || input.energy === 'light')) {
    codes.push('energy-trough')
  } else {
    codes.push('energy-match')
  }
  if (input.signals.deadlineFit > 0.66) codes.push('deadline-headroom')
  else if (input.signals.deadlineFit < 0.34) codes.push('deadline-tight')
  if (input.signals.dayBalance > 0.6) codes.push('day-balance')
  if (input.signals.fragmentation > 0.8) codes.push('low-fragmentation')
  if (input.signals.rhythm >= 1) codes.push('buffer-preserved')
  if (input.spillover) codes.push('spillover')
  codes.push(...(input.extraCodes ?? []))

  return {
    score: Number(clamp(score - penalties, 0, 1).toFixed(4)),
    signals,
    penalties: Number(penalties.toFixed(4)),
    codes: [...new Set(codes)],
  }
}

/* ------------------------------------------------------------------ *
 * Human-readable reason labels — codes are the API, labels are the copy
 * ------------------------------------------------------------------ */

export const REASON_LABELS: Record<ReasonCode, string> = {
  'energy-peak': 'Your focus peak',
  'energy-match': 'Matches your energy',
  'energy-trough': 'Saved for your low-energy window',
  'deadline-headroom': 'Comfortable room before the deadline',
  'deadline-tight': 'Tight against the deadline',
  'deadline-protected': 'Placed early to protect the deadline',
  contiguous: 'Continues the block before it',
  'day-balance': 'Balances the day’s load',
  'low-fragmentation': 'Avoids leaving an unusable gap',
  'buffer-preserved': 'Keeps your buffer',
  'lunch-protected': 'Lunch left untouched',
  'context-batch': 'Batched with similar work',
  'early-in-week': 'Nothing earlier could fit',
  'morning-protected': 'Protects your morning',
  pinned: 'Pinned by you',
  'after-dependency': 'Runs after what it depends on',
  'split-to-fit': 'Trimmed to fit the largest free gap',
  spillover: 'Extended past the original slot',
  'over-capacity': 'Placed over your daily cap',
  'deadline-risk': 'At risk of missing its deadline',
  'no-fit': 'No room in the week',
}

export function reasonLabel(code: ReasonCode): string {
  return REASON_LABELS[code]
}
