import { NextResponse } from 'next/server'
import { planRequestSchema, type PlanResponse } from '@/lib/types'
import { runPlannerAgent } from '@/lib/agent/planner-agent'
import { providerSummary } from '@/lib/agent/providers'
import { weekStartOf } from '@/lib/scheduler/slots'
import { DEMO_FREE_TEXT } from '@/lib/sample-data'

/**
 * POST /api/plan — build or rebuild the week.
 *
 * Thin by design (RULES.md §9): validate → orchestrate → shape the response. No algorithm lives here.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fail(code: string, message: string, detail?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, detail } }, { status: code === 'INVALID_BODY' ? 400 : 500 })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('INVALID_BODY', 'The request body was not valid JSON.')
  }

  const parsed = planRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail('INVALID_BODY', 'The plan request did not match the expected shape.', parsed.error.issues.slice(0, 4))
  }

  const input = parsed.data
  const nowISO = input.now ?? new Date().toISOString()
  const weekStartDate = input.weekStart ?? weekStartOf(nowISO, input.preferences.weekStartsOn)

  if (input.tasks.length === 0 && !input.instruction) {
    return fail('NO_TASKS', 'Add at least one task, or paste a brief for the agent to read.')
  }

  try {
    const result = await runPlannerAgent({
      tasks: input.tasks,
      preferences: input.preferences,
      busy: input.busy,
      pins: input.pins,
      weekStartDate,
      nowISO,
      freeText: input.instruction,
      mode: input.mode,
      provider: input.provider,
    })

    const data: PlanResponse['data'] = {
      proposal: result.proposal,
      provider: result.provider,
      mode: result.mode,
      trace: result.trace,
      notes: result.notes,
    }
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return fail('PLAN_FAILED', 'The planner could not build a week from that input.', {
      reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
  }
}

export async function GET() {
  // Handy for demos and for the "try it" button: the canonical free-text brief.
  return NextResponse.json({
    ok: true,
    data: { demoBrief: DEMO_FREE_TEXT, capability: providerSummary() },
  })
}
