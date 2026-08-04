import { test, expect } from '@playwright/test'

// All tests use $.fx.off = true to skip the actual animation and just
// verify the API surface and callback wiring. Real CSS animation tests
// would need to wait for transitionend, which adds flakiness.

async function withFxOff<T>(
  page: import('@playwright/test').Page,
  html: string,
  fn: () => T
): Promise<T> {
  await page.goto('/test/fixture.html')
  await page.evaluate(html => {
    document.body.innerHTML = html
    // Disable all animation: duration becomes 0, callback fires next tick
    ;($.fx as { off: boolean }).off = true
  }, html)
  return page.evaluate(fn)
}

test.describe('$.fx / $.fn.fx methods', () => {
  test.afterEach(async ({ page }) => {
    // Restore the default so other test files aren't affected
    await page.goto('/test/fixture.html').catch(() => {})
    await page.evaluate(() => {
      ;($.fx as { off: boolean }).off = false
    })
  })

  test('$.fx is populated with the expected fields', async ({ page }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => {
        const fx = $.fx as Record<string, unknown>
        return {
          hasOff: 'off' in fx,
          hasSpeeds: 'speeds' in fx,
          hasTransitionEnd: 'transitionEnd' in fx,
          hasAnimationEnd: 'animationEnd' in fx,
        }
      })
    )
    expect(result?.hasOff).toBe(true)
    expect(result?.hasSpeeds).toBe(true)
    expect(result?.hasTransitionEnd).toBe(true)
    expect(result?.hasAnimationEnd).toBe(true)
  })

  test('$.fx.speeds has _default, fast, slow', async ({ page }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => {
        const s = ($.fx as { speeds: Record<string, number> }).speeds
        return { _default: s._default, fast: s.fast, slow: s.slow }
      })
    )
    expect(result?._default).toBe(400)
    expect(result?.fast).toBe(200)
    expect(result?.slow).toBe(600)
  })

  test('$.fn.fadeIn() with $.fx.off fires callback and returns collection', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t" style="display:none">x</div>', () => {
      return new Promise<{ callbackFired: boolean; isCollection: boolean }>(resolve => {
        $('#t').fadeIn(() => {
          resolve({ callbackFired: true, isCollection: false })
        })
        // fadeIn with $.fx.off = true completes next tick; if callback
        // doesn't fire, resolve as false after a wait
        setTimeout(() => resolve({ callbackFired: false, isCollection: false }), 200)
      }).then(async r => {
        // Also verify it returns a MeptoCollection
        const isCollection = await new Promise<boolean>(resolve => {
          const ret = $('#t').fadeIn()
          resolve(typeof ret.length === 'number' && typeof ret.each === 'function')
        })
        return { ...r, isCollection }
      })
    })
    expect(result?.callbackFired).toBe(true)
    expect(result?.isCollection).toBe(true)
  })

  test('$.fn.fadeOut() actually hides the element when called with just a callback', async ({
    page,
  }) => {
    // Regression: fadeOut's wrapped hide callback (which calls the original
    // $.fn.hide to set display:none) used to be swallowed by $.fn.animate's
    // "is the duration a function?" argument-detection. The fix: $.fn.animate
    // only swaps a function-shaped duration/ease into the callback slot when
    // the caller hasn't already supplied a callback. This test verifies the
    // display:none side effect survives the callback swap.
    const result = await withFxOff(page, '<div id="t" style="display:block">x</div>', () => {
      return new Promise<{ display: string; callbackFired: boolean }>(resolve => {
        $('#t').fadeOut(() => {
          const display = (document.getElementById('t') as HTMLElement).style.display
          resolve({ display, callbackFired: true })
        })
        setTimeout(
          () =>
            resolve({
              display: (document.getElementById('t') as HTMLElement).style.display,
              callbackFired: false,
            }),
          500
        )
      })
    })
    expect(result?.callbackFired).toBe(true)
    expect(result?.display).toBe('none')
  })

  test('$.fn.fadeToggle() actually toggles the display when called with a callback', async ({
    page,
  }) => {
    // Regression partner to the fadeOut test: same argument-detection fix.
    // The original $.fn.toggle is called as the wrapped callback, so
    // display:none ↔ '' swap should work for the callback-only call shape.
    const result = await withFxOff(
      page,
      '<div id="hidden" style="display:none">h</div><div id="visible" style="display:block">v</div>',
      () => {
        return new Promise<{
          hiddenDisplay: string
          visibleDisplay: string
          hiddenCb: boolean
          visibleCb: boolean
        }>(resolve => {
          let hiddenCb = false
          let visibleCb = false
          $('#hidden').fadeToggle(() => {
            hiddenCb = true
            if (visibleCb) {
              resolve({
                hiddenDisplay: (document.getElementById('hidden') as HTMLElement).style.display,
                visibleDisplay: (document.getElementById('visible') as HTMLElement).style.display,
                hiddenCb,
                visibleCb,
              })
            }
          })
          $('#visible').fadeToggle(() => {
            visibleCb = true
            if (hiddenCb) {
              resolve({
                hiddenDisplay: (document.getElementById('hidden') as HTMLElement).style.display,
                visibleDisplay: (document.getElementById('visible') as HTMLElement).style.display,
                hiddenCb,
                visibleCb,
              })
            }
          })
          setTimeout(() => {
            resolve({
              hiddenDisplay: (document.getElementById('hidden') as HTMLElement).style.display,
              visibleDisplay: (document.getElementById('visible') as HTMLElement).style.display,
              hiddenCb,
              visibleCb,
            })
          }, 500)
        })
      }
    )
    expect(result?.hiddenCb).toBe(true)
    expect(result?.visibleCb).toBe(true)
    expect(result?.hiddenDisplay).not.toBe('none')
    expect(result?.visibleDisplay).toBe('none')
  })

  test('$.fn.fadeTo() sets target opacity and fires callback', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t" style="opacity:1">x</div>', () => {
      return new Promise<{ opacity: string; callbackFired: boolean }>(resolve => {
        $('#t').fadeTo(0, 0.25, () => {
          const opacity = (document.getElementById('t') as HTMLElement).style.opacity
          resolve({ opacity, callbackFired: true })
        })
        setTimeout(() => resolve({ opacity: '???', callbackFired: false }), 200)
      })
    })
    expect(result?.callbackFired).toBe(true)
    // fadeTo('fast') or any explicit duration uses the opacity path
    expect(parseFloat(result?.opacity ?? '0')).toBeCloseTo(0.25, 1)
  })

  test('$.fn.show() with no args shows immediately', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t" style="display:none">x</div>', () => {
      $('#t').show()
      return { display: (document.getElementById('t') as HTMLElement).style.display }
    })
    expect(result?.display).not.toBe('none')
  })

  test('$.fn.hide() with no args hides immediately', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t" style="display:block">x</div>', () => {
      $('#t').hide()
      return { display: (document.getElementById('t') as HTMLElement).style.display }
    })
    expect(result?.display).toBe('none')
  })

  test('$.fn.toggle() with no args toggles display', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t" style="display:block">x</div>', () => {
      $('#t').toggle()
      const after1 = (document.getElementById('t') as HTMLElement).style.display
      $('#t').toggle()
      const after2 = (document.getElementById('t') as HTMLElement).style.display
      return { after1, after2 }
    })
    expect(result?.after1).toBe('none')
    expect(result?.after2).not.toBe('none')
  })

  test('$.fn.animate({opacity:0.5}) with $.fx.off fires callback', async ({ page }) => {
    const result = await withFxOff(page, '<div id="t">x</div>', () => {
      return new Promise<{ callbackFired: boolean; cssReset: boolean }>(resolve => {
        $('#t').animate({ opacity: 0.5 }, () => {
          // After the animation, the inline cssReset should be applied
          const t = document.getElementById('t') as HTMLElement
          const cssReset = t.style.transitionProperty === ''
          resolve({ callbackFired: true, cssReset })
        })
        setTimeout(() => resolve({ callbackFired: false, cssReset: false }), 200)
      })
    })
    expect(result?.callbackFired).toBe(true)
  })

  test('$.fn.animate() accepts a function as the duration arg (options object)', async ({
    page,
  }) => {
    const result = await withFxOff(page, '<div id="t">x</div>', () => {
      return new Promise<{ callbackFired: boolean }>(resolve => {
        $('#t').animate({ opacity: 0.5 }, () => resolve({ callbackFired: true }))
        setTimeout(() => resolve({ callbackFired: false }), 200)
      })
    })
    expect(result?.callbackFired).toBe(true)
  })

  test('$.fn.animate() with keyframe string sets animation-name', async ({ page }) => {
    // Skip $.fx.off for this one so we can inspect the cssValues applied
    // before the transition completes. Use a tiny duration to keep the
    // test fast but real.
    await page.goto('/test/fixture.html')
    const result = await page.evaluate(() => {
      document.body.innerHTML = '<div id="t">x</div>'
      const t = document.getElementById('t') as HTMLElement
      $('#t').animate('myKeyframe', 10)
      // Read what css was applied immediately
      return {
        animationName: t.style.animationName,
        animationDuration: t.style.animationDuration,
      }
    })
    expect(result.animationName).toBe('myKeyframe')
    expect(result.animationDuration).toBe('0.01s')
  })

  test('transform CSS values get composed into the transform property', async ({ page }) => {
    await page.goto('/test/fixture.html')
    const result = await page.evaluate(() => {
      document.body.innerHTML = '<div id="t">x</div>'
      const t = document.getElementById('t') as HTMLElement
      $('#t').animate({ translate: '10px', opacity: 0.5 }, 1000)
      return { transform: t.style.transform, opacity: t.style.opacity }
    })
    // translate should be composed into the transform string
    expect(result.transform).toContain('translate(10px)')
    expect(parseFloat(result.opacity)).toBe(0.5)
  })
})
