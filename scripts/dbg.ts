import { parseTasksLocally, parseDeadline } from '@/lib/agent/local-reasoner'
const ctx = { nowISO: '2026-10-14T09:00:00.000Z', weekStartDate: '2026-10-12' }
for (const text of ['Review PRs every weekday, 30 minutes', 'Gym Mon/Wed/Fri, 45 minutes', 'Expenses and inbox zero sometime this week', 'Finish the Q4 board deck (4h) by Thursday 5pm']) {
  const parsed = parseTasksLocally(text, ctx)
  console.log(JSON.stringify(text))
  for (const t of parsed.tasks) console.log('   →', t.title, '|', t.energy, t.category, '|', t.estimateMinutes, '|', t.repeatDays, '|', t.deadline)
}
console.log('deadline by Thursday 5pm:', parseDeadline('by Thursday 5pm', ctx))
console.log('deadline before Friday lunch:', parseDeadline('before Friday lunch', ctx))
