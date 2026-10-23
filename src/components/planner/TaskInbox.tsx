'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Trash2, Wand2, Clock, Flag, Ban, ChevronDown, ChevronRight } from 'lucide-react'
import { SNAP_MINUTES, type Energy, type Task } from '@/lib/types'
import { ENERGY_LABEL } from '@/lib/types'
import { fmtDuration } from '@/lib/scheduler/slots'
import { recurrenceLabel } from '@/lib/scheduler/policies'
import { currentWeekStart } from '@/lib/sample-data'
import { estimateDurationMinutes } from '@/lib/agent/tools'
import { usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperChip, PaperInput, PaperLabel, PaperSelect, PaperTextarea } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'

/**
 * Intake (FR-1.x).
 *
 * Two doors into the same room: type a brief in your own words, or fill in a form. Free text is
 * parsed by the agent and only *committed* when you press Build — nothing is silently invented
 * behind your back (FR-1.2).
 */

const ENERGY_OPTIONS: Energy[] = ['deep', 'light', 'admin', 'social', 'physical']

export function TaskInbox() {
  const { tasks, addTask, removeTask, updateTask, buildWeek, status, demoSet, loadDemoSet, clearTasks, proposal } = usePlanner()
  const weekStart = proposal?.weekStart ?? currentWeekStart()
  const [brief, setBrief] = useState('')
  const [draft, setDraft] = useState({
    title: '',
    estimateMinutes: 60,
    priority: 'P2' as Task['priority'],
    energy: 'deep' as Energy,
    category: 'work' as Task['category'],
    deadlineDate: '',
    deadlineTime: '17:00',
    splittable: true,
    location: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const busy = status === 'planning'

  const submitTask = () => {
    const title = draft.title.trim()
    if (title.length < 2) return
    const estimate = draft.estimateMinutes || estimateDurationMinutes(title, draft.energy, draft.category)
    addTask({
      id: `t_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 28)}_${tasks.length}`,
      title,
      estimateMinutes: estimate,
      deadline: draft.deadlineDate ? `${draft.deadlineDate}T${draft.deadlineTime}:00` : undefined,
      priority: draft.priority,
      energy: draft.energy,
      category: draft.category,
      splittable: draft.splittable,
      minChunkMinutes: draft.energy === 'deep' ? 60 : 30,
      location: draft.location.trim() || undefined,
      source: 'user',
    })
    setDraft((current) => ({ ...current, title: '', deadlineDate: '', location: '' }))
  }

  return (
    <div className="flex flex-col gap-3">
      <PaperSheet className="p-3.5">
        <PaperLabel htmlFor="brief">Tell Calendra what your week holds</PaperLabel>
        <PaperTextarea
          id="brief"
          rows={4}
          value={brief}
          placeholder={'Finish the Q4 deck by Thursday 5pm (4h). Review PRs every weekday. Gym Mon/Wed/Fri, 45 min. Study module 4 before Sunday night.'}
          onChange={(event) => setBrief(event.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PaperButton tone="terracotta" onClick={() => void buildWeek(brief)} disabled={busy}>
            <Wand2 size={14} aria-hidden="true" />
            {busy ? 'Planning…' : 'Build my week'}
          </PaperButton>
          <PaperButton variant="flat" onClick={() => void buildWeek()} disabled={busy}>
            Re-plan with my tasks
          </PaperButton>
          <span className="ml-auto text-[11px] text-ink-faint">{tasks.length} tasks ready</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Durations you do not give are estimated and flagged. Everything the parser reads appears below before it reaches your calendar.
        </p>
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-[15px]">Tasks</h3>
          <div className="flex items-center gap-1">
            <PaperButton size="sm" variant="flat" onClick={() => setShowForm((value) => !value)}>
              <Plus size={13} aria-hidden="true" />
              Add
            </PaperButton>
          </div>
        </header>

        {showForm ? (
          <div className="paper-well mb-3 space-y-2 p-2.5">
            <div>
              <PaperLabel htmlFor="task-title">Task</PaperLabel>
              <PaperInput
                id="task-title"
                value={draft.title}
                placeholder="Finish the Q4 board deck"
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitTask()
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <PaperLabel htmlFor="task-minutes">Minutes</PaperLabel>
                <PaperInput
                  id="task-minutes"
                  type="number"
                  min={SNAP_MINUTES}
                  step={SNAP_MINUTES}
                  value={draft.estimateMinutes}
                  onChange={(event) => setDraft((current) => ({ ...current, estimateMinutes: Number(event.target.value) }))}
                />
              </div>
              <div>
                <PaperLabel htmlFor="task-priority">Priority</PaperLabel>
                <PaperSelect
                  id="task-priority"
                  value={draft.priority}
                  onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Task['priority'] }))}
                >
                  <option value="P0">P0 · must happen</option>
                  <option value="P1">P1 · important</option>
                  <option value="P2">P2 · should happen</option>
                  <option value="P3">P3 · nice to have</option>
                </PaperSelect>
              </div>
              <div>
                <PaperLabel htmlFor="task-energy">Energy it needs</PaperLabel>
                <PaperSelect
                  id="task-energy"
                  value={draft.energy}
                  onChange={(event) => setDraft((current) => ({ ...current, energy: event.target.value as Energy }))}
                >
                  {ENERGY_OPTIONS.map((energy) => (
                    <option key={energy} value={energy}>
                      {ENERGY_LABEL[energy]}
                    </option>
                  ))}
                </PaperSelect>
              </div>
              <div>
                <PaperLabel htmlFor="task-category">Category</PaperLabel>
                <PaperSelect
                  id="task-category"
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as Task['category'] }))}
                >
                  {['work', 'study', 'health', 'life', 'admin', 'creative'].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </PaperSelect>
              </div>
              <div>
                <PaperLabel htmlFor="task-deadline">Deadline</PaperLabel>
                <PaperInput
                  id="task-deadline"
                  type="date"
                  value={draft.deadlineDate}
                  onChange={(event) => setDraft((current) => ({ ...current, deadlineDate: event.target.value }))}
                />
              </div>
              <div>
                <PaperLabel htmlFor="task-time">By</PaperLabel>
                <PaperInput
                  id="task-time"
                  type="time"
                  value={draft.deadlineTime}
                  disabled={!draft.deadlineDate}
                  onChange={(event) => setDraft((current) => ({ ...current, deadlineTime: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                <input
                  type="checkbox"
                  checked={draft.splittable}
                  onChange={(event) => setDraft((current) => ({ ...current, splittable: event.target.checked }))}
                  className="h-3.5 w-3.5 accent-teal-deep"
                />
                Can be split into sessions
              </label>
              <PaperButton size="sm" tone="teal" onClick={submitTask}>
                Add task
              </PaperButton>
            </div>
          </div>
        ) : null}

        {tasks.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-soft">Nothing to plan yet.</p>
            <div className="mt-2 flex justify-center gap-2">
              <PaperButton size="sm" variant="flat" onClick={() => loadDemoSet('realistic')}>
                Load a realistic week
              </PaperButton>
              <PaperButton size="sm" variant="flat" onClick={() => loadDemoSet('overloaded')}>
                Load an overbooked week
              </PaperButton>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((task) => {
              const expanded = expandedId === task.id
              return (
                <li key={task.id} className="paper-tile">
                  <div className="flex items-start gap-2 p-2">
                    <button
                      type="button"
                      className="mt-[3px] text-ink-faint hover:text-ink"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${task.title}`}
                      onClick={() => setExpandedId(expanded ? null : task.id)}
                    >
                      {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <PaperChip tone="kraft" icon={<Clock size={9} aria-hidden="true" />}>
                          {fmtDuration(task.estimateMinutes)}
                          {(() => {
                            const cadence = recurrenceLabel(task, weekStart)
                            return cadence ? ` ↻ ${cadence}` : ''
                          })()}
                        </PaperChip>
                        <PaperChip tone={task.priority === 'P0' ? 'rose' : task.priority === 'P1' ? 'terracotta' : 'olive'} icon={<Flag size={9} aria-hidden="true" />}>
                          {task.priority}
                        </PaperChip>
                        <PaperChip tone="teal">{ENERGY_LABEL[task.energy]}</PaperChip>
                        {task.deadline ? <PaperChip tone="rose">due {task.deadline.slice(5, 10)} {task.deadline.slice(11, 16)}</PaperChip> : null}
                        {task.estimatedByAI ? <PaperChip tone="frost" title="Duration was inferred, not stated">estimated</PaperChip> : null}
                        {!task.splittable ? (
                          <PaperChip tone="kraft" icon={<Ban size={9} aria-hidden="true" />}>
                            one sitting
                          </PaperChip>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-[2px] text-ink-faint hover:text-rose-deep"
                      aria-label={`Remove ${task.title}`}
                      onClick={() => removeTask(task.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>

                  {expanded ? (
                    <div className="paper-well m-2 mt-0 grid grid-cols-2 gap-2 p-2">
                      <div>
                        <PaperLabel htmlFor={`${task.id}-minutes`}>Minutes</PaperLabel>
                        <PaperInput
                          id={`${task.id}-minutes`}
                          type="number"
                          min={SNAP_MINUTES}
                          step={SNAP_MINUTES}
                          value={task.estimateMinutes}
                          onChange={(event) => updateTask(task.id, { estimateMinutes: Math.max(SNAP_MINUTES, Number(event.target.value)) })}
                        />
                      </div>
                      <div>
                        <PaperLabel htmlFor={`${task.id}-priority`}>Priority</PaperLabel>
                        <PaperSelect
                          id={`${task.id}-priority`}
                          value={task.priority}
                          onChange={(event) => updateTask(task.id, { priority: event.target.value as Task['priority'] })}
                        >
                          {['P0', 'P1', 'P2', 'P3'].map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </PaperSelect>
                      </div>
                      <div>
                        <PaperLabel htmlFor={`${task.id}-energy`}>Energy</PaperLabel>
                        <PaperSelect
                          id={`${task.id}-energy`}
                          value={task.energy}
                          onChange={(event) => updateTask(task.id, { energy: event.target.value as Energy })}
                        >
                          {ENERGY_OPTIONS.map((energy) => (
                            <option key={energy} value={energy}>
                              {ENERGY_LABEL[energy]}
                            </option>
                          ))}
                        </PaperSelect>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                          <input
                            type="checkbox"
                            checked={task.splittable}
                            onChange={(event) => updateTask(task.id, { splittable: event.target.checked })}
                            className="h-3.5 w-3.5 accent-teal-deep"
                          />
                          Splittable
                        </label>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[color:rgba(12,74,87,0.25)] pt-2.5">
          <div className="flex gap-1.5">
            <PaperButton
              size="sm"
              variant="press"
              active={demoSet === 'realistic'}
              onClick={() => loadDemoSet('realistic')}
            >
              Realistic
            </PaperButton>
            <PaperButton
              size="sm"
              variant="press"
              active={demoSet === 'overloaded'}
              onClick={() => loadDemoSet('overloaded')}
            >
              Overbooked
            </PaperButton>
          </div>
          <button type="button" className={clsx('text-[11px] font-semibold text-ink-faint hover:text-rose-deep')} onClick={clearTasks}>
            Clear all
          </button>
        </footer>
      </PaperSheet>
    </div>
  )
}
