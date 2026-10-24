import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

const source = readFileSync('src/components/landing/Landing.jsx', 'utf8')
const css = readFileSync('src/components/landing/site.module.css', 'utf8')

it('groups the brand and tagline without adding visible desktop navigation', () => {
  assert.match(source, /className=\{s\.brandGroup\}/)
  assert.match(css, /\.brandGroup\s*\{[^}]*display:\s*flex/s)
  assert.match(source, /aria-controls="navigation-dialog"/)
})

it('fits the hero preview without horizontal scroll and offers a compact mobile agenda', () => {
  assert.match(
    css,
    /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  )
  assert.match(css, /\.calendarScroll\s*\{[^}]*overflow:\s*visible/s)
  assert.ok(!css.includes('min-width: 602px'))
  assert.match(source, /className=\{s\.weekAgenda\}/)
  assert.ok(!source.includes('data-depth'))
})

it('uses the shared primary CTA for the floating action and a consistent control radius', () => {
  assert.match(source, /<LinkButton className=\{s\.stickyCTA\}[^>]*>/)
  assert.match(
    css,
    /\.button,\s*\.stickyCTA,\s*\.backTop\s*\{\s*border-radius:\s*var\(--radius-cut-sm\)/s,
  )
  assert.match(css, /\.backTop\s*\{\s*width:\s*44px;\s*height:\s*44px;/s)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

it('gives contact and newsletter inputs explicit visible geometry and contrast', () => {
  assert.match(css, /border:\s*2px solid var\(--color-ink\)/)
  assert.match(css, /min-height:\s*48px/)
  assert.match(css, /font-size:\s*16px/)
  assert.match(css, /\.inputRow input\s*\{[^}]*width:\s*100%/s)
  assert.match(source, /aria-busy=\{busy\}/)
})

it('protects FAQs and pricing from floating controls and gives question text its own wrap track', () => {
  assert.match(source, /data-bottom-cta/)
  assert.ok(!source.includes('data-sticky-cta'))
  assert.match(source, /className=\{s\.faqQuestion\}/)
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\) 20px/)
  assert.match(css, /\.faqQuestion\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(css, /padding-block:\s*clamp\(64px,\s*7vw,\s*96px\)/)
})

it('keeps the bottom action bar in flow and anchors the header inside a bounded surface', () => {
  assert.match(source, /className=\{s\.actionBar\}/)
  assert.match(
    css,
    /\.actionBar \.stickyCTA,\s*\.actionBar \.backTop\s*\{[^}]*position:\s*static/s,
  )
  assert.match(css, /\.headerInner\s*\{[^}]*max-width:\s*1120px/s)
  assert.match(source, /onClickCapture=\{followAnchor\}/)
  assert.match(source, /target\.scrollIntoView/)
  assert.match(css, /\.footer a\s*\{[^}]*min-height:\s*44px/s)
})

it('uses uniform pricing cards with shared tracks and in-flow product visuals', () => {
  assert.ok(!source.includes('s.featured'))
  assert.match(css, /grid-template-rows:\s*subgrid/)
  assert.match(css, /grid-row:\s*span 7/)
  assert.match(source, /data-plan=\{p.name\}/)
  assert.match(css, /\.floatingNote\s*\{[^}]*position:\s*static/s)
  assert.match(source, /role="figure"\s+aria-label="Illustrative task intake"/)
  assert.match(css, /margin-bottom:\s*clamp\(48px,\s*5vw,\s*72px\)/)
})


it('embeds a real Hyderabad map and keeps direct map links available', () => {
  assert.match(source, /<iframe\s+title="Map of Hyderabad, India"/)
  assert.match(source, /src="https:\/\/www\.google\.com\/maps\?q=/)
  assert.match(source, /loading="lazy"\s+referrerPolicy="no-referrer"/)
  assert.match(source, /aria-label="Open Hyderabad location map \(new tab\)"/)
  assert.ok(!source.includes('Decorative location illustration'))
  assert.match(css, /\.map iframe\s*\{[^}]*width:\s*100%/s)
})


it('keeps a real footer map at the original compact locator size', () => {
  assert.match(source, /title="Map of Hyderabad in the footer"/)
  assert.equal((source.match(/output=embed/g) ?? []).length, 2)
  assert.ok(!source.includes('openstreetmap.org'))
  assert.match(css, /\.tinyMap iframe\s*\{[^}]*height:\s*100%/s)
  assert.match(css, /\.tinyMap\s*\{\s*height:\s*110px/s)
  assert.doesNotMatch(css, /\.footer \.tinyMap\s*\{[^}]*height:\s*220px/s)
})
