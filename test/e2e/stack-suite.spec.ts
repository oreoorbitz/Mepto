import { test, expect } from '@playwright/test'

// Helper: load Mepto + inject markup, return a page.evaluate runner that
// captures the script's return value.
async function runWithMarkup<T>(
  page: import('@playwright/test').Page,
  html: string,
  script: () => T
): Promise<T> {
  await page.goto('/test/fixture.html')
  await page.evaluate(html => {
    document.body.innerHTML = html
  }, html)
  return page.evaluate(script)
}

test.describe('$.fn stack / end()', () => {
  test('end() returns the previous collection after .filter()', async ({ page }) => {
    const result = await runWithMarkup(
      page,
      '<div class="x"></div><div class="x"></div><div class="y"></div>',
      () => {
        const all = $('.x')
        const filtered = all.filter('.y')
        // All .x have no .y class so filter empties; end returns the full set
        return { filteredLen: filtered.length, endLen: filtered.end().length }
      }
    )
    expect(result.filteredLen).toBe(0)
    expect(result.endLen).toBe(2)
  })

  test('end() returns the previous collection after .find()', async ({ page }) => {
    const result = await runWithMarkup(
      page,
      '<div id="root"><span>1</span><span>2</span></div><div id="other"></div>',
      () => {
        const root = $('#root')
        const spans = root.find('span')
        return { rootLen: root.length, spansLen: spans.length, endLen: spans.end().length }
      }
    )
    expect(result.rootLen).toBe(1)
    expect(result.spansLen).toBe(2)
    expect(result.endLen).toBe(1)
  })

  test('end() returns an empty collection when no prevObject exists', async ({ page }) => {
    const result = await runWithMarkup(page, '', () => {
      return { endLen: $('div').end().length }
    })
    expect(result.endLen).toBe(0)
  })

  test('chained .add().end() returns the base collection', async ({ page }) => {
    const result = await runWithMarkup(
      page,
      '<p class="a">1</p><p class="b">2</p><p class="c">3</p>',
      () => {
        const a = $('.a')
        const merged = a.add('.b')
        return { aLen: a.length, mergedLen: merged.length, endLen: merged.end().length }
      }
    )
    expect(result.aLen).toBe(1)
    expect(result.mergedLen).toBe(2)
    expect(result.endLen).toBe(1)
  })

  test('chained .eq().end() returns the full collection', async ({ page }) => {
    const result = await runWithMarkup(page, '<p>1</p><p>2</p><p>3</p>', () => {
      const ps = $('p')
      return { psLen: ps.length, eqLen: ps.eq(1).length, endLen: ps.eq(1).end().length }
    })
    expect(result.psLen).toBe(3)
    expect(result.eqLen).toBe(1)
    expect(result.endLen).toBe(3)
  })
})
