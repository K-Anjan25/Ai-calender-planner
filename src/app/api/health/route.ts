import { NextResponse } from 'next/server'
import { providerSummary } from '@/lib/agent/providers'
import { calendarConfig, isCalendarConfigured } from '@/lib/google/scopes'

/**
 * GET /api/health — capability probe.
 *
 * Reports which integrations are live so the UI can render an honest state ("Demo mode — the
 * deterministic engine is doing the work") instead of failing mysteriously. Names and booleans only:
 * no key material, ever (RULES.md §9).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const provider = providerSummary()
  const calendar = calendarConfig()
  return NextResponse.json({
    ok: true,
    data: {
      engine: 'deterministic',
      agent: provider,
      calendar: {
        connected: false, // optimistic flag is resolved per user in the planner UI
        configured: isCalendarConfigured(),
        missing: calendar.missing,
      },
      demoMode: provider.mode === 'local',
      features: {
        freeTextIntake: true,
        dragAdjust: true,
        tradeoffs: true,
        calendarSync: isCalendarConfigured(),
      },
    },
  })
}
