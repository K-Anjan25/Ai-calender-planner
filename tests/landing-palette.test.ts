import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

const theme = readFileSync('src/app/globals.css', 'utf8')
const css = readFileSync('src/components/landing/site.module.css', 'utf8')
function token(name: string) {
  const color = theme.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'),
  )?.[1]
  assert.ok(color, `${name} must be sourced from the original design tokens`)
  return color
}
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
function contrast(a: string, b: string) {
  const values = [luminance(token(a)), luminance(token(b))].sort(
    (a, b) => b - a,
  )
  return (values[0] + 0.05) / (values[1] + 0.05)
}

it('uses the original logo and shared palette, not an independent forest-green brand', () => {
  const source = readFileSync('src/components/landing/Landing.jsx', 'utf8')
  assert.match(
    source,
    /import \{ CalendraLogo \} from '@\/components\/paper\/CalendraMark'/,
  )
  assert.match(source, /<CalendraLogo size=\{32\}/)
  for (const name of [
    'paper-cream',
    'paper-sand',
    'ink',
    'teal-deep',
    'olive-light',
    'terracotta-light',
  ]) {
    assert.ok(css.includes(`var(--color-${name})`))
  }
  assert.ok(!css.includes('#1c3028'))
})
it('keeps the key body-text, button and event color pairs above AA normal-text contrast', () => {
  // Numeric pair audit, not a claim of complete browser/WCAG conformance.
  for (const [foreground, background] of [
    ['ink-soft', 'paper-cream'],
    ['ink-soft', 'paper-sand'],
    ['teal-deep', 'paper-cream'],
    ['paper-ivory', 'teal-deep'],
    ['ink', 'teal-light'],
    ['ink', 'olive-light'],
    ['ink', 'terracotta-light'],
    ['terracotta-deep', 'paper-ivory'],
  ])
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} on ${background} falls below 4.5:1`,
    )
})
