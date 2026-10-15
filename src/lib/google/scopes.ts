/**
 * Google Calendar integration — scopes, capability probing and the marker that makes sync idempotent.
 *
 * Scopes are intentionally minimal (RULES.md §8): events plus free/busy. Anything broader needs a
 * PRD amendment before it appears here.
 */

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const

/** Private extended properties written on every event we create. */
export const MARKER_BLOCK = 'calendraBlockId'
export const MARKER_PLAN = 'calendraPlanId'
export const MARKER_KIND = 'calendraBlock'
export const BLOCK_LABEL_SUFFIX = ' · CAL'

export type CalendarConfig = {
  configured: boolean
  missing: string[]
  redirectUri: string
}

export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export function calendarConfig(): CalendarConfig {
  const clientId = readEnv('GOOGLE_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
  const redirectUri = readEnv('GOOGLE_REDIRECT_URI') ?? 'http://localhost:3000/api/calendar/callback'
  const missing: string[] = []
  if (!clientId) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  return { configured: missing.length === 0, missing, redirectUri }
}

export function isCalendarConfigured(): boolean {
  return calendarConfig().configured
}

export const TOKEN_COOKIE = 'calendra_gcal'
export const OAUTH_STATE_COOKIE = 'calendra_gcal_state'
