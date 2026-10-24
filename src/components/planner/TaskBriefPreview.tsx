'use client'
import { useEffect, useRef, useState } from 'react'
import { taskSchema, type Task } from '@/lib/types'
import { postPlan } from '@/lib/api'
import { plannerLocked, plannerSnapshotKey, usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperInput, PaperLabel, PaperSelect, PaperTextarea } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'

/** Extraction is provisional: only an explicit reviewed confirmation changes the backlog. */
export function TaskBriefPreview() {
  const state = usePlanner()
  const [brief, setBrief] = useState('')
  const [pending, setPending] = useState(false)
  const [review, setReview] = useState<Task[] | null>(null)
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const serial = useRef(0)
  useEffect(() => () => { serial.current++ }, [])
  const stale = Boolean(review && source !== plannerSnapshotKey(state))
  const locked = plannerLocked(state)
  const invalid = review?.some(task => !taskSchema.safeParse(task).success || !task.title.trim() || task.estimateMinutes % 15 !== 0 || (task.deadline && task.earliestStart && task.deadline <= task.earliestStart))
  const duplicate = review ? new Set(review.map(task => task.title.trim().toLowerCase())).size !== review.length : false
  const patch = (id: string, change: Partial<Task>) => setReview(tasks => tasks?.map(task => task.id === id ? { ...task, ...change } : task) ?? null)
  async function preview() {
    if (locked || pending || brief.trim().length < 3) return
    const snapshot = usePlanner.getState(), id = ++serial.current
    setSource(plannerSnapshotKey(snapshot)); setPending(true); setError(''); setReview(null)
    const result = await postPlan({ tasks: snapshot.tasks, preferences: snapshot.preferences, busy: snapshot.busy, pins: snapshot.pins, mode: snapshot.mode, instruction: brief, now: new Date().toISOString() })
    if (id !== serial.current) return
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    const key = (task: Task) => task.title.trim().toLowerCase().replace(/\s+/g, ' ')
    const changed = result.data.proposal.tasks.filter(task => !snapshot.tasks.some(old => JSON.stringify(old) === JSON.stringify(task)))
    setReview(changed.map(task => {
      const old = snapshot.tasks.find(item => item.id === task.id || key(item) === key(task))
      return old ? { ...task, id: old.id, source: old.source } : task
    }))
    setNotes(result.data.notes)
  }
  return <PaperSheet className="space-y-3 p-3.5">
    <PaperLabel htmlFor="brief">Tell Calendra what your week holds</PaperLabel>
    <PaperTextarea id="brief" rows={4} value={brief} disabled={pending || locked} onChange={event => { setBrief(event.target.value); setReview(null) }} placeholder="Finish the Q4 deck by Thursday 5pm (4h). Review PRs every weekday. Gym Mon/Wed/Fri, 45 min." />
    <PaperButton disabled={pending || locked || brief.trim().length < 3} onClick={() => void preview()}>{pending ? 'Reading your brief…' : 'Preview tasks'}</PaperButton>
    <p className="text-xs text-ink-soft">Review extracted tasks and inferred estimates before confirming. Previewing does not change your backlog, rules or calendar.</p>
    {pending && <PaperButton onClick={() => { serial.current++; setPending(false) }}>Cancel preview</PaperButton>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {review && <section aria-label="Review extracted tasks" className="space-y-3">
      <h3 className="text-base">Review before adding</h3>
      {!review.length && <p role="status" className="text-sm">No new task changes found. Edit your brief or add a task manually.</p>}
      {notes.map((note, index) => <p key={index} className="text-xs text-ink-soft">{note}</p>)}
      {review.map(task => <fieldset key={task.id} disabled={locked} className="paper-well min-w-0 space-y-2 p-3">
        <legend className="sr-only">Review {task.title}</legend>
        <PaperLabel htmlFor={`review-title-${task.id}`}>Task title</PaperLabel>
        <PaperInput id={`review-title-${task.id}`} value={task.title} onChange={event => patch(task.id, { title: event.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div><PaperLabel htmlFor={`review-minutes-${task.id}`}>Minutes{task.estimatedByAI ? ' (inferred)' : ''}</PaperLabel><PaperInput id={`review-minutes-${task.id}`} type="number" min={15} max={720} step={15} value={task.estimateMinutes} onChange={event => patch(task.id, { estimateMinutes: Number(event.target.value), minChunkMinutes: Math.max(15, Math.min(task.minChunkMinutes, Number(event.target.value) || 15)), estimatedByAI: false })} /></div>
          <div><PaperLabel htmlFor={`review-priority-${task.id}`}>Priority</PaperLabel><PaperSelect id={`review-priority-${task.id}`} value={task.priority} onChange={event => patch(task.id, { priority: event.target.value as Task['priority'] })}>{['P0','P1','P2','P3'].map(value => <option key={value}>{value}</option>)}</PaperSelect></div>
        </div>
        <PaperLabel htmlFor={`review-deadline-${task.id}`}>Deadline</PaperLabel>
        <PaperInput id={`review-deadline-${task.id}`} type="datetime-local" value={task.deadline?.slice(0,16) ?? ''} onChange={event => patch(task.id, { deadline: event.target.value || undefined })} />
        <p className="text-xs">{task.energy} · {task.splittable ? 'Splittable' : 'One sitting'}{task.repeatDays?.length ? ` · Repeats ${task.repeatDays.join(', ')}` : ''}{task.earliestStart ? ` · Not before ${task.earliestStart}` : ''}{task.location ? ` · ${task.location}` : ''}</p>
        {state.tasks.some(old => old.id === task.id) && <p className="text-xs">Matches an existing task. Confirming updates it instead of adding a duplicate.</p>}
        <PaperButton variant="flat" onClick={() => setReview(tasks => tasks?.filter(item => item.id !== task.id) ?? null)}>Exclude task</PaperButton>
      </fieldset>)}
      {stale && <p role="status" className="text-sm">Your draft changed. Preview the brief again before confirming.</p>}
      {duplicate && <p role="status" className="text-sm">Repeated titles found. Exclude duplicates or give each task a distinct title.</p>}
      {invalid && <p role="status" className="text-sm">Use a title and 15–720 minutes in 15-minute steps. Deadlines must be after the earliest start.</p>}
      <PaperButton disabled={locked || stale || invalid || duplicate || !review.length} onClick={async () => {
        if (plannerLocked(usePlanner.getState()) || plannerSnapshotKey(usePlanner.getState()) !== source) return
        const merged = [...usePlanner.getState().tasks]
        for (const task of review) { const index = merged.findIndex(old => old.id === task.id); if (index < 0) merged.push(task); else merged[index] = task }
        if (merged.length > 120) { setError('Keep the backlog to 120 tasks or fewer.'); return }
        state.setTasks(merged); setReview(null); setBrief('')
        await usePlanner.getState().buildWeek()
        if (usePlanner.getState().status === 'ready') usePlanner.getState().setRailTab('calendar')
      }}>Confirm tasks &amp; plan</PaperButton>
      <PaperButton variant="flat" onClick={() => setReview(null)}>Discard preview</PaperButton>
    </section>}
  </PaperSheet>
}
