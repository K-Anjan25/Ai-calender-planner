import { cookies } from 'next/headers'
import { CALENDAR_SCOPES, OAUTH_STATE_COOKIE, TOKEN_COOKIE, calendarConfig } from '@/lib/google/scopes'

/**
 * OAuth 2.0 handling (rules in RULES.md §8).
 *
 * Tokens never leave the server: they live in an `httpOnly`, `sameSite=lax` cookie and are never
 * serialised into a client payload. There is no database in the MVP (D-010), so the cookie *is* the
 * session — it holds only what is needed to refresh, never profile data.
 */

export type StoredTokens = {
  accessToken?: string
  refreshToken?: string
  expiryDate?: number
  scope?: string
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export async function getOAuthClient(origin?: string) {
  const { configured, redirectUri } = calendarConfig(origin)
  if (!configured) return null
  const { google } = await import('googleapis')
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri)
}

/** The auth URL is built from a fixed option set — nothing user-supplied reaches it. */
export function authUrlFor(client: unknown, state: string): string {
  const oauth = client as { generateAuthUrl: (options: object) => string }
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [...CALENDAR_SCOPES],
    state,
  })
}

export async function storeTokens(tokens: StoredTokens) {
  const jar = await cookies()
  jar.set(TOKEN_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export async function clearTokens() {
  const jar = await cookies()
  jar.delete(TOKEN_COOKIE)
}

export async function readTokens(): Promise<StoredTokens | null> {
  const jar = await cookies()
  const raw = jar.get(TOKEN_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredTokens
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export async function setStateCookie(state: string) {
  const jar = await cookies()
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })
}

export async function readStateCookie(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(OAUTH_STATE_COOKIE)?.value ?? null
}

export async function clearStateCookie() {
  const jar = await cookies()
  jar.delete(OAUTH_STATE_COOKIE)
}

export function randomState(): string {
  return crypto.randomUUID()
}

/**
 * An authorised client for API calls. Refreshes when the access token is missing or expired, and
 * persists the refreshed token back to the cookie (FR-5.6).
 */
/**
 * A client for **API calls** (free/busy, insert, patch, delete) using the stored refresh token.
 *
 * `origin` is accepted for symmetry and is not otherwise used on this path: the redirect URI only
 * participates in the authorisation-code exchange (`getOAuthClient` at the callback), never in a
 * refresh or an API request. Refreshing with a localhost redirect URI is therefore correct.
 */
export async function authorisedClient(origin?: string): Promise<{ client: unknown } | { error: 'CALENDAR_NOT_CONFIGURED' | 'CALENDAR_NOT_CONNECTED' }> {
  const tokens = await readTokens()
  if (!tokens?.refreshToken) return { error: 'CALENDAR_NOT_CONNECTED' }
  const client = await getOAuthClient(origin)
  if (!client) return { error: 'CALENDAR_NOT_CONFIGURED' }

  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
    scope: tokens.scope,
  })

  const expired = !tokens.expiryDate || tokens.expiryDate - Date.now() < 60_000
  if (expired) {
    try {
      const { credentials } = await client.refreshAccessToken()
      await storeTokens({
        accessToken: credentials.access_token ?? undefined,
        refreshToken: credentials.refresh_token ?? tokens.refreshToken,
        expiryDate: credentials.expiry_date ?? undefined,
        scope: credentials.scope ?? tokens.scope,
      })
      client.setCredentials(credentials)
    } catch {
      return { error: 'CALENDAR_NOT_CONNECTED' }
    }
  }
  return { client }
}
