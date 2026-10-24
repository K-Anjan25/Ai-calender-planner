import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

it('auth panels rely on the site header instead of repeating its wordmark', () => {
  const panel = readFileSync('src/components/site/AuthPanel.tsx', 'utf8')
  assert.equal(panel.includes('CalendraLogo'), false)
  assert.equal(
    panel.includes('across devices'),
    true,
    'storage limitation must remain explicit',
  )
  assert.equal(panel.includes('not synced across devices'), true)
})

it('removes the requested landing caption', () => {
  assert.equal(
    readFileSync('src/app/page.tsx', 'utf8').includes(
      'Every layer below is a real constraint',
    ),
    false,
  )
})

it('ships a calendar SVG and a matching PNG-backed ICO rather than the starter favicon', () => {
  const svg = readFileSync('src/app/icon.svg', 'utf8')
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(svg, /aria-label="Calendra"/)
  assert.match(svg, /#3770BF/)
  const ico = readFileSync('src/app/favicon.ico')
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 1)
  assert.equal(ico.readUInt32LE(14), ico.length - 22)
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a')
})

it('keeps internal docs off the public website and moves legal links to their own page', () => {
  const docs = readFileSync('src/app/docs/page.tsx', 'utf8')
  assert.match(docs, /notFound\(\)/)
  for (const file of [
    'src/components/site/SiteHeader.tsx',
    'src/components/site/SiteFooter.tsx',
    'src/components/site/AuthPanel.tsx',
  ]) {
    assert.equal(readFileSync(file, 'utf8').includes('/docs'), false, file)
  }
  assert.equal(docs.includes('MEMORY.md'), false)
  assert.equal(
    readFileSync('src/app/legal/page.tsx', 'utf8').includes('Privacy notice'),
    true,
  )
})

it('explicitly links a versioned PNG favicon and an Apple touch icon', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8')
  for (const name of ['calendra-icon-v9.png', 'calendra-apple-v9.png']) {
    assert.equal(layout.includes('/' + name), true)
    assert.equal(
      readFileSync('public/' + name)
        .subarray(0, 8)
        .toString('hex'),
      '89504e470d0a1a0a',
    )
  }
})

it('keeps implementation notes out of customer-facing auth and pricing copy', () => {
  const auth = readFileSync('src/components/site/AuthPanel.tsx', 'utf8')
  assert.equal(
    auth.includes('A real signed session with a clearly-labelled identity'),
    false,
  )
  assert.equal(
    auth.includes('a real signed session with a labelled identity'),
    false,
  )
  assert.equal(auth.includes('demo@calendra.local'), false)
  assert.equal(auth.includes('This deployment cannot see'), false)
  const pricing = readFileSync('src/components/landing/Landing.jsx', 'utf8')
  assert.equal(pricing.includes('Adding API keys alone'), false)
  assert.match(pricing, /enquiries only;\s+no\s+checkout or payment is taken/)
})
