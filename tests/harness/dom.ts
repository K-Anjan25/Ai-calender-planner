/**
 * jsdom harness for the UI tests.
 *
 * There is no browser in the build sandbox, but there is jsdom — which is enough to *execute* the
 * planner's components and drive real pointer and keyboard events through React. The fetch stub is
 * deliberately not a mock: it calls the actual route handlers, so a drag in the DOM travels
 * component → store → `/api/plan` → agent → engine → proposal → back into the DOM.
 *
 * Geometry is shimmed because jsdom has no layout engine: `getBoundingClientRect()` returns zeros
 * and `clientWidth` is 0. `layoutFor()` hands each element the same rect the browser would compute
 * from tailwind classes (`HOUR_HEIGHT=112`, an hour gutter, seven equal day columns), which is what
 * makes the drag maths testable rather than imaginary.
 */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

/** Pixels per hour, mirroring `WeekGrid`'s export. Asserted against the real component in
 *  `ui.test.ts`, so a change to the grid's scale fails loudly instead of silently. */
export const HOUR_HEIGHT = 112

const DAY_GUTTER = 56
const DAY_WIDTH = 140
const STRIP_TOP = 40

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number; x: number; y: number }

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top }
}

/** The day strip's rect: the coordinate origin for every drag this harness performs. */
export const STRIP_RECT = rect(DAY_GUTTER, STRIP_TOP, DAY_WIDTH * 7, HOUR_HEIGHT * 24)

/** Where a block sits, given the strip's geometry. Mirrors `DayColumn`'s absolute positioning. */
export function blockRect(dayIndex: number, startMin: number, minutes: number, windowStart: number): Rect {
  return rect(
    DAY_GUTTER + dayIndex * DAY_WIDTH,
    STRIP_TOP + ((startMin - windowStart) / 60) * HOUR_HEIGHT,
    DAY_WIDTH,
    (minutes / 60) * HOUR_HEIGHT,
  )
}

/**
 * The display window a day column is drawn with, read back from the DOM. The grid labels each
 * column with its own window (working hours plus any shoulder it shows), so a test must ask rather
 * than assume — getting this wrong shifts every expected drop time.
 */
export function dayWindow(date: string): number {
  const column = document.querySelector(`[data-day-date="${date}"]`)
  assert(column, `no column for ${date}`)
  const value = Number(column.getAttribute('data-window-start'))
  assert(Number.isFinite(value), `column ${date} has no window start`)
  return value
}

/** Strip-relative Y for a wall-clock minute — the inverse of the drag maths under test. */
export function yFor(minute: number, windowStart: number): number {
  return STRIP_TOP + ((minute - windowStart) / 60) * HOUR_HEIGHT
}

/** Strip-relative X for the middle of a day column. */
export function xForDay(dayIndex: number): number {
  return DAY_GUTTER + dayIndex * DAY_WIDTH + DAY_WIDTH / 2
}

let installed = false

/** Install the DOM once per process; safe to call from every test file. */
export function installDom(): void {
  if (installed) return
  installed = true

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:3000/planner',
    pretendToBeVisual: true,
  })
  const { window } = dom
  const g = globalThis as unknown as Record<string, unknown>

  /** Node 22 makes some globals getter-only (`navigator`, `localStorage`), so define, don't assign. */
  const define = (name: string, value: unknown) => {
    try {
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    } catch {
      g[name] = value
    }
  }

  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    localStorage: window.localStorage,
    requestAnimationFrame: (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => window.clearTimeout(id),
    self: window,
    // React 19 reads this to decide whether it is in a client or server environment.
    IS_REACT_ACT_ENVIRONMENT: true,
    IS_REACT_SERVER_RENDERER: false,
  })) {
    define(name, value)
  }

  // jsdom ships no matchMedia / ResizeObserver / pointer capture; the design system asks for all
  // three (reduced-motion, rail measurement, drag capture).
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
  define('matchMedia', window.matchMedia)
  if (!g.ResizeObserver) {
    define('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  }
  const proto = window.Element.prototype as unknown as Record<string, unknown>
  for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
    if (!proto[method]) proto[method] = () => true
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {}
  }

  // Request bodies are never empty here: the store and the routes both send JSON.
  if (!globalThis.fetch) define('fetch', window.fetch?.bind(window))
}

/**
 * Route `fetch` to the real handlers. Anything not listed falls back to the previous fetch, so an
 * unstubbed call fails loudly instead of silently returning `undefined`.
 */
export function stubFetch(): void {
  const routes = [
    ['/api/plan', () => import('@/app/api/plan/route')],
    ['/api/chat', () => import('@/app/api/chat/route')],
    ['/api/health', () => import('@/app/api/health/route')],
    ['/api/calendar/sync', () => import('@/app/api/calendar/sync/route')],
    ['/api/export/ics', () => import('@/app/api/export/ics/route')],
    ['/api/auth/session', () => import('@/app/api/auth/session/route')],
    ['/api/auth/demo', () => import('@/app/api/auth/demo/route')],
    ['/api/auth/signout', () => import('@/app/api/auth/signout/route')],
  ] as const

  const original = globalThis.fetch
  const routed = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined)

    for (const [path, load] of routes) {
      if (!url.includes(path)) continue
      const routeModule = (await load()) as unknown as Record<string, (request: Request) => Promise<Response>>
      const handler = routeModule[method]
      if (!handler) continue
      const request = new Request(url.startsWith('http') ? url : `http://localhost:3000${url}`, {
        method,
        headers,
        body: body as BodyInit | undefined,
      })
      return handler(request)
    }

    // Calendar auth/callback read and write cookies through `next/headers`, which needs a real
    // request scope. Those two were verified over HTTP instead (see TASK.md, verification ledger).
    if (url.includes('/api/calendar/auth')) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'CALENDAR_NOT_CONFIGURED', message: 'Google Calendar is not configured on this deployment.' },
        }),
        { status: 501, headers: { 'content-type': 'application/json' } },
      )
    }

    if (!original) throw new Error(`No fetch stub for ${method} ${url}`)
    return original(input as RequestInfo, init)
  }

  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: routed })
}

/** Draw the fixed layout onto an element, the way a browser would from the tailwind classes. */
export function applyRect<T extends Element>(element: T, value: Rect): T {
  const target = element as unknown as Record<string, unknown>
  target.getBoundingClientRect = () => ({ ...value, toJSON: () => value })
  if (value.width) {
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: value.width })
  }
  return element
}

/**
 * A real `PointerEvent` — React's pointer plugin keys off the interface, so a `MouseEvent` with the
 * same type is delivered to the DOM but never reaches an `onPointerDown` handler.
 */
export function pointerEvent(type: string, x: number, y: number): Event {
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true }
  if (typeof window.PointerEvent === 'function') return new window.PointerEvent(type, init)
  return new MouseEvent(type, init)
}

/** One native event per call, so a test can flush React between them exactly as a browser would. */
export const pointerDown = (target: Element, point: { x: number; y: number }) =>
  target.dispatchEvent(pointerEvent('pointerdown', point.x, point.y))

export const pointerMove = (point: { x: number; y: number }) =>
  window.dispatchEvent(pointerEvent('pointermove', point.x, point.y))

export const pointerUp = (point: { x: number; y: number }) =>
  window.dispatchEvent(pointerEvent('pointerup', point.x, point.y))

/**
 * `next/link` requires an app-router context. There is no Next server in these tests, so a stub
 * router is supplied: enough for `<Link>` to render an anchor.
 */
export const routerStub = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => Promise.resolve(),
  hmrRefresh: () => {},
}
