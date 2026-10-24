import './harness/setup-dom'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { localWallISO, zonedMidnight, zonedWallInstant } from '@/lib/timezone'
import { busyEventsFromFreeBusy, parsePrimaryBusy, detectDrift } from '@/lib/google/calendar'
import { planningBusy } from '@/lib/google/planning-context'
import { privatePlannerAllowed } from '@/lib/auth/planner-access'
import { demoUser, type SessionPayload } from '@/lib/auth/session'
import { planningResponse } from '@/lib/planning-stream'
import { withinBudget } from '@/lib/agent/planner-agent'
import { defaultPreferences } from '@/lib/sample-data'
import { POST } from '@/app/api/plan/route'
import type { BusyEvent } from '@/lib/types'

describe('PRD completion: calendar boundaries and safe availability', () => {
  it('uses Asia/Kolkata rather than the server timezone', () => {
    assert.equal(localWallISO('2026-10-24T00:00:00Z', 'Asia/Kolkata'), '2026-10-24T05:30:00')
    assert.equal(zonedMidnight('2026-10-24', 'Asia/Kolkata').toISOString(), '2026-10-23T18:30:00.000Z')
  })
  it('bounds DST days at local midnight (23 and 25 hours)', () => {
    const midnight = (date: string) => zonedMidnight(date, 'America/New_York').getTime()
    assert.equal((midnight('2026-03-09') - midnight('2026-03-08')) / 3600000, 23)
    assert.equal((midnight('2026-11-02') - midnight('2026-11-01')) / 3600000, 25)
    assert.equal(zonedWallInstant('2026-03-08', 9 * 60, 'America/New_York').toISOString(), '2026-03-08T13:00:00.000Z')
  })
  it('splits an India overnight busy event on both local dates', () => {
    const events = busyEventsFromFreeBusy([{ start: '2026-10-26T18:00:00Z', end: '2026-10-26T19:00:01Z' }], '2026-10-26', 'Asia/Kolkata')
    assert.deepEqual(events.map(({ date, startMin, endMin }) => ({ date, startMin, endMin })), [
      { date: '2026-10-26', startMin: 1410, endMin: 1440 }, { date: '2026-10-27', startMin: 0, endMin: 31 },
    ])
  })
  it('does not mistake per-calendar failures, missing primary or malformed ranges for availability', () => {
    assert.equal(parsePrimaryBusy({ calendars: { primary: { errors: [{ reason: 'forbidden' }] } } }), null)
    assert.equal(parsePrimaryBusy({ calendars: {} }), null)
    assert.equal(parsePrimaryBusy({ calendars: { primary: { busy: [{ start: 'bad', end: 'bad' }] } } }), null)
    assert.deepEqual(parsePrimaryBusy({ calendars: { primary: { busy: [] } } }), [])
  })
  it('refreshes connected context, retaining manual events but replacing demo and stale Google events', async () => {
    const event = (id: string, source: BusyEvent['source']): BusyEvent => ({ id, source, title: 'Busy', date: '2026-10-26', startMin: 600, endMin: 660 })
    const result = await planningBusy('2026-10-26', 'UTC', [event('demo', 'demo'), event('old', 'google'), event('manual', 'manual')], {
      connected: async () => true, load: async () => ({ ok: true, events: [event('fresh', 'google')] }),
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.events.map(e => e.id), ['manual', 'fresh'])
  })
  it('fails closed if connected freebusy cannot be refreshed', async () => {
    assert.deepEqual(await planningBusy('2026-10-26', 'UTC', [], { connected: async () => true, load: async () => ({ ok: false, code: 'CALENDAR_UNAVAILABLE' }) }), { ok: false, code: 'CALENDAR_UNAVAILABLE' })
  })
  it('does not approve a write when the availability recheck is unavailable', async () => {
    const client = { freebusy: { query: async () => { throw new Error('outage') } }, events: {} }
    await assert.rejects(detectDrift(client as never, [{ date: '2026-10-26' }] as never, 'UTC'), /CALENDAR_UNAVAILABLE/)
  })
})

describe('PRD completion: private access and real progress', () => {
  it('rejects demo sessions for private access, without disabling the public product', () => {
    const demo: SessionPayload = { user: demoUser(), iat: 0, exp: 9999999999 }
    const privateConfig = { required: true, configured: true }
    assert.equal(privatePlannerAllowed(privateConfig, demo), false)
    assert.equal(privatePlannerAllowed(privateConfig, null), false)
    assert.equal(privatePlannerAllowed({ required: false, configured: false }, null), true)
    assert.equal(privatePlannerAllowed(privateConfig, { ...demo, user: { ...demo.user, provider: 'google' } }), true)
    assert.equal(privatePlannerAllowed({ ...privateConfig, configured: false }, { ...demo, user: { ...demo.user, provider: 'google' } }), false)
  })
  it('streams completed tool steps before the final result', async () => {
    let finish!: () => void
    const wait = new Promise<void>(resolve => { finish = resolve })
    const response = await planningResponse(new Request('http://localhost/api/plan', { headers: { accept: 'application/x-ndjson' } }), async onStep => {
      onStep?.({ tool: 'schedule_week', label: 'Scheduled week' })
      await wait
      return Response.json({ ok: true, data: { done: true } })
    })
    const reader = response.body!.getReader()
    const first = await reader.read()
    assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type, 'trace')
    finish()
    const next = await reader.read()
    assert.equal(JSON.parse(new TextDecoder().decode(next.value)).type, 'result')
    reader.releaseLock()
  })
  it('keeps default JSON clients compatible', async () => {
    const response = await planningResponse(new Request('http://localhost/api/plan'), async () => Response.json({ ok: true }))
    assert.deepEqual(await response.json(), { ok: true })
  })
  it('bounds a stalled provider loop while preserving successful results', async () => {
    await assert.rejects(withinBudget(new Promise(() => {}), 5), /MODEL_TIME_BUDGET/)
    assert.equal(await withinBudget(Promise.resolve(42), 100), 42)
  })
  it('the real zero-key plan endpoint streams actual scheduler steps and a validated result', async () => {
    const response = await POST(new Request('http://localhost/api/plan', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ tasks: [], instruction: 'Write report, 30 minutes', busy: [], pins: [], preferences: defaultPreferences(), mode: 'local', weekStart: '2026-10-26', now: '2026-10-26T08:00:00Z' }) }))
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.ok(events.some(event => event.type === 'trace' && event.step.tool === 'build_schedule'), JSON.stringify(events))
    assert.equal(events.at(-1).payload.ok, true)
  })
})

describe('PRD completion: hard safety and conservation', () => {
  it('does not extend hours or violate a deadline to make overloaded work appear to fit', async () => {
    const { generatePlan } = await import('@/lib/scheduler/engine')
    const preferences = defaultPreferences()
    for (const day of Object.keys(preferences.workingHours) as (keyof typeof preferences.workingHours)[]) preferences.workingHours[day] = null
    preferences.workingHours.mon = { start: 540, end: 600 }
    const task = { id: 'hard', title: 'Hard constraint', estimateMinutes: 120, priority: 'P0', energy: 'deep', category: 'work', splittable: true, minChunkMinutes: 30, source: 'manual', deadline: '2026-10-26T10:00:00', earliestStart: '2026-10-26T09:30:00' } as const
    const result = generatePlan({ tasks: [task], preferences, busy: [], pins: [], weekStartDate: '2026-10-26', nowISO: '2026-10-26T08:00:00' })
    const blocks = result.blocks.filter(b => b.taskId === task.id)
    assert.ok(blocks.every(b => b.date === '2026-10-26' && b.startMin >= 570 && b.endMin <= 600))
    assert.equal(blocks.reduce((sum, b) => sum + b.minutes, 0) + result.report.unscheduled.reduce((sum, u) => sum + u.minutes, 0), 120)
    assert.equal(result.report.fits, 'overbooked')
  })
  it('subtracts valid pins from demand instead of scheduling that work twice', async () => {
    const { generatePlan } = await import('@/lib/scheduler/engine')
    const task = { id: 'pinned', title: 'Pinned work', estimateMinutes: 120, priority: 'P1', energy: 'deep', category: 'work', splittable: true, minChunkMinutes: 30, source: 'manual' } as const
    const result = generatePlan({ tasks: [task], preferences: defaultPreferences(), busy: [], pins: [{ taskId: task.id, date: '2026-10-26', startMin: 540, minutes: 60 }], weekStartDate: '2026-10-26', nowISO: '2026-10-26T08:00:00' })
    assert.equal(result.blocks.filter(b => b.taskId === task.id).reduce((sum, b) => sum + b.minutes, 0), 120)
    assert.ok(result.blocks.some(b => b.taskId === task.id && b.pinned && b.startMin === 540))
    assert.equal(result.report.unscheduled.length, 0)
  })
  it('warns about meeting-cap breaches even on days with no planned tasks', async () => {
    const { generatePlan } = await import('@/lib/scheduler/engine')
    const preferences = defaultPreferences(); preferences.maxMeetingMinutesPerDay = 60
    const result = generatePlan({ tasks: [], preferences, busy: [{ id: 'meeting', source: 'google', title: 'Busy', date: '2026-10-26', startMin: 540, endMin: 660 }], pins: [], weekStartDate: '2026-10-26', nowISO: '2026-10-26T08:00:00' })
    assert.ok(result.report.warnings.some(w => w.code === 'meeting-cap'))
  })
})

it('reserves the repeated DST fall-back hour instead of inverting a busy range', () => {
  const events = busyEventsFromFreeBusy([{ start: '2026-11-01T05:45:00Z', end: '2026-11-01T06:15:00Z' }], '2026-10-26', 'America/New_York')
  assert.deepEqual(events.map(e => [e.startMin, e.endMin]), [[60, 120]])
})

it('cannot use a dependent pin to bypass a prerequisite', async () => {
  const { generatePlan } = await import('@/lib/scheduler/engine')
  const task = { id: 'before', title: 'Prerequisite', estimateMinutes: 120, priority: 'P1', energy: 'deep', category: 'work', splittable: true, minChunkMinutes: 30, source: 'manual' } as const
  const result = generatePlan({ tasks: [task, { ...task, id: 'after', title: 'Dependent', estimateMinutes: 60, dependsOn: ['before'] }], preferences: defaultPreferences(), busy: [], pins: [{ taskId: 'after', date: '2026-10-26', startMin: 540, minutes: 60 }], weekStartDate: '2026-10-26', nowISO: '2026-10-26T08:00:00' })
  assert.equal(result.blocks.some(b => b.taskId === 'after'), false)
  assert.ok(result.report.droppedPins.includes('after'))
  assert.equal(result.report.unscheduled.find(u => u.taskId === 'after')?.minutes, 60)
})
