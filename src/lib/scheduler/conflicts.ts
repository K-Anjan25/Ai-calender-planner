import { SNAP_MINUTES, type PlacedBlock } from '@/lib/types'
import { fmtMinutes, overlaps, workingHoursFor } from '@/lib/scheduler/slots'
import type { PlacementContext } from '@/lib/scheduler/engine'
import { reasonLabel } from '@/lib/scheduler/policies'

/**
 * Stage 4 — repair (`ARCHITECTURE.md` §5.1).
 *
 * Bounded (≤ 3 passes, no unbounded loops), and never silent: anything removed here is reported
 * through `failures` so `evaluatePlan` can account for the lost minutes (INV-6, RULES.md L4).
 */

export type RepairInput = {
  ctx: PlacementContext
  failures: Map<string, string>
}

export type RepairResult = {
  blocks: PlacedBlock[]
  failures: Map<string, string>
}

const MAX_PASSES = 3
const BREAK_AFTER_MINUTES = 180
const BREAK_MINUTES = 15

function sortBlocks(blocks: PlacedBlock[]): PlacedBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.startMin !== b.startMin) return a.startMin - b.startMin
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** Safety net: the placement loop should already guarantee this, but INV-1 is too important to assume. */
function resolveOverlaps(blocks: PlacedBlock[], failures: Map<string, string>): PlacedBlock[] {
  const byDate = new Map<string, PlacedBlock[]>()
  for (const block of blocks) {
    const list = byDate.get(block.date)
    if (list) list.push(block)
    else byDate.set(block.date, [block])
  }

  const kept: PlacedBlock[] = []
  for (const [date, list] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sorted = sortBlocks(list)
    for (const block of sorted) {
      const clash = kept.find((k) => k.date === date && overlaps(block.startMin, block.endMin, k.startMin, k.endMin))
      if (!clash) {
        kept.push(block)
        continue
      }
      // Winner rules: a pinned block always wins; otherwise the earlier start wins.
      const challengerWins = block.pinned ? !clash.pinned : clash.pinned ? false : block.startMin < clash.startMin
      if (challengerWins) {
        const index = kept.indexOf(clash)
        if (index >= 0) kept.splice(index, 1)
        kept.push(block)
        failures.set(
          clash.taskId,
          `Displaced by a higher-priority block at ${fmtMinutes(block.startMin)} — minutes returned to the backlog`,
        )
      } else {
        failures.set(
          block.taskId,
          `Displaced by a higher-priority block at ${fmtMinutes(clash.startMin)} — minutes returned to the backlog`,
        )
      }
    }
  }
  return sortBlocks(kept)
}

/** Enforce the daily cap by trimming the weakest blocks on overloaded days. */
function enforceDailyCaps(ctx: PlacementContext, blocks: PlacedBlock[], failures: Map<string, string>): PlacedBlock[] {
  const cap = ctx.prefs.maxPlannedMinutesPerDay
  const byDate = new Map<string, PlacedBlock[]>()
  for (const block of blocks) {
    if (block.kind !== 'task' || block.pinned) continue
    const list = byDate.get(block.date)
    if (list) list.push(block)
    else byDate.set(block.date, [block])
  }

  const dropped = new Set<string>()
  for (const [date, list] of byDate.entries()) {
    let total = blocks.filter((b) => b.date === date && b.kind === 'task').reduce((sum, b) => sum + b.minutes, 0)
    if (total <= cap) continue
    // Drop lowest score first, but only blocks that came from the escalation ladder.
    const ranked = [...list].sort((a, b) => {
      const aSoft = Boolean(a.conflict)
      const bSoft = Boolean(b.conflict)
      if (aSoft !== bSoft) return aSoft ? -1 : 1
      if (a.score !== b.score) return a.score - b.score
      return a.id < b.id ? -1 : 1
    })
    for (const block of ranked) {
      if (total <= cap) break
      dropped.add(block.id)
      total -= block.minutes
      failures.set(
        block.taskId,
        `Over your ${Math.round(cap / 60)}h daily limit — this block needs a different day`,
      )
    }
  }
  return blocks.filter((b) => !dropped.has(b.id))
}

/** Insert visible rituals: the protected lunch, and a break after long unbroken stretches. */
function insertRituals(ctx: PlacementContext, blocks: PlacedBlock[]): PlacedBlock[] {
  const out = [...blocks]
  for (const day of ctx.frame.days) {
    const hours = workingHoursFor(ctx.prefs, day.weekday)
    if (!hours) continue

    if (ctx.prefs.lunch) {
      const lunch = ctx.prefs.lunch
      const end = Math.max(lunch.start + lunch.minutes, lunch.end)
      const clash =
        out.some((b) => b.date === day.date && overlaps(lunch.start, end, b.startMin, b.endMin)) ||
        collidesWithMeeting(ctx, day.date, lunch.start, end)
      if (!clash) {
        out.push({
          id: `blk_lunch_${day.date}`,
          taskId: 'blocked-lunch',
          title: 'Lunch',
          kind: 'lunch',
          date: day.date,
          dayIndex: day.dayIndex,
          weekday: day.weekday,
          startMin: lunch.start,
          endMin: end,
          minutes: end - lunch.start,
          priority: 'P3',
          energy: 'light',
          category: 'life',
          chunkIndex: 0,
          chunkCount: 1,
          reasonText: 'Protected: lunch is never sacrificed to fit more work.',
          reasons: [{ code: 'lunch-protected', label: reasonLabel('lunch-protected') }],
          score: 1,
          pinned: true,
        })
      }
    }

    const dayBlocks = sortBlocks(out.filter((b) => b.date === day.date && b.kind === 'task'))
    let streak = 0
    let streakEnd: number | null = null
    for (const block of dayBlocks) {
      if (streakEnd !== null && block.startMin - streakEnd === 0) streak += block.minutes
      else streak = block.minutes
      streakEnd = block.endMin
      if (streak >= BREAK_AFTER_MINUTES) {
        const start = block.endMin
        const end = start + BREAK_MINUTES
        const exists =
          out.some((b) => b.date === day.date && overlaps(start, end, b.startMin, b.endMin)) ||
          collidesWithMeeting(ctx, day.date, start, end)
        if (!exists && end <= hours.end) {
          out.push({
            id: `blk_break_${day.date}_${start}`,
            taskId: 'blocked-break',
            title: 'Stretch break',
            kind: 'break',
            date: day.date,
            dayIndex: day.dayIndex,
            weekday: day.weekday,
            startMin: start,
            endMin: end,
            minutes: BREAK_MINUTES,
            priority: 'P3',
            energy: 'physical',
            category: 'health',
            chunkIndex: 0,
            chunkCount: 1,
            reasonText: `${Math.round(streak / 60)}h without a gap — a real week needs air in it.`,
            reasons: [{ code: 'buffer-preserved', label: 'Air between long stretches' }],
            score: 1,
            pinned: true,
          })
        }
        streak = 0
        streakEnd = null
      }
    }
  }
  return sortBlocks(out)
}

/** Ritual tiles are decoration on the sheet; they must never cover a real meeting. */
function collidesWithMeeting(ctx: PlacementContext, date: string, start: number, end: number): boolean {
  return ctx.busy.some((event) => event.date === date && overlaps(start, end, event.startMin, event.endMin))
}

export function repairPlan(input: RepairInput): RepairResult {
  const failures = new Map(input.failures)
  let blocks = sortBlocks(input.ctx.blocks.filter((b) => b.minutes >= SNAP_MINUTES))

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const before = blocks.length
    blocks = resolveOverlaps(blocks, failures)
    blocks = enforceDailyCaps(input.ctx, blocks, failures)
    if (blocks.length === before) break
  }

  blocks = insertRituals(input.ctx, blocks)
  return { blocks, failures }
}
