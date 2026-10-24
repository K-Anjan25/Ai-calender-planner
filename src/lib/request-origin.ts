/**
 * The public origin of the running deployment, taken from the request.
 *
 * Google requires the `redirect_uri` sent to the authorisation endpoint to **exactly** match one
 * registered on the OAuth client, and it must be the host the browser can actually reach. A
 * hardcoded `http://localhost:3000` default is therefore wrong for every deployed instance: the
 * browser is sent back to the developer's machine, and the deployment's sign-in fails with
 * `redirect_uri_mismatch` even though the client id and secret are correct.
 *
 * Resolving from the request makes one OAuth client work on localhost, on a preview deployment and
 * on a custom domain with no extra configuration — each host simply has to be registered, which it
 * already has to be.
 *
 * `AUTH_REDIRECT_URI` / `GOOGLE_REDIRECT_URI` still take precedence, for the cases where the public
 * origin genuinely differs from the one the request arrived on (a proxy that rewrites Host, a
 * tunnel, a custom domain in front of a preview).
 */

/** Vercel, and most proxies, put the original host here; it can be a comma-separated chain. */
function forwarded(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first && first.length > 0 ? first : null
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = forwarded(request.headers, 'x-forwarded-host') ?? forwarded(request.headers, 'host') ?? url.host
  const proto =
    forwarded(request.headers, 'x-forwarded-proto') ??
    (url.protocol ? url.protocol.replace(':', '') : 'https')
  return `${proto}://${host}`
}

/**
 * The origin used when there is no request to read — a unit test, a build, or a documentation page
 * rendering the environment matrix. It is deliberately obvious rather than plausible: a value that
 * looks real in a table is a value nobody checks.
 */
export const FALLBACK_ORIGIN = 'http://localhost:3000'

/* ------------------------------------------------------------------ *
 * Is this origin a redirect target Google will actually accept?
 * ------------------------------------------------------------------ */

/**
 * Google rejects a `redirect_uri` that is not a registrable public host. Loopback is the documented
 * exception; everything else needs a dot and a real TLD.
 *
 * The failure that matters here is a **private network address**. Next prints one in its dev banner
 * (`Network: http://192.168.1.2:3000`), so it is the natural thing to open when you want to try the
 * app on your phone — and Google answers with
 *
 *     device_id and device_name are required for private IP: http://192.168.1.2:3000/api/auth/callback
 *     Error 400: invalid_request
 *
 * which is Google's limited-input-device flow asking for parameters this app has no reason to send.
 * Nothing is wrong with the code; the address simply cannot be a redirect target. Left alone, that
 * error page gives the user no way to work out why, so the app checks first and explains (RULES L9).
 */
export type OriginProblem = { host: string; reason: 'private-network' | 'not-public' }

const LOOPBACK = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|::1)$/i
const PRIVATE_V4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})$/
const ANY_V4 = /^\d{1,3}(\.\d{1,3}){3}$/
const LOCAL_TLD = /\.(local|localhost|internal|test|example|invalid)$/i

export function googleOriginProblem(origin: string): OriginProblem | null {
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return { host: origin, reason: 'not-public' }
  }

  if (LOOPBACK.test(host)) return null
  if (PRIVATE_V4.test(host)) return { host, reason: 'private-network' }
  // Any other bare IP: it has no TLD, and Google will not take it as a redirect target either.
  if (ANY_V4.test(host)) return { host, reason: 'not-public' }
  if (!host.includes('.')) return { host, reason: 'not-public' }
  if (LOCAL_TLD.test(host)) return { host, reason: 'not-public' }
  return null
}
