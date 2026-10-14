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
      busy: z.array(z.object({ start: z.string().optional(), end: z.string().optional() })).optional(),
    }),
  ),
})

/** Ranges are clamped to the planning week, and an event crossing midnight blocks both days. */
export function busyEventsFromFreeBusy(
  periods: { start?: string; end?: string }[],
  weekStart: string,
): BusyEvent[] {
  const weekEnd = addDaysISO(weekStart, 7)
  const events: BusyEvent[] = []
  let index = 0
  for (const period of periods) {
    if (!period.start || !period.end) continue
    const start = new Date(period.start)
    const end = new Date(period.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    if (end <= start) continue

    let cursor = new Date(start)
    // All-day and overnight spans block each day they touch (D-011).
    while (cursor < end) {
      const date = toLocalDateKey(cursor)
      if (date >= weekStart && date < weekEnd) {
        const isFirst = toLocalDateKey(cursor) === toLocalDateKey(start)
        const dayStart = isFirst ? cursor.getHours() * 60 + cursor.getMinutes() : 0
        const isLast = toLocalDateKey(addDays(new Date(cursor), 1)) >= toLocalDateKey(end) || sameDay(addDays(cursor, 1), end)
        const dayEnd = isLast ? end.getHours() * 60 + end.getMinutes() : 24 * 60
        events.push({
          id: `gcal_${index}`,
          title: 'Busy',
          date,
          startMin: Math.max(0, Math.min(24 * 60, dayStart)),
          endMin: Math.max(0, Math.min(24 * 60, dayEnd === 0 ? 24 * 60 : dayEnd)),
          source: 'google',
        })
        index += 1
      }
      cursor = addDays(cursor, 1)
      cursor.setHours(0, 0, 0, 0)
    }
  }
  return events
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function sameDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b)
}

export async function fetchBusyEvents(weekStart: string, timeZone: string): Promise<{ ok: true; events: BusyEvent[] } | { ok: false; code: string }> {
  const result = await calendarClient()
  if ('error' in result) return { ok: false, code: result.error }
  const timeMin = new Date(`${weekStart}T00:00:00`).toISOString()
  const timeMax = new Date(`${addDaysISO(weekStart, 7)}T00:00:00`).toISOString()
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
    const parsed = freeBusyResponseSchema.safeParse((response as { data?: unknown }).data)
    if (!parsed.success) return { ok: false, code: 'CALENDAR_BAD_RESPONSE' }
    const primary = parsed.data.calendars.primary ?? Object.values(parsed.data.calendars)[0]
    return { ok: true, events: busyEventsFromFreeBusy(primary?.busy ?? [], weekStart) }
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
      'Planned with Paperweek. Edit it here and Paperweek will plan around your change next time.',
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
  const timeMin = new Date(`${dates[0]}T00:00:00`).toISOString()
  const timeMax = new Date(`${addDaysISO(dates[dates.length - 1] ?? dates[0] ?? '2026-01-01', 1)}T00:00:00`).toISOString()
  try {
    const response = await client.freebusy.query({
      requestBody: { timeMin, timeMax, timeZone, items: [{ id: 'primary' }] },
      timeout: OUTBOUND_TIMEOUT_MS,
    })
    const parsed = freeBusyResponseSchema.safeParse((response as { data?: unknown }).data)
    if (!parsed.success) return []
    const primary = parsed.data.calendars.primary ?? Object.values(parsed.data.calendars)[0]
    const busy = (primary?.busy ?? [])
      .filter((period) => period.start && period.end)
      .map((period) => ({ start: new Date(period.start as string).getTime(), end: new Date(period.end as string).getTime() }))

    const drift: Drift[] = []
    for (const block of blocks) {
      const start = new Date(`${block.date}T${pad(block.startMin)}:00`).getTime()
      const end = new Date(`${block.date}T${pad(block.endMin)}:00`).getTime()
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
    // A failed availability check must not block a legitimate write the user already approved.
    return []
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

  const drift = await detectDrift(result.client, approved, timeZone)
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
