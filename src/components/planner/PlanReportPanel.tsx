'use client'

import { clsx } from 'clsx'
import { AlertTriangle, Check, Info, ShieldAlert, Wand2, X, Gauge } from 'lucide-react'
import type { PlanReport, TradeoffOption } from '@/lib/types'
import { WEEKDAY_SHORT } from '@/lib/types'
import { fmtDuration } from '@/lib/scheduler/slots'
import { usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperChip } from '@/components/paper/PaperControls'
import { PaperSheet, PaperWell } from '@/components/paper/PaperSheet'
import { PaperSkeleton } from '@/components/planner/AgentChat'

/**
 * The plan report (FR-3.8, PRD G1).
 *
 * The most important panel in the product. It states — in numbers, before the user asks — whether the
 * week actually fits, what does not, and what could be traded. A planner that only shows a pretty grid
 * is lying by omission.
 */

const VERDICT_STYLE: Record<PlanReport['fits'], { tone: string; icon: React.ReactNode; label: string }> = {
  fits: { tone: 'bg-olive-light text-olive-deep', icon: <Check size={13} aria-hidden="true" />, label: 'Fits' },
  tight: { tone: 'bg-terracotta-light text-terracotta-deep', icon: <Gauge size={13} aria-hidden="true" />, label: 'Tight' },
  overbooked: { tone: 'bg-rose-light text-rose-deep', icon: <ShieldAlert size={13} aria-hidden="true" />, label: 'Overbooked' },
}

export function PlanReportPanel() {
  const { proposal, status, error, selectBlock, applyTradeoff, notes } = usePlanner()

  if (!proposal) {
    return (
      <PaperSheet className="p-4">
        <h3 className="mb-2 text-[15px]">Plan report</h3>
        {status === 'planning' ? (
          <div className="space-y-2">
            <PaperSkeleton lines={4} />
            <p className="text-[11px] text-ink-faint">Working out what fits…</p>
          </div>
        ) : error ? (
          <div className="paper-well p-3">
            <p className="text-[12px] font-bold text-rose-deep">{error.code}</p>
            <p className="mt-1 text-[12px] text-ink-soft">{error.message}</p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Nothing planned yet. Press <strong>Build my week</strong> and this panel will tell you exactly what fits — and what
            does not.
          </p>
        )}
      </PaperSheet>
    )
  }

  const { report } = proposal
  const verdict = VERDICT_STYLE[report.fits]
  const maxDay = Math.max(60, ...report.perDay.map((day) => Math.max(day.plannedMinutes, day.capacityMinutes)))

  return (
    <div className="flex flex-col gap-3">
      <PaperSheet className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px]">Plan report</h3>
          <span className={clsx('paper-fibre inline-flex items-center gap-1 rounded-[var(--radius-cut-xs)] px-2 py-1 text-[11px] font-bold', verdict.tone)}>
            {verdict.icon}
            {verdict.label}
          </span>
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{report.headline}</p>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Usable time" value={fmtDuration(report.capacityMinutes)} />
          <Metric label="Work asked for" value={fmtDuration(report.demandMinutes)} />
          <Metric label="Scheduled" value={fmtDuration(report.scheduledMinutes)} />
        </dl>

        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-ink-faint">
            <span>Utilisation of usable time</span>
            <span className="tnum">{Math.round(report.utilisation * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper-kraft" role="img" aria-label={`${Math.round(report.utilisation * 100)} percent of usable time is booked`}>
            <div
              className={clsx('h-full rounded-full', report.utilisation > 1 ? 'bg-rose' : report.utilisation > 0.9 ? 'bg-terracotta' : 'bg-teal')}
              style={{ width: `${Math.min(100, report.utilisation * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">
            {report.meetingMinutes > 0
              ? `${fmtDuration(report.meetingMinutes)} of the week is already meetings, so it is not available for tasks.`
              : 'No meetings imported — this is your raw working time.'}
          </p>
        </div>
      </PaperSheet>

      {/* day by day */}
      <PaperSheet className="p-4">
        <h3 className="mb-2 text-[15px]">Load by day</h3>
        <ul className="space-y-2">
          {report.perDay.map((day) => {
            const ratio = day.capacityMinutes > 0 ? day.plannedMinutes / day.capacityMinutes : 0
            return (
              <li key={day.date} className="space-y-1">
                <div className="flex items-baseline justify-between text-[11.5px]">
                  <span className="font-bold text-ink-soft">{WEEKDAY_SHORT[day.weekday]}</span>
                  <span className="tnum text-ink-faint">
                    {day.capacityMinutes === 0 ? (
                      'off'
                    ) : (
                      <>
                        {fmtDuration(day.plannedMinutes)} / {fmtDuration(day.capacityMinutes)}
                        {day.deepMinutes > 0 ? ` · ${fmtDuration(day.deepMinutes)} deep` : ''}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-paper-kraft/70">
                  <span
                    className="h-full bg-olive"
                    style={{ width: `${(day.meetingMinutes / maxDay) * 100}%` }}
                    title={`${fmtDuration(day.meetingMinutes)} of meetings`}
                  />
                  <span
                    className={clsx('h-full', ratio > 1 ? 'bg-rose' : ratio > 0.85 ? 'bg-terracotta' : 'bg-teal')}
                    style={{ width: `${(day.plannedMinutes / maxDay) * 100}%` }}
                    title={`${fmtDuration(day.plannedMinutes)} of planned work`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </PaperSheet>

      {/* what does not fit */}
      {report.unscheduled.length > 0 ? (
        <PaperSheet className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[15px]">
            <AlertTriangle size={14} className="text-terracotta-deep" aria-hidden="true" />
            Does not fit
          </h3>
          <ul className="space-y-2">
            {report.unscheduled.map((item) => (
              <li key={item.taskId} className="paper-well p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-ink">{item.title}</p>
                  <span className="tnum shrink-0 text-[11px] font-bold text-rose-deep">{fmtDuration(item.minutes)}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{item.why}</p>
              </li>
            ))}
          </ul>
        </PaperSheet>
      ) : null}

      {/* deadline risks */}
      {report.deadlineRisks.length > 0 ? (
        <PaperSheet className="p-4">
          <h3 className="mb-2 text-[15px]">Deadline risk</h3>
          <ul className="space-y-1.5">
            {report.deadlineRisks.map((risk) => (
              <li key={risk.taskId} className="flex items-start gap-2">
                <PaperChip tone={risk.severity === 'critical' ? 'rose' : 'terracotta'}>{risk.severity}</PaperChip>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{risk.title}</p>
                  <p className="tnum text-[11px] text-ink-faint">
                    due {risk.deadline.slice(5, 16).replace('T', ' ')} · {fmtDuration(risk.scheduledMinutes)} of{' '}
                    {fmtDuration(risk.requiredMinutes)} placed
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </PaperSheet>
      ) : null}

      {/* trade-offs */}
      {report.tradeoffs.length > 0 ? (
        <TradeoffPanel options={report.tradeoffs} onApply={applyTradeoff} />
      ) : null}

      {/* structural warnings */}
      {report.warnings.length > 0 ? (
        <PaperSheet className="p-4">
          <h3 className="mb-2 text-[15px]">What the plan is doing to you</h3>
          <ul className="space-y-1.5">
            {report.warnings.map((warning) => (
              <li key={`${warning.code}_${warning.weekday ?? 'all'}_${warning.message.slice(0, 12)}`} className="flex items-start gap-2">
                <span
                  className={clsx(
                    'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
                    warning.severity === 'critical' ? 'bg-rose' : warning.severity === 'warn' ? 'bg-terracotta' : 'bg-ink-ghost',
                  )}
                  aria-hidden="true"
                />
                <p className="text-[11.5px] leading-relaxed text-ink-soft">{warning.message}</p>
              </li>
            ))}
          </ul>
        </PaperSheet>
      ) : null}

      <SelectedBlockCard onSelect={selectBlock} />

      {notes.length > 0 ? (
        <PaperSheet tone="sand" className="p-3.5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px]">
            <Info size={12} aria-hidden="true" />
            How this plan was made
          </h3>
          <ul className="space-y-1">
            {notes.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-ink-soft">
                {note}
              </li>
            ))}
          </ul>
        </PaperSheet>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-well px-2 py-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className="tnum mt-0.5 text-[13px] font-bold text-ink">{value}</dd>
    </div>
  )
}

function TradeoffPanel({ options, onApply }: { options: TradeoffOption[]; onApply(kind: string, taskId: string): void }) {
  return (
    <PaperSheet className="p-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[15px]">
        <Wand2 size={14} className="text-teal-deep" aria-hidden="true" />
        Ways to make it fit
      </h3>
      <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-soft">
        Ranked by how little they cost you. Apply one and the engine rebuilds the week around it — nothing happens silently.
      </p>
      <ul className="space-y-2">
        {options.map((option) => (
          <li key={option.id} className="paper-well p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-ink">{option.label}</p>
              <span className="tnum shrink-0 text-[11px] font-bold text-olive-deep">+{fmtDuration(option.minutesRecovered)}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{option.consequence}</p>
            <div className="mt-2">
              <PaperButton size="sm" variant="press" tone="teal" onClick={() => onApply(option.kind, option.taskId)}>
                Apply
              </PaperButton>
            </div>
          </li>
        ))}
      </ul>
    </PaperSheet>
  )
}

function SelectedBlockCard({ onSelect }: { onSelect(id: string | null): void }) {
  const { proposal, selectedBlockId, pins, unpinTask } = usePlanner()
  const block = proposal?.blocks.find((item) => item.id === selectedBlockId)
  if (!block) return null
  const isPinned = block.pinned || pins.some((pin) => pin.taskId === block.taskId)

  return (
    <PaperSheet className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px]">{block.title}</h3>
          <p className="tnum text-[11.5px] font-semibold text-ink-soft">
            {block.weekday} {String(Math.floor(block.startMin / 60)).padStart(2, '0')}:
            {String(block.startMin % 60).padStart(2, '0')} – {String(Math.floor(block.endMin / 60)).padStart(2, '0')}:
            {String(block.endMin % 60).padStart(2, '0')} · {fmtDuration(block.minutes)}
            {block.chunkCount > 1 ? ` · session ${block.chunkIndex + 1} of ${block.chunkCount}` : ''}
          </p>
        </div>
        <button type="button" aria-label="Close block details" className="text-ink-faint hover:text-ink" onClick={() => onSelect(null)}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <PaperChip tone={block.priority === 'P0' ? 'rose' : 'terracotta'}>{block.priority}</PaperChip>
        <PaperChip tone="teal">{block.energy}</PaperChip>
        <PaperChip tone="kraft">{block.category}</PaperChip>
        <PaperChip tone="frost">score {block.score.toFixed(2)}</PaperChip>
        {block.conflict ? <PaperChip tone="rose">{block.conflict.replace('-', ' ')}</PaperChip> : null}
        {isPinned ? <PaperChip tone="plum">pinned by you</PaperChip> : null}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-ink">{block.reasonText}</p>

      <ul className="mt-2 space-y-1">
        {block.reasons.map((reason) => (
          <li key={reason.code} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-teal/70" aria-hidden="true" />
            {reason.label}
            {reason.detail ? <span className="text-ink-faint">— {reason.detail}</span> : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <PaperWell className="hidden" />
        {isPinned ? (
          <PaperButton size="sm" variant="flat" onClick={() => void unpinTask(block.taskId)}>
            Unpin and re-plan
          </PaperButton>
        ) : (
          <span className="text-[11px] text-ink-faint">Drag the block, or focus it and use the arrow keys, to pin it somewhere yourself.</span>
        )}
      </div>
    </PaperSheet>
  )
}
