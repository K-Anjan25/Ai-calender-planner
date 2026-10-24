import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { safeNext } from '@/lib/auth/session'
import { readEnv } from '@/lib/google/scopes'
import { AUTH_STATE_COOKIE, googleAuthConfig, googleClient, identityAuthUrl } from '@/lib/auth/google'
import { googleOriginProblem, requestOrigin } from '@/lib/request-origin'

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
  // The redirect URI is built from this request's own origin, so one OAuth client works on
  // localhost, on a preview URL and on a custom domain. See `lib/request-origin.ts`.
  const origin = requestOrigin(request)
  const config = googleAuthConfig(origin)
  const next = safeNext(url.searchParams.get('next'))

  if (!config.configured) {
    // Honest degradation: there is no fake sign-in. The user is told what is missing and offered the
    // demo session instead (D-025).
    return NextResponse.redirect(new URL(`/signin?error=not_configured&next=${encodeURIComponent(next)}`, url.origin))
  }

  /*
   * A private network address is not a redirect target Google accepts, and it answers with an error
   * page about the limited-input-device flow that says nothing about the real cause. Rather than send
   * the user there, explain it here — unless an explicit redirect URI was configured, which is the
   * supported way to front a LAN address with a public one (a tunnel or a proxy).
   */
  const problem = googleOriginProblem(origin)
  if (problem && !readEnv('AUTH_REDIRECT_URI')) {
    return NextResponse.redirect(
      new URL(`/signin?error=origin&host=${encodeURIComponent(problem.host)}`, url.origin),
    )
  }

  const client = await googleClient(origin)
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
