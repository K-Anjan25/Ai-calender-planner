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
      'rgb(16, 44, 80)',
      'CTA type must use approved AAA dark blue',
    )
    assert.ok(
      attention.size >= 19 && attention.weight >= 700,
      'Blue on lime requires large bold type',
    )
    await page.evaluate(() => {
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) {
        window.__anchorBehavior = options?.behavior
        return original.call(this, options)
      }
    })
    await page.locator('main a[href="#product"]').first().click()
    await page.waitForFunction(() => location.hash === '#product')
    assert.equal(
      await page.evaluate(() => window.__anchorBehavior),
      'auto',
      'Reduced motion must disable smooth scrolling',
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => {
      window.__anchorBehavior = null
    })
    await page.locator('main a[href="#product"]').first().click()
    await page.waitForFunction(() => window.__anchorBehavior === 'smooth')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const links = await page
      .locator('a')
      .evaluateAll((nodes) => nodes.map((el) => el.getAttribute('href')))
    for (const href of links) {
      assert.ok(href && !href.includes('url?id='), `Malformed target: ${href}`)
      if (href.startsWith('#'))
        assert.ok(
          await page.locator(`[id="${href.slice(1)}"]`).count(),
          `Missing anchor ${href}`,
        )
    }
    if (width === 390) {
      const paths = [
        ...new Set(
          links
            .filter((href) => href.startsWith('/') && !href.startsWith('//'))
            .map((href) => href.split('#')[0]),
        ),
      ]
      for (const path of paths)
        assert.ok(
          (await context.request.get(`${base}${path}`)).ok(),
          `Broken route ${path}`,
        )
    }
    assert.ok(
      !/\[https?:\/\//.test(await page.locator('body').innerText()),
      'Raw Markdown URL rendered',
    )
    const levels = await page
      .locator('h1,h2,h3,h4,h5,h6')
      .evaluateAll((nodes) => nodes.map((el) => Number(el.tagName.slice(1))))
    for (let index = 1; index < levels.length; index++)
      assert.ok(levels[index] <= levels[index - 1] + 1, 'Heading level skipped')
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
      if (expanded === 'false') {
        const answer = page.locator(
          `#${await question.getAttribute('aria-controls')} p`,
        )
        const padding = await answer.evaluate((el) => {
          const style = getComputedStyle(el)
          return [
            parseFloat(style.paddingLeft),
            parseFloat(style.paddingBottom),
          ]
        })
        assert.ok(
          padding[0] >= 12 && padding[1] >= 24,
          `${width}: expanded answer crowds its borders`,
        )
      }

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
    const cards = await page.locator('[data-plan]').evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect(),
          button = el.querySelector('a'),
          b = button.getBoundingClientRect(),
          style = getComputedStyle(el)
        return {
          top: r.top,
          bottom: r.bottom,
          height: r.height,
          width: r.width,
          border: style.borderWidth,
          padding: style.padding,
          buttonTop: b.top,
          buttonBottom: b.bottom,
          contained: [...el.children].every((child) => {
            const c = child.getBoundingClientRect()
            return (
              c.left >= r.left &&
              c.right <= r.right &&
              c.top >= r.top &&
              c.bottom <= r.bottom
            )
          }),
          noOverflow:
            el.scrollWidth <= el.clientWidth &&
            el.scrollHeight <= el.clientHeight,
        }
      }),
    )
    assert.equal(cards.length, 3)
    assert.ok(
      cards.every((card) => card.contained && card.noOverflow),
      `${width}: pricing content clips`,
    )
    assert.ok(
      cards.every(
        (card) =>
          card.border === cards[0].border && card.padding === cards[0].padding,
      ),
      `${width}: unequal pricing borders or padding`,
    )
    if (width >= 1100) {
      for (const key of ['top', 'height', 'buttonTop', 'buttonBottom'])
        assert.ok(
          Math.max(...cards.map((card) => card[key])) -
            Math.min(...cards.map((card) => card[key])) <
            2,
          `${width}: pricing ${key} misaligned`,
        )
    }
    await page
      .locator('#plans')
      .screenshot({
        path: join(artifacts, `pricing-${width}.png`),
        style:
          'header, a[href="#main-content"] { visibility: hidden !important; }',
      })
    for (const label of [
      'Illustrative task intake',
      'Illustrative capacity report',
    ]) {
      const visual = page.getByRole('figure', { name: label, exact: true })
      assert.ok(await visual.isVisible(), `${width}: product visual missing`)
      const box = await visual.boundingBox()
      assert.ok(
        box.width >= 200 && box.height >= 200,
        `${width}: product visual collapsed`,
      )
    }
    assert.equal(
      await page
        .locator('main')
        .getByText('Enough space for the work.', { exact: true })
        .evaluate(
          (el) => getComputedStyle(el.closest('div').parentElement).position,
        ),
      'static',
      'Hero note must not float over content',
    )
    if (width > 760) {
      for (const label of [
        'Illustrative task intake',
        'Illustrative capacity report',
      ]) {
        const separation = await page
          .getByRole('figure', { name: label, exact: true })
          .evaluate((el) => {
            const sibling = [...el.parentElement.children].find(
              (node) => node !== el,
            )
            const a = el.getBoundingClientRect(),
              b = sibling.getBoundingClientRect()
            return a.right <= b.left || b.right <= a.left
          })
        assert.ok(separation, `${width}: visual should sit beside its text`)
      }
    }
    const faqClearance = await page.locator('#questions').evaluate((el) => {
      const heading = el.querySelector('h2').getBoundingClientRect(),
        firstQuestion = el.querySelector('button').getBoundingClientRect()
      return firstQuestion.top - heading.bottom
    })
    assert.ok(faqClearance >= 48, `${width}: FAQ heading crowded`)
    const rail = page.getByRole('navigation', { name: 'Planner actions' })
    assert.equal(
      await rail
        .locator('[data-bottom-cta]')
        .evaluate((el) => getComputedStyle(el).position),
      'static',
    )
    const railPlacement = await rail.evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      previousBottom: el.previousElementSibling.getBoundingClientRect().bottom,
      bottom: el.getBoundingClientRect().bottom,
      nextTop: el.nextElementSibling.getBoundingClientRect().top,
    }))
    assert.ok(
      railPlacement.top >= railPlacement.previousBottom &&
        railPlacement.nextTop >= railPlacement.bottom,
      'Action bar must reserve its own space between main content and footer',
    )
    const footerLinks = page.locator('footer a')
    for (const link of await footerLinks.all()) {
      const box = await link.boundingBox()
      assert.ok(
        box && box.height >= 44 && box.width >= 44,
        `${width}: footer link tap target too small`,
      )
    }
    for (const tier of ['Pro', 'Teams']) {
      await page
        .getByRole('link', { name: `Ask about ${tier}`, exact: true })
        .click()
      await page.waitForFunction(
        (value) => document.querySelector('#contact-inquiry').value === value,
        tier.toLowerCase(),
      )
      assert.equal(
        await page
          .locator('#contact-inquiry')
          .evaluate((el) => el === document.activeElement),
        true,
      )
    }
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
    let releaseSubmission
    const submissionGate = new Promise((resolve) => {
      releaseSubmission = resolve
    })
    await page.route('**/api/contact', async (route) => {
      await submissionGate
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"ok":false}',
      })
    })
    await form.getByRole('button', { name: 'Send message' }).click()
    assert.equal(await form.getAttribute('aria-busy'), 'true')
    assert.equal(
      await form.getByRole('button', { name: 'Sending…' }).isDisabled(),
      true,
    )
    releaseSubmission()
    await form
      .getByRole('status')
      .filter({ hasText: 'couldn’t send' })
      .waitFor()
    assert.equal(
      await page.locator('#contact-name').inputValue(),
      'Test Planner',
    )
    await page.unroute('**/api/contact')
    assert.equal(await page.locator('#contact-inquiry').inputValue(), 'teams')
    await page.route('**/api/contact', (route) => {
      assert.equal(route.request().postDataJSON().inquiry, 'teams')
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"ok":true}',
      })
    })
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
