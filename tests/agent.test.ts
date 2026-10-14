import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planRequestSchema, chatRequestSchema, syncRequestSchema } from '@/lib/types'
import { estimateDurationMinutes, normaliseTasks, createToolkit, mergeTasks } from '@/lib/agent/tools'
import { interpretLocally, parseTasksLocally } from '@/lib/agent/local-reasoner'
import { resolveProvider, providerSummary } from '@/lib/agent/providers'
import { runPlannerAgent } from '@/lib/agent/planner-agent'
import { extractJson } from '@/lib/agent/planner-agent'
import { diffPlans } from '@/lib/plan-diff'
import { busyEventsFromFreeBusy, payloadForBlock } from '@/lib/google/calendar'
import { currentWeekStart, defaultPreferences, demoBusy, DEMO_FREE_TEXT, demoTasks } from '@/lib/sample-data'

/**
 * Agent and contract tests.
 *
 * The bar here is not "the model is clever" — it is that the *pipeline* behaves: schemas reject
 * garbage, the local reasoner produces the same shape as a live model, and every failure path
 * degrades to a real plan (RULES.md L5, D-004).
 */

const NOW = '2026-10-14T09:00:00.000Z'
const WEEK_START = currentWeekStart(new Date(NOW))

describe('boundary validation', () => {
  it('rejects a plan request with a nonsense payload', () => {
    assert.equal(planRequestSchema.safeParse({}).success, false)
    assert.equal(planRequestSchema.safeParse({ tasks: 'not an array' }).success, false)
  })

  it('accepts a minimal valid plan request and applies defaults', () => {
    const parsed = planRequestSchema.safeParse({
      tasks: [],
      preferences: defaultPreferences(),
    })
    assert.equal(parsed.success, true)
    if (parsed.success) {
      assert.equal(parsed.data.mode, 'auto')
      assert.deepEqual(parsed.data.pins, [])
      assert.deepEqual(parsed.data.busy, [])
    }
  })

  it('requires a message on the chat route and approvals on sync', () => {
    assert.equal(chatRequestSchema.safeParse({ tasks: [], preferences: defaultPreferences() }).success, false)
    assert.equal(syncRequestSchema.safeParse({ dryRun: true, approvedBlockIds: [] }).success, false)
  })

  it('refuses a task with a deadline that is not an ISO instant', () => {
    const result = planRequestSchema.safeParse({
      tasks: [
        {
          id: 't1',
          title: 'Broken',
          estimateMinutes: 60,
          deadline: 'next thursday-ish',
          priority: 'P1',
          energy: 'deep',
          category: 'work',
          splittable: true,
        },
      ],
      preferences: defaultPreferences(),
    })
    assert.equal(result.success, false)
  })
})

describe('provider resolution', () => {
  it('never throws and falls back to the local engine without keys', () => {
    const provider = resolveProvider()
    assert.ok(provider.kind === 'local' || provider.kind === 'live')
    if (provider.kind === 'local') {
      assert.equal(provider.name, 'local')
      assert.ok(provider.reason.length > 0, 'the fallback must explain itself')
    }
  })

  it('reports capability without leaking key material', () => {
    const summary = providerSummary()
    const serialised = JSON.stringify(summary)
    assert.ok(!/\b(sk-|AIza|api[_-]?key)/i.test(serialised))
    assert.equal(typeof summary.mode, 'string')
    assert.ok(Array.isArray(summary.configured))
  })
})

describe('duration estimation (FR-1.3)', () => {
  it('estimates sensible durations from the title', () => {
    assert.equal(estimateDurationMinutes('Quick reply to Sam'), 15)
    assert.equal(estimateDurationMinutes('Send expenses'), 30)
    assert.equal(estimateDurationMinutes('Review incoming PRs'), 45)
    assert.equal(estimateDurationMinutes('Write the search revamp spec'), 120)
    assert.equal(estimateDurationMinutes('Gym'), 45)
    assert.equal(estimateDurationMinutes('Migrate the billing service'), 180) // the "build/migrate" rule is more specific than "audit/research"
  })

  it('never returns a fraction of a slot or a nonsense zero', () => {
    for (const title of ['x', 'Do the thing', 'Board deck', 'Call with the team']) {
      const minutes = estimateDurationMinutes(title)
      assert.ok(minutes >= 15 && minutes % 15 === 0, `${title} → ${minutes}`)
    }
  })
})

describe('normalisation', () => {
  it('fills defaults, flags inferred durations and keeps ids unique', () => {
    const { tasks, notes } = normaliseTasks(
      [
        { title: 'Finish the deck' },
        { title: 'Finish the deck' },
        { title: 'Gym', estimateMinutes: 45, energy: 'physical', category: 'health', splittable: false, minChunkMinutes: 45, priority: 'P2' },
      ],
      { nowISO: NOW, existingTasks: [] },
    )
    assert.equal(tasks.length, 3)
    assert.equal(new Set(tasks.map((task) => task.id)).size, 3, 'duplicate ids')
    assert.equal(tasks[0]?.estimatedByAI, true)
    assert.equal(tasks[2]?.estimatedByAI, undefined, 'a stated duration must not be marked as inferred')
    assert.ok(notes.length >= 1)
  })

  it('updates an existing task rather than duplicating it on re-parse', () => {
    const existing = demoTasks(WEEK_START)
    const { tasks: parsed } = normaliseTasks([{ title: 'Finish Q4 board deck', estimateMinutes: 300 }], { nowISO: NOW, existingTasks: existing })
    const merged = mergeTasks(existing, parsed)
    assert.equal(merged.length, existing.length, 're-parsing created a duplicate')
    assert.equal(merged.find((task) => task.id === 't_deck')?.estimateMinutes, 300)
  })
})

describe('free-text intake', () => {
  const parsed = parseTasksLocally(DEMO_FREE_TEXT, { nowISO: NOW, weekStartDate: WEEK_START })

  it('finds every task in a realistic brief', () => {
    assert.ok(parsed.tasks.length >= 6, `only found ${parsed.tasks.length} tasks`)
  })

  it('reads durations rather than guessing them', () => {
    const deck = parsed.tasks.find((task) => /deck/i.test(task.title))
    assert.ok(deck, 'the deck is missing')
    assert.equal(deck?.estimateMinutes, 240)
  })

  it('reads deadlines with the right day and time', () => {
    const deck = parsed.tasks.find((task) => /deck/i.test(task.title))
    assert.ok(deck?.deadline, 'no deadline was read')
    // "by Thursday 5pm" in the week beginning Monday 12 October.
    assert.match(deck?.deadline ?? '', /T17:00:00$/)
    const date = new Date(deck?.deadline as string)
    assert.equal(date.getDay(), 4, 'Thursday was resolved to a different weekday')
  })

  it('turns "every weekday" into a repeating task instead of one task named “minutes”', () => {
    const prs = parsed.tasks.find((task) => /pr/i.test(task.title))
    assert.ok(prs, 'the PR task is missing')
    assert.deepEqual(prs?.repeatDays, ['mon', 'tue', 'wed', 'thu', 'fri'])
    assert.ok(!parsed.tasks.some((task) => /^minutes$/i.test(task.title)), 'a duration fragment became a task')
  })

  it('classifies energy and category from the words used', () => {
    assert.equal(parsed.tasks.find((task) => /gym/i.test(task.title))?.energy, 'physical')
    assert.equal(parsed.tasks.find((task) => /gym/i.test(task.title))?.category, 'health')
    assert.equal(parsed.tasks.find((task) => /deck/i.test(task.title))?.energy, 'deep')
    assert.equal(parsed.tasks.find((task) => /expenses/i.test(task.title))?.energy, 'admin')
  })

  it('produces tasks that satisfy the domain schema', () => {
    const toolkitReady = planRequestSchema.safeParse({ tasks: parsed.tasks, preferences: defaultPreferences() })
    assert.equal(toolkitReady.success, true)
  })
})

describe('conversational refinement', () => {
  const tasks = demoTasks(WEEK_START)

  it('understands an absence and blocks that window', () => {
    const result = interpretLocally("I'm out Friday afternoon", {
      nowISO: NOW,
      weekStartDate: WEEK_START,
      preferences: defaultPreferences(),
      tasks,
    })
    const block = result.preferences?.blackouts.find((item) => item.weekday === 'fri')
    assert.ok(block, 'no Friday blackout was created')
    assert.equal(block?.start, 12 * 60)
    assert.ok(result.changes.length > 0)
  })

  it('understands a working-hours change with minutes', () => {
    const result = interpretLocally('start at 8:30', { nowISO: NOW, weekStartDate: WEEK_START, preferences: defaultPreferences(), tasks })
    assert.equal(result.preferences?.workingHours.mon?.start, 8 * 60 + 30)
  })

  it('only opens the weekend when it is offered', () => {
    const refused = interpretLocally('do not use the weekend', { nowISO: NOW, weekStartDate: WEEK_START, preferences: defaultPreferences(), tasks })
    assert.equal(refused.preferences?.weekendMode ?? 'off', 'off')
    const accepted = interpretLocally('use the weekend if it helps', { nowISO: NOW, weekStartDate: WEEK_START, preferences: defaultPreferences(), tasks })
    assert.equal(accepted.preferences?.weekendMode, 'light')
  })

  it('reads a pinned placement request', () => {
    const result = interpretLocally('move the gym to Saturday morning', {
      nowISO: NOW,
      weekStartDate: WEEK_START,
      preferences: defaultPreferences(),
      tasks,
    })
    assert.equal(result.pins?.length, 1)
    assert.equal(result.pins?.[0]?.taskId, 't_gym')
  })

  it('adds new work at the priority the user stated', () => {
    const result = interpretLocally('add a 90 minute writing block by Thursday, it is P0', {
      nowISO: NOW,
      weekStartDate: WEEK_START,
      preferences: defaultPreferences(),
      tasks,
    })
    const added = result.tasks?.find((task) => /writing block/i.test(task.title))
    assert.ok(added, 'the new task was not added')
    assert.equal(added?.priority, 'P0')
    assert.equal(added?.estimateMinutes, 90)
    assert.ok(!/p0/i.test(added?.title ?? ''), 'the priority leaked into the title')
  })

  it('does not invent a change when the message carries none', () => {
    const result = interpretLocally('what fits in the week?', { nowISO: NOW, weekStartDate: WEEK_START, preferences: defaultPreferences(), tasks })
    assert.equal(result.tasks, undefined)
    assert.equal(result.preferences, undefined)
    assert.equal(result.changes.length, 0)
    assert.ok(result.reply.length > 20)
  })
})

describe('structured output repair', () => {
  it('pulls JSON out of fenced, chatty or prefixed model output', () => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
    assert.deepEqual(extractJson('Sure! Here is the plan:\n{"a":{"b":2}}'), { a: { b: 2 } })
    assert.deepEqual(extractJson('no json here'), null)
    assert.deepEqual(extractJson('{"broken": '), null)
  })
})

describe('planner agent · end to end without keys', () => {
  it('plans from free text alone and explains itself', async () => {
    const result = await runPlannerAgent({
      tasks: [],
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      freeText: DEMO_FREE_TEXT,
      mode: 'auto',
    })
    assert.equal(result.mode, 'local')
    assert.ok(result.tasks.length >= 6)
    assert.ok(result.proposal.blocks.length > 0)
    assert.ok(result.proposal.report.headline.length > 0)
    assert.ok(result.trace.some((step) => step.tool === 'build_schedule'), 'the engine was never called')
    assert.ok(result.notes.length > 0, 'demo mode must be disclosed')
    assert.ok(result.reply.length > 0)
  })

  it('keeps the plan when a refinement changes nothing schedulable', async () => {
    const tasks = demoTasks(WEEK_START)
    const before = await runPlannerAgent({
      tasks,
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      mode: 'local',
    })
    const after = await runPlannerAgent({
      tasks,
      preferences: before.preferences,
      busy: demoBusy(WEEK_START),
      pins: [],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      message: 'what does my week look like?',
      mode: 'local',
    })
    assert.equal(after.proposal.blocks.length, before.proposal.blocks.length)
    assert.ok(after.reply.length > 0)
  })

  it('exposes the tool contract, not the timestamps', async () => {
    const toolkit = createToolkit({
      context: { tasks: demoTasks(WEEK_START), preferences: defaultPreferences(), busy: demoBusy(WEEK_START), pins: [], weekStartDate: WEEK_START, nowISO: NOW },
      interpreter: {
        parseTasks: async () => ({ tasks: [], notes: [] }),
        interpretMessage: async () => ({ changes: [], reply: '' }),
        explainBlock: async () => 'because it is your focus peak',
      },
    })
    await toolkit.build_schedule({ rationale: 'test' })
    assert.ok(toolkit.proposal, 'build_schedule did not produce a plan')
    const critique = await toolkit.critique_plan()
    assert.ok(['fits', 'tight', 'overbooked'].includes(critique.fits))
    const explained = await toolkit.explain_block({ blockId: toolkit.proposal?.blocks[0]?.id ?? 'missing' })
    assert.equal(explained.kind, 'explanation')
  })
})

describe('plan diff (what changed, in words)', () => {
  it('describes additions, removals and the overflow that remains', async () => {
    const before = demoTasks(WEEK_START)
    const result = await runPlannerAgent({
      tasks: [...before, { ...(before[0] as (typeof before)[number]), id: 't_extra', title: 'New urgent thing', priority: 'P0' }],
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      mode: 'local',
    })
    const changes = diffPlans(before, result.tasks, result.proposal)
    assert.ok(changes.some((change) => /added/i.test(change)))
    assert.ok(changes.length <= 6)
  })
})

describe('google calendar adapter', () => {
  it('clamps free/busy periods into the planning week', () => {
    const events = busyEventsFromFreeBusy(
      [
        { start: '2026-10-13T10:00:00.000Z', end: '2026-10-13T11:30:00.000Z' },
        { start: '2026-09-01T10:00:00.000Z', end: '2026-09-01T11:00:00.000Z' },
      ],
      WEEK_START,
    )
    assert.equal(events.length, 1, 'an out-of-week period was imported')
    assert.equal(events[0]?.date, '2026-10-13')
  })

  it('writes an idempotency marker and a Paperweek tag on every event', () => {
    const payload = payloadForBlock(
      {
        id: 'blk_1',
        taskId: 't_deck',
        title: 'Finish the deck',
        kind: 'task',
        date: WEEK_START,
        dayIndex: 0,
        weekday: 'mon',
        startMin: 9 * 60,
        endMin: 10 * 60 + 30,
        minutes: 90,
        priority: 'P0',
        energy: 'deep',
        category: 'work',
        chunkIndex: 0,
        chunkCount: 1,
        reasonText: 'Your focus peak.',
        reasons: [],
        score: 0.9,
        pinned: false,
      },
      'plan_1',
      'Europe/London',
    )
    assert.equal(payload.extendedProperties.private.paperweekBlockId, 'blk_1')
    assert.equal(payload.extendedProperties.private.paperweekPlanId, 'plan_1')
    assert.match(payload.summary, /· PW$/)
    assert.match(payload.start.dateTime, /^2026-10-12T09:00:00$/)
    assert.equal(payload.start.timeZone, 'Europe/London')
  })
})
