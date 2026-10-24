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

it('preserves integer calendar columns with local scroll instead of scaling the preview', () => {
  assert.match(css, /width:\s*602px/)
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*112px\)/)
  assert.equal((602 - 20 * 2 - 2) / 5, 112)
  assert.match(css, /overflow-x:\s*auto/)
  assert.ok(!source.includes('data-depth'))
  assert.ok(!source.includes('translateY(${Math.min'))
  assert.match(source, /Math\.round\(top \* 3\.2\)/)
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
