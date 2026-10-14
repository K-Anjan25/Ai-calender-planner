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
import { occurrenceDays, totalDemandMinutes } from '@/lib/scheduler/policies'
import { currentWeekStart, defaultPreferences, demoBusy, DEMO_FREE_TEXT, demoTasks } from '@/lib/sample-data'
import { addDaysISO } from '@/lib/scheduler/slots'

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

describe('recurrence in free text (T-601)', () => {
  const parse = (text: string) => parseTasksLocally(text, { nowISO: NOW, weekStartDate: WEEK_START })

  it('reads "every other Thursday" as a fortnightly occurrence', () => {
    const { tasks } = parse('Retro every other Thursday at 4pm, 60 minutes')
    const task = tasks[0]
    assert.ok(task)
    assert.equal(task.recurrence?.interval, 2)
    assert.deepEqual(task.recurrence?.byWeekday, ['thu'])
    assert.equal(task.recurrence?.anchorWeek, WEEK_START)
  })

  it('reads "until Thursday" as a bounded run', () => {
    const { tasks } = parse('Deep work every weekday until Thursday, 2 hours')
    const task = tasks[0]
    assert.ok(task?.recurrence?.until)
    const days = occurrenceDays(task, WEEK_START)
    assert.deepEqual(days, ['mon', 'tue', 'wed', 'thu'])
    assert.equal(totalDemandMinutes(task, WEEK_START), 4 * 120)
  })

  it('reads "four times this week" as a count', () => {
    const { tasks } = parse('Inbox zero daily, four times this week, 30 minutes')
    const task = tasks[0]
    assert.equal(task?.recurrence?.count, 4)
    assert.equal(occurrenceDays(task, WEEK_START).length, 4)
  })

  it('leaves a plain weekday list as repeatDays, with no recurrence object', () => {
    const { tasks } = parse('Gym Mon/Wed/Fri, 45 minutes')
    const task = tasks[0]
    assert.deepEqual(task?.repeatDays, ['mon', 'wed', 'fri'])
    assert.equal(task?.recurrence, undefined, 'a simple repeat gained a redundant recurrence')
  })

  it('still treats "every weekday" as five occurrences per week', () => {
    const { tasks } = parse('Review PRs every weekday, 30 minutes')
    const task = tasks[0]
    assert.equal(totalDemandMinutes(task, WEEK_START), 5 * 30)
    assert.equal(task?.recurrence, undefined)
  })
})

describe('dependencies survive normalisation (T-602)', () => {
  it('keeps dependsOn from the model payload', () => {
    const { tasks } = normaliseTasks(
      [
        { title: 'Write the spec', estimateMinutes: 120, energy: 'deep', category: 'work', splittable: false, priority: 'P1' },
        {
          title: 'Build the deck',
          estimateMinutes: 120,
          energy: 'deep',
          category: 'work',
          splittable: false,
          priority: 'P1',
          dependsOn: ['t_write_the_spec'],
        },
      ],
      { nowISO: NOW, existingTasks: [] },
    )
    assert.deepEqual(tasks[1]?.dependsOn, ['t_write_the_spec'])
  })

  it('does not invent dependencies', () => {
    const { tasks } = normaliseTasks([{ title: 'Standalone thing' }], { nowISO: NOW, existingTasks: [] })
    assert.equal(tasks[0]?.dependsOn, undefined)
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

  it('keeps a pin made in an earlier turn when a later turn changes something else (N-9)', async () => {
    const run = (message: string, previous: Awaited<ReturnType<typeof runPlannerAgent>>) =>
      runPlannerAgent({
        tasks: previous.tasks,
        preferences: previous.proposal.preferences,
        busy: demoBusy(WEEK_START),
        pins: previous.pins,
        weekStartDate: WEEK_START,
        nowISO: NOW,
        message,
        mode: 'local',
      })

    // Turn 1: open the weekend. Turn 2: the user puts the gym on Saturday morning — a pin.
    const opened = await runPlannerAgent({
      tasks,
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      message: 'use the weekend if it helps',
      mode: 'local',
    })
    const pinned = await run('move the gym to Saturday morning', opened)
    const gymPin = pinned.pins.find((pin) => pin.taskId === 't_gym')
    assert.ok(gymPin, 'the gym pin was not created (or was refused) where the weekend is open')

    // Turn 3: an unrelated instruction, sent with the pin the client is holding.
    const after = await run('add a 90 minute writing block by Thursday', pinned)
    assert.ok(
      after.pins.some((pin) => pin.taskId === 't_gym' && pin.date === gymPin.date && pin.startMin === gymPin.startMin),
      'the gym pin was dropped by an unrelated instruction',
    )
    const block = after.proposal.blocks.find((item) => item.taskId === 't_gym' && item.date === gymPin.date)
    assert.equal(block?.startMin, gymPin.startMin, 'the pinned block moved after an unrelated instruction')
  })

  it('retires a pin it cannot honour, and says why (§D-021)', async () => {
    const result = await runPlannerAgent({
      tasks,
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [{ taskId: 't_gym', date: addDaysISO(WEEK_START, 1), startMin: 10 * 60, minutes: 45 }],
      weekStartDate: WEEK_START,
      nowISO: NOW,
      message: 'move the gym to Monday 10am',
      mode: 'local',
    })
    const impossible = result.pins.find((pin) => pin.date === addDaysISO(WEEK_START, 1))
    if (impossible) {
      assert.equal(impossible.startMin, 10 * 60, 'an honoured pin changed position')
    } else {
      assert.ok(
        result.proposal.report.droppedPins.includes('t_gym'),
        'a pin vanished without being reported in droppedPins',
      )
      assert.ok(result.proposal.report.warnings.some((warning) => warning.code === 'pin-ignored'))
    }
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
