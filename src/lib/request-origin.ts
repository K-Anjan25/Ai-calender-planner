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
