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
const widths = [320, 390, 768, 1024, 1440]
try {
  for (const width of widths) {
    browser = await launchBrowser()
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.abort(),
    )
    await page.goto(base, { waitUntil: 'networkidle' })
    const attention = await page
      .locator('a[data-attention]')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          fill: style.backgroundColor,
          text: style.color,
          size: parseFloat(style.fontSize),
          weight: Number(style.fontWeight),
        }
      })
    assert.equal(
      attention.fill,
      'rgb(206, 242, 109)',
      'Build my week must use Sunny Herb',
    )
    assert.equal(
      attention.text,
      'rgb(55, 112, 191)',
      'CTA type must use Blue Harbor',
    )
    assert.ok(
      attention.size >= 19 && attention.weight >= 700,
      'Blue on lime requires large bold type',
    )
    // Scroll the final question near the old floating-CTA collision zone.
    const faq = page.locator('#questions')
    const questions = faq.getByRole('button')
    for (const question of await questions.all()) {
      await question.scrollIntoViewIfNeeded()
      await page.waitForFunction(
        () => !document.querySelector('[data-sticky-cta]'),
      )
      const geometry = await question.evaluate((el) => {
        const label = el.querySelector('span'),
          icon = el.querySelector('svg')
        const a = label.getBoundingClientRect(),
          b = icon.getBoundingClientRect()
        return {
          right: a.right,
          iconLeft: b.left,
          iconWidth: b.width,
          textFits: label.scrollWidth <= label.clientWidth,
          height: a.height,
        }
      })
      assert.ok(
        geometry.textFits && geometry.right + 10 <= geometry.iconLeft,
        `${width}: FAQ text collides with icon`,
      )
      assert.equal(geometry.iconWidth, 18, `${width}: FAQ icon shrinks`)
      const expanded = await question.getAttribute('aria-expanded')
      await question.click()
      assert.notEqual(await question.getAttribute('aria-expanded'), expanded)
      // Keyboard users must be able to reverse the toggle as well.
      await question.press('Enter')
      assert.equal(await question.getAttribute('aria-expanded'), expanded)
    }
    await page
      .locator('#questions')
      .screenshot({ path: join(artifacts, `faq-${width}.png`) })
    await page.locator('#plans').scrollIntoViewIfNeeded()
    await page.waitForFunction(
      () => !document.querySelector('[data-sticky-cta]'),
    )
    const form = page.getByRole('form', { name: 'Contact Calendra' })
    await form.scrollIntoViewIfNeeded()
    await page.waitForFunction(
      () => !document.querySelector('[data-sticky-cta]'),
    )
    for (const id of ['contact-name', 'contact-email', 'contact-message']) {
      const field = page.locator(`#${id}`)
      assert.ok(await field.isVisible(), `${width}: ${id} missing`)
      const geometry = await field.evaluate((el) => {
        const box = el.getBoundingClientRect(),
          style = getComputedStyle(el)
        return {
          width: box.width,
          height: box.height,
          border: parseFloat(style.borderTopWidth),
          borderColor: style.borderTopColor,
          fill: style.backgroundColor,
          right: box.right,
          left: box.left,
        }
      })
      assert.ok(
        geometry.width > 120 && geometry.height >= 48,
        `${width}: ${id} collapsed`,
      )
      assert.ok(
        geometry.border >= 2 && geometry.borderColor !== geometry.fill,
        `${width}: ${id} invisible outline`,
      )
      assert.ok(
        geometry.left >= 0 && geometry.right <= width,
        `${width}: ${id} overflows viewport`,
      )
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}: page overflows horizontally`,
    )
    await form.getByRole('button', { name: 'Send message' }).click()
    assert.equal(await form.locator('[aria-invalid="true"]').count(), 4)
    await page.locator('#contact-name').fill('Test Planner')
    assert.equal(
      await page.locator('#contact-name').getAttribute('aria-invalid'),
      'false',
    )
    await page.locator('#contact-email').fill('planner@example.com')
    await page
      .locator('#contact-message')
      .fill('I would like help planning a realistic week.')
    await form.getByRole('checkbox').check()
    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"ok":false}',
      }),
    )
    await form.getByRole('button', { name: 'Send message' }).click()
    await form
      .getByRole('status')
      .filter({ hasText: 'couldn’t send' })
      .waitFor()
    assert.equal(
      await page.locator('#contact-name').inputValue(),
      'Test Planner',
    )
    await page.unroute('**/api/contact')
    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"ok":true}',
      }),
    )
    await form.getByRole('button', { name: 'Send message' }).click()
    await form
      .getByRole('status')
      .filter({ hasText: 'Message received' })
      .waitFor()
    assert.equal(await page.locator('#contact-name').inputValue(), '')
    const newsletter = page.getByRole('form', {
      name: 'Newsletter subscription',
    })
    await newsletter.scrollIntoViewIfNeeded()
    const email = newsletter.getByRole('textbox')
    assert.ok((await email.boundingBox()).width > 120)
    await newsletter.getByRole('button').click()
    assert.equal(await email.getAttribute('aria-invalid'), 'true')
    await email.fill('newsletter@example.com')
    await page.route('**/api/newsletter', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"ok":true}',
      }),
    )
    await newsletter.getByRole('button').click()
    await newsletter
      .getByRole('status')
      .filter({ hasText: 'subscribed' })
      .waitFor()
    await page.getByRole('button', { name: 'MENU', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('link', { name: 'Contact', exact: true })
      .click()
    assert.ok(!(await page.getByRole('dialog').isVisible()))
    await form.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, `contact-${width}.png`) })
    assert.deepEqual(errors, [], `${width}: runtime errors`)
    process.stdout.write(
      `PASS ${width}px / DPR 2: visible fields, no overflow, validation, delivery states, newsletter, menu and unobstructed FAQs/pricing\n`,
    )
    await browser.close()
  }
} finally {
  await browser?.close()
}
