import {
  PRIORITY_ORDER,
  SNAP_MINUTES,
  WEEKDAY_SHORT,
  type BusyEvent,
  type DayLoad,
  type PlacedBlock,
  type PlanProposal,
  type PlanReport,
  type Preferences,
  type Task,
  type TradeoffOption,
  type Warning,
} from '@/lib/types'
import {
  fmtDuration,
  overlaps,
  workingHoursFor,
  type FreeSlot,
  type WeekFrame,
} from '@/lib/scheduler/slots'
import { absMinuteOf, occurrenceCount, totalDemandMinutes, type OrderingContext } from '@/lib/scheduler/policies'

/**
 * Stage 5 — evaluate (`ARCHITECTURE.md` §5.1).
 *
 * Turns the placed blocks into an honest report: what fits, what does not, why, and what the user
 * could trade to make it fit. This is where INV-6 (no silent loss) is *reconciled* rather than
 * assumed — the numbers here are derived from inputs, not from the placement loop.
 */

export type EvaluateInput = {
  frame: WeekFrame
  prefs: Preferences
  tasks: Task[]
  busy: BusyEvent[]
  blocks: PlacedBlock[]
  slots: FreeSlot[]
  droppedPins: string[]
  failures: Map<string, string>
  engine: 'deterministic' | 'agent'
  generatedAt: string
}

const OPEN_GAP_MIN = 20
const MARATHON_MINUTES = 6 * 60 + 30
const NO_BREAK_MINUTES = 4 * 60
const THRASH_SWITCHES = 8

function orderedContext(frame: WeekFrame): OrderingContext {
  return {
    nowAbs: 0,
    frameStartDate: frame.weekStartDate,
    daysByDate: new Map(frame.days.map((d) => [d.date, { dayIndex: d.dayIndex }])),
  }
}

export function evaluatePlan(input: EvaluateInput): PlanProposal {
  const { frame, prefs, tasks, busy, blocks, slots, failures, droppedPins } = input
  const ordering = orderedContext(frame)

  const taskBlocks = blocks.filter((b) => b.kind === 'task')
  const scheduledByTask = new Map<string, number>()
  for (const block of taskBlocks) {
    scheduledByTask.set(block.taskId, (scheduledByTask.get(block.taskId) ?? 0) + block.minutes)
  }

  const meetingMinutes = busy.reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0)
  const capacityMinutes =
    slots.reduce((sum, s) => sum + s.minutes, 0) + taskBlocks.filter((b) => b.pinned).reduce((sum, b) => sum + b.minutes, 0)
  const demandMinutes = tasks.reduce((sum, t) => sum + totalDemandMinutes(t), 0)
  const scheduledMinutes = taskBlocks.reduce((sum, b) => sum + b.minutes, 0)
  const utilisation = capacityMinutes > 0 ? Number((scheduledMinutes / capacityMinutes).toFixed(3)) : 0

  /* ---------- unplaced work (INV-6 reconciliation) ---------- */
  const unscheduled: PlanReport['unscheduled'] = []
  for (const task of tasks) {
    const scheduled = scheduledByTask.get(task.id) ?? 0
    const deficit = totalDemandMinutes(task) - scheduled
    if (deficit <= 0) continue
    unscheduled.push({
      taskId: task.id,
      title: task.title,
      minutes: deficit,
      why: failures.get(task.id) ?? 'No window large enough was left in the week',
    })
  }
  unscheduled.sort((a, b) => b.minutes - a.minutes || (a.taskId < b.taskId ? -1 : 1))
  const unplacedCount = unscheduled.length

  /* ---------- deadline risk ---------- */
  const deadlineRisks: PlanReport['deadlineRisks'] = []
  for (const task of tasks) {
    if (!task.deadline) continue
    const scheduled = scheduledByTask.get(task.id) ?? 0
    const lateBlocks = taskBlocks.filter((b) => b.taskId === task.id && b.conflict === 'deadline-risk')
    const shortfall = totalDemandMinutes(task) - scheduled
    if (shortfall <= 0 && !lateBlocks.length) continue
    const deadlineAbs = absMinuteOf(task.deadline, ordering)
    const lastBlock = [...taskBlocks].filter((b) => b.taskId === task.id).sort((a, b) => b.endMin - a.endMin)[0]
    const lastAbs = lastBlock ? lastBlock.dayIndex * 1440 + lastBlock.endMin : 0
    const severity: 'warn' | 'critical' =
      (deadlineAbs !== null && lastAbs > deadlineAbs) || shortfall > 0 ? 'critical' : 'warn'
    deadlineRisks.push({
      taskId: task.id,
      title: task.title,
      deadline: task.deadline,
      scheduledMinutes: scheduled,
      requiredMinutes: totalDemandMinutes(task),
      severity,
    })
  }
  deadlineRisks.sort((a, b) => (a.deadline < b.deadline ? -1 : 1))

  /* ---------- per-day load ---------- */
  const perDay: DayLoad[] = frame.days.map((day) => {
    const dayBlocks = taskBlocks.filter((b) => b.date === day.date)
    const meetings = busy.filter((e) => e.date === day.date).reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0)
    const hours = workingHoursFor(prefs, day.weekday)
    const windowMinutes = hours ? Math.max(0, hours.end - hours.start) : 0
    const capacity = hours ? windowMinutes - meetings : 0
    return {
      weekday: day.weekday,
      date: day.date,
      capacityMinutes: Math.max(0, Math.round(capacity)),
      plannedMinutes: dayBlocks.reduce((sum, b) => sum + b.minutes, 0),
      deepMinutes: dayBlocks.filter((b) => b.energy === 'deep').reduce((sum, b) => sum + b.minutes, 0),
      meetingMinutes: Math.round(meetings),
      blocks: dayBlocks.length,
    }
  })

  /* ---------- warnings ---------- */
  const warnings: Warning[] = []
  for (const day of frame.days) {
    const dayBlocks = taskBlocks.filter((b) => b.date === day.date).sort((a, b) => a.startMin - b.startMin)
    if (!dayBlocks.length) continue
    const total = dayBlocks.reduce((sum, b) => sum + b.minutes, 0)
    const label = WEEKDAY_SHORT[day.weekday]

    if (total >= MARATHON_MINUTES) {
      warnings.push({
        code: 'marathon',
        severity: 'warn',
        weekday: day.weekday,
        message: `${label} carries ${fmtDuration(total)} of work — that is a marathon, not a plan.`,
      })
    }
    let longestStreak = 0
    let streak = 0
    let prevEnd: number | null = null
    for (const block of dayBlocks) {
      if (prevEnd !== null && block.startMin - prevEnd <= SNAP_MINUTES) streak += block.minutes
      else streak = block.minutes
      longestStreak = Math.max(longestStreak, streak)
      prevEnd = block.endMin
    }
    if (longestStreak >= NO_BREAK_MINUTES) {
      warnings.push({
        code: 'no-break-day',
        severity: 'warn',
        weekday: day.weekday,
        message: `${label} has ${fmtDuration(longestStreak)} without a real break.`,
      })
    }
    let openGaps = 0
    for (let i = 0; i < dayBlocks.length - 1; i += 1) {
      const current = dayBlocks[i]
      const next = dayBlocks[i + 1]
      if (!current || !next) continue
      const gap = next.startMin - current.endMin
      if (gap >= OPEN_GAP_MIN && gap < prefs.minBlockMinutes) openGaps += 1
    }
    if (openGaps >= 2) {
      warnings.push({
        code: 'fragmentation',
        severity: 'info',
        weekday: day.weekday,
        message: `${label} is fragmented — ${openGaps} gaps too short to use properly.`,
      })
    }
    const switches = dayBlocks.reduce((count, block, index) => {
      const prev = dayBlocks[index - 1]
      return prev && prev.category !== block.category ? count + 1 : count
    }, 0)
    if (switches >= THRASH_SWITCHES) {
      warnings.push({
        code: 'context-thrash',
        severity: 'info',
        weekday: day.weekday,
        message: `${label} switches context ${switches} times. Grouping similar work would help.`,
      })
    }
    if (dayBlocks.some((b) => b.startMin >= 20 * 60)) {
      warnings.push({
        code: 'back-to-back',
        severity: 'info',
        weekday: day.weekday,
        message: `${label} runs past 20:00 — late blocks rarely survive contact with reality.`,
      })
    }
  }

  const weekendUsed = taskBlocks.filter((b) => b.weekday === 'sat' || b.weekday === 'sun')
  if (weekendUsed.length) {
    warnings.push({
      code: 'weekend-used',
      severity: 'info',
      message: `${fmtDuration(weekendUsed.reduce((s, b) => s + b.minutes, 0))} landed on the weekend because the weekdays could not hold it.`,
    })
  }

  /* ---------- deadline cliff ---------- */
  const deadlines = tasks
    .filter((t) => t.deadline)
    .map((t) => ({ task: t, abs: absMinuteOf(t.deadline as string, ordering) ?? 0 }))
    .sort((a, b) => a.abs - b.abs)
  for (let i = 1; i < deadlines.length; i += 1) {
    const prev = deadlines[i - 1]
    const current = deadlines[i]
    if (!prev || !current) continue
    if (current.abs - prev.abs <= 8 * 60) {
      warnings.push({
        code: 'deadline-cliff',
        severity: 'warn',
        message: `“${prev.task.title}” and “${current.task.title}” are due within ${fmtDuration(
          Math.max(0, current.abs - prev.abs),
        )} of each other.`,
      })
      break
    }
  }

  if (droppedPins.length > 0) {
    const titles = droppedPins
      .map((taskId) => tasks.find((task) => task.id === taskId)?.title)
      .filter((title): title is string => Boolean(title))
    warnings.push({
      code: 'pin-ignored',
      severity: 'warn',
      message: `Could not keep ${titles.length === 1 ? `“${titles[0]}”` : `${titles.length} blocks`} where you put ${
        titles.length === 1 ? 'it' : 'them'
      } — that spot is already taken by a meeting or sits outside your working hours.`,
    })
  }

  if (scheduledMinutes > capacityMinutes && capacityMinutes > 0) {
    warnings.push({
      code: 'over-capacity',
      severity: 'critical',
      message: `You are ${fmtDuration(scheduledMinutes - capacityMinutes)} over the time you actually have.`,
    })
  }

  /* ---------- trade-offs ---------- */
  const tradeoffs = buildTradeoffs({ tasks, unscheduled, prefs, frame, slots, scheduledByTask })

  /* ---------- verdict ---------- */
  const unscheduledMinutes = unscheduled.reduce((sum, u) => sum + u.minutes, 0)
  // A 15-minute sliver that will not fit is a footnote, not a crisis. Only a shortfall that a
  // human would call real (a whole block, or 2% of the week) downgrades the verdict.
  const significantShortfall = unscheduledMinutes >= Math.max(prefs.minBlockMinutes, demandMinutes * 0.02)
  const overCapacity = scheduledMinutes > capacityMinutes && unplacedCount > 0
  const fits: PlanReport['fits'] = overCapacity
    ? 'overbooked'
    : utilisation >= 0.92 || deadlineRisks.some((r) => r.severity === 'critical') || significantShortfall
      ? 'tight'
      : 'fits'

  const slack = Math.max(0, capacityMinutes - scheduledMinutes)
  const leftover =
    unplacedCount > 0 && !significantShortfall
      ? ` (${fmtDuration(unscheduledMinutes)} of loose ends stayed unplaced)`
      : ''
  const headline =
    fits === 'fits'
      ? `Fits — ${Math.round(utilisation * 100)}% of your working time is booked, leaving ${fmtDuration(slack)} of slack.${leftover}`
      : fits === 'tight'
        ? `Tight — ${Math.round(utilisation * 100)}% booked${significantShortfall ? `, ${fmtDuration(unscheduledMinutes)} has nowhere to go` : ''}.`
        : `Overbooked — ${fmtDuration(unscheduledMinutes)} of work does not fit this week.`

  const report: PlanReport = {
    fits,
    capacityMinutes,
    demandMinutes,
    scheduledMinutes,
    meetingMinutes,
    utilisation,
    placedCount: taskBlocks.length,
    unplacedCount,
    unscheduled,
    deadlineRisks,
    warnings: warnings.slice(0, 8),
    perDay,
    tradeoffs,
    headline,
  }

  return {
    weekStart: frame.weekStartDate,
    weekLabel: frame.weekLabel,
    blocks: [...blocks].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.startMin !== b.startMin) return a.startMin - b.startMin
      return a.id < b.id ? -1 : 1
    }),
    report,
    busy,
    tasks,
    preferences: prefs,
    pins: [],
    engine: input.engine,
    generatedAt: input.generatedAt,
  }
}

/* ------------------------------------------------------------------ *
 * Trade-offs (PRD J4 / FR-3.11)
 * ------------------------------------------------------------------ */

const TRADEOFF_RANK: Record<TradeoffOption['kind'], number> = {
  split: 0,
  shorten: 1,
  'extend-hours': 2,
  'use-weekend': 3,
  defer: 4,
  drop: 5,
}

function buildTradeoffs(input: {
  tasks: Task[]
  unscheduled: PlanReport['unscheduled']
  prefs: Preferences
  frame: WeekFrame
  slots: FreeSlot[]
  scheduledByTask: Map<string, number>
}): TradeoffOption[] {
  const { tasks, unscheduled, prefs, frame, slots, scheduledByTask } = input
  const options: TradeoffOption[] = []

  const weekendSlots = slots.filter((s) => s.weekend)
  const weekendFree = weekendSlots.reduce((sum, s) => sum + s.minutes, 0)

  for (const item of unscheduled) {
    const task = tasks.find((t) => t.id === item.taskId)
    if (!task) continue

    const sessions = Math.ceil(task.estimateMinutes / 90)
    if (!task.splittable && occurrenceCount(task) === 1 && sessions > 1 && task.estimateMinutes >= 90) {
      options.push({
        id: `to_split_${task.id}`,
        kind: 'split',
        taskId: task.id,
        label: `Allow “${task.title}” to be split`,
        consequence: `Broken into ${sessions} sessions of about ${fmtDuration(
          Math.round(task.estimateMinutes / sessions),
        )}, it fits into gaps that are currently unusable.`,
        minutesRecovered: item.minutes,
      })
    }

    if (item.minutes > 0 && occurrenceCount(task) > 1) {
      options.push({
        id: `to_occurrence_${task.id}`,
        kind: 'shorten',
        taskId: task.id,
        label: `Drop one “${task.title}” this week`,
        consequence: `Skips one of its ${occurrenceCount(task)} occurrences. Frees ${fmtDuration(
          task.estimateMinutes,
        )} and keeps the weekly rhythm mostly intact.`,
        minutesRecovered: task.estimateMinutes,
      })
    } else if (item.minutes > 0) {
      const shortenBy = Math.min(
        item.minutes,
        Math.max(SNAP_MINUTES, Math.round(item.minutes / 2 / SNAP_MINUTES) * SNAP_MINUTES),
      )
      options.push({
        id: `to_shorten_${task.id}`,
        kind: 'shorten',
        taskId: task.id,
        label: `Cut “${task.title}” by ${fmtDuration(shortenBy)}`,
        consequence: `Brings the task inside the week, but with ${fmtDuration(
          Math.max(0, item.minutes - shortenBy),
        )} of work left undone.`,
        minutesRecovered: shortenBy,
      })
    }

    if (prefs.weekendMode === 'off' && weekendFree > 0) {
      options.push({
        id: `to_weekend_${task.id}`,
        kind: 'use-weekend',
        taskId: task.id,
        label: `Let “${task.title}” use ${WEEKDAY_SHORT[frame.days[5]?.weekday ?? 'sat']} morning`,
        consequence: `Recovers up to ${fmtDuration(Math.min(item.minutes, weekendFree))} of weekend time. Your weekdays stay protected.`,
        minutesRecovered: Math.min(item.minutes, weekendFree),
      })
    }

    const beforeHours = frame.days.reduce((sum, day) => {
      const hours = workingHoursFor(prefs, day.weekday)
      if (!hours) return sum
      const early = hours.start - 7 * 60
      return sum + Math.max(0, early)
    }, 0)
    if (beforeHours > 0) {
      options.push({
        id: `to_early_${task.id}`,
        kind: 'extend-hours',
        taskId: task.id,
        label: 'Start days an hour earlier',
        consequence: `Opens ${fmtDuration(beforeHours)} across the week, before anyone else is awake.`,
        minutesRecovered: Math.min(item.minutes, beforeHours),
      })
    }

    options.push({
      id: `to_defer_${task.id}`,
      kind: 'defer',
      taskId: task.id,
      label: `Move “${task.title}” past its deadline`,
      consequence: task.deadline
        ? `Delivers late. Everything else in the plan stays intact.`
        : `Pushes the work to a later week with no other change to the plan.`,
      minutesRecovered: item.minutes,
    })
  }

  // A drop option is only offered for the least important unfinished work.
  const ranked = unscheduled
    .map((u) => ({ u, task: tasks.find((t) => t.id === u.taskId) }))
    .filter((entry): entry is { u: PlanReport['unscheduled'][number]; task: Task } => Boolean(entry.task))
    .sort((a, b) => PRIORITY_ORDER[b.task.priority] - PRIORITY_ORDER[a.task.priority])
  const droppable = ranked[0]
  if (droppable && scheduledByTask.get(droppable.task.id) === undefined) {
    options.push({
      id: `to_drop_${droppable.task.id}`,
      kind: 'drop',
      taskId: droppable.task.id,
      label: `Drop “${droppable.task.title}” this week`,
      consequence: `${fmtDuration(droppable.u.minutes)} of ${droppable.task.priority} work is released. Nothing is silently deleted — it goes back to your inbox.`,
      minutesRecovered: droppable.u.minutes,
    })
  }

  // Global levers (weekend, early starts) appear once each, not once per unfinished task.
  const seen = new Set<string>()
  const deduped = options.filter((option) => {
    const key = option.kind === 'use-weekend' || option.kind === 'extend-hours' ? option.kind : option.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return deduped
    .filter((option) => option.minutesRecovered >= Math.max(SNAP_MINUTES, prefs.minBlockMinutes))
    .sort((a, b) => {
      const rank = TRADEOFF_RANK[a.kind] - TRADEOFF_RANK[b.kind]
      if (rank !== 0) return rank
      if (b.minutesRecovered !== a.minutesRecovered) return b.minutesRecovered - a.minutesRecovered
      return a.id < b.id ? -1 : 1
    })
    .slice(0, 5)
}

/** Convenience used by the UI to describe a block's span. */
export function blockSpanLabel(block: PlacedBlock): string {
  const h = Math.floor(block.startMin / 60)
  const m = block.startMin % 60
  const eh = Math.floor(block.endMin / 60)
  const em = block.endMin % 60
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')} – ${`${eh}`.padStart(2, '0')}:${`${em}`.padStart(2, '0')}`
}

export function overlapsBusy(block: PlacedBlock, busy: BusyEvent[]): boolean {
  return busy.some((e) => e.date === block.date && overlaps(block.startMin, block.endMin, e.startMin, e.endMin))
}
