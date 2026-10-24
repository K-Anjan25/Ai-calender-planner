import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth/session'

/** POST /api/auth/signout — clear the session cookie. Nothing to revoke: there is no server store. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  await clearSession()
  return NextResponse.json({ ok: true, data: { signedOut: true } })
}
