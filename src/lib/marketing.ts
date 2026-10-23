import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requestOrigin } from '@/lib/request-origin'

const email = z.string().trim().email().max(254)
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  message: z.string().trim().min(15).max(4000),
  consent: z.literal('on'),
})
export const newsletterSchema = z.object({ email })

// Warm-instance protection only; use an edge/distributed limiter for global enforcement.
const attempts = new Map<string, { count: number; expires: number }>()
function permitted(key: string) {
  const now = Date.now()
  for (const [k, value] of attempts)
    if (value.expires <= now) attempts.delete(k)
  if (attempts.size >= 5000 && !attempts.has(key)) return false
  const previous = attempts.get(key) ?? { count: 0, expires: now + 60_000 }
  previous.count += 1
  attempts.set(key, previous)
  return previous.count <= 5
}

/** Browser posts to a same-origin handler; only the server knows the delivery URL/token.
 * Delivery is optional. Missing configuration returns 503, never a fabricated acceptance.
 * The configured receiver must persist/process data and return 2xx only after acceptance.
 */
export async function submitMarketing(
  request: Request,
  kind: 'contact' | 'newsletter',
) {
  const headers = { 'Cache-Control': 'no-store' }
  const error = (status: number) =>
    NextResponse.json({ ok: false }, { status, headers })
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== requestOrigin(request)
  )
    return error(403)
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return error(415)
  const address =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!permitted(`${kind}:${address}`)) return error(429)
  // Enforce the byte budget while reading, including requests without Content-Length.
  const reader = request.body?.getReader()
  if (!reader) return error(400)
  let body = '',
    bytes = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 8192) {
        await reader.cancel()
        return error(413)
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return error(400)
    }
    const parsed = (
      kind === 'contact' ? contactSchema : newsletterSchema
    ).safeParse(payload)
    if (!parsed.success) return error(400)
    const destination =
      process.env[
        kind === 'contact' ? 'CONTACT_WEBHOOK_URL' : 'NEWSLETTER_WEBHOOK_URL'
      ]?.trim()
    if (!destination) return error(503)
    const url = new URL(destination)
    if (url.protocol !== 'https:' || url.username || url.password)
      return error(503)
    const token = process.env.MARKETING_WEBHOOK_TOKEN?.trim()
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind, ...parsed.data }),
    })
    if (!response.ok) return error(502)
    return NextResponse.json({ ok: true }, { status: 202, headers })
  } catch {
    // Deliberately do not log personal data, delivery credentials or provider responses.
    return error(body ? 502 : 400)
  } finally {
    reader.releaseLock()
  }
}
