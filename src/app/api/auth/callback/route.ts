import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { safeNext, writeSession } from '@/lib/auth/session'
import { AUTH_STATE_COOKIE, exchangeCodeForIdentity } from '@/lib/auth/google'

/**
 * GET /api/auth/callback — finish Sign in with Google.
 *
 * Every failure path lands on `/signin` with a short code rather than a stack trace or a half-signed
 * session: a failed sign-in must never leave a user authenticated.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const jar = await cookies()
  const cookieState = jar.get(AUTH_STATE_COOKIE)?.value
  jar.delete(AUTH_STATE_COOKIE)

  // CSRF: the state echoed by Google must equal the nonce we set, verbatim.
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL('/signin?error=state', url.origin))
  }

  const next = safeNext(decodeURIComponent(state.split('.').slice(1).join('.') || ''))
  const identity = await exchangeCodeForIdentity(code)
  if (!identity) {
    return NextResponse.redirect(new URL('/signin?error=exchange', url.origin))
  }

  await writeSession({
    id: `google_${identity.id}`,
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
    provider: 'google',
  })

  return NextResponse.redirect(new URL(next, url.origin))
}
