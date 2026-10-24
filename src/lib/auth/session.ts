import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Sessions (`ARCHITECTURE.md` §15).
 *
 * The session is a **signed cookie**, not a database row: the payload is base64url JSON, the signature
 * is HMAC-SHA256 over that payload with `AUTH_SECRET`. `httpOnly`, `sameSite=lax`, `secure` in
 * production. Verification is constant-time.
 *
 * What this is and is not, stated plainly because the difference matters in production:
 *  - it **is** real authentication: a forged or edited cookie fails the signature check, and the
 *    payload is never trusted without it;
 *  - it is **not** server-side revocation. Signing out clears the cookie, but a copied cookie stays
 *    valid until it expires. Revocation needs a store (D-025) — the same trade the MVP already makes
 *    for Google tokens (D-010).
 *
 * With no `AUTH_SECRET` configured the app still runs: it signs with a documented development key and
 * reports `configured: false`, so the UI can say the session is a demo instead of implying security
 * it does not have.
 */

export const SESSION_COOKIE = 'calendra_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30
const DEV_SECRET = 'calendra-development-secret-do-not-use-in-production'

export type SessionUser = {
  id: string
  email: string
  name: string
  picture?: string
  /** How this session was established. `demo` is a real session with a clearly-labelled identity. */
  provider: 'google' | 'demo'
}

export type SessionPayload = {
  user: SessionUser
  /** Unix seconds. Checked on read, so an expired cookie is treated as no session. */
  exp: number
  iat: number
}

export type SessionConfig = {
  /** `AUTH_SECRET` is present: signatures are meaningful. */
  configured: boolean
  /** Google OAuth credentials are present: real sign-in is possible. */
  google: boolean
  /** `REQUIRE_AUTH=true` gates the planner behind a session. */
  required: boolean
  missing: string[]
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export function authConfig(): SessionConfig {
  const missing: string[] = []
  const secret = readEnv('AUTH_SECRET')
  const clientId = readEnv('GOOGLE_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
  if (!secret) missing.push('AUTH_SECRET')
  if (!clientId) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  return {
    configured: Boolean(secret),
    google: Boolean(clientId && clientSecret),
    required: readEnv('REQUIRE_AUTH') === 'true',
    missing,
  }
}

function secret(): string {
  return readEnv('AUTH_SECRET') ?? DEV_SECRET
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function encodeSession(user: SessionUser, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const payload: SessionPayload = { user, iat: issuedAt, exp: issuedAt + SESSION_MAX_AGE }
  const body = base64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/** Verify a raw cookie value. Returns `null` for anything that is not a valid, unexpired session. */
export function decodeSession(raw: string | undefined, now = Date.now()): SessionPayload | null {
  if (!raw) return null
  const [body, signature] = raw.split('.')
  if (!body || !signature) return null

  const expected = Buffer.from(sign(body))
  const received = Buffer.from(signature)
  // Length check first: `timingSafeEqual` throws on a length mismatch.
  if (expected.length !== received.length) return null
  if (!timingSafeEqual(expected, received)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload?.exp !== 'number' || payload.exp * 1000 < now) return null
    if (!payload.user?.id || !payload.user.email) return null
    if (!readEnv('AUTH_SECRET') && process.env.NODE_ENV === 'production' && (payload.user.provider !== 'demo' || authConfig().required)) return null
    return payload
  } catch {
    return null
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  return decodeSession(jar.get(SESSION_COOKIE)?.value)
}

export async function writeSession(user: SessionUser) {
  if (process.env.NODE_ENV === 'production' && !readEnv('AUTH_SECRET') && user.provider !== 'demo') throw new Error('AUTH_SECRET is required for real accounts in production')
  const jar = await cookies()
  jar.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/**
 * The zero-configuration path: a real, signed session for a clearly-labelled demo identity.
 *
 * This is not a bypass — it is the same session mechanism with a name that says what it is. Without
 * Google credentials there is no way to prove who someone is, so the app does not pretend to; it
 * gives them a working workspace and labels the account "Demo session" everywhere it appears.
 */
export function demoUser(seed = 'local'): SessionUser {
  return {
    id: `demo_${seed}`,
    email: 'demo@calendra.local',
    name: 'Demo session',
    provider: 'demo',
  }
}

/** Only accept same-origin, absolute-path redirect targets — never an attacker-supplied origin. */
export function safeNext(next: string | null | undefined, fallback = '/planner'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}
