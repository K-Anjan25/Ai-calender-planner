import { NextResponse } from 'next/server'
import {
  clearStateCookie,
  getOAuthClient,
  readStateCookie,
  storeTokens,
} from '@/lib/google/oauth'
import { requestOrigin } from '@/lib/request-origin'

/**
 * GET /api/calendar/callback — finish the consent flow.
 *
 * The authorization code is exchanged server-side and the tokens go straight into an httpOnly cookie.
 * They are never returned to the browser as data (RULES.md §8).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/planner?calendar=denied`, url.origin))
  }

  const expectedState = await readStateCookie()
  if (!code || !state || !expectedState || state !== expectedState) {
    await clearStateCookie()
    return NextResponse.redirect(new URL('/planner?calendar=state_mismatch', url.origin))
  }

  const client = await getOAuthClient(requestOrigin(request))
  if (!client) {
    return NextResponse.redirect(new URL('/planner?calendar=unconfigured', url.origin))
  }

  try {
    const { tokens } = await client.getToken(code)
    await storeTokens({
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
    })
    await clearStateCookie()
    return NextResponse.redirect(new URL('/planner?calendar=connected', url.origin))
  } catch {
    await clearStateCookie()
    return NextResponse.redirect(new URL('/planner?calendar=error', url.origin))
  }
}
