'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Send, Sparkles, ChevronDown, Terminal } from 'lucide-react'
import { plannerLocked, usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperInput } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'

/**
 * The refinement loop (FR-4.4) with a visible trace.
 *
 * Every agent turn shows what it actually did — which tools ran, how long they took, what moved.
 * An AI planner that cannot be audited gets deleted after one surprise, so the trace is part of the
 * product, not a debug panel.
 */

const SUGGESTIONS = [
  "I'm out Friday afternoon",
  'Start at 8:30 and finish by 17:30',
  'Use the weekend if it helps',
  'Protect my mornings for deep work',
  'Add a 90 minute writing block by Thursday, P0',
]

export function AgentChat() {
  const { chat, chatBusy, sendMessage, capability, mode, setMode, status, trace } = usePlanner()
  const locked = usePlanner(plannerLocked)
  const [message, setMessage] = useState('')
  const [showTrace, setShowTrace] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [chat.length, chatBusy])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || locked) return
    setMessage('')
    void sendMessage(trimmed)
  }

  return (
    <PaperSheet className="flex min-h-0 flex-col p-3.5">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-teal-deep" aria-hidden="true" />
          <h3 className="text-[15px]">Talk to the plan</h3>
        </div>
        <div className="flex items-center gap-1">
          <PaperButton
            size="sm"
            variant="press"
            active={showTrace}
            onClick={() => setShowTrace((value) => !value)}
            title="Show what the agent actually did"
          >
            <Terminal size={12} aria-hidden="true" />
            Trace
          </PaperButton>
        </div>
      </header>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <PaperButton size="sm" variant="press" disabled={locked} active={mode === 'auto'} onClick={() => setMode('auto')}>
          {capability?.agent.mode === 'agent' ? capability.agent.provider : 'auto'}
        </PaperButton>
        <PaperButton size="sm" variant="press" disabled={locked} active={mode === 'local'} onClick={() => setMode('local')}>
          Local engine
        </PaperButton>
        <span className="text-[11px] text-ink-faint">
          {capability?.demoMode
            ? 'Demo mode: rule-based language, identical scheduling.'
            : `Model: ${capability?.agent.model || 'configured provider'}`}
        </span>
      </div>

      <div ref={listRef} className="paper-well mb-2 max-h-[280px] min-h-[140px] flex-1 space-y-2 overflow-y-auto p-2.5">
        {chat.length === 0 ? (
          <div className="space-y-2 text-[12px] leading-relaxed text-ink-soft">
            <p>
              Tell me what changed, in your own words — a meeting moved, you are out on Friday, a deadline slipped,
              something new landed. I read it, update the plan, and show you exactly what moved.
            </p>
            <details>
              <summary className="cursor-pointer py-2">Example changes</summary>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={locked}
                    onClick={() => send(suggestion)}
                    className="paper-tile px-2 py-1 text-[11px] font-semibold text-ink-soft transition-transform duration-150 hover:-translate-y-px"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        {chat.map((entry) => (
          <div key={entry.id} className={clsx('animate-paper-slide', entry.role === 'user' ? 'flex justify-end' : '')}>
            {entry.role === 'user' ? (
              <p className="paper-tile max-w-[85%] bg-paper-sand px-2.5 py-1.5 text-[12px] font-semibold text-ink">
                {entry.text}
              </p>
            ) : (
              <div className="max-w-[92%] space-y-1.5">
                <p className="text-[12.5px] leading-relaxed text-ink">{entry.text}</p>
                {entry.changes && entry.changes.length > 0 ? (
                  <ul className="paper-well space-y-1 p-2">
                    {entry.changes.map((change) => (
                      <li key={change} className="flex gap-1.5 text-[11px] text-ink-soft">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                        {change}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {showTrace && entry.trace && entry.trace.length > 0 ? <TraceList trace={entry.trace} /> : null}
              </div>
            )}
          </div>
        ))}

        {chatBusy || status === 'planning' ? (
          <div className="space-y-1.5" aria-live="polite">
            {trace.length ? <TraceList trace={trace} /> : <PaperSkeleton lines={2} />}
          </div>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send(message)
        }}
      >
        <PaperInput
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="“Push the deck to Tuesday morning.”"
          aria-label="Message the planner agent"
          disabled={locked}
        />
        <PaperButton
          type="submit"
          tone="teal"
          size="sm"
          disabled={locked || message.trim().length === 0}
          aria-label="Send"
        >
          <Send size={13} aria-hidden="true" />
        </PaperButton>
      </form>
    </PaperSheet>
  )
}

function TraceList({ trace }: { trace: { tool: string; label: string; detail?: string; ms?: number }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="paper-well p-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint hover:text-ink-soft"
      >
        <ChevronDown size={11} className={clsx('transition-transform', !open && '-rotate-90')} aria-hidden="true" />
        {trace.length} agent steps · {trace.reduce((sum, step) => sum + (step.ms ?? 0), 0)}ms
      </button>
      {open ? (
        <ol className="mt-1.5 space-y-1">
          {trace.map((step, index) => (
            <li key={`${step.tool}_${index}`} className="flex items-baseline gap-1.5 text-[11px]">
              <span className="tnum text-ink-faint">{index + 1}.</span>
              <span className="font-bold text-ink-soft">{step.tool}</span>
              <span className="text-ink-faint">{step.detail ?? step.label}</span>
              {step.ms ? <span className="tnum ml-auto text-ink-faint">{step.ms}ms</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

/** Paper skeletons: cut-out placeholders, never a bare spinner (RULES.md §10). */
export function PaperSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3 rounded-[var(--radius-cut-xs)] bg-paper-kraft/60"
          style={{ width: `${88 - index * 14}%` }}
        />
      ))}
    </div>
  )
}
