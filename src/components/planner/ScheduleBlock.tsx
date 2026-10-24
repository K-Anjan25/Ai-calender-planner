'use client'

import { clsx } from 'clsx'
import { Lock, TriangleAlert, Layers } from 'lucide-react'
import type { PlacedBlock } from '@/lib/types'
import { ENERGY_ACCENT, ENERGY_LABEL, type Energy } from '@/lib/types'
import { fmtClock, fmtDuration } from '@/lib/scheduler/slots'

/**
 * A schedule tile (DESIGN.md §9.1).
 *
 * The smallest paper unit in the app: a cut-out tile glued onto a day sheet. The 3px left edge is the
 * dyed paper layer; the accent colour always means the same thing (energy demand), never decoration.
 */

const ACCENT_BAR: Record<string, string> = {
  teal: 'bg-teal',
  olive: 'bg-olive',
  kraft: 'bg-paper-edge',
  plum: 'bg-plum',
  terracotta: 'bg-terracotta',
}

const ACCENT_WASH: Record<string, string> = {
  teal: 'bg-teal-light/45',
  olive: 'bg-olive-light/45',
  kraft: 'bg-paper-kraft/50',
  plum: 'bg-plum-light/45',
  terracotta: 'bg-terracotta-light/45',
}

export function ScheduleBlock({
  block,
  style,
  compact,
  selected,
  dragging,
  onSelect,
  onPointerDown,
  onResizePointerDown,
  onKeyDown,
}: {
  block: PlacedBlock
  style: React.CSSProperties
  compact?: boolean
  selected: boolean
  dragging: boolean
  onSelect(): void
  onPointerDown(event: React.PointerEvent<HTMLButtonElement>): void
  onResizePointerDown(event: React.PointerEvent<HTMLSpanElement>): void
  onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void
}) {
  const accent = ENERGY_ACCENT[block.energy as Energy] ?? 'kraft'
  const isSpecial = block.kind !== 'task'
  /**
   * How much of a tile actually fits.
   *
   * The tile's height is fixed by the block's duration, and `.paper-tile` clips what does not fit —
   * so a 45-minute tile showing a two-line title, a time row and two reason chips did not overflow
   * the sheet, it silently lost its last line. Content is therefore chosen by available height:
   * a title needs ~26px, a time row ~14px, a chip row ~18px.
   */
  const pixels = typeof style.height === 'number' ? style.height : 0
  const titleClamp = pixels >= 72 ? 'line-clamp-2' : 'line-clamp-1'
  const showTime = pixels >= 50
  const chipBudget = pixels >= 130 ? 1 : 0
  const reasons = block.reasons.filter((reason) => reason.code !== 'pinned').slice(0, chipBudget)
  const hiddenReasons = block.reasons.filter((reason) => reason.code !== 'pinned').length - reasons.length

  return (
    <button
      type="button"
      data-block-id={block.id}
      title={`${block.title} · ${fmtClock(block.startMin)}–${fmtClock(block.endMin)} · ${block.reasonText}`}
      aria-expanded={selected}
      aria-describedby={`block-description-${block.id}`}
      style={style}
      onClick={onSelect}
      onFocus={onSelect}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      aria-label={`${block.title}, ${block.weekday} ${fmtClock(block.startMin)} to ${fmtClock(block.endMin)}, ${
        isSpecial ? block.kind : ENERGY_LABEL[block.energy as Energy]
      }${block.pinned ? ', pinned in place' : ''}${block.conflict ? `, flagged ${block.conflict.replace('-', ' ')}` : ''}`}
      className={clsx(
        'paper-tile group absolute text-left transition-[transform,box-shadow] duration-150 ease-[var(--ease-paper)]',
        // `touch-none` is what makes the gesture a drag rather than a page scroll on a phone: without
        // it the browser claims the touch for scrolling and `pointermove` never fires on the tile.
        'touch-none select-none',
        'focus-visible:outline-2 focus-visible:outline-teal-deep',
        dragging
          ? 'paper-lifted cursor-grabbing'
          : 'hover:-translate-y-px hover:shadow-[var(--shadow-lift)] cursor-grab',
        selected && 'ring-2 ring-teal-deep/70 ring-offset-1 ring-offset-paper-ivory',
        block.conflict === 'deadline-risk' && 'border-dashed border-rose',
        isSpecial && 'border-dashed',
      )}
    >
      {/* dyed paper edge — colour is semantic (energy), always */}
      <span aria-hidden="true" className={clsx('absolute inset-y-0 left-0 w-[3px]', ACCENT_BAR[accent])} />
      <span aria-hidden="true" className={clsx('absolute inset-y-0 left-[3px] w-8 opacity-70', ACCENT_WASH[accent])} />

      <span className={clsx('block pl-2.5 pr-1.5 pt-1', compact ? 'pb-0.5' : 'pb-1.5')}>
        <span className="flex items-start justify-between gap-1">
          <span
            className={clsx(
              titleClamp,
              'min-w-0 font-semibold text-ink',
              compact ? 'text-[10.5px] leading-[1.25]' : 'text-[12px] leading-tight',
            )}
          >
            {block.title}
          </span>
          <span className="mt-[1px] flex shrink-0 items-center gap-1">
            {block.pinned ? <Lock size={9} className="text-ink-faint" aria-hidden="true" /> : null}
            {block.chunkCount > 1 ? <Layers size={9} className="text-ink-faint" aria-hidden="true" /> : null}
            {block.conflict ? <TriangleAlert size={9} className="text-rose-deep" aria-hidden="true" /> : null}
          </span>
        </span>
        {showTime ? (
          // The clock range is the one thing a tile must always say; the duration and chunk counter
          // follow it and are allowed to be cut by the next chip rather than wrapping the tile taller.
          <span className="tnum mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] font-semibold text-ink-soft">
            {fmtClock(block.startMin)}–{fmtClock(block.endMin)}
            <span className="text-ink-faint">
              {' · '}
              {fmtDuration(block.minutes)}
              {block.chunkCount > 1 ? ` · ${block.chunkIndex + 1}/${block.chunkCount}` : ''}
            </span>
          </span>
        ) : null}
        {reasons.length > 0 && !isSpecial ? (
          <span className="mt-1 flex flex-wrap gap-1 overflow-hidden">
            {reasons.map((reason) => (
              <span key={reason.code} className="truncate rounded-[var(--radius-cut-xs)] planner-status-chip">
                {reason.label}
              </span>
            ))}
            {hiddenReasons > 0 ? (
              <span className="px-1 py-[1px] text-[9.5px] font-bold text-ink-faint">+{hiddenReasons}</span>
            ) : null}
          </span>
        ) : null}
      </span>

      {/* resize grip: paper does not stretch, it gets another cut */}
      {!isSpecial ? (
        <span
          role="separator"
          aria-label={`Resize ${block.title}`}
          onPointerDown={onResizePointerDown}
          className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(55,112,191,.35) 0 3px, transparent 3px 6px)',
          }}
        />
      ) : null}
      <span id={`block-description-${block.id}`} className="sr-only">
        {`${fmtDuration(block.minutes)}${block.chunkCount > 1 ? `, session ${block.chunkIndex + 1} of ${block.chunkCount}` : ''}. ${block.reasonText}. Arrows inspect; Control or Command with arrows moves; Alt with up or down resizes.`}{' '}
      </span>
    </button>
  )
}

/** Busy events are the printed layer everything else must sit around: flat, matte, immovable. */
export function BusyBlock({
  block,
  style,
}: {
  block: { title: string; startMin: number; endMin: number }
  style: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className="planner-meeting absolute overflow-hidden rounded-[var(--radius-cut-xs)] border border-dashed border-ink bg-paper-cream px-1.5 py-1"
      tabIndex={0}
      role="note"
      aria-label={`Meeting: ${block.title}, ${fmtClock(block.startMin)}–${fmtClock(block.endMin)}`}
      title={`${block.title} · ${fmtClock(block.startMin)}–${fmtClock(block.endMin)}`}
    >
      {Number(style.height) >= 24 && (
        <div className="flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-ink">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-frost-deep/60" aria-hidden="true" />
          <span className="min-w-0 truncate">{block.title}</span>
        </div>
      )}
      {Number(style.height) >= 44 && (
        <p className="tnum text-[10px] font-semibold text-ink">
          {fmtClock(block.startMin)}–{fmtClock(block.endMin)}
        </p>
      )}
    </div>
  )
}
