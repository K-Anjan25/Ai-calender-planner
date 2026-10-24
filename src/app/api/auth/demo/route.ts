import { NextResponse } from 'next/server'
import { authConfig, demoUser, writeSession } from '@/lib/auth/session'

/**
 * POST /api/auth/demo — the zero-configuration session.
 *
 * Deliberately a POST and deliberately named: it creates a real signed session for an identity that
 * is labelled "Demo session" everywhere it appears. That keeps the app usable with no credentials
 * without ever letting a visitor believe they have proved who they are.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  if (authConfig().required) return NextResponse.json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'Demo sessions cannot unlock a private planner. Sign in with Google.' } }, { status: 403 })
  await writeSession(demoUser())
  return NextResponse.json({ ok: true, data: { user: demoUser() } })
}
