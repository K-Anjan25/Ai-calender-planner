import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

const css = readFileSync('src/app/globals.css', 'utf8')
const read = (path: string) => readFileSync(path, 'utf8')
it('uses one Bauhaus typography and square surface system across all application routes', () => {
  assert.match(css, /--font-display: 'DM Sans'/)
  assert.match(css, /--font-sans: 'DM Sans'/)
  for (const token of ['radius-cut', 'radius-cut-sm', 'radius-cut-xs', 'radius-well']) assert.match(css, new RegExp(`--${token}: 0px`))
  assert.ok(!read('src/app/layout.tsx').includes('family=Fraunces'))
  for (const route of ['signin', 'signup', 'legal']) {
    const source = read(`src/app/${route}/page.tsx`)
    assert.ok(source.includes('<SiteHeader'))
    assert.ok(source.includes('<SiteFooter'))
    assert.ok(source.includes('id="page-content"'))
  }
})
it('keeps account actions honest and available through accessible mobile navigation', () => {
  const header = read('src/components/site/SiteHeader.tsx')
  for (const text of ['showModal()', 'onCancel=', 'toggle.current?.focus()', 'aria-expanded={open}', 'aria-controls="site-menu"', 'user.provider ===', 'void leave()']) assert.ok(header.includes(text), text)
  assert.ok(!header.includes('(demo)')) // Google unavailability must not mislabel a private deployment.
  assert.match(css, /\.bauhaus-sign-in\s*\{\s*white-space:\s*nowrap/)
})
it('includes branded not-found, loading and retry screens without exposing error details', () => {
  assert.ok(read('src/app/not-found.tsx').includes('Not on'))
  assert.ok(read('src/components/site/PageLoading.tsx').includes('role="status"'))
  const error = read('src/app/error.tsx')
  assert.ok(error.includes('onClick={reset}'))
  assert.ok(!error.includes('error.message'))
  assert.ok(!error.includes('error.stack'))
  assert.ok(read('src/app/docs/page.tsx').includes('notFound()'))
})
