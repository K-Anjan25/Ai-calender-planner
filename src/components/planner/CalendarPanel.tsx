'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { CalendarCheck, CalendarX, CloudDownload, Link2, RotateCcw, ShieldCheck, Eye } from 'lucide-react'
import { fmtDuration } from '@/lib/scheduler/slots'
import { usePlanner } from '@/lib/store/planner-store'
import { calendarAuthUrl } from '@/lib/api'
import { PaperButton, PaperChip } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'

/**
 * Google Calendar (FR-5.x, RULES.md §8).
 *
 * Three separates things the user is allowed to understand: connect (read your reality), dry run
 * (see exactly what would be written), approve (write it). Nothing is ever written by implication,
 * and re-syncing updates instead of duplicating.
 */

export function CalendarPanel() {
  const { capability, proposal, syncState, dryRun, approveAndSync, rollback, refreshCapability } = usePlanner()
  const [selected, setSelected] = useState<string[] | null>(null)
  const [showPreflight, setShowPreflight] = useState(false)

  const taskBlocks = proposal?.blocks.filter((block) => block.kind === 'task') ?? []
  const configured = capability?.calendar.configured ?? false
  const connected = capability?.calendar.connected ?? false
  const approval = selected ?? taskBlocks.map((block) => block.id)
  const approvedMinutes = taskBlocks.filter((block) => approval.includes(block.id)).reduce((sum, block) => sum + block.minutes, 0)

  const toggle = (id: string) => {
    setSelected(approval.includes(id) ? approval.filter((value) => value !== id) : [...approval, id])
  }

  return (
    <div className="flex flex-col gap-3">
      <PaperSheet className="p-3.5">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[15px]">
          {connected ? <CalendarCheck size={14} className="text-olive-deep" aria-hidden="true" /> : <CalendarX size={14} className="text-ink-faint" aria-hidden="true" />}
          Google Calendar
        </h3>

        {!configured ? (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Not configured on this deployment. Planning works completely without it — you just do not get your existing
              meetings imported, and nothing gets written out.
            </p>
            <div className="paper-well p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">To enable it</p>
              <ol className="mt-1 space-y-1 text-[11px] leading-relaxed text-ink-soft">
                <li>1. Create an OAuth client in Google Cloud Console.</li>
                <li>2. Set <code className="rounded bg-paper-kraft px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-paper-kraft px-1">GOOGLE_CLIENT_SECRET</code>.</li>
                <li>3. Add this app&apos;s <code className="rounded bg-paper-kraft px-1">/api/calendar/callback</code> as a redirect URI.</li>
              </ol>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {capability?.calendar.missing.length ? `Missing: ${capability.calendar.missing.join(', ')}` : ''}
              </p>
            </div>
          </div>
        ) : !connected ? (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Connect to import your real meetings as fixed context and to push approved blocks back. Paperweek reads free/busy
              only — it never reads event details it does not need.
            </p>
            {/* A real anchor: OAuth consent must be a full navigation, not a client route. */}
            <a href={calendarAuthUrl()} className="paper-fibre inline-flex items-center gap-2 rounded-[var(--radius-cut-sm)] border border-[color:rgba(120,98,70,0.2)] bg-frost px-3.5 py-1.5 text-sm font-semibold text-paper-ivory shadow-[var(--shadow-tile)] transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-lift)]">
              <Link2 size={13} aria-hidden="true" />
              Connect Google Calendar
            </a>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <PaperChip tone="kraft" icon={<ShieldCheck size={9} aria-hidden="true" />}>
                calendar.events
              </PaperChip>
              <PaperChip tone="kraft" icon={<ShieldCheck size={9} aria-hidden="true" />}>
                calendar.readonly
              </PaperChip>
            </div>
            <p className="text-[11px] text-ink-faint">Tokens stay on the server, never in your browser storage.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <PaperChip tone="olive">Connected</PaperChip>
              <PaperButton size="sm" variant="flat" onClick={() => void refreshCapability()}>
                Refresh
              </PaperButton>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Existing meetings are already accounted for in the plan. Choose what to write back:
            </p>
          </div>
        )}
      </PaperSheet>

      {proposal ? (
        <PaperSheet className="p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[15px]">Approve before writing</h3>
            <PaperChip tone="kraft">{approval.length} of {taskBlocks.length}</PaperChip>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <PaperButton size="sm" variant="flat" onClick={() => setSelected(taskBlocks.map((block) => block.id))}>
              Select all
            </PaperButton>
            <PaperButton size="sm" variant="flat" onClick={() => setSelected([])}>
              Select none
            </PaperButton>
            <PaperButton size="sm" variant="flat" onClick={() => setSelected(taskBlocks.filter((b) => b.priority === 'P0' || b.priority === 'P1').map((block) => block.id))}>
              Only P0/P1
            </PaperButton>
          </div>

          <ul className="paper-well max-h-[220px] space-y-1 overflow-y-auto p-2">
            {taskBlocks.map((block) => {
              const checked = approval.includes(block.id)
              return (
                <li key={block.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-cut-xs)] px-1.5 py-1 hover:bg-paper-ivory/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(block.id)}
                      className="h-3.5 w-3.5 accent-teal-deep"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{block.title}</span>
                    <span className="tnum shrink-0 text-[11px] text-ink-faint">
                      {block.weekday} {String(Math.floor(block.startMin / 60)).padStart(2, '0')}:
                      {String(block.startMin % 60).padStart(2, '0')}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <PaperButton
              size="sm"
              variant="flat"
              disabled={!connected}
              onClick={() => {
                setShowPreflight(true)
                void dryRun()
              }}
            >
              <Eye size={13} aria-hidden="true" />
              Dry run
            </PaperButton>
            <PaperButton
              size="sm"
              tone="teal"
              disabled={!connected || approval.length === 0 || syncState.status === 'syncing'}
              onClick={() => void approveAndSync(approval)}
            >
              <CloudDownload size={13} aria-hidden="true" />
              Approve &amp; write {approval.length} block{approval.length === 1 ? '' : 's'}
            </PaperButton>
            <PaperButton size="sm" variant="flat" disabled={!connected} onClick={() => void rollback()}>
              <RotateCcw size={13} aria-hidden="true" />
              Undo this plan
            </PaperButton>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            About to write <strong className="tnum">{fmtDuration(approvedMinutes)}</strong> of work. Every event is tagged so a
            re-sync updates it instead of creating a duplicate, and so “undo this plan” removes exactly what this plan added.
          </p>

          {showPreflight && syncState.status !== 'idle' ? (
            <div
              className={clsx(
                'paper-well mt-2.5 p-2.5',
                syncState.status === 'error' ? 'border-rose/40' : syncState.status === 'done' ? 'border-olive/40' : '',
              )}
              role="status"
            >
              <p className="text-[11.5px] font-semibold text-ink-soft">{syncState.message}</p>
              {syncState.status === 'syncing' ? <p className="mt-1 text-[11px] text-ink-faint">Talking to Google…</p> : null}
            </div>
          ) : null}
        </PaperSheet>
      ) : null}
    </div>
  )
}
