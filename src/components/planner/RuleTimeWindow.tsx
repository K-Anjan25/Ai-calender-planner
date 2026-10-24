'use client'

import { useEffect, useId, useState } from 'react'
import { PaperInput } from '@/components/paper/PaperControls'

export type TimeWindow = { start: number; end: number }
const clock = (value: number) => `${String(Math.floor((value % 1440) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const minute = (value: string) => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN

/** Invalid/unfinished edits remain local; the scheduler only receives complete, ordered windows. */
export function RuleTimeWindow({ value, label, onChange }: { value: TimeWindow; label: string; onChange(value: TimeWindow): void }) {
  const id = useId()
  const [draft, setDraft] = useState({ start: clock(value.start), end: clock(value.end) })
  const [error, setError] = useState('')
  useEffect(() => {
    setDraft({ start: clock(value.start), end: clock(value.end) })
    setError('')
  }, [value.start, value.end])

  function edit(part: 'start' | 'end', text: string) {
    const next = { ...draft, [part]: text }
    setDraft(next)
    const start = minute(next.start), end = next.end === '00:00' ? 1440 : minute(next.end)
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end && end <= 1440 && start % 15 === 0 && end % 15 === 0
    setError(valid ? '' : 'Choose an end after the start, in 15-minute steps. End 00:00 means midnight.')
    if (valid) onChange({ start, end })
  }
  return <div className="min-w-0 space-y-1">
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {(['start', 'end'] as const).map(part => <div key={part} className="min-w-0">
        <label htmlFor={`${id}-${part}`} className="mb-1 block text-xs text-ink-soft">{part === 'start' ? 'From' : 'Until'}</label>
        <PaperInput id={`${id}-${part}`} type="time" step={900} aria-label={`${label} ${part}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} value={draft[part]} onChange={event => edit(part, event.target.value)} className="w-full min-w-0" />
      </div>)}
    </div>
    {error && <p id={`${id}-error`} role="status" className="text-xs text-ink">{error}</p>}
  </div>
}
