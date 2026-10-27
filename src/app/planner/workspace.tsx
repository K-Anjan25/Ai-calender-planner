'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { CalendarRange, Filter, Layers3, ListChecks, Settings2, Sparkles, RefreshCw, LogIn } from 'lucide-react'
import { hasDraftChanges, plannerLocked, usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperChip, PaperTabs } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'
import { WeekGrid } from '@/components/planner/WeekGrid'
import { TaskInbox } from '@/components/planner/TaskInbox'
import { PreferencePanel } from '@/components/planner/PreferencePanel'
import { AgentChat } from '@/components/planner/AgentChat'
import { PlanReportPanel } from '@/components/planner/PlanReportPanel'
import { CalendarPanel } from '@/components/planner/CalendarPanel'
import { InsightsRail } from '@/components/planner/InsightsRail'
import { CalendraLogo } from '@/components/paper/CalendraMark'
import { useSession } from '@/lib/use-session'

/** Focused editing views; publishing is an explicit Calendar sub-flow. */
export default function PlannerWorkspace() {
  const {
    hydrate,
    refreshCapability,
    railTab,
    setRailTab,
    proposal,
    tasks,
    busy,
    preferences,
    buildWeek,
    status,
    error,
    mode,
    setMode,
    capability,
    filters,
    setFilters,
    selectedBlockId,
    syncState,
    chatBusy,
    cancelPlanning,
    actionMessage,
  } = usePlanner()
  const { status: sessionStatus, user: sessionUser } = useSession()
  const [publishing, setPublishing] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  useEffect(() => {
    hydrate()
    void refreshCapability()
  }, [hydrate, refreshCapability])
  useEffect(() => {
    const timer = setTimeout(() => {
      const panel = document.getElementById(`planner-panel-${railTab}`)
      if (!panel?.contains(document.activeElement)) panel?.focus({ preventScroll: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [railTab])
  useEffect(() => {
    if (selectedBlockId) setDiagnosticsOpen(true)
  }, [selectedBlockId])
  const activate = (tab: typeof railTab) => {
    setPublishing(false)
    setRailTab(tab)
    setTimeout(() => document.getElementById(`planner-panel-${tab}`)?.focus({ preventScroll: true }), 0)
  }
  const locked = plannerLocked({ status, chatBusy, syncState })
  const stale = usePlanner(hasDraftChanges)
  const blocks = proposal?.blocks ?? []
  const filtersActive = filters.energy.length > 0 || filters.categories.length > 0 || filters.pinnedOnly
  const statusLine = useMemo(
    () =>
      status === 'planning'
        ? 'Building your week…'
        : (proposal?.report.headline ?? 'Nothing planned yet — press Build my week.'),
    [proposal, status],
  )
  const hasConflicts = Boolean(proposal && (proposal.report.unscheduled.length || proposal.report.deadlineRisks.length))
  const openDiagnostics = () => {
    activate('calendar')
    setDiagnosticsOpen(true)
    setTimeout(() => document.getElementById('planner-diagnostics')?.focus(), 0)
  }
  return (
    <main className="bauhaus-workspace relative min-h-screen pb-10">
      <a className="bauhaus-skip" href="#planner-content">Skip to planner</a>
      <header className="bauhaus-workspace-header mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="Calendra home">
            <CalendraLogo size={26} className="text-teal-deep" />
          </Link>
          {proposal ? (
            <PaperChip tone="kraft" icon={<CalendarRange size={10} aria-hidden="true" />}>
              {proposal.weekLabel}
            </PaperChip>
          ) : null}
          {capability?.demoMode ? <PaperChip tone="frost">demo engine</PaperChip> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Account state, so an authenticated deployment never hides who is signed in — or that
              nobody is. Skeleton while it resolves, at a fixed height: no layout shift. */}
          {sessionStatus === 'loading' ? (
            <span className="paper-well h-[30px] w-[96px]" aria-hidden="true" />
          ) : sessionUser ? (
            <span className="flex max-w-[180px] items-center gap-1.5 rounded-[var(--radius-cut-xs)] bg-paper-ivory/80 px-2 py-1">
              <span className="min-w-0 truncate text-[12px] font-semibold text-ink" title={sessionUser.email}>
                {sessionUser.name}
              </span>
              {sessionUser.provider === 'demo' ? <PaperChip tone="kraft">demo</PaperChip> : null}
            </span>
          ) : (
            <Link
              href="/signin?next=%2Fplanner"
              className="flex items-center gap-1 rounded-[var(--radius-cut-xs)] px-2 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-paper-ivory/70 hover:text-ink"
            >
              <LogIn size={13} aria-hidden="true" />
              Sign in
            </Link>
          )}
          <PaperButton
            size="sm"
            variant="press"
            disabled={locked}
            active={mode === 'auto'}
            onClick={() => setMode('auto')}
          >
            <Sparkles size={12} aria-hidden="true" />
            Agent
          </PaperButton>
          <PaperButton
            size="sm"
            variant="press"
            disabled={locked}
            active={mode === 'local'}
            onClick={() => setMode('local')}
          >
            <Layers3 size={12} aria-hidden="true" />
            Local
          </PaperButton>
        </div>
      </header>
      <div id="planner-content" tabIndex={-1} className="mx-auto max-w-[1440px] space-y-4 px-4 sm:px-6">
        <section className="bauhaus-planner-intro"><div><p className="bauhaus-eyebrow"><span />THE WEEKLY WORKSPACE</p><h1>Give your week <span>shape.</span></h1></div><div className="bauhaus-planner-shapes" aria-hidden="true"><i /><i /><i /></div></section>
        <div
          role="toolbar"
          aria-label="Plan actions"
          className="paper-sheet flex flex-wrap items-center justify-between gap-3 p-3"
        >
          <p className="text-sm text-ink">Planning changes this draft. Publishing requires a separate review.</p>
          <div className="flex flex-wrap gap-2">
            <PaperButton
              tone="terracotta"
              disabled={locked || tasks.length === 0}
              onClick={async () => {
                await buildWeek()
                if (usePlanner.getState().status === 'ready') activate('calendar')
              }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {status === 'planning' ? 'Planning…' : proposal ? 'Re-plan' : 'Build my week'}
            </PaperButton>
            {(status === 'planning' || chatBusy) && <PaperButton onClick={cancelPlanning}>Cancel planning</PaperButton>}
            <PaperButton
              disabled={!proposal || locked || stale}
              onClick={() => {
                setRailTab('calendar')
                setPublishing(true)
                setTimeout(() => document.getElementById('planner-publishing')?.focus(), 0)
              }}
            >
              Review &amp; publish
            </PaperButton>
          </div>
        </div>
        {tasks.length === 0 && !locked && (
          <section className="paper-sheet p-4 text-sm text-ink" aria-label="Empty task backlog">
            <p>No tasks to schedule yet. Add a task or paste a brief to start planning.</p>
            <PaperButton onClick={() => activate('tasks')}>Add tasks</PaperButton>
          </section>
        )}
        {stale && (
          <section
            role="status"
            aria-label="Unsaved schedule changes"
            className="paper-sheet bg-frost p-4 text-sm text-ink"
          >
            Tasks or rules have changed. The calendar shows the previous schedule. Re-plan before moving blocks,
            exporting or publishing.
          </section>
        )}
        {actionMessage && (
          <p role="status" className="paper-well p-3 text-sm text-ink">
            {actionMessage}
          </p>
        )}
        {!publishing && syncState.status !== 'idle' && (
          <p role={syncState.status === 'error' ? 'alert' : 'status'} className="paper-well p-3 text-sm text-ink">
            {syncState.message}
          </p>
        )}
        <section
          role={hasConflicts || error ? 'alert' : 'status'}
          aria-label="Planning status"
          className={clsx('paper-sheet p-4 text-ink', hasConflicts || error ? 'bg-terracotta' : 'bg-paper-cream')}
        >
          <p className="font-semibold">{error?.message ?? statusLine}</p>
          {proposal && hasConflicts && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm">
                {proposal.report.unscheduled.length} unplaced tasks · {proposal.report.deadlineRisks.length} deadline
                risks
              </p>
              <PaperButton onClick={openDiagnostics}>Review conflicts</PaperButton>
            </div>
          )}
        </section>
        <PaperTabs
          value={railTab}
          onChange={activate}
          tabs={[
            { id: 'tasks', label: 'Tasks', icon: <ListChecks size={12} aria-hidden="true" />, badge: tasks.length },
            { id: 'prefs', label: 'Rules', icon: <Settings2 size={12} aria-hidden="true" /> },
            { id: 'calendar', label: 'Calendar', icon: <CalendarRange size={12} aria-hidden="true" /> },
          ]}
        />
        <section
          id="planner-panel-tasks"
          role="tabpanel"
          aria-labelledby="planner-tab-tasks"
          tabIndex={-1}
          hidden={railTab !== 'tasks'}
        >
          <h2 className="mb-3 text-xl">Task backlog</h2>
          <TaskInbox />
        </section>
        <section
          id="planner-panel-prefs"
          role="tabpanel"
          aria-labelledby="planner-tab-prefs"
          tabIndex={-1}
          hidden={railTab !== 'prefs'}
        >
          <h2 className="mb-3 text-xl">Working rules</h2>
          <div id="planner-rules" tabIndex={-1}>
            <PreferencePanel />
          </div>
        </section>
        <section
          id="planner-panel-calendar"
          role="tabpanel"
          aria-labelledby="planner-tab-calendar"
          tabIndex={-1}
          hidden={railTab !== 'calendar'}
        >
          {publishing ? (
            <div id="planner-publishing" tabIndex={-1} className="mx-auto max-w-4xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">Review &amp; publish</h2>
                <PaperButton onClick={() => activate('calendar')}>Back to week</PaperButton>
              </div>
              <p className="text-sm text-ink">
                Choose the blocks to publish. Dry run writes nothing; approval writes only the selected blocks. Undo
                removes this plan’s published events, not your other meetings.
              </p>
              <CalendarPanel />
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-3">
                <PaperSheet tone="sand" className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <p className="px-1 text-[12px] font-semibold text-ink-soft">Calendar filters</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-faint">
                      <Filter size={11} aria-hidden="true" />
                      Filter
                    </span>
                    {(['deep', 'light', 'admin', 'social', 'physical'] as const).map((energy) => (
                      <PaperButton
                        key={energy}
                        size="sm"
                        variant="press"
                        active={filters.energy.includes(energy)}
                        onClick={() =>
                          setFilters({
                            energy: filters.energy.includes(energy)
                              ? filters.energy.filter((value) => value !== energy)
                              : [...filters.energy, energy],
                          })
                        }
                      >
                        {energy}
                      </PaperButton>
                    ))}
                    <PaperButton
                      size="sm"
                      variant="press"
                      active={filters.pinnedOnly}
                      onClick={() => setFilters({ pinnedOnly: !filters.pinnedOnly })}
                    >
                      pinned
                    </PaperButton>
                    {filtersActive ? (
                      <PaperButton
                        size="sm"
                        variant="flat"
                        onClick={() =>
                          setFilters({
                            energy: [],
                            categories: [],
                            pinnedOnly: false,
                          })
                        }
                      >
                        clear
                      </PaperButton>
                    ) : null}
                  </div>
                </PaperSheet>
                <details className="paper-sheet p-3" id="planner-keyboard-help">
                  <summary className="cursor-pointer py-2 font-semibold">Keyboard help</summary>
                  <ul className="space-y-2 text-sm">
                    <li>Arrows: inspect neighbouring blocks.</li>
                    <li>Ctrl/Command + arrows: move by 15 minutes; add Shift to move one hour.</li>
                    <li>Alt + up/down: resize. Enter: open details. Escape: cancel a drag or clear selection.</li>
                    <li>Drag a task to preview a move. Every move is checked by the engine.</li>
                  </ul>
                </details>
                <WeekGrid
                  blocks={blocks}
                  busy={proposal?.busy ?? busy}
                  preferences={proposal?.preferences ?? preferences}
                  weekLabel={proposal?.weekLabel ?? 'this week'}
                  weekStart={proposal?.weekStart}
                />
                <details className="paper-sheet p-3">
                  <summary className="cursor-pointer py-2 font-semibold">Adjust the plan with words</summary>
                  <p className="my-2 text-sm text-ink">
                    Describe a change to your draft plan. Calendar publishing is always a separate approval.
                  </p>
                  <AgentChat />
                </details>
              </div>
              <aside className="min-w-0 space-y-3" aria-label="Calendar diagnostics">
                <details
                  id="planner-diagnostics"
                  tabIndex={-1}
                  className="paper-sheet p-3"
                  open={diagnosticsOpen}
                  onToggle={(event) => {
                    setDiagnosticsOpen(event.currentTarget.open)
                    if (!event.currentTarget.open) usePlanner.getState().selectBlock(null)
                  }}
                >
                  <summary className="cursor-pointer py-2 font-semibold">Plan report &amp; quick fixes</summary>
                  <PlanReportPanel />
                </details>
                <details className="paper-sheet p-3">
                  <summary className="cursor-pointer py-2 font-semibold">Week insights</summary>
                  <InsightsRail />
                </details>
              </aside>
            </div>
          )}
        </section>
      </div>
      <footer className="mx-auto mt-8 max-w-[1440px] px-4 text-sm text-ink sm:px-6">
        Nothing reaches Google Calendar until you review and approve it.
      </footer>
      <footer className="bauhaus-workspace-footer"><span>Calendra · Good weeks, by design.</span><nav aria-label="Planner footer"><Link href="/">Home</Link><Link href="/legal#privacy">Privacy</Link><Link href="/legal#terms">Terms</Link></nav></footer>
    </main>
  )
}
