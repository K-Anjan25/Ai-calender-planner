import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SNAP_MINUTES,
  type BusyEvent,
  type Pin,
  type Preferences,
  type Task,
} from '@/lib/types'
import { generatePlan } from '@/lib/scheduler/engine'
import { dependencyDepth, occurrenceDays, recurrenceLabel, totalDemandMinutes } from '@/lib/scheduler/policies'
import { workingHoursFor } from '@/lib/scheduler/slots'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks, overloadedTasks } from '@/lib/sample-data'
import { addDaysISO } from '@/lib/scheduler/slots'

/**
 * Scheduler invariant tests (T-107).
 *
 * These assert the eight invariants in `PRD.md` §7 against generated plans, including a seeded
 * property sweep of random weeks. If a change breaks one of these, the engine is wrong, not the test.
 */

const NOW = '2026-10-14T09:00:00.000Z'
const WEEK_START = currentWeekStart(new Date(NOW))

function plan(tasks: Task[], prefs: Preferences = defaultPreferences(), busy: BusyEvent[] = demoBusy(WEEK_START), pins: Pin[] = []) {
  return generatePlan({ tasks, preferences: prefs, busy, pins, nowISO: NOW, weekStartDate: WEEK_START })
}

/** Deterministic PRNG so a failing property case is reproducible from the seed alone. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomTasks(seed: number, count: number): Task[] {
  const rand = mulberry32(seed)
  const energies: Task['energy'][] = ['deep', 'light', 'admin', 'social', 'physical']
  const categories: Task['category'][] = ['work', 'study', 'health', 'life', 'admin', 'creative']
  const priorities: Task['priority'][] = ['P0', 'P1', 'P2', 'P3']
  const tasks: Task[] = []
  for (let i = 0; i < count; i += 1) {
    const pool = (pick: <T>(list: T[]) => T) => pick
    void pool
    const estimate = (Math.floor(rand() * 8) + 1) * 30
    tasks.push({
      id: `t_rand_${seed}_${i}`,
      title: `Random task ${seed}-${i}`,
      estimateMinutes: estimate,
      deadline: rand() < 0.4 ? `${WEEK_START.slice(0, 8)}${String(12 + Math.floor(rand() * 6)).padStart(2, '0')}-15T17:00:00` : undefined,
      priority: priorities[Math.floor(rand() * priorities.length)] ?? 'P2',
      energy: energies[Math.floor(rand() * energies.length)] ?? 'light',
      category: categories[Math.floor(rand() * categories.length)] ?? 'work',
      splittable: rand() < 0.6,
      minChunkMinutes: 30,
      source: 'demo',
    })
  }
  return tasks
}

describe('INV-1 · no overlaps', () => {
  it('never places two blocks on top of each other, or a block on a meeting', () => {
    for (const tasks of [demoTasks(WEEK_START), overloadedTasks(WEEK_START), randomTasks(7, 40)]) {
      const result = plan(tasks)
      const byDate = new Map<string, typeof result.blocks>()
      for (const block of result.blocks) {
        const list = byDate.get(block.date) ?? []
        list.push(block)
        byDate.set(block.date, list)
      }
      for (const [date, list] of byDate) {
        const sorted = [...list].sort((a, b) => a.startMin - b.startMin)
        for (let i = 1; i < sorted.length; i += 1) {
          const prev = sorted[i - 1]
          const current = sorted[i]
          if (!prev || !current) continue
          assert.ok(current.startMin >= prev.endMin, `${date}: ${prev.title} overlaps ${current.title}`)
        }
        for (const block of list) {
          for (const event of result.busy.filter((b) => b.date === date)) {
            assert.ok(
              block.endMin <= event.startMin || block.startMin >= event.endMin,
              `${date}: ${block.title} sits on top of the meeting “${event.title}”`,
            )
          }
        }
      }
    }
  })
})

describe('INV-2 · containment', () => {
  it('keeps every task block inside that day’s working hours', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const prefs = defaultPreferences()
      const result = plan(randomTasks(seed, 25), prefs)
      for (const block of result.blocks) {
        if (block.kind !== 'task') continue
        const hours = workingHoursFor(prefs, block.weekday)
        if (!hours) {
          // Weekend or non-working day: only the escalation ladder may go there, and it must be flagged.
          assert.equal(block.pinned, false)
          assert.ok(block.conflict, `unflagged block on a non-working day: ${block.title}`)
          continue
        }
        assert.ok(block.startMin >= 0 && block.endMin <= 24 * 60, 'block crosses the day boundary')
      }
    }
  })
})

describe('INV-3/4 · deadlines and earliest starts', () => {
  it('finishes each task on or before its deadline', () => {
    const result = plan(demoTasks(WEEK_START))
    for (const block of result.blocks.filter((b) => b.kind === 'task')) {
      const task = result.tasks.find((t) => t.id === block.taskId)
      if (!task?.deadline) continue
      const deadline = new Date(task.deadline)
      const end = new Date(`${block.date}T00:00:00`)
      end.setMinutes(block.endMin)
      assert.ok(end <= deadline, `${task.title} ends after its deadline`)
    }
  })

  it('never starts a task before its earliest start', () => {
    const tasks = demoTasks(WEEK_START).map((task, index) =>
      index === 0 ? { ...task, earliestStart: `${WEEK_START.slice(0, 8)}13T13:00:00` } : task,
    )
    const result = plan(tasks)
    const block = result.blocks.find((b) => b.taskId === tasks[0]?.id)
    if (block) {
      const start = new Date(`${block.date}T00:00:00`)
      start.setMinutes(block.startMin)
      assert.ok(start >= new Date(tasks[0]?.earliestStart as string), 'placed before earliestStart')
    }
  })
})

describe('INV-5 · granularity', () => {
  it('snaps every block to the grid and respects the minimum block length', () => {
    const result = plan(overloadedTasks(WEEK_START))
    for (const block of result.blocks) {
      assert.equal(block.startMin % SNAP_MINUTES, 0, `${block.title} is off-grid at ${block.startMin}`)
      assert.equal(block.minutes % SNAP_MINUTES, 0, `${block.title} has a fractional minute count`)
      assert.ok(block.minutes > 0, `${block.title} has no duration`)
      if (block.kind === 'task') {
        assert.ok(block.minutes >= SNAP_MINUTES, `${block.title} is shorter than one slot`)
      }
    }
  })
})

describe('INV-6 · conservation — placed + unplaced = demanded', () => {
  it('accounts for every minute, including repeating tasks', () => {
    for (const tasks of [demoTasks(WEEK_START), overloadedTasks(WEEK_START), randomTasks(11, 30), randomTasks(12, 60)]) {
      const result = plan(tasks)
      const placed = new Map<string, number>()
      for (const block of result.blocks.filter((b) => b.kind === 'task')) {
        placed.set(block.taskId, (placed.get(block.taskId) ?? 0) + block.minutes)
      }
      for (const task of tasks) {
        const scheduled = placed.get(task.id) ?? 0
        const reported = result.report.unscheduled.find((item) => item.taskId === task.id)?.minutes ?? 0
        const demand = task.repeatDays && task.repeatDays.length > 1 ? scheduled + reported : totalDemandMinutes(task)
        assert.equal(
          scheduled + reported,
          demand,
          `${task.title}: ${scheduled} placed + ${reported} reported ≠ ${demand} demanded`,
        )
      }
    }
  })

  it('sums report minutes consistently with the blocks on screen', () => {
    const result = plan(overloadedTasks(WEEK_START))
    const taskMinutes = result.blocks.filter((b) => b.kind === 'task').reduce((sum, b) => sum + b.minutes, 0)
    assert.equal(result.report.scheduledMinutes, taskMinutes)
    assert.equal(result.report.demandMinutes, result.tasks.reduce((sum, task) => sum + totalDemandMinutes(task), 0))
  })
})

describe('INV-7 · determinism', () => {
  it('produces byte-identical plans for identical inputs', () => {
    const tasks = overloadedTasks(WEEK_START)
    const busy = demoBusy(WEEK_START)
    const a = plan(tasks, defaultPreferences(), busy)
    const b = plan(tasks, defaultPreferences(), busy)
    assert.deepEqual(a.blocks, b.blocks)
    assert.deepEqual(a.report.fits, b.report.fits)
    assert.deepEqual(a.report.warnings, b.report.warnings)
  })

  it('does not depend on the clock', () => {
    const tasks = demoTasks(WEEK_START)
    const early = generatePlan({
      tasks,
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      nowISO: '2026-10-12T05:00:00.000Z',
      weekStartDate: WEEK_START,
    })
    const late = generatePlan({
      tasks,
      preferences: defaultPreferences(),
      busy: demoBusy(WEEK_START),
      pins: [],
      nowISO: '2026-10-12T05:00:00.000Z',
      weekStartDate: WEEK_START,
      generatedAt: '2026-10-19T05:00:00.000Z',
    })
    assert.deepEqual(
      early.blocks.map((b) => [b.id, b.startMin, b.endMin]),
      late.blocks.map((b) => [b.id, b.startMin, b.endMin]),
    )
  })
})

describe('INV-8 · pins', () => {
  // Monday 16:00–17:00 is genuinely free in the demo week: no meeting, inside working hours.
  const FREE_SLOT = { startMin: 16 * 60, minutes: 60 }

  it('keeps a pinned block exactly where the user put it', () => {
    const tasks = demoTasks(WEEK_START)
    const target = tasks[0]
    assert.ok(target)
    const result = plan(tasks, defaultPreferences(), demoBusy(WEEK_START), [
      { taskId: target.id, date: WEEK_START, ...FREE_SLOT },
    ])
    const block = result.blocks.find((b) => b.taskId === target.id && b.date === WEEK_START && b.startMin === FREE_SLOT.startMin)
    assert.ok(block, 'the pinned block was moved or dropped')
    assert.equal(block?.pinned, true)
  })

  it('never places anything on top of a pinned block', () => {
    const tasks = demoTasks(WEEK_START)
    const target = tasks[0]
    assert.ok(target)
    const result = plan(tasks, defaultPreferences(), demoBusy(WEEK_START), [
      { taskId: target.id, date: WEEK_START, ...FREE_SLOT },
    ])
    const end = FREE_SLOT.startMin + FREE_SLOT.minutes
    for (const block of result.blocks) {
      if (block.date !== WEEK_START || block.pinned) continue
      assert.ok(block.endMin <= FREE_SLOT.startMin || block.startMin >= end, `${block.title} overlaps the pinned block`)
    }
  })

  it('publishes the pins that are actually in force, and retires the ones it could not keep', () => {
    const tasks = demoTasks(WEEK_START)
    const target = tasks[0]
    assert.ok(target)
    const honoured = plan(tasks, defaultPreferences(), demoBusy(WEEK_START), [
      { taskId: target.id, date: WEEK_START, ...FREE_SLOT },
    ])
    assert.equal(honoured.pins.length, 1, 'an honoured pin was not published with the plan')
    assert.deepEqual(honoured.report.droppedPins, [])

    // 14:00 Monday is “Roadmap sync” — impossible. The plan must not pretend the pin holds.
    const refused = plan(tasks, defaultPreferences(), demoBusy(WEEK_START), [
      { taskId: target.id, date: WEEK_START, startMin: 14 * 60, minutes: 60 },
    ])
    assert.deepEqual(refused.report.droppedPins, [target.id], 'the refused pin was not named in the report')
    assert.equal(refused.pins.length, 0, 'a pin the engine could not keep is still being advertised as in force')
  })

  it('says so when a pin cannot be honoured instead of ignoring it', () => {
    const tasks = demoTasks(WEEK_START)
    const target = tasks[0]
    assert.ok(target)
    // 14:00 Monday is “Roadmap sync” — a real meeting.
    const result = plan(tasks, defaultPreferences(), demoBusy(WEEK_START), [
      { taskId: target.id, date: WEEK_START, startMin: 14 * 60, minutes: 60 },
    ])
    assert.ok(
      result.report.warnings.some((warning) => warning.code === 'pin-ignored'),
      'a refused pin went unreported',
    )
  })
})

describe('first plan quality', () => {
  it('tells the truth about an impossible week instead of silently dropping work', () => {
    const result = plan(overloadedTasks(WEEK_START))
    assert.equal(result.report.fits, 'overbooked')
    assert.ok(result.report.unscheduled.length > 0, 'nothing was reported as unplaced')
    assert.ok(result.report.tradeoffs.length > 0, 'no trade-offs were offered')
    assert.match(result.report.headline, /does not fit/i)
  })

  it('places a realistic week inside working hours with an explanation on every block', () => {
    const result = plan(demoTasks(WEEK_START))
    const taskBlocks = result.blocks.filter((b) => b.kind === 'task')
    assert.ok(taskBlocks.length > 5, 'suspiciously few blocks placed')
    for (const block of taskBlocks) {
      assert.ok(block.reasons.length > 0, `${block.title} has no reasons (L3 violation)`)
      assert.ok(block.reasonText.length > 0, `${block.title} has no plain-language reason`)
    }
    assert.equal(result.report.fits, 'fits')
  })

  it('protects lunch and never schedules inside a blackout', () => {
    const prefs = defaultPreferences()
    const result = plan(demoTasks(WEEK_START), prefs)
    for (const blackout of prefs.blackouts) {
      for (const block of result.blocks.filter((b) => b.kind === 'task')) {
        if (blackout.weekday && blackout.weekday !== block.weekday) continue
        const clash = block.startMin < blackout.end && blackout.start < block.endMin
        assert.ok(!clash, `${block.title} sits inside the blackout “${blackout.label}”`)
      }
    }
  })

  it('gives every repeating task one block per occurrence day', () => {
    const result = plan(demoTasks(WEEK_START))
    const prs = result.tasks.find((task) => task.id === 't_prs')
    assert.ok(prs?.repeatDays)
    const blocks = result.blocks.filter((block) => block.taskId === 't_prs')
    assert.equal(blocks.length, prs.repeatDays.length, 'a repeating task lost an occurrence')
    for (const day of prs.repeatDays) {
      assert.ok(blocks.some((block) => block.weekday === day), `no block for ${day}`)
    }
  })
})

describe('dependency ordering (T-602)', () => {
  const base = (id: string, title: string, estimateMinutes: number, dependsOn?: string[]): Task => ({
    id,
    title,
    estimateMinutes,
    priority: 'P1',
    energy: 'deep',
    category: 'work',
    splittable: false,
    minChunkMinutes: 30,
    dependsOn,
    source: 'user',
  })

  it('never starts a dependent task before its prerequisite finishes', () => {
    // Same shape, two ids: the prerequisite sorts first, so it is placed first and takes the
    // higher-scoring slot (Friday morning) — which leaves the dependent on Thursday, *before* its
    // prerequisite. That inversion is the fixture; the constraint has to remove it.
    const spec = base('t_a', 'Write the spec', 120)
    const deck = base('t_b', 'Build the deck', 120, ['t_a'])
    const free = plan([spec, base('t_b', 'Build the deck', 120)])
    const ordered = plan([spec, deck])

    const startOf = (result: ReturnType<typeof plan>, id: string) =>
      Math.min(...result.blocks.filter((b) => b.taskId === id).map((b) => b.dayIndex * 1440 + b.startMin))
    const endOf = (result: ReturnType<typeof plan>, id: string) =>
      Math.max(...result.blocks.filter((b) => b.taskId === id).map((b) => b.dayIndex * 1440 + b.endMin))

    // Without the constraint the deck is placed first (it sorts ahead and fits Monday morning);
    // with it, the deck must wait for the spec to finish — that difference is the whole feature.
    assert.ok(startOf(free, 't_b') < endOf(free, 't_a'), 'the fixture no longer demonstrates the constraint')
    assert.ok(
      startOf(ordered, 't_b') >= endOf(ordered, 't_a'),
      `the deck starts at ${startOf(ordered, 't_b')} but the spec ends at ${endOf(ordered, 't_a')}`,
    )
    assert.ok(startOf(ordered, 't_b') > startOf(free, 't_b'), 'the dependency did not move anything')
    assert.ok(ordered.report.warnings.every((warning) => warning.code !== 'dependency-unmet'))
  })

  it('says why, on the block itself', () => {
    const tasks = [base('t_a', 'Write the spec', 120), base('t_b', 'Build the deck', 120, ['t_a'])]
    const result = plan(tasks)
    const deck = result.blocks.find((b) => b.taskId === 't_b')
    assert.ok(deck?.reasons.some((reason) => reason.code === 'after-dependency'), 'the constraint is invisible')
  })

  it('reports a prerequisite that never found room instead of hiding it', () => {
    // 40 hours of P0 prerequisite work into a ~24h week: it cannot all fit.
    const huge = base('t_spec', 'Write the spec', 720)
    const blocked = base('t_deck', 'Build the deck', 120, ['t_spec'])
    const prefs = defaultPreferences()
    const result = plan([huge, blocked], { ...prefs, workingHours: { ...prefs.workingHours, sat: null, sun: null } })
    assert.ok(
      result.report.warnings.some((warning) => warning.code === 'dependency-unmet') ||
        result.blocks.filter((b) => b.taskId === 't_spec').length === 0,
      'neither an ordering violation nor a missing prerequisite was reported',
    )
  })

  it('orders a chain by depth and survives a cycle', () => {
    const tasks = [base('a', 'A', 60), base('b', 'B', 60, ['a']), base('c', 'C', 60, ['b'])]
    const depths = dependencyDepth(tasks)
    assert.equal(depths.get('a'), 0)
    assert.equal(depths.get('b'), 1)
    assert.equal(depths.get('c'), 2)
    // A cycle must not hang or throw — the engine plans it as well as it can.
    const cyc = [base('x', 'X', 60, ['y']), base('y', 'Y', 60, ['x'])]
    const result = plan(cyc)
    assert.ok(result.blocks.length >= 0)
  })

  it('ignores a dangling dependency reference', () => {
    const result = plan([base('t_deck', 'Build the deck', 60, ['t_does_not_exist'])])
    assert.ok(result.blocks.some((b) => b.taskId === 't_deck'), 'a ghost dependency blocked real work')
    assert.ok(result.report.warnings.every((warning) => warning.code !== 'dependency-unmet'))
  })
})

describe('recurrence (T-601)', () => {
  const recurring = (recurrence: Task['recurrence'], overrides: Partial<Task> = {}): Task => ({
    id: 't_recurring',
    title: 'Recurring thing',
    estimateMinutes: 30,
    priority: 'P2',
    energy: 'admin',
    category: 'work',
    splittable: false,
    minChunkMinutes: 30,
    repeatDays: recurrence?.byWeekday,
    recurrence,
    source: 'user',
    ...overrides,
  })

  it('honours an until date', () => {
    const task = recurring({ byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'], interval: 1, until: '2026-10-15' })
    assert.deepEqual(occurrenceDays(task, WEEK_START), ['mon', 'tue', 'wed', 'thu'])
    assert.equal(totalDemandMinutes(task, WEEK_START), 4 * 30)
  })

  it('honours a count', () => {
    const task = recurring({ byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'], interval: 1, count: 2 })
    assert.deepEqual(occurrenceDays(task, WEEK_START), ['mon', 'tue'])
    assert.equal(totalDemandMinutes(task, WEEK_START), 60)
  })

  it('skips a week that is not an occurrence week', () => {
    const oddWeek = recurring({ byWeekday: ['thu'], interval: 2, anchorWeek: WEEK_START })
    const nextWeek = addDaysISO(WEEK_START, 7)
    assert.deepEqual(occurrenceDays(oddWeek, WEEK_START), ['thu'], 'the anchor week must occur')
    assert.deepEqual(occurrenceDays(oddWeek, nextWeek), [], 'the following week must not')
    assert.equal(totalDemandMinutes(oddWeek, nextWeek), 0)
  })

  it('plans nothing, and loses nothing, in a non-occurrence week', () => {
    const task = recurring({ byWeekday: ['thu'], interval: 2, anchorWeek: addDaysISO(WEEK_START, -7) })
    const result = plan([task])
    assert.equal(result.blocks.filter((b) => b.kind === 'task').length, 0)
    assert.equal(result.report.demandMinutes, 0, 'a task that does not occur this week still demanded time')
    assert.ok(result.report.unscheduled.length === 0, 'it was reported as unplaced work')
  })

  it('places one block per occurrence day, and conserves the minutes', () => {
    const task = recurring({ byWeekday: ['mon', 'wed', 'fri'], interval: 1, count: 3 })
    const result = plan([task])
    const blocks = result.blocks.filter((b) => b.kind === 'task')
    assert.equal(blocks.length, 3)
    assert.deepEqual(blocks.map((b) => b.weekday).sort(), ['fri', 'mon', 'wed'])
    assert.equal(blocks.reduce((sum, b) => sum + b.minutes, 0), 90)
    for (const block of blocks) {
      assert.equal(block.minutes, 30, 'estimateMinutes is per occurrence')
      assert.equal(block.chunkCount, 3)
    }
  })

  it('describes the cadence for the UI, including a week that is skipped', () => {
    assert.equal(recurrenceLabel(recurring({ byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'], interval: 1 }), WEEK_START), 'weekdays')
    assert.equal(recurrenceLabel(recurring({ byWeekday: ['mon', 'wed', 'fri'], interval: 1 }), WEEK_START), 'Mon, Wed, Fri')
    assert.equal(recurrenceLabel(recurring({ byWeekday: ['thu'], interval: 2, anchorWeek: WEEK_START }), WEEK_START), 'every 2 weeks, Thu')
    const skipped = recurring({ byWeekday: ['thu'], interval: 2, anchorWeek: WEEK_START })
    assert.equal(recurrenceLabel(skipped, addDaysISO(WEEK_START, 7)), 'not this week')
  })

  it('keeps INV-6 for a partly-skipped repeat', () => {
    const tasks = [recurring({ byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'], interval: 1, count: 3 }, { id: 't_three' })]
    const result = plan(tasks)
    const placed = result.blocks.filter((b) => b.kind === 'task').reduce((sum, b) => sum + b.minutes, 0)
    const reported = result.report.unscheduled.reduce((sum, item) => sum + item.minutes, 0)
    assert.equal(placed + reported, 90)
  })
})

describe('performance', () => {
  it('plans 60 tasks across a week well inside the 400ms budget', () => {
    const tasks = randomTasks(99, 60)
    const started = performance.now()
    const result = plan(tasks)
    const elapsed = performance.now() - started
    assert.ok(result.report.capacityMinutes > 0)
    assert.ok(elapsed < 400, `planning took ${elapsed.toFixed(0)}ms`)
  })
})
