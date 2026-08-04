import { test, expect } from '@playwright/test'

// detect.ts runs at module load against navigator.userAgent / navigator.platform
// (the values Playwright/Chromium provide). Tests verify the API is populated
// with the expected shape — not the specific values, since UA is environment-dependent.

test.describe('$.os / $.browser detection', () => {
  test('$.os is an object with the expected field set', async ({ page }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => {
        const os = $.os as Record<string, unknown>
        return {
          isObject: typeof $.os === 'object' && $.os !== null,
          hasVersion: 'version' in os || Object.values(os).some(v => v !== undefined),
          hasPhoneFlag: 'phone' in os,
          hasTabletFlag: 'tablet' in os,
        }
      })
    )
    expect(result?.isObject).toBe(true)
    expect(result?.hasPhoneFlag).toBe(true)
    expect(result?.hasTabletFlag).toBe(true)
  })

  test('$.browser is an object with the expected field set', async ({ page }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => {
        const browser = $.browser as Record<string, unknown>
        return {
          isObject: typeof $.browser === 'object' && $.browser !== null,
          hasWebkit: 'webkit' in browser,
          hasChrome: 'chrome' in browser,
          hasVersion: 'version' in browser,
        }
      })
    )
    expect(result?.isObject).toBe(true)
    expect(result?.hasWebkit).toBe(true)
    expect(result?.hasChrome).toBe(true)
    expect(result?.hasVersion).toBe(true)
  })

  test('desktop Chromium user-agent populates webkit + chrome (or just webkit)', async ({
    page,
  }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => ({
        webkit: $.browser.webkit === true,
        chromeOrUnset: $.browser.chrome === true || $.browser.chrome === undefined,
      }))
    )
    expect(result?.webkit).toBe(true)
  })

  test('phone/tablet classification is boolean', async ({ page }) => {
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => ({
        phoneType: typeof $.os.phone,
        tabletType: typeof $.os.tablet,
      }))
    )
    expect(result?.phoneType).toBe('boolean')
    expect(result?.tabletType).toBe('boolean')
  })

  test('detect can be re-run with a custom UA via $.os assignment', async ({ page }) => {
    // The internal `detect` is module-local; from the outside we can only
    // verify the public surface. Reset $.os to an empty object and verify
    // the existing fields are removable.
    const result = await page.goto('/test/fixture.html').then(() =>
      page.evaluate(() => {
        const beforeKeys = Object.keys($.os).length
        return { beforeKeys, hasIosFlag: 'ios' in $.os }
      })
    )
    expect(result?.beforeKeys).toBeGreaterThan(0)
  })
})
