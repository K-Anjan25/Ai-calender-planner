import { NextResponse } from 'next/server'
import { authConfig, readSession } from '@/lib/auth/session'
import { googleAuthConfig } from '@/lib/auth/google'

/** GET /api/auth/session — who is signed in, and which capabilities this deployment has. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [session, google] = [await readSession(), googleAuthConfig()]
  const config = authConfig()
  return NextResponse.json({
    ok: true,
    data: {
      user: session?.user ?? null,
      expiresAt: session ? new Date(session.exp * 1000).toISOString() : null,
      capabilities: {
        googleSignIn: google.configured,
        // Diagnostic names only, never credential values.
        googleMissing: google.missing,
        secretConfigured: config.configured,
        required: config.required,
      },
    },
  })
}
