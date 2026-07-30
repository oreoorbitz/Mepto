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

// ---- branch coverage for the complexity refactor (slideHandler + checkResponsive)

test('slideHandler non-infinite: out-of-bounds navigation clamps to current slide', async ({
  page,
}) => {
  await build(page, {
    id: 'perf-edge',
    slides: 6,
    opts: { slidesToShow: 2, slidesToScroll: 1, infinite: false, dots: false },
  })
  const cur = () =>
    page.evaluate(
      () => (document.querySelector('#perf-edge') as unknown as { mlick: any }).mlick.currentSlide
    )
  expect(await cur()).toBe(0)

  // prev at index 0 -> out of bounds (< 0), must clamp back to 0 (not wrap)
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-edge').mlick('mlickPrev')
  })
  await expect.poll(cur).toBe(0)

  // navigate to the last valid index (slideCount - slidesToShow = 4), then next -> clamp at 4
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-edge').mlick('mlickGoTo', 4)
  })
  await expect.poll(cur).toBe(4)

  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-edge').mlick('mlickNext')
  })
  await expect.poll(cur).toBe(4)
})

test('slideHandler infinite: wraps past last slide to first (current behavior)', async ({
  page,
}) => {
  await build(page, {
    id: 'perf-inf',
    slides: 4,
    opts: { slidesToShow: 1, slidesToScroll: 1, infinite: true, dots: false },
  })
  const cur = () =>
    page.evaluate(
      () => (document.querySelector('#perf-inf') as unknown as { mlick: any }).mlick.currentSlide
    )
  // wait until the running transition finishes (mlickNext is dropped while animating)
  const idle = () =>
    page.evaluate(
      () =>
        (document.querySelector('#perf-inf') as unknown as { mlick: any }).mlick.animating === false
    )
  // go to last, then next should wrap to 0
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-inf').mlick('mlickGoTo', 3)
  })
  await expect.poll(cur).toBe(3)
  await expect.poll(idle).toBe(true)
  await page.evaluate(() => {
    const $m = (window as unknown as { $: (s: string) => any }).$
    $m('#perf-inf').mlick('mlickNext')
  })
  await expect.poll(cur).toBe(0)
})

test('checkResponsive: activates breakpoint settings when window shrinks below breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await build(page, {
    id: 'perf-resp',
    slides: 6,
    opts: {
      slidesToShow: 4,
      slidesToScroll: 1,
      infinite: false,
      dots: false,
      responsive: [{ breakpoint: 600, settings: { slidesToShow: 2 } }],
    },
  })
  const show = () =>
    page.evaluate(
      () =>
        (document.querySelector('#perf-resp') as unknown as { mlick: any }).mlick.options
          .slidesToShow
    )
  const active = () =>
    page.evaluate(
      () =>
        (document.querySelector('#perf-resp') as unknown as { mlick: any }).mlick.activeBreakpoint
    )

  // wide window: desktop settings (4), no active breakpoint
  expect(await show()).toBe(4)
  expect(await active()).toBe(null)

  // shrink below 600: breakpoint activates, slidesToShow becomes 2
  await page.setViewportSize({ width: 500, height: 700 })
  await expect.poll(show).toBe(2)
  expect(await active()).toBe(600)

  // grow back: returns to desktop settings, breakpoint cleared
  await page.setViewportSize({ width: 900, height: 700 })
  await expect.poll(show).toBe(4)
  expect(await active()).toBe(null)
})

test('checkResponsive mobileFirst: breakpoint activates as window grows past it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 700 })
  await build(page, {
    id: 'perf-mf',
    slides: 6,
    opts: {
      slidesToShow: 1,
      mobileFirst: true,
      infinite: false,
      dots: false,
      responsive: [{ breakpoint: 600, settings: { slidesToShow: 3 } }],
    },
  })
  const show = () =>
    page.evaluate(
      () =>
        (document.querySelector('#perf-mf') as unknown as { mlick: any }).mlick.options.slidesToShow
    )
  // narrow (mobile-first base): 1
  expect(await show()).toBe(1)
  // grow past breakpoint: 3
  await page.setViewportSize({ width: 900, height: 700 })
  await expect.poll(show).toBe(3)
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
