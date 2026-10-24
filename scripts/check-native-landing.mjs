/** Exercise the native client component, rather than the archived HTML bundle. */
import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { JSDOM, VirtualConsole } from 'jsdom'
const result = await build({
  stdin: {
    contents:
      "import React from 'react';import{createRoot}from'react-dom/client';import Landing from './src/components/landing/Landing.jsx';createRoot(document.getElementById('root')).render(<Landing/>);",
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  outdir: 'out',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
})
const errors = [],
  console = new VirtualConsole()
console.on('jsdomError', (e) => errors.push(e.message))
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://calendra.example/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: console,
  beforeParse(w) {
    w.matchMedia = () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    })
    w.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    w.scrollTo = () => {}
    w.HTMLElement.prototype.scrollIntoView = () => {}
    w.HTMLCanvasElement.prototype.getContext = () => null
    w.HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    w.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
    // An unavailable delivery service must never yield a success message.
    w.fetch = async () => ({ ok: false, status: 503 })
  },
})
dom.window.eval(
  result.outputFiles.find((file) => file.path.endsWith('.js')).text,
)
const wait = () => new Promise((resolve) => setTimeout(resolve, 80))
const { document, Event } = dom.window
await wait()
assert.equal(document.querySelectorAll('h1').length, 1)
assert.equal(
  document.querySelectorAll('svg[aria-label="Calendra"]').length,
  3,
  'Header, drawer and footer must share the original calendar mark',
)
assert.ok(
  document.querySelector('nav a[href="#questions"]'),
  'Menu must include FAQs',
)
for (const label of ['Discuss Pro', 'Talk to us']) {
  const link = [...document.querySelectorAll('a')].find((a) =>
    a.textContent.includes(label),
  )
  assert.equal(link?.getAttribute('href'), '#contact')
}
for (const link of document.querySelectorAll('a[target="_blank"]')) {
  assert.ok(
    link.getAttribute('aria-label'),
    'External icon links must have accessible names',
  )
  assert.match(link.href, /^https:\/\//)
}

for (const id of ['product', 'plans', 'questions', 'contact'])
  assert.ok(document.getElementById(id))
assert.equal(
  document.querySelector('a[href="/planner"]').getAttribute('href'),
  '/planner',
)
document.querySelector('[aria-controls="navigation-dialog"]').click()
await wait()
assert.ok(document.querySelector('dialog').hasAttribute('open'))
document.querySelector('button[aria-label="Close navigation"]').click()
await wait()
assert.ok(!document.querySelector('dialog').hasAttribute('open'))
const question = document.querySelector('[aria-controls="answer-1"]')
question.click()
await wait()
assert.equal(question.getAttribute('aria-expanded'), 'true')
const form = document.querySelector('form[aria-label="Contact Calendra"]')
form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
await wait()
assert.equal(form.querySelectorAll('[aria-invalid="true"]').length, 4)
for (const [name, value] of [
  ['name', 'Test'],
  ['email', 'test@example.com'],
  ['message', 'Please help me organize my week.'],
])
  form.elements.namedItem(name).value = value
form.elements.namedItem('consent').checked = true
form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
await wait()
assert.match(form.textContent, /couldn’t send/)
assert.deepEqual(errors, [])
dom.window.close()
process.stdout.write(
  'PASS: native Next landing sections, dashboard CTA, menu, FAQ, contact validation and delivery failure.\n',
)
