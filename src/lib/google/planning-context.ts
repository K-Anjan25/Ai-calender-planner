import type { BusyEvent } from '@/lib/types'
import { fetchBusyEvents } from '@/lib/google/calendar'
import { isCalendarConfigured } from '@/lib/google/scopes'
import { readTokens } from '@/lib/google/oauth'

type Gateway = { connected(): Promise<boolean>; load: typeof fetchBusyEvents }
const gateway: Gateway = {
  connected: async () => isCalendarConfigured() && Boolean((await readTokens())?.refreshToken),
  load: fetchBusyEvents,
}
/** A connected calendar must be refreshed before planning, not merely at publish time. Fail closed. */
export async function planningBusy(weekStart: string, timezone: string, existing: BusyEvent[], source: Gateway = gateway) {
  if (!await source.connected()) return { ok: true as const, events: existing, notes: existing.some(event => event.source === 'google') ? ['Calendar is disconnected; cached busy times were used. Reconnect for current availability.'] : [] }
  const result = await source.load(weekStart, timezone)
  if (!result.ok) return { ok: false as const, code: result.code }
  // Connected users must not inherit fictitious demo meetings or stale Google snapshots.
  return { ok: true as const, events: [...existing.filter(event => event.source !== 'demo' && event.source !== 'google'), ...result.events], notes: [] }
}
