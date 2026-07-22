import { test, expect, type Page } from '@playwright/test'

/**
 * End-to-end spec for the mlick carousel plugin (plugins/mlick.js) via its QA
 * page at /examples/mlick/. Everything runs locally — no network fixtures are
 * needed. The plugin instance is stored on the DOM element as `.mlick`, which
 * gives tests a direct handle on currentSlide for assertions.
 *
 * Every test enters through the root QA directory link, so the directory
 * listing itself is exercised on each run.
 */

interface MlickInstance {
  currentSlide: number
  slideCount: number
  animating: boolean
}

/** Reads the plugin instance expando off the carousel element. */
const instance = (page: Page, id: string): Promise<MlickInstance> =>
  page.evaluate(
    cid => (document.querySelector(cid) as unknown as { mlick: MlickInstance }).mlick,
    id
  )

const currentSlide = (page: Page, id: string): Promise<number> =>
  instance(page, id).then(i => i.currentSlide)

/** Resolves true once the running transition has finished. Clicks that land
 * while `animating` is true are dropped by the plugin (waitForAnimate), so
 * tests must wait for idle between navigations. */
const idle = (page: Page, id: string): Promise<boolean> =>
  instance(page, id).then(i => i.animating === false)

/** Navigates from the QA directory to the mlick page via its entry link. */
const gotoMlick = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.getByRole('link', { name: /Mlick Carousel/ }).click()
  await page.waitForURL('**/examples/mlick/')
}

test.beforeEach(async ({ page }) => {
  await gotoMlick(page)
})

test('page loads with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(String(err)))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await gotoMlick(page)
  await expect(page.locator('#carousel-basic')).toHaveClass(/mlick-initialized/)
  expect(errors).toEqual([])
})

test('carousels initialize with expected structure', async ({ page }) => {
  for (const id of ['#carousel-basic', '#carousel-multi', '#carousel-fade', '#carousel-autoplay']) {
    await expect(page.locator(id)).toHaveClass(/mlick-initialized/)
  }
  // 6 original slides, all wrapped and marked up (plus 7 infinite clones)
  await expect(page.locator('#carousel-basic .mlick-slide')).toHaveCount(13)
  await expect(page.locator('#carousel-basic .mlick-slide:not(.mlick-cloned)')).toHaveCount(6)
  // track has an inline width computed by the plugin
  const trackWidth = await page
    .locator('#carousel-basic .mlick-track')
    .evaluate(el => el.style.width)
  expect(trackWidth).toMatch(/^\d+px$/)
})

test('next/prev arrows navigate', async ({ page }) => {
  const section = page.locator('#section-basic')
  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(0)

  await section.locator('.mlick-next').click()
  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(1)
  await expect.poll(() => idle(page, '#carousel-basic')).toBe(true)

  await section.locator('.mlick-prev').click()
  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(0)
})

test('dots navigate to the matching slide', async ({ page }) => {
  const dots = page.locator('#section-basic .mlick-dots li')
  await expect(dots).toHaveCount(6)

  await dots.nth(2).locator('button').click()
  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(2)
  await expect(dots.nth(2)).toHaveClass(/mlick-active/)
})

test('infinite mode wraps from last slide to first', async ({ page }) => {
  const section = page.locator('#section-basic')
  await section.locator('.mlick-prev').click()
  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(5)
})

test('multiple mode shows three slides at once', async ({ page }) => {
  await expect(page.locator('#carousel-multi .mlick-slide.mlick-active')).toHaveCount(3)

  await page.locator('#section-multi .mlick-next').click()
  await expect.poll(() => currentSlide(page, '#carousel-multi')).toBe(1)
})

test('fade carousel crossfades between slides', async ({ page }) => {
  await page.locator('#section-fade .mlick-next').click()
  await expect.poll(() => currentSlide(page, '#carousel-fade')).toBe(1)
  await expect.poll(() => idle(page, '#carousel-fade')).toBe(true)

  const opacities = await page
    .locator('#carousel-fade .mlick-slide:not(.mlick-cloned)')
    .evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).opacity)))
  expect(opacities[0]).toBe(0)
  expect(opacities[1]).toBe(1)
})

test('autoplay advances and fires events', async ({ page }) => {
  await expect
    .poll(() => currentSlide(page, '#carousel-autoplay'), { timeout: 5000 })
    .toBeGreaterThan(0)
  await expect(page.locator('#event-log li').first()).toBeVisible()
  await expect(page.locator('#event-log')).toContainText('beforeChange')
  await expect(page.locator('#event-log')).toContainText('afterChange')
})

test('API commands: goto, add, remove, unmlick, re-init', async ({ page }) => {
  // mlickGoTo(0) after navigating forward
  await page.locator('#api-next').click()
  await expect.poll(() => currentSlide(page, '#carousel-api')).toBe(1)
  await expect.poll(() => idle(page, '#carousel-api')).toBe(true)
  await page.locator('#api-goto').click()
  await expect.poll(() => currentSlide(page, '#carousel-api')).toBe(0)

  // mlickAdd appends a slide
  await page.locator('#api-add').click()
  await expect.poll(() => instance(page, '#carousel-api').then(i => i.slideCount)).toBe(6)

  // mlickRemove drops the last slide
  await page.locator('#api-remove').click()
  await expect.poll(() => instance(page, '#carousel-api').then(i => i.slideCount)).toBe(5)

  // unmlick tears the plugin down
  await page.locator('#api-unslick').click()
  await expect(page.locator('#carousel-api')).not.toHaveClass(/mlick-initialized/)

  // re-init brings it back
  await page.locator('#api-init').click()
  await expect(page.locator('#carousel-api')).toHaveClass(/mlick-initialized/)
  await expect.poll(() => currentSlide(page, '#carousel-api')).toBe(0)
})

test('mouse drag swipes to the next slide', async ({ page }) => {
  const list = page.locator('#carousel-basic .mlick-list')
  const box = await list.boundingBox()
  if (!box) throw new Error('carousel list not visible')

  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.75, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 10 })
  await page.mouse.up()

  await expect.poll(() => currentSlide(page, '#carousel-basic')).toBe(1)
})
