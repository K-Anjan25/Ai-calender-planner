import { generatePlan } from '@/lib/scheduler/engine'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks, overloadedTasks } from '@/lib/sample-data'
import { fmtDuration } from '@/lib/scheduler/slots'
import { totalDemandMinutes } from '@/lib/scheduler/policies'

const weekStart = currentWeekStart(new Date('2026-10-14T09:00:00Z'))
const now = '2026-10-14T09:00:00.000Z'
const prefs = defaultPreferences()

function run(label: string, tasks: ReturnType<typeof demoTasks>) {
  const t0 = Date.now()
  const plan = generatePlan({
    tasks,
    preferences: prefs,
    busy: demoBusy(weekStart),
    pins: [],
    nowISO: now,
    weekStartDate: weekStart,
  })
  const ms = Date.now() - t0
  const r = plan.report
  console.log(`\n=== ${label} (${ms}ms) ===`)
  console.log(`week ${plan.weekLabel} · ${r.fits.toUpperCase()} · ${r.headline}`)
  console.log(`capacity ${fmtDuration(r.capacityMinutes)} · demand ${fmtDuration(r.demandMinutes)} · scheduled ${fmtDuration(r.scheduledMinutes)} · util ${(r.utilisation * 100).toFixed(0)}%`)
  console.log(`blocks ${r.placedCount} · unscheduled ${r.unplacedCount}`)
  for (const u of r.unscheduled) console.log(`   unplaced: ${u.title} — ${fmtDuration(u.minutes)} (${u.why})`)
  for (const w of r.warnings) console.log(`   warn[${w.severity}] ${w.message}`)
  for (const t of r.tradeoffs) console.log(`   tradeoff: ${t.label} → ${t.consequence}`)
  // invariants
  const byDate = new Map<string, typeof plan.blocks>()
  for (const b of plan.blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }
  let overlapsFound = 0
  let outsideHours = 0
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.startMin - b.startMin)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startMin < sorted[i - 1]!.endMin) overlapsFound++
    }
    for (const b of list) {
      if (b.startMin % 15 !== 0 || b.minutes % 15 !== 0) outsideHours++
    }
  }
  const placedByTask = new Map<string, number>()
  for (const b of plan.blocks.filter((b) => b.kind === 'task')) {
    placedByTask.set(b.taskId, (placedByTask.get(b.taskId) ?? 0) + b.minutes)
  }
  let lost = 0
  for (const t of tasks) {
    const got = placedByTask.get(t.id) ?? 0
    const reported = r.unscheduled.find((u) => u.taskId === t.id)?.minutes ?? 0
    const demand = totalDemandMinutes(t)
    if (got + reported !== demand) {
      console.log(`   !! INV-6 broken for ${t.title}: placed ${got} + reported ${reported} != ${demand}`)
      lost += Math.abs(demand - got - reported)
    }
  }
  console.log(`invariants: overlaps=${overlapsFound} unaligned=${outsideHours} lostMinutes=${lost}`)

  // print monday + tuesday
  for (const date of [...byDate.keys()].sort().slice(0, 3)) {
    console.log(`  ${date}:`)
    for (const b of [...(byDate.get(date) ?? [])].sort((a, b) => a.startMin - b.startMin)) {
      const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      console.log(`    ${hh(b.startMin)}-${hh(b.endMin)} ${b.title} [${b.energy}/${b.chunkIndex + 1}of${b.chunkCount}] ${b.score} :: ${b.reasonText}`)
    }
  }
}

run('demo week', demoTasks(weekStart))
run('overloaded week', overloadedTasks(weekStart))
