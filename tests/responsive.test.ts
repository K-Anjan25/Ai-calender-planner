import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { walkSource } from './harness/walk'

/**
 * Narrow-viewport containment (DESIGN.md §8b).
 *
 * The reported bug was "text overflows" — text escaping its card on a phone. There is no layout engine
 * in this test environment (no Chromium, and jsdom reports scrollWidth 0), so a rendered-width
 * assertion would be a lie dressed as a test. What *can* be checked is the two mechanisms that cause
 * the bug in the first place, since both are visible in the source:
 *
 *  1. A long unbreakable token cannot wrap unless `overflow-wrap` allows it — so the global guard in
 *     `globals.css` must exist, and must still target the elements text actually lives in.
 *  2. A deliberately wide child (`min-w-[720px]` for a data table) is fine *only* when an ancestor
 *     scrolls it. These are meant to be wide; what breaks the page is one that escapes its box.
 *
 * It cannot prove a page looks right at 320px. It can prove the guard is still installed and that no
 * new uncontained wide element has appeared, which is the shape this bug actually takes.
 */

const ROOT = join(import.meta.dirname, '..')
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

/** Sources that render UI. Tests, docs and scripts cannot cause a layout overflow. */
const UI_SOURCES = walkSource(join(ROOT, 'src'), (p) => p.endsWith('.tsx') || p.endsWith('.ts'))

describe('the overflow guard is installed', () => {
  it('lets long tokens break in every element that holds text', () => {
    const guard = CSS.replace(/\s+/g, ' ').match(/:where\(\s*h1, h2, h3, h4, p, li, dd, dt, td, th, span, a, code, strong, em, figcaption\s*\)\s*\{([^}]*)\}/)
    assert.ok(guard, 'the :where(…) text guard is gone from globals.css')
    assert.match(guard[1], /overflow-wrap:\s*break-word/, 'the text guard no longer breaks words')
    assert.match(guard[1], /word-break:\s*normal/, 'word-break was changed; break-all mangles ordinary prose')
  })

  it('caps replaced elements at their container width', () => {
    const guard = CSS.match(/:where\(img, svg, video, canvas, table, pre\)\s*\{([^}]*)\}/)
    assert.ok(guard, 'the :where(…) media guard is gone from globals.css')
    assert.match(guard[1], /max-width:\s*100%/)
  })

  it('does not hide overflow instead of fixing it', () => {
    // `overflow-x: hidden` on the root would make every overflow bug invisible rather than absent —
    // the page would still be wrong, it would just be clipped silently.
    assert.doesNotMatch(CSS, /html\s*\{[^}]*overflow-x:\s*hidden/, 'overflow was clipped at the root instead of contained')
    assert.doesNotMatch(CSS, /body\s*\{[^}]*overflow-x:\s*hidden/, 'overflow was clipped on the body instead of contained')
  })
})

describe('wide elements are contained, not escaped', () => {
  /** `min-w-[720px]`, `w-[840px]`, `min-w-[1100px]` — anything forcing a floor wider than a phone. */
  // `max-w-` is a ceiling, not a floor — only `w-` and `min-w-` can force a container wider.
  const WIDE = /(?<!max-)(?:min-)?w-\[(\d{3,4})px\]/g

  it('every fixed width wider than a phone sits inside a scroll container', () => {
    const offenders: string[] = []

    for (const file of UI_SOURCES) {
      const source = readFileSync(file, 'utf8')
      const lines = source.split('\n')

      for (const match of source.matchAll(WIDE)) {
        if (Number(match[1]) <= 320) continue

        // Find the line the class is on, then look upwards for the ancestor that must scroll it.
        const index = source.slice(0, match.index).split('\n').length - 1
        const scope = lines.slice(Math.max(0, index - 12), index + 1).join('\n')
        if (/overflow-x-auto|overflow-auto/.test(scope)) continue

        offenders.push(`${relative(ROOT, file)}:${index + 1} → ${match[0]} without an overflow-x-auto ancestor`)
      }
    }

    assert.deepEqual(offenders, [], `wide element(s) can escape their container:\n${offenders.join('\n')}`)
  })

  it('scans the real source tree', () => {
    // A silent failure of the walker would turn the check above into a no-op.
    assert.ok(UI_SOURCES.length > 20, `only ${UI_SOURCES.length} UI sources found — the walker is not seeing the app`)
    assert.ok(
      UI_SOURCES.some((p) => p.endsWith('src/app/docs/page.tsx')),
      'the docs page, which owns the one legitimately wide table, was not scanned',
    )
  })
})
