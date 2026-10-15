import './harness/setup-dom'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { authRedirectUri } from '@/lib/auth/google'
import { decodeSession, demoUser, encodeSession, safeNext, type SessionUser } from '@/lib/auth/session'
import { FALLBACK_ORIGIN, requestOrigin } from '@/lib/request-origin'
import { calendarConfig } from '@/lib/google/scopes'

/**
 * Sessions and authorisation (PRD §13, ARCHITECTURE §15).
 *
 * Authentication is the one part of an app where "it looks right" is worth nothing: the failure mode is
 * a forged cookie that grants a workspace, and it fails silently. So these assert the *negative* cases
 * as carefully as the positive one — an edited payload, a swapped signature, an expired token, and a
 * redirect target that points off-site.
 */

const USER: SessionUser = {
  id: 'google_12345',
  email: 'someone@example.com',
  name: 'Someone',
  provider: 'google',
}

describe('session cookies are signed, not trusted', () => {
  it('round-trips a session it issued', () => {
    const raw = encodeSession(USER)
    const decoded = decodeSession(raw)
    assert.ok(decoded, 'a freshly issued session failed verification')
    assert.equal(decoded?.user.email, USER.email)
    assert.equal(decoded?.user.provider, 'google')
  })

  it('rejects a payload edited after signing', () => {
    const raw = encodeSession(USER)
    const [body, signature] = raw.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), user: { ...USER, email: 'attacker@example.com' } })).toString('base64url')
    assert.equal(decodeSession(`${forged}.${signature}`), null, 'an edited payload kept its signature valid')
  })

  it('rejects a swapped or truncated signature', () => {
    const a = encodeSession(USER)
    const b = encodeSession({ ...USER, id: 'google_999' })
    const [, sigA] = a.split('.')
    const [bodyB] = b.split('.')
    assert.equal(decodeSession(`${bodyB}.${sigA}`), null)
    assert.equal(decodeSession(`${a.split('.')[0]}.`), null)
    assert.equal(decodeSession('not-a-cookie'), null)
    assert.equal(decodeSession(undefined), null)
    assert.equal(decodeSession(''), null)
  })

  it('treats an expired session as no session', () => {
    const issued = Date.now() - 60 * 24 * 60 * 60 * 1000
    const raw = encodeSession(USER, issued)
    assert.equal(decodeSession(raw, Date.now()), null, 'an expired session was accepted')
    // …and the same cookie verifies while it is still inside its window.
    assert.ok(decodeSession(encodeSession(USER, Date.now())))
  })

  it('gives a demo session a name that says what it is', () => {
    const user = demoUser()
    assert.equal(user.provider, 'demo')
    assert.equal(user.name, 'Demo session')
    assert.match(user.email, /@calendra\.local$/)
  })
})

describe('redirect targets stay on-site', () => {
  it('accepts a path and rejects everything else', () => {
    assert.equal(safeNext('/planner'), '/planner')
    assert.equal(safeNext('/pricing?plan=pro'), '/pricing?plan=pro')
    assert.equal(safeNext(null), '/planner')
    assert.equal(safeNext(''), '/planner')
    // Protocol-relative and absolute URLs are the open-redirect shapes.
    assert.equal(safeNext('//evil.example.com'), '/planner')
    assert.equal(safeNext('https://evil.example.com'), '/planner')
    assert.equal(safeNext('javascript:alert(1)'), '/planner')
    assert.equal(safeNext('/ok', '/fallback'), '/ok')
  })
})

describe('the redirect URI follows the request, not the build machine', () => {
  /*
   * Google matches `redirect_uri` against the registered list exactly. A hardcoded localhost default
   * therefore breaks every deployment: the deployed app would ask Google to send the browser to
   * `http://localhost:3000`, which is the developer's machine, and sign-in fails with
   * `redirect_uri_mismatch` even though the client id and secret are correct. The origin comes from
   * the request so one OAuth client works on localhost, a preview URL and a custom domain.
   */
  it('resolves both grants from the request origin', () => {
    assert.equal(authRedirectUri('https://calendra.example'), 'https://calendra.example/api/auth/callback')
    assert.equal(calendarConfig('https://calendra.example').redirectUri, 'https://calendra.example/api/calendar/callback')
    // Trailing slashes are not part of an origin, but a proxy can hand one through — the URI must
    // still be well formed.
    assert.match(authRedirectUri('https://calendra.example'), /^https:\/\/calendra\.example\/api\/auth\/callback$/)
  })

  it('falls back to something obviously local when no request is in scope', () => {
    // Tests and build-time rendering have no request. The fallback is deliberately the wrong answer
    // for a deployment, and deliberately obvious rather than plausible.
    assert.equal(FALLBACK_ORIGIN, 'http://localhost:3000')
    assert.equal(authRedirectUri(), `${FALLBACK_ORIGIN}/api/auth/callback`)
    assert.equal(calendarConfig().redirectUri, `${FALLBACK_ORIGIN}/api/calendar/callback`)
  })

  it('prefers the forwarded host and protocol behind a proxy', () => {
    // Vercel terminates TLS at its edge: the request arrives over http on an internal host, and the
    // public origin is in the forwarded headers. Reading only `request.url` would produce
    // `http://<internal>/api/auth/callback`, which is not a registered URI.
    const request = new Request('http://10.0.0.4:3000/api/auth/google', {
      headers: { 'x-forwarded-host': 'calendra.example', 'x-forwarded-proto': 'https' },
    })
    assert.equal(requestOrigin(request), 'https://calendra.example')
  })

  it('takes the first entry of a forwarded chain', () => {
    const request = new Request('https://ignored.example/api/auth/google', {
      headers: { 'x-forwarded-host': 'calendra.example, edge.internal', 'x-forwarded-proto': 'https, http' },
    })
    assert.equal(requestOrigin(request), 'https://calendra.example')
  })

  it('falls back to the request URL when nothing is forwarded', () => {
    assert.equal(requestOrigin(new Request('http://localhost:4000/api/auth/google')), 'http://localhost:4000')
  })
})

/**
 * The *routes* (`/api/auth/*`) are deliberately not unit-tested here.
 *
 * They call `cookies()` from `next/headers`, which needs Next's request scope; driving them through the
 * jsdom fetch bridge throws "`cookies` was called outside a request scope" — the same constraint the
 * Google OAuth callback routes already have (MEMORY §5.9). Faking a request scope would test the fake,
 * not the route.
 *
 * They are verified over HTTP against a running server instead, where the cookie jar is real:
 *   curl -s -c jar -b jar -X POST <origin>/api/auth/demo     → 200, sets calendra_session
 *   curl -s -b jar <origin>/api/auth/session                 → user.name = "Demo session"
 *   curl -s -b jar -X POST <origin>/api/auth/signout         → 200
 *   curl -s -b jar <origin>/api/auth/session                 → user = null
 *   curl -s -b "calendra_session=<tampered>" <origin>/api/auth/session → user = null
 *
 * The parts with security consequence — the signature, the expiry, the redirect target — are pure
 * functions and are asserted above.
 */
