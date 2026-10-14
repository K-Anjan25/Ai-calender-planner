import type { ChatResponse, PlanResponse, SyncResult } from '@/lib/types'

/**
 * Typed client for our own API routes.
 *
 * Every route returns the same envelope — `{ ok: true, data }` or `{ ok: false, error }` — so the UI
 * can switch on stable error *codes* rather than on message text (RULES.md §9).
 */

export type ApiError = { code: string; message: string; detail?: unknown }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

const TIMEOUT_MS = 25_000

async function request<T>(url: string, init: RequestInit, timeout = TIMEOUT_MS): Promise<ApiResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    const payload = (await response.json().catch(() => null)) as ApiResult<T> | null
    if (!payload) {
      return { ok: false, error: { code: 'BAD_RESPONSE', message: 'The server sent something unreadable.' } }
    }
    return payload
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: { code: 'TIMEOUT', message: 'That took too long. Try again — or switch to the local engine, which is instant.' } }
    }
    return { ok: false, error: { code: 'NETWORK', message: 'Could not reach the planner. Check your connection and try again.' } }
  } finally {
    clearTimeout(timer)
  }
}

export function postPlan(body: unknown): Promise<ApiResult<PlanResponse['data']>> {
  return request<PlanResponse['data']>('/api/plan', { method: 'POST', body: JSON.stringify(body) }, 30_000)
}

export function postChat(body: unknown): Promise<ApiResult<ChatResponse['data']>> {
  return request<ChatResponse['data']>('/api/chat', { method: 'POST', body: JSON.stringify(body) }, 30_000)
}

export function postSync(body: unknown): Promise<ApiResult<SyncResult['data']>> {
  return request<SyncResult['data']>('/api/calendar/sync', { method: 'POST', body: JSON.stringify(body) }, 30_000)
}

export function getCalendarStatus(): Promise<ApiResult<{ configured: boolean; connected: boolean; scopes: string[] }>> {
  return request('/api/calendar/sync', { method: 'GET' })
}

export function getHealth(): Promise<
  ApiResult<{
    demoMode: boolean
    agent: { mode: 'agent' | 'local'; provider: string; model: string; reason?: string }
    calendar: { configured: boolean; connected: boolean; missing: string[] }
    features: Record<string, boolean>
  }>
> {
  return request('/api/health', { method: 'GET' }, 8000)
}

export function deletePlanEvents(planId: string): Promise<ApiResult<{ deleted: number; disconnected: boolean }>> {
  return request(`/api/calendar/sync?planId=${encodeURIComponent(planId)}`, { method: 'DELETE' })
}

export function calendarAuthUrl(): string {
  return '/api/calendar/auth'
}
