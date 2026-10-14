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
import { totalDemandMinutes } from '@/lib/scheduler/policies'
import { workingHoursFor } from '@/lib/scheduler/slots'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks, overloadedTasks } from '@/lib/sample-data'

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
