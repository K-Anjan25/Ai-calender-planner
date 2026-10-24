'use client'

import { useEffect, useId, useState } from 'react'
import { PaperInput } from './PaperControls'

/** Required persisted text can be cleared temporarily without corrupting the next plan request. */
export function ValidatedTextInput({ value, onValueChange, maxLength = 160, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onValueChange(value: string): void }) {
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const errorId = useId()
  useEffect(() => { setDraft(value); setInvalid(false) }, [value])
  return <div className="min-w-0 flex-1">
    <PaperInput {...props} maxLength={maxLength} value={draft} aria-invalid={invalid} aria-describedby={invalid ? errorId : props['aria-describedby']} onChange={event => {
      const text = event.target.value
      setDraft(text)
      const valid = text.trim().length > 0 && text.length <= maxLength
      setInvalid(!valid)
      if (valid) onValueChange(text)
    }} />
    {invalid && <p id={errorId} role="status" className="mt-1 text-xs text-ink">Enter a name. Your saved value is unchanged.</p>}
  </div>
}
