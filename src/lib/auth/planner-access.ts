import { NextResponse } from 'next/server'
import { authConfig, readSession, type SessionPayload } from '@/lib/auth/session'

export function privatePlannerAllowed(config: { required: boolean; configured: boolean }, session: SessionPayload | null) {
  return !config.required || (config.configured && session?.user.provider === 'google')
}
/** Private deployments protect API calls too; a public demo identity is not identity verification. */
export async function plannerAccessError(): Promise<Response | null> {
  const config = authConfig()
  if (!config.required) return null
  if (!config.configured) return NextResponse.json({ ok: false, error: { code: 'AUTH_NOT_CONFIGURED', message: 'Private access requires AUTH_SECRET and Google sign-in configuration.' } }, { status: 503 })
  if (!privatePlannerAllowed(config, await readSession())) return NextResponse.json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in with Google to use this private planner.' } }, { status: 401 })
  return null
}
