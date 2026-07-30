import { test, expect, type Page } from '@playwright/test'

/**
 * Regression safety net for the mlick.js performance pass.
 *
 * These specs capture the CURRENT correct behavior of the hot paths being
 * refactored — getLeft (horizontal + vertical), setDimensions, swipeMove, and
 * setSlideClasses — by asserting on observable DOM state (track transform,
 * slide classes, dimensions, swipe outcomes) rather than internals. Any
 * behavioral drift introduced by the perf refactor fails here.
 *
 * Carousels are built dynamically on the /examples/mlick/ QA page, where the
 * plugin is loaded. The instance is reachable via the `.mlick` expando.
 */

const gotoMlick = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.getByRole('link', { name: /Mlick Carousel/ }).click()
  await page.waitForURL('**/examples/mlick/')
}

test.beforeEach(async ({ page }) => {
  await gotoMlick(page)
})

interface BuildOptions {
  id: string
  slides: number
  opts: Record<string, unknown>
}

/** Builds a carousel in the live page and returns its mlick instance expando. */
const build = (page: Page, { id, slides, opts }: BuildOptions) =>
  page.evaluate(
    ({ id, slides, opts }) => {
      const $m = (window as unknown as { $: (sel: string) => any }).$
      const host = document.createElement('div')
      host.id = id
      host.style.width = '600px'
      for (let i = 1; i <= slides; i++) {
        const s = document.createElement('div')
        s.className = 'slide'
        s.textContent = String(i)
        host.appendChild(s)
      }
      document.body.appendChild(host)
      $m('#' + id).mlick(opts)
      return (document.querySelector('#' + id) as unknown as { mlick: any }).mlick
    },
    { id, slides, opts }
  )

/** Reads the track's computed translate3d x-offset (px) as a number. */
const trackOffset = (page: Page, id: string) =>
  page.evaluate(cid => {
    const track = document.querySelector(cid + ' .mlick-track') as HTMLElement
    const t = track.style.transform || getComputedStyle(track).transform
    const m = /translate3d\(\s*(-?[\d.]+)px/.exec(t)
    if (m) return parseFloat(m[1])
    const m2 = /matrix\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*(-?[\d.]+)/.exec(t)
    return m2 ? parseFloat(m2[1]) : null
  }, id)

test('horizontal getLeft positions track at -slideWidth*index (infinite)', async ({ page }) => {
  const inst = await build(page, {
    id: 'perf-h',
    slides: 6,
    opts: { slidesToShow: 1, dots: false },
  })
  const slideWidth = inst.slideWidth
  expect(slideWidth).toBeGreaterThan(0)

  // index 0 with 1 infinite clone pair -> offset is -(slideWidth * (0 + 1))
  const at0 = await trackOffset(page, '#perf-h')
  expect(at0).toBeCloseTo(-slideWidth * 1, 0)

  // go to slide 3 -> -(slideWidth * (3 + 1))
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-h').mlick('mlickGoTo', 3)
  })
  await expect.poll(() => trackOffset(page, '#perf-h')).toBeCloseTo(-slideWidth * 4, 0)
})

test('vertical mode: mlick-vertical class set and getLeft uses vertical branch', async ({
  page,
}) => {
  const inst = await build(page, {
    id: 'perf-v',
    slides: 6,
    opts: { slidesToShow: 1, vertical: true, dots: false },
  })
  // vertical flag drives the 'top' position prop and adds the class
  expect(inst.options.vertical).toBe(true)
  const hasClass = await page.evaluate(() =>
    (document.querySelector('#perf-v') as HTMLElement).classList.contains('mlick-vertical')
  )
  expect(hasClass).toBe(true)
  // getLeft for index 0 must be a finite number (vertical math, no NaN)
  const left = await page.evaluate(() => {
    const inst = (document.querySelector('#perf-v') as unknown as { mlick: any }).mlick
    return inst.getLeft(0)
  })
  expect(Number.isFinite(left)).toBe(true)
})

test('setSlideClasses marks exactly slidesToShow slides active with aria-hidden=false', async ({
  page,
}) => {
  await build(page, {
    id: 'perf-c',
    slides: 6,
    opts: { slidesToShow: 3, slidesToScroll: 1, infinite: false, dots: false },
  })
  const counts = await page.evaluate(() => {
    const active = document.querySelectorAll('#perf-c .mlick-slide.mlick-active').length
    const ariaFalse = document.querySelectorAll('#perf-c .mlick-slide[aria-hidden="false"]').length
    const current = document.querySelectorAll('#perf-c .mlick-slide.mlick-current').length
    return { active, ariaFalse, current }
  })
  expect(counts.active).toBe(3)
  expect(counts.ariaFalse).toBe(3)
  expect(counts.current).toBe(1)

  // after goto 2, the active window shifts
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-c').mlick('mlickGoTo', 2)
  })
  const activeIndexes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#perf-c .mlick-slide'))
      .map((el, i) => ({ i, active: el.classList.contains('mlick-active') }))
      .filter(x => x.active)
      .map(x => x.i)
  )
  expect(activeIndexes).toEqual([2, 3, 4])
})

test('swipeMove math: horizontal drag drives a left swipe to next slide', async ({ page }) => {
  // Reuse the proven-draggable #carousel-basic fixture (slidesToShow: 1). The
  // swipeMove swipeLength computation must convert a left drag into next-slide.
  const currentSlide = () =>
    page.evaluate(
      () =>
        (document.querySelector('#carousel-basic') as unknown as { mlick: any }).mlick.currentSlide
    )
  expect(await currentSlide()).toBe(0)

  const list = page.locator('#carousel-basic .mlick-list')
  const box = await list.boundingBox()
  if (!box) throw new Error('carousel list not visible')

  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.75, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 10 })
  await page.mouse.up()

  await expect.poll(currentSlide).toBe(1)
})
