'use client'

import { useEffect, useId, useState } from 'react'
import { PaperInput } from './PaperControls'

/** Preserve unfinished number edits without replacing persisted values with 0, NaN or a clamp. */
export function ValidatedMinutesInput({ value, onValueChange, min = 15, max = 720, step = 15, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'> & { value: number; onValueChange(value: number): void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const errorId = useId()
  useEffect(() => { setDraft(String(value)); setInvalid(false) }, [value])
  return <div className="min-w-0">
    <PaperInput {...props} type="number" min={min} max={max} step={step} value={draft} aria-invalid={invalid} aria-describedby={invalid ? errorId : props['aria-describedby']} onChange={event => {
      const text = event.target.value, next = Number(text)
      setDraft(text)
      const valid = text.trim() !== '' && Number.isInteger(next) && next >= min && next <= max && next % step === 0
      setInvalid(!valid)
      if (valid) onValueChange(next)
    }} />
    {invalid && <p id={errorId} role="status" className="mt-1 text-xs text-ink">Enter {min}–{max} minutes in {step}-minute steps. Your saved value is unchanged.</p>}
  </div>
}
