import './harness/setup-dom'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeSession, demoUser, encodeSession, safeNext, type SessionUser } from '@/lib/auth/session'

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
