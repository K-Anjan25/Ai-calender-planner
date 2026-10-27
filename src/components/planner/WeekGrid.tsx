'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Sun, Coffee } from 'lucide-react'
import {
  SNAP_MINUTES,
  WEEKDAY_SHORT,
  type BusyEvent,
  type PlacedBlock,
  type Preferences,
  type Weekday,
} from '@/lib/types'
import { fmtClock, fmtDuration, weekendHours, workingHoursFor } from '@/lib/scheduler/slots'
import { hasDraftChanges, plannerLocked, usePlanner } from '@/lib/store/planner-store'
import { ScheduleBlock, BusyBlock } from '@/components/planner/ScheduleBlock'
import { PaperWell } from '@/components/paper/PaperSheet'

/**
 * The weekly calendar: timestamp-aligned columns with accessible task details.
 *
 * Interaction model (D-009): dragging never mutates a plan locally. It produces a *pin request*, the
 * server re-runs the engine, and the resulting plan comes back. The optimistic move is a courtesy,
 * not a source of truth. Keyboard operation mirrors the pointer one exactly.
 */

/** Pixels per hour. The drag maths, the ghost, and the test harness all measure against this. */
export const HOUR_HEIGHT = 112
const SNAP = SNAP_MINUTES

/** Where a dragged tile currently wants to land, before the server agrees. */
type Ghost = {
  blockId: string
  date: string
  startMin: number
  minutes: number
}

/** Shared empties: `memo` compares by identity, so a fresh `[]` per render would defeat it. */
const NO_BLOCKS: PlacedBlock[] = []
const NO_MEETINGS: BusyEvent[] = []

/** Everything a drag needs to survive re-renders. Held in a ref, not state: it must not re-render. */
type DragDescriptor = {
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
}

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

  /** Keep one aligned time axis, including actual overflow placements and meetings.
   * Unrelated preference edits retain the same day geometry. */
  const workingHours = preferences.workingHours
  const weekendMode = preferences.weekendMode
  const weekStartsOn = preferences.weekStartsOn
  const days = useMemo(() => {
    if (!resolvedStart) return []
    const base = weekDays(workingHours, weekendMode, weekStartsOn, resolvedStart)
    const dates = new Set(base.map((day) => day.date))
    const events = [...blocks, ...busy].filter((event) => dates.has(event.date))
    const start = Math.max(
      0,
      Math.floor(Math.min(...base.map((day) => day.windowStart), ...events.map((event) => event.startMin)) / 60) * 60,
    )
    const end = Math.min(
      1440,
      Math.ceil(Math.max(...base.map((day) => day.windowEnd), ...events.map((event) => event.endMin)) / 60) * 60,
    )
    return base.map((day) => ({ ...day, windowStart: start, windowEnd: end }))
  }, [workingHours, weekendMode, weekStartsOn, resolvedStart, blocks, busy])
  const { selectedBlockId, selectBlock, pinBlock, status, filters } = usePlanner()
  const locked = usePlanner(plannerLocked)
  const stale = usePlanner(hasDraftChanges)
  const focusAfterMove = useRef<string | null>(null)
  const dragRef = useRef<DragDescriptor | null>(null)
  const [ghost, setGhostState] = useState<Ghost | null>(null)
  /**
   * The ghost, mirrored into a ref.
   *
   * `pointerup` is registered while the drag *starts*, so its listener closes over the `ghost` of
   * that render — which is still `null`. Reading the ref instead of the captured state is what makes
   * a drop land: without it the tile follows the cursor and then silently snaps back, and the plan
   * never changes. (Found by `tests/ui.test.ts`, not by reading the code.)
   */
  const ghostRef = useRef<Ghost | null>(null)
  const setGhost = useCallback((next: Ghost | null) => {
    ghostRef.current = next
    setGhostState(next)
  }, [])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /** The strip of day columns — drag maths must be measured against this, not the whole grid,
   *  or the hour-label gutter silently shifts every drop by half a day. */
  const columnsRef = useRef<HTMLDivElement>(null)
  /**
   * The strip's geometry, measured **once when the drag starts**.
   *
   * Reading `clientWidth`/`getBoundingClientRect()` inside the move handler looks harmless and is
   * the classic performance trap: React has already written the previous frame's transform, so the
   * read forces the browser to recompute style and layout before it can answer — a synchronous
   * reflow per `pointermove`. A 120 Hz mouse delivers ~120 of those a second, on top of the render
   * that follows, which is precisely how an interaction ends up over the INP budget
   * (`tests/perf.test.ts` measures this; the numbers are in MEMORY.md §5b).
   *
   * A gesture cannot scroll the page, and `clientX/clientY` are viewport-relative exactly like
   * `getBoundingClientRect()`, so the measurement stays valid for the whole drag.
   */
  const geometryRef = useRef<{
    left: number
    top: number
    dayWidth: number
  } | null>(null)

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

  /**
   * Partition once instead of filtering per column on every render.
   *
   * `visible.filter(...)` inside the map handed each column a brand-new array, so every column
   * re-rendered on every pointer move even though only the dragged one can have changed. The arrays
   * below keep their identity until the blocks or the filters actually do.
   */
  const byDay = useMemo(() => {
    const blocksFor = new Map<string, PlacedBlock[]>()
    const meetingsFor = new Map<string, BusyEvent[]>()
    for (const day of days) {
      blocksFor.set(day.date, [])
      meetingsFor.set(day.date, [])
    }
    for (const block of visible) blocksFor.get(block.date)?.push(block)
    for (const event of busy) meetingsFor.get(event.date)?.push(event)
    return { blocksFor, meetingsFor }
  }, [busy, days, visible])

  const minuteToY = useCallback((minute: number, day: DayMeta) => ((minute - day.windowStart) / 60) * HOUR_HEIGHT, [])

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      const geometry = geometryRef.current
      if (!drag || !geometry) return
      const dayIndex = Math.max(0, Math.min(6, Math.floor((event.clientX - geometry.left) / geometry.dayWidth)))
      const target = drag.mode === 'resize' ? days.find((day) => day.date === drag.originDate) : days[dayIndex]
      if (!target) return
      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true
      if (
        event.clientX < geometry.left ||
        event.clientX > geometry.left + geometry.dayWidth * 7 ||
        event.clientY < geometry.top ||
        event.clientY > geometry.top + ((target.windowEnd - target.windowStart) / 60) * HOUR_HEIGHT
      ) {
        setGhost(null)
        return
      }

      const minuteRaw = target.windowStart + ((event.clientY - geometry.top) / HOUR_HEIGHT) * 60
      const span = target.windowEnd - drag.originStart

      // Two gestures, two rules. A *move* follows the cursor, offset by wherever the tile was
      // grabbed. A *resize* keeps the start where it was and only moves the base — deriving the
      // start from the pointer here would slide the whole block down as the user stretches it.
      const minutes =
        drag.mode === 'resize'
          ? Math.min(span, Math.max(SNAP, Math.round((minuteRaw - drag.originStart) / SNAP) * SNAP))
          : drag.originMinutes
      const requested =
        drag.mode === 'resize' ? drag.originStart : Math.round((minuteRaw - drag.grabOffsetMin) / SNAP) * SNAP
      const startMin = Math.max(target.windowStart, Math.min(target.windowEnd - minutes, requested))

      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true
      setGhost({ blockId: drag.blockId, date: target.date, startMin, minutes })
    },
    [days, setGhost],
  )

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    const drag = dragRef.current
    const current = ghostRef.current
    dragRef.current = null
    geometryRef.current = null
    setDraggingId(null)
    setGhost(null)
    if (!drag) return
    if (!drag.moved) {
      setTimeout(() => document.getElementById('planner-block-details')?.focus(), 0)
      return
    }
    if (!current) {
      usePlanner.setState({ actionMessage: 'Move cancelled outside the calendar. The draft is unchanged.' })
      return
    }

    const day = days.find((d) => d.date === current.date)
    if (!day) return
    if (
      current.date === drag.originDate &&
      current.startMin === drag.originStart &&
      current.minutes === drag.originMinutes
    )
      return
    focusAfterMove.current = drag.blockId
    void pinBlock(drag.blockId, current.date, current.startMin, current.minutes)
  }, [days, onPointerMove, pinBlock, setGhost])

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, block: PlacedBlock, mode: 'move' | 'resize') => {
      if (
        block.kind !== 'task' ||
        plannerLocked(usePlanner.getState()) ||
        hasDraftChanges(usePlanner.getState()) ||
        event.button !== 0
      )
        return
      event.preventDefault()
      event.stopPropagation()
      const day = days.find((d) => d.date === block.date)
      if (!day) return
      const strip = columnsRef.current
      if (!strip) return
      // One measurement for the whole gesture — see `geometryRef`. The tile's own rect is read here
      // too, because the grab offset is relative to it and this runs once per drag, not per move.
      const stripRect = strip.getBoundingClientRect()
      geometryRef.current = {
        left: stripRect.left,
        top: stripRect.top,
        dayWidth: strip.clientWidth / 7,
      }
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      selectBlock(block.id)
      ;(event.currentTarget.closest('[data-block-id]') as HTMLElement | null)?.focus()
      // An offset *within the block*, in minutes. Adding `day.windowStart` here makes the drop land
      // at the start of the day instead of under the cursor, because the move handler subtracts this
      // from an absolute minute.
      const minuteAtPointer = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * block.minutes : 0
      dragRef.current = {
        blockId: block.id,
        taskId: block.taskId,
        mode,
        grabOffsetMin: mode === 'move' ? Math.max(0, Math.min(block.minutes, minuteAtPointer)) : 0,
        startX: event.clientX,
        startY: event.clientY,
        originDate: block.date,
        originStart: block.startMin,
        originMinutes: block.minutes,
        moved: false,
      }
      setDraggingId(block.id)
      setGhost({
        blockId: block.id,
        date: block.date,
        startMin: block.startMin,
        minutes: block.minutes,
      })
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
    },
    [days, endDrag, onPointerMove, setGhost, selectBlock],
  )

  useEffect(() => {
    const cancel = () => {
      if (!dragRef.current) return
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      dragRef.current = null
      geometryRef.current = null
      setDraggingId(null)
      setGhost(null)
      usePlanner.setState({ actionMessage: 'Move or resize cancelled. The draft is unchanged.' })
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      dragRef.current = null
      geometryRef.current = null
    }
  }, [endDrag, onPointerMove, setGhost])

  useEffect(() => {
    if (status === 'planning' || !focusAfterMove.current) return
    const id = selectedBlockId ?? focusAfterMove.current
    const node = [...(columnsRef.current?.querySelectorAll<HTMLButtonElement>('[data-block-id]') ?? [])].find(
      (node) => node.dataset.blockId === id,
    )
    node?.focus({ preventScroll: true })
    focusAfterMove.current = null
  }, [status, selectedBlockId])

  /**
   * Keyboard parity (RULES.md §10): arrows nudge by a slot, shift+arrows jump an hour,
   * alt+arrows resize. Everything a mouse can do, a keyboard can do.
   */
  const onBlockKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, block: PlacedBlock) => {
      const day = days.find((d) => d.date === block.date)
      if (!day) return
      if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        const nodes = [...(columnsRef.current?.querySelectorAll<HTMLButtonElement>('[data-block-id]') ?? [])]
        const index = nodes.indexOf(event.currentTarget)
        const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
        const next = nodes[Math.max(0, Math.min(nodes.length - 1, index + direction))]
        next?.focus()
        if (next?.dataset.blockId) selectBlock(next.dataset.blockId)
        return
      }
      if (block.kind !== 'task' && event.key.startsWith('Arrow')) {
        event.preventDefault()
        return
      }
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
        setTimeout(() => document.getElementById('planner-block-details')?.focus(), 0)
        return
      } else if (event.key === 'Escape') {
        selectBlock(null)
        return
      } else {
        return
      }

      event.preventDefault()
      if (plannerLocked(usePlanner.getState()) || hasDraftChanges(usePlanner.getState())) return
      const target = days.find((d) => d.date === nextDate) ?? day
      if (event.altKey) nextMinutes = Math.min(nextMinutes, target.windowEnd - block.startMin)
      const clampedStart = Math.max(target.windowStart, Math.min(target.windowEnd - nextMinutes, nextStart))
      const clampedMinutes = Math.min(nextMinutes, target.windowEnd - clampedStart)
      if (nextDate === block.date && clampedStart === block.startMin && clampedMinutes === block.minutes) {
        usePlanner.setState({ actionMessage: 'This block is already at the edge of the displayed week.' })
        return
      }
      focusAfterMove.current = block.id
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
    <div className="relative" aria-busy={locked}>
      {stale && (
        <p role="status" className="mb-2 text-sm text-ink">
          This schedule is out of date. Re-plan before moving or resizing blocks.
        </p>
      )}
      {visible.filter((block) => block.kind === 'task').length === 0 &&
        blocks.some((block) => block.kind === 'task') && (
          <p role="status" className="mb-2 text-sm text-ink">
            No tasks match your filters. Clear filters to see the full week.
          </p>
        )}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[19px] leading-none">Your week</h2>
          <span className="text-xs font-semibold text-ink-faint">{weekLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-soft">
          <span className="sr-only">Colour key</span>
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
            <span className="h-2.5 w-2.5 rounded-[3px] bg-frost-light ring-1 ring-frost-deep/30" aria-hidden="true" />{' '}
            meeting
          </span>
        </div>
      </div>

      <PaperWell className="p-2 sm:p-3">
        {locked ? (
          <div
            className="pointer-events-none absolute inset-0 z-30 rounded-[var(--radius-well)] bg-paper-cream/45"
            aria-hidden="true"
          />
        ) : null}

        {/*
          One scroller for the header row *and* the strip, so a day label can never drift out of line
          with its own column.
          
          Below roughly 720px of available width the week stops compressing and starts scrolling. Seven
          days sharing 300px is 43px a day: the title, the time and the reason chips cannot be read at
          any font size, and the tiles turn into a barcode. A fixed minimum per day plus a horizontal
          scroll keeps every column legible — which is the whole job of a calendar — and the hour
          gutter is `sticky` so "when" is never scrolled out of view.

          The maths still holds: a drag measures `columnsRef` once at `pointerdown`, and
          `clientX - rect.left` is content-relative, so a scrolled strip drops where it looks like it
          should (see `geometryRef`).
        */}
        <div className="overflow-x-auto overscroll-x-contain pb-1">
          <div className="min-w-[720px]">
            <div className="flex">
              <div className="sticky left-0 z-20 w-12 shrink-0 bg-paper-sand sm:w-14" aria-hidden="true" />
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
              style={{
                height: days[0] ? ((days[0].windowEnd - days[0].windowStart) / 60) * HOUR_HEIGHT : 600,
              }}
            >
              {/* hour gutter: printed onto the well, outside the drop-target strip, stuck to the left */}
              <div className="sticky left-0 z-20 w-12 shrink-0 bg-paper-sand sm:w-14" aria-hidden="true">
                {hourMarks(days[0]).map((mark) => {
                  /* The window starts and ends on the hour, so the first and last labels sit exactly on
                     the edge. Centring them there hangs half a line of text outside the well — over the
                     day/date header above and off the bottom of the grid. They are pinned inside
                     instead; only the labels in between are centred on their rule. */
                  const atStart = mark.minute === days[0]?.windowStart
                  const atEnd = mark.minute === days[0]?.windowEnd
                  return (
                    <span
                      key={mark.minute}
                      className={clsx(
                        'tnum absolute right-2 text-[10px] font-semibold text-ink-faint',
                        atStart ? 'translate-y-0' : atEnd ? '-translate-y-full' : '-translate-y-1/2',
                      )}
                      style={{
                        top: ((mark.minute - (days[0]?.windowStart ?? 0)) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      {fmtClock(mark.minute)}
                    </span>
                  )
                })}
              </div>

              {/* data-day-strip is the measurement target for drag maths and for the jsdom UI tests. */}
              <div ref={columnsRef} data-day-strip="" className="flex min-w-0 flex-1">
                {days.map((day) => (
                  <DayColumn
                    key={day.date}
                    day={day}
                    blocks={byDay.blocksFor.get(day.date) ?? NO_BLOCKS}
                    meetings={byDay.meetingsFor.get(day.date) ?? NO_MEETINGS}
                    /* Scoped to the target: the other six columns receive a stable `null`, so the
                       memoised column skips them entirely while a drag is in flight. */
                    ghost={ghost && ghost.date === day.date ? ghost : null}
                    draggingId={draggingId}
                    editable={!locked && !stale}
                    selectedBlockId={selectedBlockId}
                    minuteToY={minuteToY}
                    onSelect={selectBlock}
                    onBeginDrag={beginDrag}
                    onKeyDown={onBlockKeyDown}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </PaperWell>

      <p className="mt-2 px-1 text-sm text-ink">
        Select a block for full details. Keyboard shortcuts are available in Keyboard help above the week.
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
                  <div
                    key={row}
                    className="h-4 rounded-[var(--radius-cut-xs)] bg-paper-kraft/45"
                    style={{ width: `${72 - row * 16}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </PaperWell>
      <p className="mt-2 px-1 text-[11px] text-ink-faint">Preparing your week…</p>
    </div>
  )
}

function DayLoadPip({ planned, capacity }: { planned: number; capacity: number }) {
  if (capacity <= 0) return <span className="text-[10px] font-bold text-ink-faint">off</span>
  const ratio = Math.min(1.15, planned / capacity)
  const tone = ratio > 1 ? 'bg-rose' : ratio > 0.85 ? 'bg-terracotta' : 'bg-olive'
  return (
    <span
      className="flex min-w-0 items-center gap-1"
      title={`${fmtDuration(planned)} planned of ${fmtDuration(capacity)} usable`}
    >
      <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-paper-kraft" aria-hidden="true">
        <span className={clsx('block h-full rounded-full', tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
      <span className="tnum text-[9.5px] font-bold whitespace-nowrap text-ink-faint">{fmtDuration(planned)}</span>
    </span>
  )
}

type DayMeta = {
  weekday: Weekday
  date: string
  windowStart: number
  windowEnd: number
  capacity: number
}

function weekDays(
  workingHours: Preferences['workingHours'],
  weekendMode: Preferences['weekendMode'],
  weekStartsOn: Weekday,
  weekStart: string,
): DayMeta[] {
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const offset = order.indexOf(weekStartsOn)
  const rotated = [...order.slice(offset), ...order.slice(0, offset)]

  return rotated.map((weekday, index) => {
    // Same resolution as `workingHoursFor`, spelled out here so this grid depends on the two values
    // that decide a day window rather than on the object that carries them.
    const explicit = workingHours[weekday]
    const hours =
      explicit && explicit.end > explicit.start
        ? explicit
        : weekday === 'sat' || weekday === 'sun'
          ? weekendHours(weekendMode)
          : null
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

/**
 * One day. Memoised because a drag updates the ghost ~120×/second and only the column holding the
 * dragged tile can look different; without this every column re-rendered for every move.
 */
const DayColumn = memo(function DayColumn({
  day,
  blocks,
  meetings,
  ghost,
  draggingId,
  editable,
  selectedBlockId,
  minuteToY,
  onSelect,
  onBeginDrag,
  onKeyDown,
}: {
  day: DayMeta
  blocks: PlacedBlock[]
  meetings: BusyEvent[]
  ghost: {
    blockId: string
    date: string
    startMin: number
    minutes: number
  } | null
  draggingId: string | null
  editable: boolean
  selectedBlockId: string | null
  minuteToY(minute: number, day: DayMeta): number
  onSelect(id: string | null): void
  onBeginDrag(event: React.PointerEvent<HTMLElement>, block: PlacedBlock, mode: 'move' | 'resize'): void
  onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, block: PlacedBlock): void
}) {
  const off = day.capacity === 0
  const ghostHere = ghost && ghost.date === day.date ? ghost : null
  const preferences = usePlanner((state) => state.preferences)
  const overlapping = useMemo(
    () =>
      layoutColumns([
        ...blocks,
        ...meetings.map((event) => ({
          ...event,
          minutes: event.endMin - event.startMin,
        })),
      ]),
    [blocks, meetings],
  )
  const overlapsGhost = (start: number, end: number) =>
    Boolean(ghostHere && start < ghostHere.startMin + ghostHere.minutes && ghostHere.startMin < end)
  const lunch = preferences.lunch
  const working = workingHoursFor(preferences, day.weekday)
  const ghostBlocked =
    ghostHere &&
    (day.capacity === 0 ||
      !working ||
      ghostHere.startMin < working.start ||
      ghostHere.startMin + ghostHere.minutes > working.end ||
      meetings.some((event) => overlapsGhost(event.startMin, event.endMin)) ||
      blocks.some(
        (block) => block.pinned && block.id !== ghostHere.blockId && overlapsGhost(block.startMin, block.endMin),
      ) ||
      (lunch && overlapsGhost(lunch.start, Math.max(lunch.end, lunch.start + lunch.minutes))) ||
      preferences.blackouts.some(
        (window) => (!window.weekday || window.weekday === day.weekday) && overlapsGhost(window.start, window.end),
      ))

  return (
    <div
      data-day-date={day.date}
      data-window-start={day.windowStart}
      className={clsx(
        'relative min-w-0 flex-1 rounded-[var(--radius-cut-xs)] border border-[color:rgba(25,25,25,0.10)]',
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
          className="pointer-events-none absolute inset-x-0 border-t border-[color:rgba(25,25,25,0.10)]"
          style={{ top: minuteToY(mark.minute, day) }}
        />
      ))}

      {ghostHere && (
        <div
          data-drop-preview
          data-blocked={Boolean(ghostBlocked)}
          role="status"
          className={clsx(
            'pointer-events-none absolute inset-x-0 z-20 overflow-hidden border-2 px-1 text-[11px] font-bold text-ink',
            ghostBlocked ? 'border-dashed border-ink bg-terracotta' : 'border-ink bg-frost/70',
          )}
          style={{
            top: minuteToY(ghostHere.startMin, day),
            height: Math.max(24, (ghostHere.minutes / 60) * HOUR_HEIGHT - 2),
          }}
          title={
            ghostBlocked
              ? 'Unavailable: overlaps protected time or a pinned event. The server validates every drop.'
              : 'Drop preview. The server validates the resulting plan.'
          }
        >
          {ghostBlocked ? 'Unavailable' : 'Drop preview'} · {fmtClock(ghostHere.startMin)}
        </div>
      )}
      {/* protected windows: lunch and blackouts are the paper the tiles cannot cover */}
      <ProtectedBands day={day} />

      {meetings.map((event) => (
        <BusyBlock
          key={event.id}
          block={event}
          style={{
            top: minuteToY(event.startMin, day),
            height: Math.max(2, ((event.endMin - event.startMin) / 60) * HOUR_HEIGHT - 2),
            left: `calc(${((overlapping.get(event.id)?.index ?? 0) * 100) / (overlapping.get(event.id)?.columns ?? 1)}% + 2px)`,
            width: `calc(${100 / (overlapping.get(event.id)?.columns ?? 1)}% - 4px)`,
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
            block={{
              ...block,
              startMin: start,
              endMin: start + minutes,
              minutes,
            }}
            compact={compact}
            editable={editable}
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
})

/** Lunch and blackout bands, so protected time is visible rather than merely respected. */
function ProtectedBands({ day }: { day: DayMeta }) {
  const preferences = usePlanner((state) => state.preferences)
  const lunch = preferences.lunch
  const bands: {
    label: string
    start: number
    end: number
    icon: React.ReactNode
    tone: string
  }[] = []
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
    bands.push({
      label: blackout.label,
      start: blackout.start,
      end: blackout.end,
      icon: <Sun size={9} aria-hidden="true" />,
      tone: 'bg-paper-kraft/45',
    })
  }
  return (
    <>
      {bands
        .filter((band) => band.end > day.windowStart && band.start < day.windowEnd)
        .map((band, bandIndex) => (
          <div
            // Index included: two windows can legitimately share a label and a start time ("Busy"
            // at 15:00 on two rows of the list), and a duplicate key drops one of them silently.
            key={`${bandIndex}_${band.label}_${band.start}`}
            aria-hidden="true"
            className={clsx(
              // `overflow-hidden`: a 15-minute band is 11px tall and its label is 13px. Without this the
              // text spills over the neighbouring slot instead of being clipped to its own window.
              'pointer-events-none absolute inset-x-0 overflow-hidden border-y border-dashed border-[color:rgba(25,25,25,0.18)]',
              band.tone,
            )}
            style={{
              top: ((Math.max(band.start, day.windowStart) - day.windowStart) / 60) * HOUR_HEIGHT,
              height: Math.max(
                8,
                ((Math.min(band.end, day.windowEnd) - Math.max(band.start, day.windowStart)) / 60) * HOUR_HEIGHT,
              ),
            }}
          >
            <span className="mt-0.5 ml-1 flex min-w-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] whitespace-nowrap text-ink-faint">
              <span className="shrink-0">{band.icon}</span>
              <span className="min-w-0 truncate">{band.label}</span>
            </span>
          </div>
        ))}
    </>
  )
}

/**
 * Side-by-side layout for overlapping tiles (DESIGN.md §10).
 *
 * The first version counted how many tiles started *before* this one and used that as the column
 * index. That is only correct when no two tiles share a start: two blocks starting at 09:00 both got
 * index 0 and width 50%, so they were drawn on top of each other and the one underneath was simply
 * invisible — no error, no warning, just a block the user could not see or grab. The engine will not
 * place two tasks at the same minute, but a ritual row (lunch, a focus break) can land on a task, and
 * a drag preview always can.
 *
 * A calendar lays overlaps out the way a greedy interval colouring does: walk the cluster in time
 * order and give each tile the first column whose last tile has already *ended*. Every tile then has
 * its own column, and a cluster's width is the number of columns it needed.
 */
export function layoutColumns(
  blocks: Pick<PlacedBlock, 'id' | 'startMin' | 'endMin' | 'minutes'>[],
): Map<string, { index: number; columns: number }> {
  const result = new Map<string, { index: number; columns: number }>()
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.minutes - a.minutes)

  /** A run of tiles connected by overlap: nothing outside it can share columns with anything inside. */
  const cluster: {
    block: Pick<PlacedBlock, 'id' | 'startMin' | 'endMin' | 'minutes'>
    index: number
  }[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    if (cluster.length === 0) return
    const width = cluster.reduce((most, item) => Math.max(most, item.index + 1), 1)
    for (const item of cluster) result.set(item.block.id, { index: item.index, columns: width })
    cluster.length = 0
  }

  /** When each column is free again. */
  let freeAt: number[] = []

  for (const block of sorted) {
    if (block.startMin >= clusterEnd) {
      flush()
      freeAt = []
      clusterEnd = block.endMin
    } else {
      clusterEnd = Math.max(clusterEnd, block.endMin)
    }
    let index = freeAt.findIndex((end) => end <= block.startMin)
    if (index === -1) index = freeAt.length
    freeAt[index] = block.endMin
    cluster.push({ block, index })
  }
  flush()

  return result
}
