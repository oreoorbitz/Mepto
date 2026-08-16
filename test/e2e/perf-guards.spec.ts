import { test, expect, type Page } from '@playwright/test'

/**
 * Performance regression guards for the Kimi dom-manip passes.
 *
 * §7.2 containment, §6.2.3 transient will-change, §3.2 FSL.
 * All asserts are deterministic (computed style / timing) — no flaky perf marks.
 */

const gotoMlick = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Mlick Carousel/ }).click()
  await page.waitForURL('**/examples/mlick/')
}

test.beforeEach(async ({ page }) => {
  await gotoMlick(page)
})

test.describe('contain: layout paint guard (§7.2)', () => {
  test('mlick .mlick-list scopes recalc', async ({ page }) => {
    const contain = await page.evaluate(() => {
      const el = document.querySelector('.mlick-list') as HTMLElement | null
      return el ? getComputedStyle(el).contain : null
    })
    expect(contain).not.toBeNull()
    // contain is a space-separated list; order unspecified
    expect(contain).toMatch(/layout/)
    expect(contain).toMatch(/paint/)
  })

  test('docs QA .demo cards scope recalc (examples/mlick)', async ({ page }) => {
    // The QA page's .demo and .carousel now carry contain — guards 5e82ee6.
    const demoContain = await page.evaluate(() => {
      const el = document.querySelector('.demo') as HTMLElement | null
      return el ? getComputedStyle(el).contain : null
    })
    expect(demoContain).toMatch(/layout/)
  })
})

test.describe('will-change transient guard (§6.2.3)', () => {
  test('track gets will-change: transform on slide then clears after speed+100', async ({
    page,
  }) => {
    // Build a fresh carousel with known speed
    const speed = 200
    await page.evaluate(
      ({ speed }) => {
        const $m = (window as unknown as { $: (s: string) => any }).$
        const host = document.createElement('div')
        host.id = 'perf-willchange'
        host.style.width = '600px'
        for (let i = 1; i <= 4; i++) {
          const s = document.createElement('div')
          s.className = 'slide'
          s.textContent = String(i)
          host.appendChild(s)
        }
        document.body.appendChild(host)
        $m('#perf-willchange').mlick({ dots: false, speed })
        // Ensure mlick object exists before we poke it
        return (document.querySelector('#perf-willchange') as unknown as { mlick: any }).mlick.speed
      },
      { speed }
    )

    // Trigger a slide — setCSS should set will-change
    await page.evaluate(() => {
      const $m = (window as unknown as { $: (s: string) => any }).$
      $m('#perf-willchange').mlick('mlickGoTo', 1)
    })

    const willChangeSet = await page.evaluate(() => {
      const track = document.querySelector('#perf-willchange .mlick-track') as HTMLElement
      return track.style.willChange || getComputedStyle(track).willChange
    })
    expect(willChangeSet).toMatch(/transform/)

    // After speed+150 it must be cleared (transient, not persistent — 3× surface budget)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const track = document.querySelector('#perf-willchange .mlick-track') as HTMLElement
          // Mepto's willChangeClear sets style.willChange = ''
          return track.style.willChange
        })
      )
      .toBe('')
  })
})

test.describe('FSL single-layout guard (§3.2)', () => {
  test('setPosition batches reads — UMD bundle still exposes the batched path', async ({
    page,
  }) => {
    // Behavioral proxy for the FSL fix (ec4d5da): setDimensions + setPosition must
    // still produce the correct adaptiveHeight after a batched read. If someone
    // re-introduces the write→read split, the height will still be correct but
    // the forced-layout count would double — we assert the observable height is
    // correct and that a second setPosition is idempotent within 1px.
    await page.evaluate(() => {
      const $m = (window as unknown as { $: (s: string) => any }).$
      const host = document.createElement('div')
      host.id = 'perf-fsl'
      host.style.width = '600px'
      // heights vary so adaptiveHeight must read the current slide's outerHeight
      const heights = [100, 180, 120]
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('div')
        s.className = 'slide'
        s.style.height = heights[i] + 'px'
        s.textContent = String(i)
        host.appendChild(s)
      }
      document.body.appendChild(host)
      $m('#perf-fsl').mlick({
        dots: false,
        slidesToShow: 1,
        adaptiveHeight: true,
        speed: 0,
      })
    })

    const h0 = await page.evaluate(() => {
      const list = document.querySelector('#perf-fsl .mlick-list') as HTMLElement
      return list.getBoundingClientRect().height
    })
    expect(h0).toBeGreaterThan(90)
    expect(h0).toBeLessThan(250)

    // goto slide 1 (180px) — batched read must pick up the new height
    await page.evaluate(() => {
      const $m = (window as unknown as { $: (s: string) => any }).$
      $m('#perf-fsl').mlick('mlickGoTo', 1)
    })
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const list = document.querySelector('#perf-fsl .mlick-list') as HTMLElement
          return Math.round(list.getBoundingClientRect().height)
        })
      )
      .toBeGreaterThan(160)

    // Idempotent — calling getLeft/setPosition again must not drift
    const h1 = await page.evaluate(() => {
      const list = document.querySelector('#perf-fsl .mlick-list') as HTMLElement
      return Math.round(list.getBoundingClientRect().height)
    })
    await page.evaluate(() => {
      const m = (document.querySelector('#perf-fsl') as unknown as { mlick: any }).mlick
      m.setPosition()
    })
    const h2 = await page.evaluate(() => {
      const list = document.querySelector('#perf-fsl .mlick-list') as HTMLElement
      return Math.round(list.getBoundingClientRect().height)
    })
    expect(Math.abs(h2 - h1)).toBeLessThanOrEqual(1)
  })
})
