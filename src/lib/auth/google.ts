import { FALLBACK_ORIGIN } from '@/lib/request-origin'
import { readEnv } from '@/lib/google/scopes'

/**
 * Google identity (Sign in with Google).
 *
 * Separate from the Calendar grant on purpose, and the separation is the whole point:
 *  - **sign-in** asks for `openid email profile` — who you are, nothing else;
 *  - **Calendar** is asked for separately, later, when the user clicks *Connect Google Calendar*
 *    (incremental authorisation).
 *
 * Bundling them would mean asking for read/write access to someone's calendar before they have
 * created an account, which is both worse consent design and a worse product. Two grants, two
 * moments of intent.
 */

export const IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const

export const AUTH_STATE_COOKIE = 'calendra_auth_state'

export type AuthConfig = {
  configured: boolean
  missing: string[]
  redirectUri: string
}

/**
 * The redirect URI for the **sign-in** grant.
 *
 * It must be the host the browser is on, not a build-time constant: Google matches the value sent to
 * the authorisation endpoint against the registered URIs exactly, so a deployed instance that asked
 * for `http://localhost:3000/...` would send the user's browser back to the developer's machine.
 * `origin` comes from the request (`lib/request-origin.ts`) and makes one OAuth client work on
 * localhost, on a preview URL and on a custom domain. The env vars still win, for proxies and
 * tunnels where the public origin differs from the one the request arrived on.
 */
export function authRedirectUri(origin?: string): string {
  return (
    readEnv('AUTH_REDIRECT_URI') ??
    readEnv('GOOGLE_REDIRECT_URI')?.replace(/\/api\/calendar\/callback$/, '/api/auth/callback') ??
    `${origin ?? FALLBACK_ORIGIN}/api/auth/callback`
  )
}

export function googleAuthConfig(origin?: string): AuthConfig {
  const clientId = readEnv('GOOGLE_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
  const missing: string[] = []
  if (!clientId) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  return { configured: missing.length === 0, missing, redirectUri: authRedirectUri(origin) }
}

export async function googleClient(origin?: string) {
  const config = googleAuthConfig(origin)
  if (!config.configured) return null
  const { google } = await import('googleapis')
  return new google.auth.OAuth2(readEnv('GOOGLE_CLIENT_ID'), readEnv('GOOGLE_CLIENT_SECRET'), config.redirectUri)
}

/**
 * The consent URL. Built from a fixed option set — nothing user-supplied reaches it, and `state` is
 * a server-generated nonce that the callback verifies against a cookie (CSRF).
 */
export function identityAuthUrl(client: unknown, state: string): string {
  const oauth = client as { generateAuthUrl: (options: object) => string }
  return oauth.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: [...IDENTITY_SCOPES],
    state,
  })
}

export type GoogleIdentity = { id: string; email: string; name: string; picture?: string }

/**
 * Exchange the code, then read the identity from the **ID token** rather than the profile endpoint:
 * one fewer network hop on the sign-in critical path, and the token is signature-verified by the
 * library against Google's keys.
 */
export async function exchangeCodeForIdentity(code: string, origin?: string): Promise<GoogleIdentity | null> {
  // Same `origin` as the authorisation request: the token exchange must present the identical
  // `redirect_uri` or Google rejects the code.
  const client = await googleClient(origin)
  if (!client) return null
  try {
    const { tokens } = await client.getToken(code)
    const idToken = tokens.id_token
    if (!idToken) return null

    const { OAuth2Client } = await import('google-auth-library')
    const verifier = new OAuth2Client()
    const ticket = await verifier.verifyIdToken({ idToken, audience: readEnv('GOOGLE_CLIENT_ID') })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) return null

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name?.trim() || payload.email.split('@')[0],
      picture: payload.picture,
    }
  } catch {
    // Any failure here is a failed sign-in, never a signed-in user.
    return null
  }
}
