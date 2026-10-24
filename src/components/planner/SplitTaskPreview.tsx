'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlanResponse } from '@/lib/types'
import { postPlan } from '@/lib/api'
import { fmtClock, fmtDuration } from '@/lib/scheduler/slots'
import { plannerLocked, plannerSnapshotKey, usePlanner } from '@/lib/store/planner-store'
import { PaperButton } from '@/components/paper/PaperControls'

/** Preview a real engine answer without mutating the current draft or writing calendar events. */
export function SplitTaskPreview({ taskId, title }: { taskId: string; title: string }) {
  const state = usePlanner()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [source, setSource] = useState('')
  const [data, setData] = useState<PlanResponse['data'] | null>(null)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  useEffect(
    () => () => {
      requestId.current += 1
    },
    [],
  )
  const stale = Boolean(data && source !== plannerSnapshotKey(state))
  const blocks = data?.proposal.blocks.filter((block) => block.taskId === taskId && block.kind === 'task') ?? []
  const remaining = data?.proposal.report.unscheduled.find((item) => item.taskId === taskId)
  async function preview() {
    const snapshot = usePlanner.getState()
    const id = ++requestId.current
    setSource(plannerSnapshotKey(snapshot))
    setOpen(true)
    setPending(true)
    setData(null)
    setError('')
    const result = await postPlan({
      tasks: snapshot.tasks.map((task) =>
        task.id === taskId ? { ...task, splittable: true, minChunkMinutes: 15 } : task,
      ),
      preferences: snapshot.preferences,
      busy: snapshot.busy,
      pins: snapshot.pins,
      mode: snapshot.mode,
      now: new Date().toISOString(),
    })
    if (id !== requestId.current) return
    setPending(false)
    if (result.ok) setData(result.data)
    else setError(result.error.message)
  }
  return (
    <div className="space-y-2">
      <PaperButton size="sm" disabled={pending || plannerLocked(state)} onClick={() => void preview()}>
        {pending ? 'Finding room…' : 'Preview 15-minute chunks'}
      </PaperButton>
      {open && (
        <section
          aria-label={`Preview smaller chunks for ${title}`}
          aria-busy={pending}
          className="paper-sheet space-y-2 p-3"
        >
          <h4 className="text-sm font-semibold">Smaller chunks preview</h4>
          <p role="status" className="text-sm">
            {pending
              ? 'Checking where this task could fit. Your current plan is unchanged.'
              : 'Preview only. Nothing has changed or been written to your calendar.'}
          </p>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          {data && (
            <>
              <ul className="space-y-1 text-sm">
                {blocks.map((block) => (
                  <li key={block.id}>
                    {block.date} · {fmtClock(block.startMin)}–{fmtClock(block.endMin)} · {fmtDuration(block.minutes)}
                  </li>
                ))}
              </ul>
              {remaining && (
                <p className="text-sm">
                  Still unplaced: {fmtDuration(remaining.minutes)}. {remaining.why}
                </p>
              )}
              {!blocks.length && (
                <p className="text-sm">No valid slots were found. Review working hours or reduce other commitments.</p>
              )}
              {stale && (
                <p role="status" className="text-sm font-semibold">
                  The plan changed. Generate a fresh preview before applying.
                </p>
              )}
              <p className="text-sm">
                Applying replaces the draft week; other tasks may move. Publishing still requires your approval.
              </p>
              <PaperButton
                disabled={stale || !blocks.length || plannerLocked(state)}
                onClick={() => {
                  if (!state.acceptPreview(data, source, taskId))
                    setError('The plan changed. Generate a fresh preview.')
                }}
              >
                Use preview
              </PaperButton>
            </>
          )}
          <PaperButton
            variant="flat"
            onClick={() => {
              requestId.current += 1
              setPending(false)
              setOpen(false)
              setData(null)
            }}
          >
            Cancel preview
          </PaperButton>
        </section>
      )}
    </div>
  )
}
