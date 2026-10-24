'use client'
import { WEEKDAYS, WEEKDAY_SHORT, type Task } from '@/lib/types'
import { PaperInput, PaperLabel } from '@/components/paper/PaperControls'

/** Optional constraints are editable for both newly entered and previously extracted tasks. */
export function TaskConstraintFields({ prefix, value, tasks, onChange, editing = false }: {
  prefix: string; value: Partial<Task>; tasks: Task[]; onChange(patch: Partial<Task>): void; editing?: boolean
}) {
  const days = value.recurrence?.byWeekday ?? value.repeatDays ?? []
  return <div className="col-span-2 min-w-0 space-y-3">
    {editing && <>
      <PaperLabel htmlFor={`${prefix}-title`}>Task title</PaperLabel><PaperInput id={`${prefix}-title`} maxLength={160} value={value.title ?? ''} onChange={event => onChange({ title: event.target.value })} />
      <PaperLabel htmlFor={`${prefix}-deadline`}>Deadline</PaperLabel><PaperInput id={`${prefix}-deadline`} type="datetime-local" value={value.deadline?.slice(0,16) ?? ''} onChange={event => onChange({ deadline: event.target.value || undefined })} />
    </>}
    <div><PaperLabel htmlFor={`${prefix}-earliest`}>Earliest start</PaperLabel><PaperInput id={`${prefix}-earliest`} type="datetime-local" value={value.earliestStart?.slice(0,16) ?? ''} onChange={event => onChange({ earliestStart: event.target.value || undefined })} /></div>
    <div><PaperLabel htmlFor={`${prefix}-location`}>Location</PaperLabel><PaperInput id={`${prefix}-location`} maxLength={80} value={value.location ?? ''} placeholder="Home, office, library…" onChange={event => onChange({ location: event.target.value || undefined })} /></div>
    {value.deadline && value.earliestStart && value.earliestStart >= value.deadline && <p role="status" className="text-sm">Earliest start must be before the deadline.</p>}
    <fieldset className="min-w-0"><legend className="text-xs font-semibold">Repeat on (estimate is per occurrence)</legend><div className="flex flex-wrap gap-2">{WEEKDAYS.map(day => <label key={day} className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" checked={days.includes(day)} onChange={() => {
      const next = days.includes(day) ? days.filter(item => item !== day) : [...days, day]
      onChange({ repeatDays: next, recurrence: value.recurrence && next.length ? { ...value.recurrence, byWeekday: next } : undefined })
    }} />{WEEKDAY_SHORT[day]}</label>)}</div></fieldset>
    {tasks.some(task => task.id !== value.id) && <fieldset className="min-w-0"><legend className="text-xs font-semibold">Must happen after</legend><div className="max-h-40 overflow-auto">{tasks.filter(task => task.id !== value.id).map(task => <label key={task.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={value.dependsOn?.includes(task.id) ?? false} onChange={() => onChange({ dependsOn: value.dependsOn?.includes(task.id) ? value.dependsOn.filter(id => id !== task.id) : [...(value.dependsOn ?? []), task.id] })} /><span className="min-w-0 break-words">{task.title}</span></label>)}</div></fieldset>}
  </div>
}
