import { buildFreeSlots, buildWeekFrame, fmtDuration, fmtClock } from '@/lib/scheduler/slots'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks } from '@/lib/sample-data'
import { generatePlan } from '@/lib/scheduler/engine'

const weekStart = currentWeekStart(new Date('2026-10-14T09:00:00Z'))
const prefs = defaultPreferences()
const frame = buildWeekFrame(weekStart, prefs.weekStartsOn)
const slots = buildFreeSlots({ frame, preferences: prefs, busy: demoBusy(weekStart) })
for (const day of frame.days) {
  const daySlots = slots.filter((s) => s.date === day.date)
  console.log(`${day.weekday}: ${daySlots.map((s) => `${fmtClock(s.start)}-${fmtClock(s.end)}(${s.profile[0]},${s.minutes}m)`).join(' ')}  total ${fmtDuration(daySlots.reduce((a, b) => a + b.minutes, 0))}`)
}
const plan = generatePlan({ tasks: demoTasks(weekStart), preferences: prefs, busy: demoBusy(weekStart), pins: [], nowISO: '2026-10-14T09:00:00.000Z', weekStartDate: weekStart })
console.log('\n--- all blocks ---')
for (const day of frame.days) {
  const blocks = plan.blocks.filter((b) => b.date === day.date).sort((a, b) => a.startMin - b.startMin)
  console.log(`${day.weekday}: ${blocks.map((b) => `${fmtClock(b.startMin)}-${fmtClock(b.endMin)} ${b.title.slice(0, 22)} [${b.energy}/${b.chunkIndex + 1}of${b.chunkCount}]${b.conflict ? ' !' + b.conflict : ''}`).join(' | ')}`)
}
