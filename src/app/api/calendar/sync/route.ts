import { NextResponse } from 'next/server'
import { syncRequestSchema } from '@/lib/types'
import { deletePlanEvents, syncPlan } from '@/lib/google/calendar'
import { isCalendarConfigured } from '@/lib/google/scopes'
import { clearTokens, readTokens } from '@/lib/google/oauth'

/**
 * POST /api/calendar/sync — write *approved* blocks to Google Calendar.
 *
 * Rules this route exists to enforce:
 *  - explicit approval: `approvedBlockIds` is required, so nothing is ever written by implication (L2);
 *  - idempotent: events are upserted by their Paperweek marker, so re-syncing updates instead of
 *    duplicating (D-006);
 *  - honest about drift: if the calendar moved since planning, return 409 with the conflicting blocks
 *    rather than writing on top of someone's meeting.
 *
 * DELETE /api/calendar/sync — roll back a plan's events, and disconnect.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function envelopeError(code: string, message: string, status: number, detail?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, detail } }, { status })
}

export async function GET() {
  const tokens = await readTokens()
  const configured = isCalendarConfigured()
  return NextResponse.json({
    ok: true,
    data: {
      configured,
      connected: Boolean(tokens?.refreshToken),
      scopes: ['calendar.events', 'calendar.readonly'],
    },
  })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return envelopeError('INVALID_BODY', 'The request body was not valid JSON.', 400)
  }

  const parsed = syncRequestSchema.safeParse(body)
  if (!parsed.success) {
    return envelopeError('INVALID_BODY', 'Approved block ids and a proposal are required.', 400, parsed.error.issues.slice(0, 4))
  }

  // Dry runs are a preview and need no account at all; real writes need both config and consent.
  if (!parsed.data.dryRun) {
    if (!isCalendarConfigured()) {
      return envelopeError(
        'CALENDAR_NOT_CONFIGURED',
        'Google Calendar is not configured on this deployment. The plan itself is unaffected.',
        501,
      )
    }
    const tokens = await readTokens()
    if (!tokens?.refreshToken) {
      return envelopeError('CALENDAR_NOT_CONNECTED', 'Connect Google Calendar first — the plan is saved locally either way.', 401)
    }
  }

  const result = await syncPlan(parsed.data)

  if (!result.ok) {
    if (result.code === 'CALENDAR_DRIFT') {
      return envelopeError(
        'CALENDAR_DRIFT',
        'Your calendar changed since this plan was built. Re-plan, then approve again.',
        409,
        result.detail ? safeParse(result.detail) : undefined,
      )
    }
    if (result.code === 'CALENDAR_NOT_CONNECTED') {
      await clearTokens()
      return envelopeError('CALENDAR_NOT_CONNECTED', 'Google rejected the stored credentials. Reconnect to continue.', 401)
    }
    return envelopeError(result.code, 'Google Calendar is not answering right now. Your plan is unchanged — try again shortly.', 502)
  }

  return NextResponse.json({ ok: true, data: result.data })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const planId = url.searchParams.get('planId')
  const calendarId = url.searchParams.get('calendarId') ?? 'primary'
  const disconnect = url.searchParams.get('disconnect') === 'true'

  if (disconnect) {
    await clearTokens()
    return NextResponse.json({ ok: true, data: { disconnected: true, deleted: 0 } })
  }

  if (!planId) {
    return envelopeError('INVALID_BODY', 'A planId query parameter is required to roll back a plan.', 400)
  }
  if (!isCalendarConfigured()) {
    return envelopeError('CALENDAR_NOT_CONFIGURED', 'Google Calendar is not configured on this deployment.', 501)
  }

  const result = await deletePlanEvents(planId, calendarId)
  if (!result.ok) {
    return envelopeError(result.code, 'Could not reach Google Calendar to roll this back.', 502)
  }
  return NextResponse.json({ ok: true, data: { disconnected: false, deleted: result.deleted } })
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
