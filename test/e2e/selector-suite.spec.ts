import { test, expect } from '@playwright/test'

async function withMepto<T>(page: import('@playwright/test').Page, fn: () => T): Promise<T> {
  await page.goto('/test/fixture.html')
  return page.evaluate(fn)
}

test.describe('$.fn.is with pseudo-extensions', () => {
  // Regression: mepto.matches used to throw a SyntaxError when given an
  // unrecognised pseudo (e.g. `:lt(1)`) because the fallback path called
  // `element.matches(selector)` on a selector it can't parse. `.is()`
  // should return false for invalid selectors, not throw.
  test('$.fn.is does not throw on unrecognised pseudo like :lt/:gt', async ({ page }) => {
    const result = await withMepto(page, () => {
      const div = document.createElement('div')
      div.innerHTML = '<p>A</p><p>B</p><p>C</p>'
      document.body.appendChild(div)
      const p = div.querySelector('p')!
      let threw = false
      let isLt = false
      let isGt = false
      try {
        isLt = $(p).is(':lt(1)')
      } catch (e) {
        threw = true
      }
      try {
        isGt = $(p).is(':gt(0)')
      } catch (e) {
        threw = threw || true
      }
      return { threw, isLt, isGt }
    })
    expect(result.threw).toBe(false)
    // :lt(1) and :gt(0) are not in the recognised pseudo-extension list,
    // so the call falls through to the native selector engine, which
    // rejects them. We don't pin the boolean — only that the call doesn't
    // blow up the caller's code.
    expect(typeof result.isLt).toBe('boolean')
    expect(typeof result.isGt).toBe('boolean')
  })

  // Regression: mepto.matches used to pass idx=0 unconditionally to the
  // filter, so `.is(':eq(0)')` was true for every element and `.is(':eq(N))`
  // for N>0 was false for every element. The qsa path is correct; the
  // matches path was broken.
  test('$.fn.is(":eq(N)) respects the element\'s position', async ({ page }) => {
    const result = await withMepto(page, () => {
      const div = document.createElement('div')
      div.id = 'eq-test-container'
      div.innerHTML = '<p id="pa">A</p><p id="pb">B</p><p id="pc">C</p>'
      document.body.appendChild(div)
      const pa = document.getElementById('pa')!
      const pb = document.getElementById('pb')!
      const pc = document.getElementById('pc')!
      return {
        aIsEq0: $(pa).is(':eq(0)'),
        bIsEq0: $(pb).is(':eq(0)'),
        cIsEq0: $(pc).is(':eq(0)'),
        aIsEq2: $(pa).is(':eq(2)'),
        bIsEq2: $(pb).is(':eq(2)'),
        cIsEq2: $(pc).is(':eq(2)'),
        // Sanity: qsa path was always correct — scope to the test's div
        // so the lookup isn't affected by other test fixtures in the doc
        qsaEq0Id: $('#eq-test-container p:eq(0)').attr('id'),
        qsaEq1Id: $('#eq-test-container p:eq(1)').attr('id'),
        qsaEq2Id: $('#eq-test-container p:eq(2)').attr('id'),
      }
    })
    // First p is at index 0 in its parent: :eq(0) true, :eq(2) false
    expect(result.aIsEq0).toBe(true)
    expect(result.aIsEq2).toBe(false)
    // Middle p is at index 1
    expect(result.bIsEq0).toBe(false)
    // Last p is at index 2: :eq(2) true, :eq(0) false
    expect(result.cIsEq0).toBe(false)
    expect(result.cIsEq2).toBe(true)
    // qsa path is unaffected — sanity check
    expect(result.qsaEq0Id).toBe('pa')
    expect(result.qsaEq1Id).toBe('pb')
    expect(result.qsaEq2Id).toBe('pc')
  })
})
