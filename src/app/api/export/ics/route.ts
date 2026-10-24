import { plannerAccessError } from '@/lib/auth/planner-access'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { planProposalSchema } from '@/lib/types'
import { buildIcs, icsFilename } from '@/lib/ics'

/**
 * POST /api/export/ics — hand the week to any calendar, with no account and no OAuth (T-604).
 *
 * This is the honest counterpart to the Google integration: the same blocks, the same reasons, in a
 * file the user owns. Nothing is written anywhere, so — like the dry run — it needs no configuration
 * and no consent. Pass the plan you are looking at; you get it back as `text/calendar`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  proposal: planProposalSchema,
  approvedBlockIds: z.array(z.string()).max(200).optional(),
  includeMeetings: z.boolean().optional(),
})

export async function POST(request: Request) {
  const denied = await plannerAccessError()
  if (denied) return denied
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_BODY', message: 'Expected a JSON body.' } },
      { status: 400 },
    )
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INVALID_BODY',
          message: 'That plan could not be read, so there is nothing to export.',
          detail: parsed.error.issues.slice(0, 4),
        },
      },
      { status: 400 },
    )
  }

  const { proposal, approvedBlockIds, includeMeetings } = parsed.data
  const ics = buildIcs({ proposal, approvedBlockIds, includeMeetings })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${icsFilename(proposal)}"`,
      // A plan is a snapshot of a decision; caching it would serve a stale week.
      'cache-control': 'no-store',
    },
  })
}
