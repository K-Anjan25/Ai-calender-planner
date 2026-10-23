'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { CalendarRange, Filter, Layers3, ListChecks, Settings2, Sparkles, RefreshCw, LogIn } from 'lucide-react'
import { usePlanner } from '@/lib/store/planner-store'
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

/**
 * The planner workspace (FR-J1).
 *
 * Three application columns: inputs on the left, the week in the middle, and the report on
 * the right. Below 1280px the rails become tabs to keep controls readable.
 */

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
    mode,
    setMode,
    capability,
    filters,
    setFilters,
    demoSet,
  } = usePlanner()

  const { status: sessionStatus, user: sessionUser } = useSession()

  useEffect(() => {
    hydrate()
    void refreshCapability()
  }, [hydrate, refreshCapability])

  const blocks = proposal?.blocks ?? []
  const filtersActive = filters.energy.length > 0 || filters.categories.length > 0 || filters.pinnedOnly

  const show = (tab: typeof railTab) => clsx('min-w-0', railTab === tab ? 'block' : 'hidden xl:block')

  const statusLine = useMemo(() => {
    if (status === 'planning') return 'Building your week…'
    if (!proposal) return 'Nothing planned yet — press Build my week.'
    return proposal.report.headline
  }, [proposal, status])

  return (
    <main className="relative min-h-screen pb-10">
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
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
          <PaperButton size="sm" variant="press" active={mode === 'auto'} onClick={() => setMode('auto')}>
            <Sparkles size={12} aria-hidden="true" />
            Agent
          </PaperButton>
          <PaperButton size="sm" variant="press" active={mode === 'local'} onClick={() => setMode('local')}>
            <Layers3 size={12} aria-hidden="true" />
            Local
          </PaperButton>
          <PaperButton size="sm" tone="teal" disabled={status === 'planning'} onClick={() => void buildWeek()}>
            <RefreshCw size={12} className={clsx(status === 'planning' && 'animate-spin')} aria-hidden="true" />
            {proposal ? 'Re-plan' : 'Build my week'}
          </PaperButton>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-4 px-4 sm:px-6 xl:grid-cols-[330px_minmax(0,1fr)_360px]">
        {/* ── left rail ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-3">
          <PaperSheet tone="sand" className="p-2.5">
            <PaperTabs
              value={railTab}
              onChange={setRailTab}
              tabs={[
                { id: 'tasks', label: 'Tasks', icon: <ListChecks size={12} aria-hidden="true" />, badge: tasks.length },
                { id: 'prefs', label: 'Rules', icon: <Settings2 size={12} aria-hidden="true" /> },
                { id: 'calendar', label: 'Calendar', icon: <CalendarRange size={12} aria-hidden="true" /> },
              ]}
            />
          </PaperSheet>

          {/* Below 1280px these are tabs; at 1280px and up all three stack, because comparing
              your tasks against your rules against your calendar is the whole job. */}
          <div className={show('tasks')}>
            <TaskInbox />
          </div>
          <div className={show('prefs')}>
            <PreferencePanel />
          </div>
          <div className={show('calendar')}>
            <CalendarPanel />
          </div>
        </div>

        {/* ── centre: the week ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-3">
          <PaperSheet tone="sand" className="flex flex-wrap items-center justify-between gap-2 p-2.5">
            <p className="px-1 text-[12px] font-semibold text-ink-soft" aria-live="polite">
              {statusLine}
            </p>
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
                <PaperButton size="sm" variant="flat" onClick={() => setFilters({ energy: [], categories: [], pinnedOnly: false })}>
                  clear
                </PaperButton>
              ) : null}
            </div>
          </PaperSheet>

          <WeekGrid
            blocks={blocks}
            busy={busy}
            preferences={preferences}
            weekLabel={proposal?.weekLabel ?? 'this week'}
            weekStart={proposal?.weekStart}
          />

          {demoSet === 'overloaded' ? (
            <PaperSheet tone="sand" className="p-3">
              <p className="text-[11.5px] leading-relaxed text-ink-soft">
                You are looking at the <strong>overbooked</strong> demo set — it deliberately asks for more than a week can hold,
                so you can see the report tell the truth and offer ranked trade-offs.
              </p>
            </PaperSheet>
          ) : null}

          <AgentChat />
        </div>

        {/* ── right rail ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-3">
          <PlanReportPanel />
          <InsightsRail />
        </div>
      </div>

      <footer className="mx-auto mt-8 max-w-[1440px] px-4 text-[11px] leading-relaxed text-ink-faint sm:px-6">
        The deterministic engine owns every timestamp. The agent chooses strategy, reads language, and explains itself — it never
        invents a time. Nothing reaches your calendar until you approve it.
      </footer>
    </main>
  )
}

