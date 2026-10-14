'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Sun, Coffee } from 'lucide-react'
import { SNAP_MINUTES, WEEKDAY_SHORT, type BusyEvent, type PlacedBlock, type Preferences, type Weekday } from '@/lib/types'
import { fmtClock, fmtDuration, workingHoursFor } from '@/lib/scheduler/slots'
import { usePlanner } from '@/lib/store/planner-store'
import { ScheduleBlock, BusyBlock } from '@/components/planner/ScheduleBlock'
import { PaperWell } from '@/components/paper/PaperSheet'

/**
 * The week as a diorama: seven day sheets standing in a cut recess.
 *
 * Interaction model (D-009): dragging never mutates a plan locally. It produces a *pin request*, the
 * server re-runs the engine, and the resulting plan comes back. The optimistic move is a courtesy,
 * not a source of truth. Keyboard operation mirrors the pointer one exactly.
 */

const HOUR_HEIGHT = 44
const SNAP = SNAP_MINUTES

export function WeekGrid({
  blocks,
  busy,
  preferences,
  weekLabel,
  weekStart,
}: {
  blocks: PlacedBlock[]
  busy: BusyEvent[]
  preferences: Preferences
  weekLabel: string
  /** From the plan when we have one. Without it the calendar dates are resolved on the client,
   *  so the server and the browser can never disagree about what day it is (hydration safety). */
  weekStart?: string
}) {
  const [mounted, setMounted] = useState(Boolean(weekStart))
  useEffect(() => setMounted(true), [])

  const resolvedStart = weekStart ?? (mounted ? startOfCurrentWeek(preferences) : null)
  const days = useMemo(
    () => (resolvedStart ? weekDays(preferences, resolvedStart) : []),
    [preferences, resolvedStart],
  )
  const { selectedBlockId, selectBlock, pinBlock, status, filters } = usePlanner()
  const dragRef = useRef<{
    blockId: string
    taskId: string
    mode: 'move' | 'resize'
    grabOffsetMin: number
    startX: number
    startY: number
    originDate: string
    originStart: number
    originMinutes: number
    moved: boolean
  } | null>(null)
  const [ghost, setGhost] = useState<{ blockId: string; date: string; startMin: number; minutes: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /** The strip of day columns — drag maths must be measured against this, not the whole grid,
   *  or the hour-label gutter silently shifts every drop by half a day. */
  const columnsRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const energy = filters.energy
    const categories = filters.categories
    return blocks.filter((block) => {
      if (filters.pinnedOnly && !block.pinned) return false
      if (energy.length && !energy.includes(block.energy)) return false
      if (categories.length && !categories.includes(block.category)) return false
      return true
    })
  }, [blocks, filters])

  const minuteToY = useCallback((minute: number, day: DayMeta) => ((minute - day.windowStart) / 60) * HOUR_HEIGHT, [])

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      const container = columnsRef.current
      if (!drag || !container) return
      const dayWidth = container.clientWidth / 7
      const dayIndex = Math.max(0, Math.min(6, Math.floor((event.clientX - container.getBoundingClientRect().left) / dayWidth)))
      const target = days[dayIndex]
      if (!target) return

      const rect = container.getBoundingClientRect()
      const minuteRaw = target.windowStart + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60
      const snapped = Math.round((minuteRaw - (drag.mode === 'move' ? drag.grabOffsetMin : 0)) / SNAP) * SNAP
      const minutes = drag.mode === 'resize' ? Math.max(SNAP, Math.round((minuteRaw - drag.originStart) / SNAP) * SNAP) : drag.originMinutes
      const maxStart = target.windowEnd - minutes
      const startMin = Math.max(target.windowStart, Math.min(maxStart, snapped))

      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true
      setGhost({ blockId: drag.blockId, date: target.date, startMin, minutes })
    },
    [days],
  )

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    const drag = dragRef.current
    const current = ghost
    dragRef.current = null
    setDraggingId(null)
    setGhost(null)
    if (!drag || !current || !drag.moved) return

    const day = days.find((d) => d.date === current.date)
    if (!day) return
    if (current.date === drag.originDate && current.startMin === drag.originStart && current.minutes === drag.originMinutes) return
    void pinBlock(drag.blockId, current.date, current.startMin, current.minutes)
  }, [days, ghost, onPointerMove, pinBlock])

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, block: PlacedBlock, mode: 'move' | 'resize') => {
      if (block.kind !== 'task') return
      event.preventDefault()
      event.stopPropagation()
      const day = days.find((d) => d.date === block.date)
      if (!day) return
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const minuteAtPointer = day.windowStart + ((event.clientY - rect.top) / rect.height) * block.minutes
      dragRef.current = {
        blockId: block.id,
        taskId: block.taskId,
        mode,
        grabOffsetMin: mode === 'move' ? minuteAtPointer : 0,
        startX: event.clientX,
        startY: event.clientY,
        originDate: block.date,
        originStart: block.startMin,
        originMinutes: block.minutes,
        moved: false,
      }
      setDraggingId(block.id)
      setGhost({ blockId: block.id, date: block.date, startMin: block.startMin, minutes: block.minutes })
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
    },
    [days, endDrag, onPointerMove],
  )

  /**
   * Keyboard parity (RULES.md §10): arrows nudge by a slot, shift+arrows jump an hour,
   * alt+arrows resize. Everything a mouse can do, a keyboard can do.
   */
  const onBlockKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, block: PlacedBlock) => {
      const day = days.find((d) => d.date === block.date)
      if (!day) return
      const step = event.shiftKey ? 60 : SNAP
      let nextDate = block.date
      let nextStart = block.startMin
      let nextMinutes = block.minutes

      if (event.key === 'ArrowUp' && event.altKey) nextMinutes = Math.max(SNAP, block.minutes - step)
      else if (event.key === 'ArrowDown' && event.altKey) nextMinutes = block.minutes + step
      else if (event.key === 'ArrowUp') nextStart = block.startMin - step
      else if (event.key === 'ArrowDown') nextStart = block.startMin + step
      else if (event.key === 'ArrowLeft') {
        const index = days.findIndex((d) => d.date === block.date)
        nextDate = days[Math.max(0, index - 1)]?.date ?? block.date
      } else if (event.key === 'ArrowRight') {
        const index = days.findIndex((d) => d.date === block.date)
        nextDate = days[Math.min(days.length - 1, index + 1)]?.date ?? block.date
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectBlock(block.id)
        return
      } else if (event.key === 'Escape') {
        selectBlock(null)
        return
      } else {
        return
      }

      event.preventDefault()
      const target = days.find((d) => d.date === nextDate) ?? day
      const clampedStart = Math.max(target.windowStart, Math.min(target.windowEnd - nextMinutes, nextStart))
      const clampedMinutes = Math.min(nextMinutes, target.windowEnd - clampedStart)
      void pinBlock(block.id, nextDate, clampedStart, clampedMinutes)
    },
    [days, pinBlock, selectBlock],
  )

  const plannedByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const block of visible) {
      if (block.kind !== 'task') continue
      map.set(block.date, (map.get(block.date) ?? 0) + block.minutes)
    }
    return map
  }, [visible])

  // Every hook above this line; the skeleton is a pure early return.
  if (!resolvedStart || days.length === 0) return <WeekGridSkeleton label={weekLabel} />


  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[19px] leading-none">Your week</h2>
          <span className="text-xs font-semibold text-ink-faint">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-ink-soft">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-teal" aria-hidden="true" /> deep
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-olive" aria-hidden="true" /> light
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-paper-edge" aria-hidden="true" /> admin
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-plum" aria-hidden="true" /> social
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-terracotta" aria-hidden="true" /> physical
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-frost-light ring-1 ring-frost-deep/30" aria-hidden="true" /> meeting
          </span>
        </div>
      </div>

      <PaperWell className="p-2 sm:p-3">
        {status === 'planning' ? (
          <div className="pointer-events-none absolute inset-0 z-30 rounded-[var(--radius-well)] bg-paper-cream/45" aria-hidden="true" />
        ) : null}

        <div className="flex">
          <div className="w-12 shrink-0 sm:w-14" aria-hidden="true" />
          {days.map((day) => (
            <div key={day.date} className="min-w-0 flex-1 px-0.5 text-center">
              <div className="mb-1 flex flex-col items-center gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
                  {WEEKDAY_SHORT[day.weekday]}
                </span>
                <span className="tnum text-[10px] font-semibold text-ink-faint">{day.date.slice(8)}</span>
                <DayLoadPip planned={plannedByDay.get(day.date) ?? 0} capacity={day.capacity} />
              </div>
            </div>
          ))}
        </div>

        <div
          className="relative flex"
          style={{ height: days[0] ? ((days[0].windowEnd - days[0].windowStart) / 60) * HOUR_HEIGHT : 600 }}
        >
          {/* hour gutter: printed onto the well, outside the drop-target strip */}
          <div className="relative w-12 shrink-0 sm:w-14" aria-hidden="true">
            {hourMarks(days[0]).map((mark) => (
              <span
                key={mark.minute}
                className="tnum absolute right-2 -translate-y-1/2 text-[10px] font-semibold text-ink-faint"
                style={{ top: ((mark.minute - (days[0]?.windowStart ?? 0)) / 60) * HOUR_HEIGHT }}
              >
                {fmtClock(mark.minute)}
              </span>
            ))}
          </div>

          <div ref={columnsRef} className="flex min-w-0 flex-1">
            {days.map((day) => (
              <DayColumn
                key={day.date}
                day={day}
                blocks={visible.filter((block) => block.date === day.date)}
                meetings={busy.filter((event) => event.date === day.date)}
                ghost={ghost}
                draggingId={draggingId}
                selectedBlockId={selectedBlockId}
                minuteToY={minuteToY}
                onSelect={selectBlock}
                onBeginDrag={beginDrag}
                onKeyDown={onBlockKeyDown}
              />
            ))}
          </div>
        </div>
      </PaperWell>

      <p className="mt-2 px-1 text-[11px] text-ink-faint">
        Drag a block to move it, or use the arrows once it is focused. Anything you place yourself is pinned and survives a rebuild.
      </p>
    </div>
  )
}

/** Paper skeleton while the week resolves — a cut-out placeholder, never a spinner. */
function WeekGridSkeleton({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[19px] leading-none">Your week</h2>
        <span className="text-xs font-semibold text-ink-faint">{label}</span>
      </div>
      <PaperWell className="p-2 sm:p-3">
        <div className="flex" aria-hidden="true">
          <div className="w-12 shrink-0 sm:w-14" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="min-w-0 flex-1 px-0.5">
              <div className="mx-auto mb-2 h-3 w-10 rounded-[var(--radius-cut-xs)] bg-paper-kraft/70" />
              <div className="space-y-1.5">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-4 rounded-[var(--radius-cut-xs)] bg-paper-kraft/45" style={{ width: `${72 - row * 16}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </PaperWell>
      <p className="mt-2 px-1 text-[11px] text-ink-faint">Unrolling the paper…</p>
    </div>
  )
}

function DayLoadPip({ planned, capacity }: { planned: number; capacity: number }) {
  if (capacity <= 0) return <span className="text-[10px] font-bold text-ink-faint">off</span>
  const ratio = Math.min(1.15, planned / capacity)
  const tone = ratio > 1 ? 'bg-rose' : ratio > 0.85 ? 'bg-terracotta' : 'bg-olive'
  return (
    <span className="flex items-center gap-1" title={`${fmtDuration(planned)} planned of ${fmtDuration(capacity)} usable`}>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-paper-kraft" aria-hidden="true">
        <span className={clsx('block h-full rounded-full', tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
      <span className="tnum text-[9.5px] font-bold text-ink-faint">{fmtDuration(planned)}</span>
    </span>
  )
}

type DayMeta = { weekday: Weekday; date: string; windowStart: number; windowEnd: number; capacity: number }

function weekDays(preferences: Preferences, weekStart: string): DayMeta[] {
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const offset = order.indexOf(preferences.weekStartsOn)
  const rotated = [...order.slice(offset), ...order.slice(0, offset)]

  return rotated.map((weekday, index) => {
    const hours = workingHoursFor(preferences, weekday)
    const date = addDays(weekStart, index)
    return {
      weekday,
      date,
      windowStart: Math.max(0, (hours?.start ?? 9 * 60) - 60),
      windowEnd: Math.min(24 * 60, (hours?.end ?? 17 * 60) + 60),
      capacity: hours ? hours.end - hours.start : 0,
    }
  })
}

function startOfCurrentWeek(preferences: Preferences): string {
  const now = new Date()
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const jsDay = (now.getDay() + 6) % 7
  const offset = order.indexOf(preferences.weekStartsOn)
  const delta = (jsDay - offset + 7) % 7
  const start = new Date(now.getTime() - delta * 86_400_000)
  const y = start.getFullYear()
  const m = `${start.getMonth() + 1}`.padStart(2, '0')
  const d = `${start.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T12:00:00`)
  const next = new Date(date.getTime() + days * 86_400_000)
  const y = next.getFullYear()
  const m = `${next.getMonth() + 1}`.padStart(2, '0')
  const d = `${next.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function hourMarks(day?: DayMeta) {
  if (!day) return []
  const marks: { minute: number }[] = []
  const first = Math.ceil(day.windowStart / 60) * 60
  for (let minute = first; minute <= day.windowEnd; minute += 60) marks.push({ minute })
  return marks
}

function DayColumn({
  day,
  blocks,
  meetings,
  ghost,
  draggingId,
  selectedBlockId,
  minuteToY,
  onSelect,
  onBeginDrag,
  onKeyDown,
}: {
  day: DayMeta
  blocks: PlacedBlock[]
  meetings: BusyEvent[]
  ghost: { blockId: string; date: string; startMin: number; minutes: number } | null
  draggingId: string | null
  selectedBlockId: string | null
  minuteToY(minute: number, day: DayMeta): number
  onSelect(id: string | null): void
  onBeginDrag(event: React.PointerEvent<HTMLElement>, block: PlacedBlock, mode: 'move' | 'resize'): void
  onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, block: PlacedBlock): void
}) {
  const off = day.capacity === 0
  const ghostHere = ghost && ghost.date === day.date ? ghost : null
  const overlapping = useMemo(() => layoutColumns(blocks), [blocks])

  return (
    <div
      className={clsx(
        'relative min-w-0 flex-1 rounded-[var(--radius-cut-xs)] border border-[color:rgba(120,98,70,0.10)]',
        off ? 'bg-paper-sand/40' : 'bg-paper-ivory/85',
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect(null)
      }}
    >
      {/* hour rules, printed lightly into the sheet */}
      {hourMarks(day).map((mark) => (
        <span
          key={mark.minute}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-[color:rgba(120,98,70,0.10)]"
          style={{ top: minuteToY(mark.minute, day) }}
        />
      ))}

      {/* protected windows: lunch and blackouts are the paper the tiles cannot cover */}
      <ProtectedBands day={day} />

      {meetings.map((event) => (
        <BusyBlock
          key={event.id}
          block={event}
          style={{
            top: minuteToY(event.startMin, day),
            height: Math.max(14, ((event.endMin - event.startMin) / 60) * HOUR_HEIGHT),
            left: 2,
            right: 2,
          }}
        />
      ))}

      {blocks.map((block) => {
        const isGhosted = ghostHere?.blockId === block.id
        const start = isGhosted ? ghostHere.startMin : block.startMin
        const minutes = isGhosted ? ghostHere.minutes : block.minutes
        const slotWidth = 100 / (overlapping.get(block.id)?.columns ?? 1)
        const leftPct = (overlapping.get(block.id)?.index ?? 0) * slotWidth
        const compact = minutes < 45
        return (
          <ScheduleBlock
            key={block.id}
              block={{ ...block, startMin: start, endMin: start + minutes, minutes }}
              compact={compact}
              selected={selectedBlockId === block.id}
              dragging={draggingId === block.id}
              style={{
                top: minuteToY(start, day),
                height: Math.max(22, (minutes / 60) * HOUR_HEIGHT - 2),
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${slotWidth}% - 4px)`,
              }}
              onSelect={() => onSelect(block.id)}
              onPointerDown={(event) => onBeginDrag(event, block, 'move')}
              onResizePointerDown={(event) => onBeginDrag(event, block, 'resize')}
            onKeyDown={(event) => onKeyDown(event, block)}
          />
        )
      })}
    </div>
  )
}

/** Lunch and blackout bands, so protected time is visible rather than merely respected. */
function ProtectedBands({ day }: { day: DayMeta }) {
  const preferences = usePlanner((state) => state.preferences)
  const lunch = preferences.lunch
  const bands: { label: string; start: number; end: number; icon: React.ReactNode; tone: string }[] = []
  if (lunch && day.capacity > 0) {
    bands.push({
      label: 'Lunch',
      start: lunch.start,
      end: Math.max(lunch.end, lunch.start + lunch.minutes),
      icon: <Coffee size={9} aria-hidden="true" />,
      tone: 'bg-olive-light/30',
    })
  }
  for (const blackout of preferences.blackouts) {
    if (blackout.weekday && blackout.weekday !== day.weekday) continue
    bands.push({ label: blackout.label, start: blackout.start, end: blackout.end, icon: <Sun size={9} aria-hidden="true" />, tone: 'bg-paper-kraft/45' })
  }
  return (
    <>
      {bands.map((band) => (
        <div
          key={`${band.label}_${band.start}`}
          aria-hidden="true"
          className={clsx('pointer-events-none absolute inset-x-0 border-y border-dashed border-[color:rgba(120,98,70,0.18)]', band.tone)}
          style={{ top: ((band.start - day.windowStart) / 60) * HOUR_HEIGHT, height: Math.max(8, ((band.end - band.start) / 60) * HOUR_HEIGHT) }}
        >
          <span className="mt-0.5 ml-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] text-ink-faint">
            {band.icon}
            {band.label}
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * Side-by-side layout for overlapping tiles. A real diorama overlaps its layers rather than hiding
 * one, so colliding tiles split the column and shift vertically by 2px (DESIGN.md §10).
 */
function layoutColumns(blocks: PlacedBlock[]): Map<string, { index: number; columns: number }> {
  const result = new Map<string, { index: number; columns: number }>()
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)
  for (const block of sorted) {
    const overlapping = sorted.filter((other) => other.id !== block.id && other.startMin < block.endMin && block.startMin < other.endMin)
    const index = overlapping.filter((other) => other.startMin < block.startMin).length
    result.set(block.id, { index, columns: Math.max(1, overlapping.length + 1) })
  }
  return result
}

