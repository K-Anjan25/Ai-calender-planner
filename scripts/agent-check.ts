import { runPlannerAgent } from '@/lib/agent/planner-agent'
import { currentWeekStart, defaultPreferences, demoBusy, DEMO_FREE_TEXT } from '@/lib/sample-data'
import { fmtDuration } from '@/lib/scheduler/slots'
import type { Pin, PlacedBlock } from '@/lib/types'

/**
 * A conversational walkthrough of the planner agent (TASK.md T-508, N-9).
 *
 * It exists to answer one question: *does the agent behave like a planner over several turns?* So it
 * carries the same session state the browser does — tasks, preferences **and pins** — from each turn
 * into the next, and then verifies that a pin made three turns ago is still honoured. A harness that
 * resets pins every turn cannot see the bugs that live in the carry-over.
 */

const weekStart = currentWeekStart(new Date('2026-10-14T09:00:00Z'))
const nowISO = '2026-10-14T09:00:00.000Z'

type Turn = { message: string; expect: 'moves' | 'report' | 'explains' }

const turns: Turn[] = [
  { message: "I'm out Friday afternoon", expect: 'moves' },
  { message: 'start at 8:30 and finish by 17:30', expect: 'moves' },
  { message: 'use the weekend if it helps', expect: 'moves' },
  { message: 'add a 90 minute writing block by Thursday, it is P0', expect: 'moves' },
  { message: 'move the gym to Saturday morning', expect: 'moves' }, // ← the pin we carry forward
  { message: 'move the deck to Tuesday morning', expect: 'moves' }, // ← and a second, later pin
  { message: 'what fits in the week', expect: 'report' },
]

/** Newest pin wins, per task — the same rule the store applies (`planner-store.pinBlock`). */
function mergePins(current: Pin[], incoming: Pin[]): Pin[] {
  const byTask = new Map(current.map((pin) => [pin.taskId, pin]))
  for (const pin of incoming) byTask.set(pin.taskId, pin)
  return [...byTask.values()].sort((a, b) => a.taskId.localeCompare(b.taskId))
}

function warningCodes(report: { warnings?: { code: string }[] }): string[] {
  return (report.warnings ?? []).map((warning) => warning.code)
}

function findBlock(blocks: PlacedBlock[], pin: Pin): PlacedBlock | undefined {
  return blocks.find((block) => block.taskId === pin.taskId && block.date === pin.date && block.kind === 'task')
}

/**
 * Three honest outcomes, and the difference matters (D-014):
 *  - honoured   — the block sits exactly where the pin asked;
 *  - refused    — the pin was impossible, it was reported (`pin-ignored`), and the block went
 *                 somewhere feasible instead;
 *  - unplaced   — the task has no block anywhere; the plan owes the user minutes it never placed.
 */
function pinLine(pin: Pin, blocks: PlacedBlock[], warnings: string[]): string {
  const block = findBlock(blocks, pin)
  const wanted = `wants ${pin.date.slice(5)} ${hhmm(pin.startMin)}`
  if (block && block.startMin === pin.startMin) {
    return `  ✓ ${pin.taskId} ${wanted} → ${block.weekday} ${hhmm(block.startMin)}–${hhmm(block.endMin)} (honoured)`
  }
  const elsewhere = blocks.filter((item) => item.taskId === pin.taskId && item.kind === 'task')
  const why = warnings.includes('pin-ignored') ? 'reported pin-ignored' : 'no pin-ignored warning!'
  if (elsewhere.length === 0) return `  ✗ ${pin.taskId} ${wanted} → unplaced — ${why}`
  const where = elsewhere.map((item) => `${item.weekday} ${hhmm(item.startMin)}`).join(', ')
  return `  ✗ ${pin.taskId} ${wanted} → moved to ${where} — ${why}`
}

function hhmm(minutes: number): string {
  return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`
}

async function main() {
  let failures = 0

  // 1. free-text intake from scratch
  const first = await runPlannerAgent({
    tasks: [],
    preferences: defaultPreferences(),
    busy: demoBusy(weekStart),
    pins: [],
    weekStartDate: weekStart,
    nowISO,
    freeText: DEMO_FREE_TEXT,
    mode: 'auto',
  })
  let tasks = first.tasks
  let preferences = first.proposal.preferences
  let pins: Pin[] = mergePins([], first.pins)
  /** The pin that must still be honoured an arbitrary number of turns later. */
  let pinOfInterest: Pin | null = null

  console.log('=== free-text intake ===')
  console.log(`provider=${first.provider} mode=${first.mode}`)
  console.log('tasks parsed:')
  for (const task of tasks) {
    console.log(
      `  - ${task.title} · ${fmtDuration(task.estimateMinutes)}${task.repeatDays ? ' ×' + task.repeatDays.length : ''} · ${task.priority}/${task.energy}/${task.category}${task.deadline ? ' · due ' + task.deadline.slice(5, 16).replace('T', ' ') : ''}${task.estimatedByAI ? ' (estimated)' : ''}`,
    )
  }
  console.log('notes:', first.notes.join(' | '))
  console.log('reply:', first.reply)
  console.log('trace:', first.trace.map((step) => `${step.tool}(${step.ms}ms)`).join(' → '))
  console.log('headline:', first.proposal.report.headline)

  if (tasks.length === 0) {
    failures += 1
    console.log('✗ free-text intake produced no tasks')
  }

  // 2. conversational refinement — carrying tasks, preferences and pins like a session does
  for (const turn of turns) {
    const result = await runPlannerAgent({
      tasks,
      preferences,
      busy: demoBusy(weekStart),
      pins,
      weekStartDate: weekStart,
      nowISO,
      message: turn.message,
      mode: 'local',
    })
    tasks = result.tasks
    preferences = result.proposal.preferences
    const before = pins
    pins = mergePins(pins, result.pins)

    console.log(`\n--- "${turn.message}"`)
    console.log('reply:', result.reply)
    console.log(
      `prefs: overflow=${preferences.overflowPreference} weekend=${preferences.weekendMode} mon=${JSON.stringify(preferences.workingHours.mon)} blackouts=${preferences.blackouts.length} tasks=${tasks.length}`,
    )
    console.log(`verdict: ${result.proposal.report.fits} · ${result.proposal.report.headline}`)

    if (pins.length !== before.length) {
      const added = pins.filter((pin) => !before.some((old) => old.taskId === pin.taskId))
      console.log('new pins:')
      const codes = warningCodes(result.proposal.report)
      for (const pin of added) console.log(pinLine(pin, result.proposal.blocks, codes))
    }

    // Remember the gym pin so we can prove it survives the remaining turns.
    if (!pinOfInterest) {
      const candidate = pins.find((pin) => pin.taskId.includes('gym'))
      if (candidate) pinOfInterest = candidate
    }

    if (result.reply.trim().length === 0) {
      failures += 1
      console.log('✗ empty reply')
    }
    if (turn.expect === 'moves' && result.trace.length === 0) {
      failures += 1
      console.log('✗ no tool trace — the turn did nothing')
    }
  }

  // 3. the point of N-9: a pin from an earlier turn is still in force at the end of the session
  console.log('\n=== pins carried across turns ===')
  const last = await runPlannerAgent({
    tasks,
    preferences,
    busy: demoBusy(weekStart),
    pins,
    weekStartDate: weekStart,
    nowISO,
    mode: 'local',
  })

  if (pins.length === 0) {
    failures += 1
    console.log('✗ no pins were produced by any turn — the carry-over is untested')
  }
  const lastCodes = warningCodes(last.proposal.report)
  for (const pin of pins) console.log(pinLine(pin, last.proposal.blocks, lastCodes))

  // The point of N-9: a pin made several turns ago is still in force at the end of the session.
  const before = last.proposal.pins
  const survived = pins.every((pin) => before.some((kept) => kept.taskId === pin.taskId && kept.date === pin.date && kept.startMin === pin.startMin))
  if (!survived) {
    failures += 1
    console.log('✗ the pins sent in were not all still in the plan that came back')
  } else if (pins.length > 0) {
    console.log(`✓ all ${pins.length} pins made during the conversation are still in force`)
  }

  if (pinOfInterest) {
    const block = findBlock(last.proposal.blocks, pinOfInterest)
    if (block?.startMin === pinOfInterest.startMin && block.date === pinOfInterest.date) {
      console.log(`✓ the pin from an earlier turn still holds: ${pinOfInterest.taskId} at ${hhmm(pinOfInterest.startMin)}`)
    } else {
      failures += 1
      console.log(`✗ the earlier pin was lost or moved: ${pinOfInterest.taskId} wanted ${hhmm(pinOfInterest.startMin)}`)
    }
  } else {
    failures += 1
    console.log('✗ no gym pin was ever created, so persistence could not be checked')
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}: ${turns.length + 2} turns, ${tasks.length} tasks, ${pins.length} pins carried`)
  if (failures > 0) process.exitCode = 1
}

void main()
