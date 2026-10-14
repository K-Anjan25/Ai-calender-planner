import { runPlannerAgent } from '@/lib/agent/planner-agent'
import { currentWeekStart, defaultPreferences, demoBusy, DEMO_FREE_TEXT } from '@/lib/sample-data'
import { fmtDuration } from '@/lib/scheduler/slots'

const weekStart = currentWeekStart(new Date('2026-10-14T09:00:00Z'))
const nowISO = '2026-10-14T09:00:00.000Z'

async function main() {
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
  console.log('=== free-text intake ===')
  console.log(`provider=${first.provider} mode=${first.mode}`)
  console.log('tasks parsed:')
  for (const t of first.tasks) {
    console.log(`  - ${t.title} · ${fmtDuration(t.estimateMinutes)}${t.repeatDays ? ' ×' + t.repeatDays.length : ''} · ${t.priority}/${t.energy}/${t.category}${t.deadline ? ' · due ' + t.deadline.slice(5, 16).replace('T', ' ') : ''}${t.estimatedByAI ? ' (estimated)' : ''}`)
  }
  console.log('notes:', first.notes.join(' | '))
  console.log('reply:', first.reply)
  console.log('trace:', first.trace.map((s) => `${s.tool}(${s.ms}ms)`).join(' → '))
  console.log('headline:', first.proposal.report.headline)

  // 2. conversational refinement
  const messages = [
    "I'm out Friday afternoon",
    'start at 8:30 and finish by 17:30',
    'use the weekend if it helps',
    'add a 90 minute writing block by Thursday, it is P0',
    'move the gym to Saturday morning',
    'move the deck to Tuesday morning',
    'what fits in the week',
  ]
  for (const message of messages) {
    const result = await runPlannerAgent({
      tasks: first.tasks,
      preferences: first.proposal.preferences,
      busy: demoBusy(weekStart),
      pins: [],
      weekStartDate: weekStart,
      nowISO,
      message,
      mode: 'local',
    })
    console.log(`\n--- "${message}"`)
    console.log('reply:', result.reply)
    const prefs = result.proposal.preferences
    console.log(`prefs: overflow=${prefs.overflowPreference} weekend=${prefs.weekendMode} mon=${JSON.stringify(prefs.workingHours.mon)} blackouts=${prefs.blackouts.length} tasks=${result.tasks.length}`)
    console.log(`verdict: ${result.proposal.report.fits} · ${result.proposal.report.headline}`)
  }
}
main()
