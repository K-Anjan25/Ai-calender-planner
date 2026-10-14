import { NextResponse } from 'next/server'
import { authUrlFor, getOAuthClient, randomState, setStateCookie } from '@/lib/google/oauth'
import { isCalendarConfigured } from '@/lib/google/scopes'

/**
 * GET /api/calendar/auth — start the OAuth consent flow.
 *
 * Calendar access is requested incrementally: only when the user clicks Connect, never on page load
 * (RULES.md §8). A `state` cookie guards the callback against CSRF.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wantsJson = url.searchParams.get('format') === 'json'

  if (!isCalendarConfigured()) {
    if (wantsJson) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'CALENDAR_NOT_CONFIGURED',
            message: 'Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it — planning works without it.',
          },
        },
        { status: 501 },
      )
    }
    return NextResponse.redirect(new URL('/planner?calendar=unconfigured', url.origin))
  }

  const client = await getOAuthClient()
  if (!client) {
    return NextResponse.redirect(new URL('/planner?calendar=unconfigured', url.origin))
  }

  const state = randomState()
  await setStateCookie(state)
  const authUrl = authUrlFor(client, state)

  if (wantsJson) {
    return NextResponse.json({ ok: true, data: { url: authUrl } })
  }
  return NextResponse.redirect(authUrl)
}
