import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { safeNext } from '@/lib/auth/session'
import { AUTH_STATE_COOKIE, googleAuthConfig, googleClient, identityAuthUrl } from '@/lib/auth/google'

/**
 * GET /api/auth/google — start Sign in with Google.
 *
 * A full-page redirect, not a popup: it survives popup blockers, works on mobile, and keeps the
 * consent screen in Google's own origin where it belongs. The `state` nonce is minted here, stored
 * in an httpOnly cookie and verified in the callback.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const config = googleAuthConfig()
  const next = safeNext(url.searchParams.get('next'))

  if (!config.configured) {
    // Honest degradation: there is no fake sign-in. The user is told what is missing and offered the
    // demo session instead (D-025).
    return NextResponse.redirect(new URL(`/signin?error=not_configured&next=${encodeURIComponent(next)}`, url.origin))
  }

  const client = await googleClient()
  if (!client) {
    return NextResponse.redirect(new URL('/signin?error=not_configured', url.origin))
  }

  const state = `${crypto.randomUUID()}.${encodeURIComponent(next)}`
  const jar = await cookies()
  jar.set(AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })

  return NextResponse.redirect(identityAuthUrl(client, state))
}
