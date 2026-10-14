import { WEEKDAY_SHORT, type PlanProposal, type Preferences, type Task } from '@/lib/types'
import { fmtClock, fmtDuration } from '@/lib/scheduler/slots'

/** Just enough of a block to notice that it moved, without shipping the whole previous plan. */
export type BlockSnapshot = { id: string; taskId: string; date: string; startMin: number; minutes: number }

/**
 * Human-readable summary of what changed between two plans.
 *
 * "Moved 2 blocks, extended 1" is the sentence that makes an AI planner trustworthy — the user can
 * verify the agent did what they asked without reading a diff. Used by /api/chat and the UI.
 */

export function diffPlans(
  previousTasks: Task[],
  nextTasks: Task[],
  proposal: PlanProposal,
  previousPreferences?: Preferences,
  previousBlocks?: BlockSnapshot[],
): string[] {
  const changes: string[] = []
  const before = new Map(previousTasks.map((task) => [task.id, task]))

  const added = nextTasks.filter((task) => !before.has(task.id))
  for (const task of added.slice(0, 3)) {
    changes.push(
      `Added “${task.title}” · ${fmtDuration(task.estimateMinutes)}${task.deadline ? `, due ${task.deadline.slice(0, 10)}` : ''}.`,
    )
  }
  if (added.length > 3) changes.push(`Added ${added.length - 3} more tasks.`)

  const removed = previousTasks.filter((task) => !nextTasks.some((next) => next.id === task.id))
  for (const task of removed.slice(0, 2)) {
    changes.push(`Removed “${task.title}”.`)
  }

  const reprioritised = nextTasks.filter((task) => {
    const old = before.get(task.id)
    return old && old.priority !== task.priority
  })
  for (const task of reprioritised.slice(0, 2)) {
    changes.push(`“${task.title}” is now ${task.priority}.`)
  }

  const withDeadlineChange = nextTasks.filter((task) => {
    const old = before.get(task.id)
    return old && old.deadline !== task.deadline
  })
  for (const task of withDeadlineChange.slice(0, 2)) {
    changes.push(
      task.deadline
        ? `“${task.title}” now due ${task.deadline.slice(0, 16).replace('T', ' ')}.`
        : `“${task.title}” has no deadline now.`,
    )
  }

  if (previousPreferences) {
    const prefs = proposal.preferences
    if (previousPreferences.weekendMode !== prefs.weekendMode) {
      changes.push(
        prefs.weekendMode === 'off'
          ? 'Weekends are protected again.'
          : 'Weekend mornings are now available as overflow.',
      )
    }
    if (previousPreferences.overflowPreference !== prefs.overflowPreference) {
      changes.push(
        prefs.overflowPreference === 'weekend'
          ? 'When the week is full, weekend time is used first.'
          : prefs.overflowPreference === 'longer-days'
            ? 'When the week is full, days stretch before mornings do.'
            : 'When the week is full, shoulder hours are used first.',
      )
    }
    const hoursChanged = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).some((day) => {
      const before = previousPreferences.workingHours[day]
      const after = prefs.workingHours[day]
      if (!before && !after) return false
      if (!before || !after) return true
      return before.start !== after.start || before.end !== after.end
    })
    if (hoursChanged) {
      const monday = prefs.workingHours.mon
      changes.push(monday ? `Working days now run ${fmtClock(monday.start)}–${fmtClock(monday.end)}.` : 'Working hours changed.')
    }
    if (previousPreferences.bufferMinutes !== prefs.bufferMinutes) {
      changes.push(`Buffers between blocks are now ${prefs.bufferMinutes} minutes.`)
    }
    if (previousPreferences.minBlockMinutes !== prefs.minBlockMinutes) {
      changes.push(`Shortest useful block is now ${fmtDuration(prefs.minBlockMinutes)}.`)
    }
    if (previousPreferences.maxPlannedMinutesPerDay !== prefs.maxPlannedMinutesPerDay) {
      changes.push(`Daily ceiling is now ${fmtDuration(prefs.maxPlannedMinutesPerDay)} of planned work.`)
    }
    if (previousPreferences.maxDeepWorkMinutesPerDay !== prefs.maxDeepWorkMinutesPerDay) {
      changes.push(`Deep work is capped at ${fmtDuration(prefs.maxDeepWorkMinutesPerDay)} per day.`)
    }
    if (previousPreferences.blackouts.length !== prefs.blackouts.length) {
      const added = prefs.blackouts.length > previousPreferences.blackouts.length
      const latest = prefs.blackouts[prefs.blackouts.length - 1]
      changes.push(
        added && latest
          ? `Blocked ${latest.weekday ? `${WEEKDAY_SHORT[latest.weekday]} ` : ''}${fmtClock(latest.start)}–${fmtClock(latest.end)} (${latest.label}).`
          : 'A blocked window was removed.',
      )
    }
  }

  if (previousBlocks && previousBlocks.length > 0) {
    const before = new Map(previousBlocks.map((block) => [block.id, block]))
    const after = new Map(proposal.blocks.filter((block) => block.kind === 'task').map((block) => [block.id, block]))
    let moved = 0
    let addedBlocks = 0
    for (const [id, current] of after) {
      const previous = before.get(id)
      if (!previous) {
        addedBlocks += 1
        continue
      }
      if (previous.date !== current.date || previous.startMin !== current.startMin || previous.minutes !== current.minutes) moved += 1
    }
    let dropped = 0
    for (const id of before.keys()) if (!after.has(id)) dropped += 1
    if (moved > 0) changes.push(`Moved ${moved} block${moved === 1 ? '' : 's'} to fit.`)
    if (addedBlocks > 0) changes.push(`Placed ${addedBlocks} new block${addedBlocks === 1 ? '' : 's'}.`)
    if (dropped > 0) changes.push(`Unplaced ${dropped} block${dropped === 1 ? '' : 's'} that no longer had room.`)
  }

  const report = proposal.report
  if (report.unplacedCount > 0) {
    const total = report.unscheduled.reduce((sum, item) => sum + item.minutes, 0)
    changes.push(`${fmtDuration(total)} across ${report.unplacedCount} task${report.unplacedCount === 1 ? '' : 's'} still does not fit.`)
  }
  if (report.deadlineRisks.length > 0) {
    changes.push(`${report.deadlineRisks.length} deadline risk${report.deadlineRisks.length === 1 ? '' : 's'} flagged.`)
  }
  if (changes.length === 0) {
    changes.push('No structural change — the plan already matched that request.')
  }
  return changes.slice(0, 6)
}
