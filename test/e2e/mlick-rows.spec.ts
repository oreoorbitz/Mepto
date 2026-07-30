import { test, expect, type Page } from '@playwright/test'

/**
 * Targeted spec for the `rows > 0` branch of `Mlick.prototype.buildRows`
 * (plugins/mlick.js). None of the demo carousels in examples/mlick/app.ts use
 * `rows`, so this path is otherwise uncovered. The plugin is loaded on the
 * /examples/mlick/ QA page, so this spec builds a fresh rows-mode carousel in
 * that page and asserts the leaf slides receive their inline styles via the
 * collected `leafSlides` references (the refactor that replaced the
 * `.children().children().children()` traversal).
 */

/** Navigates from the QA directory to the mlick page via its entry link. */
const gotoMlick = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.getByRole('link', { name: /Mlick Carousel/ }).click()
  await page.waitForURL('**/examples/mlick/')
}

test.beforeEach(async ({ page }) => {
  await gotoMlick(page)
})

test('buildRows (rows>0) structures rows and styles leaves via collected references', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    // `$` is Mepto exposed on window in the page; it is not a TS global here.
    const $m = (window as unknown as { $: (sel: string) => any }).$

    // Build a fresh 8-slide rows-mode carousel in the live page.
    const host = document.createElement('div')
    host.id = 'carousel-rows'
    for (let i = 1; i <= 8; i++) {
      const s = document.createElement('div')
      s.className = 'slide'
      s.textContent = String(i)
      host.appendChild(s)
    }
    document.body.appendChild(host)

    const $host = $m('#carousel-rows')
    $host.mlick({ rows: 2, slidesPerRow: 2, dots: false })

    // The true leaves are the original `.slide` divs. `buildRows` wraps them in
    // row divs inside section divs (the sections get `.mlick-slide`), and it is
    // the innermost `.slide` nodes that `leafSlides` collects and styles. Only
    // count the non-cloned originals (infinite mode clones repeat them).
    const seen = new Set<string>()
    const widths: string[] = []
    const displays: string[] = []
    const texts: string[] = []
    $m('#carousel-rows .mlick-slide')
      .filter(function (this: HTMLElement) {
        return !$m(this as unknown as string).hasClass('mlick-cloned')
      })
      .find('.slide')
      .each(function (this: HTMLElement) {
        const key = this.textContent ?? ''
        if (seen.has(key)) return // guard against any duplicate within a section
        seen.add(key)
        widths.push(this.style.width)
        displays.push(this.style.display)
        texts.push(key)
      })

    return {
      leafCount: widths.length,
      widths,
      displays,
      texts,
      initialized: $m('#carousel-rows').hasClass('mlick-initialized'),
    }
  })

  // 8 original slides, each a leaf carrying width = 100/slidesPerRow = 50%.
  expect(result.initialized).toBe(true)
  expect(result.leafCount).toBe(8)
  expect(result.texts).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  expect(result.widths).toEqual(Array(8).fill('50%'))
  expect(result.displays).toEqual(Array(8).fill('inline-block'))
})
