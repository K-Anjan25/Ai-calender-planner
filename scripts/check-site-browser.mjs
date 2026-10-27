/** Real Chromium regression: built site must be running (default localhost:3000).
 * Fonts are blocked intentionally so the site's documented offline fallbacks are exercised.
 * Only browser requests are stubbed for delivery tests; real webhook delivery is not claimed.
 */
import assert from 'node:assert/strict'
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import { chromium as playwright } from 'playwright-core'

const base = process.env.SITE_URL || 'http://localhost:3000'
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/calendra-browser-check'
await mkdir(artifacts, { recursive: true })
const env = { ...process.env }
// The Lambda browser package contains NSS/NSPR libraries omitted by minimal Linux images.
if (
  process.platform === 'linux' &&
  !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
) {
  const dir = await mkdtemp(join(tmpdir(), 'calendra-browser-libs-'))
  const archive = join(dir, 'libs.tar')
  const binary = new URL(
    '../node_modules/@sparticuz/chromium/bin/al2023.tar.br',
    import.meta.url,
  )
  await writeFile(archive, brotliDecompressSync(await readFile(binary)))
  execFileSync('tar', ['-xf', archive, '-C', dir])
  env.LD_LIBRARY_PATH = `${join(dir, 'lib')}:${env.LD_LIBRARY_PATH || ''}`
}
const executable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (await chromium.executablePath())
let browser
const launchBrowser = () =>
  playwright.launch({
    executablePath: executable,
    args: chromium.args.filter(
      (arg) =>
        ![
          '--disable-web-security',
          '--allow-running-insecure-content',
        ].includes(arg),
    ),
    headless: true,
    env,
  })
const widths = [320, 390, 768, 1280, 1440]
try {
  for (const width of widths) {
    browser = await launchBrowser()
    const context = await browser.newContext({ viewport: { width, height: 920 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort())
    // UI states are fixtures; this does not claim live OAuth or Google credential verification.
    let privateMode = false
    let signedInUser = null
    await page.route('**/api/auth/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { user: signedInUser, capabilities: { googleSignIn: true, googleMissing: [], secretConfigured: true, required: privateMode } } }) }))
    for (const path of ['/signin', '/signup', '/legal', '/missing-bauhaus-page', '/docs']) {
      const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
      if (path === '/docs' || path.includes('missing-')) assert.equal(response.status(), 404)
      assert.ok(await page.getByRole('heading', { level: 1 }).isVisible(), `${path}: missing heading`)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} ${width}: overflow`)
      assert.ok((await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).includes('DM Sans'), `${path}: missing shared sans font`)
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(245, 242, 233)')
      assert.ok(await page.locator('footer svg[aria-label="Calendra"]').isVisible())
      if (width <= 1050) {
        const menu = page.getByRole('button', { name: 'Open navigation', exact: true })
        await menu.click()
        await page.getByRole('dialog', { name: 'Site navigation' }).waitFor()
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.ok(await menu.evaluate(el => el === document.activeElement))
      }
      if (path === '/signin' || path === '/signup') {
        const card = page.locator('.bauhaus-auth-card')
        assert.equal(await card.evaluate(el => getComputedStyle(el).borderRadius), '0px')
        assert.ok((await page.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).startsWith('/api/auth/google?next='))
        await page.screenshot({ path: join(artifacts, `bauhaus-${path.slice(1)}-${width}.png`), fullPage: true })
      }
    }
    signedInUser = { id: 'fixture-user', name: 'A very long authenticated account name for responsive layout', email: 'responsive@example.com', provider: 'google' }
    await page.goto(`${base}/signin`, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Continue to the planner', exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: authenticated header overflow`)
    signedInUser = null
    await page.goto(`${base}/signin?error=state`, { waitUntil: 'networkidle' })
    await page.getByRole('alert').filter({ hasText: /expired or did not match/ }).waitFor()
    privateMode = true
    await page.reload({ waitUntil: 'networkidle' })
    assert.ok(await page.getByRole('button', { name: 'Demo unavailable on this private deployment' }).isDisabled())
    privateMode = false
    await page.reload({ waitUntil: 'networkidle' })
    await page.route('**/api/auth/demo', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Demo temporarily unavailable. Retry.' } }) }))
    await page.getByRole('button', { name: 'Continue with a demo session', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: /Demo temporarily unavailable/ }).waitFor()
    assert.ok(page.url().includes('/signin'))
    await page.unroute('**/api/auth/demo')
    await page.getByRole('button', { name: 'Continue with a demo session', exact: true }).click()
    await page.waitForURL('**/planner')
    await page.getByRole('button', { name: 'Build my week', exact: true }).first().click()
    await page.locator('[data-block-id]').first().waitFor({ timeout: 30000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: planner overflow`)
    await page.screenshot({ path: join(artifacts, `bauhaus-planner-${width}.png`), fullPage: true })
    const rules = page.getByRole('tab', { name: 'Rules', exact: true })
    await rules.click()
    await page.getByRole('heading', { name: 'Working rules' }).waitFor()
    const monday = page.getByRole('switch', { name: 'Monday is a working day' })
    const start = await page.getByLabel('Monday start', { exact: true }).inputValue()
    await monday.click()
    assert.equal(await monday.getAttribute('aria-checked'), 'false')
    await monday.click()
    assert.equal(await page.getByLabel('Monday start', { exact: true }).inputValue(), start)
    await page.getByRole('heading', { name: 'Working hours', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, `bauhaus-site-rules-${width}.png`) })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: Rules overflow`)
    await page.getByRole('tab', { name: /^Tasks/ }).click()
    await page.locator('#brief').fill('Bauhaus acceptance task, 30 minutes')
    await page.getByRole('button', { name: 'Preview tasks', exact: true }).click()
    const review = page.getByRole('region', { name: 'Review extracted tasks' })
    await review.waitFor({ timeout: 30000 })
    await review.getByRole('button', { name: 'Discard preview', exact: true }).click()
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    await page.getByRole('button', { name: 'Review & publish', exact: true }).click()
    await page.getByRole('button', { name: /dry run/i }).waitFor()
    await page.getByRole('button', { name: 'Back to week', exact: true }).click()
    assert.deepEqual(errors, [], `${width}: page runtime errors`)
    console.log(`PASS ${width}px: signin/signup/legal/404/docs, shared theme, menu focus, auth error/private/demo retry, planner build, Rules, task preview/discard, publishing navigation`)
    await browser.close(); browser = undefined
  }
} finally { await browser?.close() }
