import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

it('auth panels rely on the site header instead of repeating its wordmark', () => {
  const panel = readFileSync('src/components/site/AuthPanel.tsx', 'utf8')
  assert.equal(panel.includes('CalendraLogo'), false)
  assert.equal(panel.includes('across devices'), true, 'storage limitation must remain explicit')
  assert.equal(panel.includes('not synced across devices'), true)
})

it('removes the requested landing caption', () => {
  assert.equal(readFileSync('src/app/page.tsx', 'utf8').includes('Every layer below is a real constraint'), false)
})

it('ships a calendar SVG and a matching PNG-backed ICO rather than the starter favicon', () => {
  const svg = readFileSync('src/app/icon.svg', 'utf8')
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(svg, /aria-label="Calendra"/)
  assert.match(svg, /#276a65/)
  const ico = readFileSync('src/app/favicon.ico')
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 1)
  assert.equal(ico.readUInt32LE(14), ico.length - 22)
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a')
})
