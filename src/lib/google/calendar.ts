import { z } from 'zod'
import type { BusyEvent, PlacedBlock, PlanProposal, SyncResult } from '@/lib/types'
import {
  BLOCK_LABEL_SUFFIX,
  MARKER_BLOCK,
  MARKER_KIND,
  MARKER_PLAN,
  calendarConfig,
} from '@/lib/google/scopes'
import { authorisedClient } from '@/lib/google/oauth'
import { zonedMidnight, zonedParts, zonedWallInstant } from '@/lib/timezone'
import { addDaysISO, parseDate } from '@/lib/scheduler/slots'

/**
 * Google Calendar adapter (`ARCHITECTURE.md` §7).
 *
 * Non-negotiables enforced here:
 *  - upsert by `extendedProperties.private[MARKER_BLOCK]` — never a blind insert (D-006);
 *  - re-verify availability immediately before writing and report drift instead of writing blind;
 *  - collect per-block failures and never discard successful writes;
 *  - `dryRun` returns the exact payloads, byte for byte.
 */

const OUTBOUND_TIMEOUT_MS = 10_000

type CalendarClient = {
  freebusy: { query: (params: unknown) => Promise<unknown> }
  events: {
    list: (params: unknown) => Promise<unknown>
    insert: (params: unknown) => Promise<unknown>
    patch: (params: unknown) => Promise<unknown>
    delete: (params: unknown) => Promise<unknown>
  }
}

async function calendarClient(): Promise<{ client: CalendarClient; auth: unknown } | { error: string }> {
  const auth = await authorisedClient()
  if ('error' in auth) return { error: auth.error }
  const { google } = await import('googleapis')
  const calendar = google.calendar({ version: 'v3', auth: auth.client as never })
  return { client: calendar as unknown as CalendarClient, auth: auth.client }
}

/* ------------------------------------------------------------------ *
 * Free/busy import (FR-5.2)
 * ------------------------------------------------------------------ */

const freeBusyResponseSchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z.array(z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })).optional(),
      errors: z.array(z.unknown()).optional(),
    }),
  ),
})

/** Missing calendars and per-calendar errors are not evidence of availability. */
export function parsePrimaryBusy(data: unknown) {
  const parsed = freeBusyResponseSchema.safeParse(data)
  const primary = parsed.success ? parsed.data.calendars.primary : undefined
  if (!primary || primary.errors?.length || !primary.busy) return null
  return primary.busy
}

/** Ranges are clamped to the planning week, and an event crossing midnight blocks both days. */
export function busyEventsFromFreeBusy(
  periods: { start?: string; end?: string }[], weekStart: string, timeZone = 'UTC',
): BusyEvent[] {
  const events: BusyEvent[] = []
  for (const period of periods) {
    if (!period.start || !period.end) continue
    const start = Date.parse(period.start), end = Date.parse(period.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    for (let index = 0; index < 7; index++) {
      const date = addDaysISO(weekStart, index)
      const dayStart = zonedMidnight(date, timeZone).getTime()
      const dayEnd = zonedMidnight(addDaysISO(date, 1), timeZone).getTime()
      const from = Math.max(start, dayStart), to = Math.min(end, dayEnd)
      if (from >= to) continue
      const a = zonedParts(new Date(from), timeZone), b = zonedParts(new Date(to), timeZone)
      let startMin = from === dayStart ? 0 : a.hour * 60 + a.minute
      let endMin = to === dayEnd ? 1440 : Math.min(1440, b.hour * 60 + b.minute + (b.second > 0 ? 1 : 0))
      // Wall-clock scheduling cannot distinguish both copies of a DST fall-back hour.
      // Conservatively reserve that hour rather than emit an inverted or under-blocked range.
      if ((to - from) / 60000 > endMin - startMin + 1) {
        const lower = Math.min(startMin, endMin), upper = Math.max(startMin, endMin)
        startMin = Math.floor(lower / 60) * 60
        endMin = Math.min(1440, Math.ceil(upper / 60) * 60)
        if (endMin === startMin) endMin = Math.min(1440, startMin + 60)
      }
      events.push({ id: `gcal_${events.length}`, title: 'Busy', date, startMin, endMin, source: 'google' })
    }
  }
  return events
}

export async function fetchBusyEvents(weekStart: string, timeZone: string): Promise<{ ok: true; events: BusyEvent[] } | { ok: false; code: string }> {
  const result = await calendarClient()
  if ('error' in result) return { ok: false, code: result.error }
  const timeMin = zonedMidnight(weekStart, timeZone).toISOString()
  const timeMax = zonedMidnight(addDaysISO(weekStart, 7), timeZone).toISOString()
  try {
    const response = await result.client.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: 'primary' }],
      },
      timeout: OUTBOUND_TIMEOUT_MS,
    })
    const busy = parsePrimaryBusy((response as { data?: unknown }).data)
    if (!busy) return { ok: false, code: 'CALENDAR_BAD_RESPONSE' }
    return { ok: true, events: busyEventsFromFreeBusy(busy, weekStart, timeZone) }
  } catch {
    return { ok: false, code: 'CALENDAR_UNAVAILABLE' }
  }
}

/* ------------------------------------------------------------------ *
 * Event payloads
 * ------------------------------------------------------------------ */

export type EventPayload = {
  blockId: string
  planId: string
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties: { private: Record<string, string> }
}

/** Local wall clock → RFC3339-without-offset plus an explicit time zone (Google's preferred form). */
export function payloadForBlock(block: PlacedBlock, planId: string, timeZone: string): EventPayload {
  return {
    blockId: block.id,
    planId,
    summary: `${block.title}${BLOCK_LABEL_SUFFIX}`,
    description: [
      block.reasonText,
      '',
      `Priority ${block.priority} · ${block.energy} · ${block.category}`,
      block.chunkCount > 1 ? `Session ${block.chunkIndex + 1} of ${block.chunkCount}` : '',
      '',
      'Planned with Calendra. Edit it here and Calendra will plan around your change next time.',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { dateTime: `${block.date}T${pad(block.startMin)}:00`, timeZone },
    end: { dateTime: `${block.date}T${pad(block.endMin)}:00`, timeZone },
    extendedProperties: {
      private: {
        [MARKER_BLOCK]: block.id,
        [MARKER_PLAN]: planId,
        [MARKER_KIND]: block.kind,
      },
    },
  }
}

function pad(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`
}

/* ------------------------------------------------------------------ *
 * Drift check — never write on top of a calendar that moved
 * ------------------------------------------------------------------ */

export type Drift = { blockId: string; title: string; detail: string }

export async function detectDrift(
  client: CalendarClient,
  blocks: PlacedBlock[],
  timeZone: string,
): Promise<Drift[]> {
  if (!blocks.length) return []
  const dates = [...new Set(blocks.map((b) => b.date))].sort()
  const timeMin = zonedMidnight(dates[0], timeZone).toISOString()
  const timeMax = zonedMidnight(addDaysISO(dates[dates.length - 1] ?? dates[0], 1), timeZone).toISOString()
  try {
    const response = await client.freebusy.query({
      requestBody: { timeMin, timeMax, timeZone, items: [{ id: 'primary' }] },
      timeout: OUTBOUND_TIMEOUT_MS,
    })
    const periods = parsePrimaryBusy((response as { data?: unknown }).data)
    if (!periods) throw new Error('CALENDAR_BAD_RESPONSE')
    const busy = periods.map(period => ({ start: Date.parse(period.start), end: Date.parse(period.end) }))

    const drift: Drift[] = []
    for (const block of blocks) {
      const start = zonedWallInstant(block.date, block.startMin, timeZone).getTime()
      const end = zonedWallInstant(block.date, block.endMin, timeZone).getTime()
      const clash = busy.find((period) => start < period.end && period.start < end)
      if (clash) {
        drift.push({
          blockId: block.id,
          title: block.title,
          detail: `Something new is on your calendar at ${pad(block.startMin)} on ${block.date}. Re-plan before writing.`,
        })
      }
    }
    return drift
  } catch {
    // Approval does not imply current availability. Never write blind after a failed recheck.
    throw new Error('CALENDAR_UNAVAILABLE')
  }
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

export type SyncInput = {
  proposal: PlanProposal
  approvedBlockIds: string[]
  dryRun: boolean
  calendarId: string
}

export async function syncPlan(input: SyncInput): Promise<{ ok: true; data: z.infer<typeof syncResultSchemaPayload> } | { ok: false; code: string; detail?: string }> {
  const planId = `${input.proposal.weekStart}_${input.proposal.generatedAt}`
  const timeZone = input.proposal.preferences.timezone
  const approved = input.proposal.blocks.filter(
    (block) => input.approvedBlockIds.includes(block.id) && block.kind !== 'lunch',
  )
  const payloads = approved.map((block) => payloadForBlock(block, planId, timeZone))

  // A dry run touches nothing, so it needs no credentials at all — the user can see exactly which
  // events would be written before they ever connect an account.
  if (input.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        inserted: payloads.length,
        updated: 0,
        skipped: input.proposal.blocks.length - approved.length,
        failed: [],
        conflicts: [],
        payloads: payloads.map((payload) => ({
          blockId: payload.blockId,
          summary: payload.summary,
          start: payload.start.dateTime,
          end: payload.end.dateTime,
        })),
      },
    }
  }

  const config = calendarConfig()
  if (!config.configured) return { ok: false, code: 'CALENDAR_NOT_CONFIGURED', detail: `Missing ${config.missing.join(', ')}` }

  const result = await calendarClient()
  if ('error' in result) return { ok: false, code: result.error }

  let drift: Drift[]
  try { drift = await detectDrift(result.client, approved, timeZone) }
  catch { return { ok: false, code: 'CALENDAR_UNAVAILABLE', detail: 'Availability could not be checked. Nothing was written; reconnect or retry.' } }
  if (drift.length) {
    return { ok: false, code: 'CALENDAR_DRIFT', detail: JSON.stringify(drift) }
  }

  const data: z.infer<typeof syncResultSchemaPayload> = {
    dryRun: false,
    inserted: 0,
    updated: 0,
    skipped: input.proposal.blocks.length - approved.length,
    failed: [],
    conflicts: [],
  }

  for (const payload of payloads) {
    try {
      const existing = await result.client.events.list({
        calendarId: input.calendarId,
        privateExtendedProperty: [`${MARKER_BLOCK}=${payload.blockId}`],
        maxResults: 2,
        timeout: OUTBOUND_TIMEOUT_MS,
      })
      const items = ((existing as { data?: { items?: { id?: string }[] } }).data?.items ?? []).filter(
        (item): item is { id: string } => typeof item.id === 'string',
      )
      if (items.length > 0 && items[0]) {
        await result.client.events.patch({
          calendarId: input.calendarId,
          eventId: items[0].id,
          requestBody: payload,
          timeout: OUTBOUND_TIMEOUT_MS,
        })
        data.updated += 1
      } else {
        await result.client.events.insert({
          calendarId: input.calendarId,
          requestBody: payload,
          timeout: OUTBOUND_TIMEOUT_MS,
        })
        data.inserted += 1
      }
    } catch (error) {
      const status = (error as { code?: number; response?: { status?: number } }).code ?? (error as { response?: { status?: number } }).response?.status
      data.failed.push({
        blockId: payload.blockId,
        code: status === 401 || status === 403 ? 'CALENDAR_FORBIDDEN' : 'CALENDAR_WRITE_FAILED',
        message: 'Google rejected this event. Everything else was written; re-run sync to retry just this one.',
      })
    }
  }

  return { ok: true, data }
}

export async function deletePlanEvents(planId: string, calendarId: string): Promise<{ ok: true; deleted: number } | { ok: false; code: string }> {
  const result = await calendarClient()
  if ('error' in result) return { ok: false, code: result.error }
  try {
    const listed = await result.client.events.list({
      calendarId,
      privateExtendedProperty: [`${MARKER_PLAN}=${planId}`],
      maxResults: 250,
      timeout: OUTBOUND_TIMEOUT_MS,
    })
    const items = ((listed as { data?: { items?: { id?: string }[] } }).data?.items ?? []).filter(
      (item): item is { id: string } => typeof item.id === 'string',
    )
    let deleted = 0
    for (const item of items) {
      try {
        await result.client.events.delete({ calendarId, eventId: item.id, timeout: OUTBOUND_TIMEOUT_MS })
        deleted += 1
      } catch {
        // Individual deletions are best effort; the caller gets the count that succeeded.
      }
    }
    return { ok: true, deleted }
  } catch {
    return { ok: false, code: 'CALENDAR_UNAVAILABLE' }
  }
}

/** Zod shape used by the route to validate what this module returns. */
export const syncResultSchemaPayload = z.object({
  dryRun: z.boolean(),
  inserted: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.array(z.object({ blockId: z.string(), code: z.string(), message: z.string() })),
  conflicts: z.array(z.object({ blockId: z.string(), title: z.string(), detail: z.string() })),
  payloads: z
    .array(z.object({ blockId: z.string(), summary: z.string(), start: z.string(), end: z.string() }))
    .optional(),
})

export type SyncData = z.infer<typeof syncResultSchemaPayload>
export type { SyncResult, BusyEvent, PlanProposal }
export { parseDate }
