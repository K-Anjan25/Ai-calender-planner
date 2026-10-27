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
const widths = [320, 390, 768, 900, 1024, 1280, 1440]
try {
  for (const width of widths) {
    browser = await launchBrowser()
    const context = await browser.newContext({ viewport: { width, height: 920 }, reducedMotion: 'reduce', deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort())
    await page.route('https://www.google.com/maps?**', route => route.fulfill({ contentType: 'text/html', body: '<p>Map provider fixture</p>' }))
    await page.goto(base, { waitUntil: 'networkidle' })
    assert.ok(await page.getByRole('heading', { level: 1 }).isVisible())
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: page overflow`)
    const calendar = page.getByRole('img', { name: /Illustrative weekly calendar/ })
    assert.ok(await calendar.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}: calendar overflow`)
    if (width >= 900) {
      const hero = await page.getByRole('heading', { level: 1 }).boundingBox(), preview = await calendar.boundingBox()
      assert.ok(preview.x > hero.x + hero.width - 10, `${width}: calendar must remain right of the heading`)
    }
    const blocks = await calendar.locator('[style]').evaluateAll(nodes => nodes.map(el => { const box = el.getBoundingClientRect(); return { width: box.width, height: box.height } }))
    assert.ok(blocks.every(block => block.width > 10 && block.height > 10), 'calendar grid lost its explicit tracks')
    await page.screenshot({ path: join(artifacts, `bauhaus-hero-${width}.png`) })
    if (width <= 760) {
      const menu = page.getByRole('button', { name: 'Open navigation' })
      await menu.click()
      await page.getByRole('dialog').waitFor()
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.ok(await menu.evaluate(el => el === document.activeElement))
      await menu.click()
      await page.getByRole('dialog').getByRole('link', { name: 'FAQs', exact: true }).click()
      assert.equal(await page.getByRole('dialog').count(), 0)
    }
    const question = page.getByRole('button', { name: /What happens when everything/ })
    await question.click()
    assert.equal(await question.getAttribute('aria-expanded'), 'true')
    assert.ok(await page.getByRole('region', { name: /What happens when everything/ }).isVisible())
    await question.click()
    assert.equal(await question.getAttribute('aria-expanded'), 'false')
    await page.getByRole('link', { name: 'Ask about Pro', exact: true }).click()
    assert.equal(await page.locator('#contact-inquiry').inputValue(), 'pro')
    const form = page.getByRole('form', { name: 'Contact Calendra' })
    await form.getByRole('button', { name: 'Send message' }).click()
    await page.waitForFunction(() => document.activeElement?.id === 'contact-name')
    assert.equal(await page.locator('#contact-email').getAttribute('aria-invalid'), 'true')
    await form.getByLabel('Your name', { exact: true }).fill('Bauhaus tester')
    await form.getByLabel('Email address', { exact: true }).fill('tester@example.com')
    await form.getByLabel('What’s on your mind?', { exact: true }).fill('A test message about planning a realistic week.')
    await form.getByRole('checkbox').check()
    let delivery = false
    await page.route('**/api/contact', route => route.fulfill({ status: delivery ? 200 : 503, contentType: 'application/json', body: JSON.stringify({ ok: delivery }) }))
    await form.getByRole('button', { name: 'Send message' }).click()
    await form.getByRole('status').filter({ hasText: /couldn’t send/ }).waitFor()
    assert.equal(await form.getByLabel('Your name', { exact: true }).inputValue(), 'Bauhaus tester')
    delivery = true
    await form.getByRole('button', { name: 'Send message' }).click()
    await form.getByRole('status').filter({ hasText: /Message received/ }).waitFor()
    assert.equal(await form.getByLabel('Your name', { exact: true }).inputValue(), '')
    const newsletter = page.getByRole('form', { name: 'Newsletter subscription' })
    await newsletter.getByRole('button', { name: 'Subscribe to newsletter' }).click()
    assert.equal(await newsletter.getByRole('textbox').getAttribute('aria-invalid'), 'true')
    await page.route('**/api/newsletter', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
    await newsletter.getByRole('textbox').fill('tester@example.com')
    await newsletter.getByRole('button', { name: 'Subscribe to newsletter' }).click()
    await newsletter.getByRole('status').filter({ hasText: /subscribed/ }).waitFor()
    assert.ok(await page.locator('footer svg[aria-label="Calendra"]').isVisible())
    assert.equal(await page.locator('iframe[title="Map of Hyderabad in the footer"]').count(), 1)
    await page.screenshot({ path: join(artifacts, `bauhaus-full-${width}.png`), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: lower-page overflow`)
    assert.deepEqual(errors, [], `${width}: browser errors`)
    console.log(`PASS ${width}px: calendar geometry, no overflow, navigation, FAQs, enquiry prefill, form validation/failure/retry/success, newsletter, footer`)
    await browser.close()
    browser = undefined
  }
} finally { await browser?.close() }
