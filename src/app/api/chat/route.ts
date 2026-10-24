import { planningResponse } from '@/lib/planning-stream'
import { plannerAccessError } from '@/lib/auth/planner-access'
import { planningBusy } from '@/lib/google/planning-context'
import { localWallISO } from '@/lib/timezone'
import { NextResponse } from 'next/server'
import { chatRequestSchema, type ChatResponse } from '@/lib/types'
import { runPlannerAgent } from '@/lib/agent/planner-agent'
import { weekStartOf } from '@/lib/scheduler/slots'
import { diffPlans } from '@/lib/plan-diff'

/**
 * POST /api/chat — refine a plan by conversation.
 *
 * The agent interprets the message (tasks / preferences / pins), then the deterministic engine
 * rebuilds. The response carries a plain-language summary of what actually moved (FR-4.4), which is
 * what makes the refinement loop trustworthy.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = await plannerAccessError()
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_BODY', message: 'The request body was not valid JSON.' } }, { status: 400 })
  }

  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_BODY', message: 'The message did not match the expected shape.', detail: parsed.error.issues.slice(0, 4) } },
      { status: 400 },
    )
  }

  const input = parsed.data
  const nowISO = input.now ?? new Date().toISOString()
  const weekStartDate = input.weekStart ?? weekStartOf(localWallISO(nowISO, input.preferences.timezone), input.preferences.weekStartsOn)

  return planningResponse(request, async (onStep) => {
    try {
      const calendar = await planningBusy(weekStartDate, input.preferences.timezone, input.busy)
      if (!calendar.ok) return NextResponse.json({ ok: false, error: { code: calendar.code, message: 'Could not refresh your calendar availability. The previous draft is unchanged. Reconnect Google Calendar or try again.' } }, { status: 502 })
      const result = await runPlannerAgent({
        onStep,
        tasks: input.tasks,
        preferences: input.preferences,
        busy: calendar.events,
        pins: input.pins,
        weekStartDate,
        nowISO: localWallISO(nowISO, input.preferences.timezone),
        message: input.message,
        explainBlockId: input.explainBlockId,
        mode: input.mode,
        provider: input.provider,
      })

      const changes = diffPlans(input.tasks, result.tasks, result.proposal, input.previousPreferences, input.previousBlocks)
      const data: ChatResponse['data'] = {
        proposal: result.proposal,
        reply: [...calendar.notes, result.reply].join(' '),
        changes,
        tasks: result.tasks,
        preferences: result.preferences,
        trace: result.trace,
        provider: result.provider,
      }
      return NextResponse.json({ ok: true, data })
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'CHAT_FAILED',
            message: 'The agent could not apply that change.',
            detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
          },
        },
        { status: 500 },
      )
    }
  })
}
