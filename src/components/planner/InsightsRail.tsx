'use client'

import { clsx } from 'clsx'
import { PieChart, Ruler } from 'lucide-react'
import { CATEGORY_LABEL, ENERGY_LABEL, WEEKDAY_SHORT, type Category, type Energy } from '@/lib/types'
import { fmtDuration } from '@/lib/scheduler/slots'
import { usePlanner } from '@/lib/store/planner-store'
import { PaperSheet } from '@/components/paper/PaperSheet'

/**
 * Insights (FR-6.x).
 *
 * Two questions the grid cannot answer by eye: *what kind of week is this* (category mix, deep-work
 * share) and *how fragmented is it* (longest unbroken session). Both are read straight off the plan,
 * so they can never disagree with the blocks on screen.
 */

/**
 * Class names are written out in full on purpose: Tailwind scans source text, so a template
 * literal like `bg-${tone}` would silently produce no CSS at all.
 */
const CATEGORY_FILL: Record<Category, string> = {
  work: 'bg-frost',
  study: 'bg-plum',
  health: 'bg-olive',
  life: 'bg-terracotta',
  admin: 'bg-paper-edge',
  creative: 'bg-rose',
}

export function InsightsRail() {
  const { proposal } = usePlanner()
  const blocks = proposal?.blocks.filter((block) => block.kind === 'task') ?? []
  if (blocks.length === 0) return null

  const total = blocks.reduce((sum, block) => sum + block.minutes, 0)
  const byCategory = new Map<Category, number>()
  const byEnergy = new Map<Energy, number>()
  for (const block of blocks) {
    byCategory.set(block.category, (byCategory.get(block.category) ?? 0) + block.minutes)
    byEnergy.set(block.energy, (byEnergy.get(block.energy) ?? 0) + block.minutes)
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const deepShare = ((byEnergy.get('deep') ?? 0) / Math.max(1, total)) * 100

  // Longest unbroken run of work per day, ignoring lunch/breaks — the honest fragmentation measure.
  const longestByDay = new Map<string, number>()
  const maxByDay = new Map<string, number>()
  for (const block of blocks) {
    const list = longestByDay.get(block.date) ?? 0
    longestByDay.set(block.date, list + block.minutes)
    maxByDay.set(block.date, Math.max(maxByDay.get(block.date) ?? 0, block.minutes))
  }

  const daysWithWork = [...new Set(blocks.map((block) => block.date))].sort()
  const averageBlock = Math.round(total / blocks.length)
  const shortest = Math.min(...blocks.map((block) => block.minutes))
  const longest = Math.max(...blocks.map((block) => block.minutes))

  return (
    <div className="flex flex-col gap-3">
      <PaperSheet className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[15px]">
          <PieChart size={14} className="text-teal-deep" aria-hidden="true" />
          Shape of the week
        </h3>

        <div className="mb-3 space-y-1.5">
          {categories.map(([category, minutes]) => (
            <div key={category}>
              <div className="flex items-baseline justify-between text-[11.5px]">
                <span className="font-semibold text-ink-soft">{CATEGORY_LABEL[category]}</span>
                <span className="tnum text-ink-faint">
                  {fmtDuration(minutes)} · {Math.round((minutes / total) * 100)}%
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-paper-kraft/70">
                <div
                  className={clsx('h-full rounded-full', CATEGORY_FILL[category])}
                  style={{ width: `${(minutes / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Deep work share" value={`${Math.round(deepShare)}%`} />
          <Stat label="Average block" value={fmtDuration(averageBlock)} />
          <Stat label="Shortest" value={fmtDuration(shortest)} />
          <Stat label="Longest" value={fmtDuration(longest)} />
        </dl>
      </PaperSheet>

      <PaperSheet className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[15px]">
          <Ruler size={14} className="text-teal-deep" aria-hidden="true" />
          Fragmentation
        </h3>
        <p className="mb-2 text-[11.5px] leading-relaxed text-ink-soft">
          Longest single session per day. Anything under an hour is hard to do real work in — that is what the longest-block
          length tells you.
        </p>
        <ul className="space-y-1.5">
          {daysWithWork.map((date) => {
            const weekday = blocks.find((block) => block.date === date)?.weekday ?? 'mon'
            const longestSession = maxByDay.get(date) ?? 0
            const tone = longestSession >= 90 ? 'bg-olive' : longestSession >= 60 ? 'bg-terracotta' : 'bg-rose'
            return (
              <li key={date} className="flex items-center gap-2">
                <span className="w-8 text-[11px] font-bold text-ink-soft">{WEEKDAY_SHORT[weekday]}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-kraft/70">
                  <span className={clsx('block h-full rounded-full', tone)} style={{ width: `${Math.min(100, (longestSession / 120) * 100)}%` }} />
                </span>
                <span className="tnum w-12 text-right text-[11px] font-semibold text-ink-faint">{fmtDuration(longestSession)}</span>
              </li>
            )
          })}
        </ul>
        <ul className="mt-3 space-y-1">
          {([...byEnergy.entries()] as [Energy, number][]).map(([energy, minutes]) => (
            <li key={energy} className="flex items-baseline justify-between text-[11px] text-ink-soft">
              <span>{ENERGY_LABEL[energy]}</span>
              <span className="tnum text-ink-faint">{fmtDuration(minutes)}</span>
            </li>
          ))}
        </ul>
      </PaperSheet>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-well px-2 py-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className="tnum mt-0.5 text-[13px] font-bold text-ink">{value}</dd>
    </div>
  )
}
