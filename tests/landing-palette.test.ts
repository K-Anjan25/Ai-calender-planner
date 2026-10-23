import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
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

it('uses the original logo shape and shared palette tokens', () => {
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

it('restricts all live authored hex/RGB colors to the four supplied swatches', () => {
  const allowed = new Set(['005F73', '0A9396', 'EE9B00', 'FFF9F4'])
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`
      return entry.isDirectory()
        ? walk(path)
        : /\.(css|jsx|tsx|ts|svg)$/.test(path)
          ? [path]
          : []
    })
  for (const path of walk('src')) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/#([\da-f]{3,8})\b/gi)) {
      let color = match[1].toUpperCase()
      if (color.length === 3 || color.length === 4)
        color = [...color].map((c) => c + c).join('')
      assert.ok(
        allowed.has(color.slice(0, 6)),
        `${path}: off-palette ${match[0]}`,
      )
    }
    for (const match of source.matchAll(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g,
    )) {
      const color = [match[1], match[2], match[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
      assert.ok(allowed.has(color), `${path}: off-palette RGB ${match[0]}`)
    }
  }
  const rootColors = [
    ...theme.matchAll(/--color-[\w-]+:\s*#([\da-f]{6})/gi),
  ].map((m) => m[1].toUpperCase())
  assert.deepEqual(new Set(rootColors), allowed)
})

it('removes section index labels without deleting real calendar/statistics data', () => {
  const source = readFileSync('src/components/landing/Landing.jsx', 'utf8')
  assert.ok(!/0[1-9]\s*\/\s*[A-Z]/.test(source))
  assert.ok(!source.includes('01 — 05'))
  assert.ok(source.includes('MAKE SENSE OF THE MESS'))
  assert.ok(source.includes('KNOW YOUR LIMITS'))
})

it('does not mount or animate a hero particle canvas', () => {
  const source = readFileSync('src/components/landing/Landing.jsx', 'utf8')
  assert.ok(!source.includes('function Atmosphere'))
  assert.ok(!source.includes('<canvas'))
  assert.ok(!source.includes('particleColor'))
})

it('removes scenery, texture overlays and cut-edge decorations from the live application', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8')
  const footer = readFileSync('src/components/site/SiteFooter.tsx', 'utf8')
  const workspace = readFileSync('src/app/planner/workspace.tsx', 'utf8')
  for (const source of [layout, footer, workspace]) {
    assert.ok(!source.includes('DioramaScene'))
    assert.ok(!source.includes('<Grain'))
    assert.ok(!source.includes('<CutEdge'))
  }
  assert.ok(!theme.includes('.paper-grain'))
  assert.ok(!theme.includes('.paper-mat::before'))
  assert.ok(!theme.includes('.deckle-top'))
  assert.ok(!theme.includes('fractalNoise'))
  assert.ok(!css.includes('rotateY('))
  assert.ok(!css.includes('rotateZ('))
})

it('keeps every shared badge tone at AA normal-text contrast', () => {
  const controls = readFileSync(
    'src/components/paper/PaperControls.tsx',
    'utf8',
  )
  const tones = controls
    .split('const CHIP_TONE:')[1]
    .split('export function')[0]
  const pairs = [...tones.matchAll(/bg-([\w-]+) text-([\w-]+)/g)]
  assert.equal(pairs.length, 8)
  for (const [, background, foreground] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} badge on ${background} is low contrast`,
    )
  }
})
