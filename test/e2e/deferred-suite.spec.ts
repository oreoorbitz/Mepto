import { test, expect } from '@playwright/test'

async function withMepto<T>(page: import('@playwright/test').Page, fn: () => T): Promise<T> {
  await page.goto('/test/fixture.html')
  return page.evaluate(fn)
}

test.describe('$.Deferred', () => {
  test('pending → resolved state transition with done()', async ({ page }) => {
    const result = await withMepto(page, () => {
      const d = $.Deferred()
      const beforeState = d.state()
      let received: unknown = null
      d.done((v: unknown) => {
        received = v
      })
      d.resolve('ok')
      return { beforeState, afterState: d.state(), received }
    })
    expect(result?.beforeState).toBe('pending')
    expect(result?.afterState).toBe('resolved')
    expect(result?.received).toBe('ok')
  })

  test('pending → rejected state transition with fail()', async ({ page }) => {
    const result = await withMepto(page, () => {
      const d = $.Deferred()
      let received: unknown = null
      d.fail((v: unknown) => {
        received = v
      })
      d.reject('nope')
      return { state: d.state(), received }
    })
    expect(result?.state).toBe('rejected')
    expect(result?.received).toBe('nope')
  })

  test('progress() callback fires on each notify()', async ({ page }) => {
    // The progress Callbacks list is {memory: true} but NOT {once: true},
    // so the list isn't cleared after each fire. A callback registered
    // before multiple notifies will receive all of them. A callback
    // registered after a notify will also receive subsequent notifies.
    const result = await withMepto(page, () => {
      const d = $.Deferred()
      const received: number[] = []
      d.progress((v: number) => received.push(v))
      d.notify(1)
      d.notify(2)
      d.notify(3)
      return received
    })
    expect(result).toEqual([1, 2, 3])
  })

  test('always() fires for both resolve and reject', async ({ page }) => {
    const result = await withMepto(page, () => {
      let count = 0
      const bump = () => count++
      const d1 = $.Deferred()
      d1.always(bump)
      d1.resolve()
      const d2 = $.Deferred()
      d2.always(bump)
      d2.reject()
      return count
    })
    expect(result).toBe(2)
  })

  test('then() with only doneFilter chains resolved value to next done', async ({ page }) => {
    const result = await withMepto(page, () => {
      let final: number | null = null
      const d = $.Deferred()
      d.then((v: number) => (v as number) * 2, undefined, undefined).done((v: unknown) => {
        final = v as number
      })
      d.resolve(5)
      return final
    })
    expect(result).toBe(10)
  })

  test('then() failFilter is invoked on reject', async ({ page }) => {
    // mepto's then() routes the failFilter's return through the new
    // deferred's rejectWith, so the .fail() handler (not .done()) receives
    // the filtered value. This differs from jQuery 3.x, where failFilter
    // results become a resolution of the new promise. Verify mepto's
    // semantics directly.
    const result = await withMepto(page, () => {
      const d = $.Deferred()
      let failArg: unknown = null
      let failResult: unknown = null
      d.then(undefined, (r: unknown) => 'caught:' + String(r)).fail((v: unknown) => {
        failResult = v
      })
      // Side-effect probe: confirm the failFilter ran with the right input
      d.then(undefined, (r: unknown) => {
        failArg = r
      })
      d.reject('boom')
      return { failArg, failResult }
    })
    expect(result?.failArg).toBe('boom')
    expect(result?.failResult).toBe('caught:boom')
  })

  test('promise() returns a chained promise with the same methods', async ({ page }) => {
    const result = await withMepto(page, () => {
      const d = $.Deferred()
      const p = d.promise()
      let received: unknown = null
      p.done((v: unknown) => {
        received = v
      })
      d.resolve('via-promise')
      return received
    })
    expect(result).toBe('via-promise')
  })

  test('deferred is a one-shot — second resolve is ignored', async ({ page }) => {
    const result = await withMepto(page, () => {
      const calls: number[] = []
      const d = $.Deferred()
      d.done((v: number) => calls.push(v))
      d.resolve(1)
      d.resolve(2)
      return calls
    })
    // once:1 means the callbacks list is disabled after first fire
    expect(result).toEqual([1])
  })

  test('$.when() with single resolved deferred resolves immediately', async ({ page }) => {
    const result = await withMepto(page, () => {
      let received: unknown = null
      const d = $.Deferred()
      d.resolve('solo')
      return $.when(d)
        .done((v: unknown) => {
          received = v
        })
        .state()
    })
    expect(result).toBe('resolved')
  })

  test('$.when() with multiple deferreds delivers the array of values as a single arg', async ({
    page,
  }) => {
    // Regression: mepto's $.when used to spread the array into individual
    // arguments (callback received 'a' as first arg instead of ['a','b']).
    // The fix: resolveWith is called with [resolveValues] so the array
    // reaches the done callback as a single value. Matches jQuery 3.x.
    const result = await withMepto(page, () => {
      const d1 = $.Deferred()
      const d2 = $.Deferred()
      let received: unknown = null
      $.when(d1, d2).done((v: unknown) => {
        received = v
      })
      d1.resolve('a')
      const afterFirst = received
      d2.resolve('b')
      return new Promise<{ afterFirst: unknown; final: unknown }>(resolve => {
        setTimeout(() => resolve({ afterFirst, final: received }), 10)
      })
    })
    expect(result.afterFirst).toBeNull()
    expect(result.final).toEqual(['a', 'b'])
  })

  test('$.when() with no arguments resolves immediately', async ({ page }) => {
    const result = await withMepto(page, () => {
      return $.when().state()
    })
    expect(result).toBe('resolved')
  })

  test('$.when() with a single non-thenable passes it through as the value', async ({ page }) => {
    // Regression: $.when(5) used to deliver [5] to the done callback because
    // the all-non-thenables path wrapped the resolve values in an extra
    // array. jQuery 3.x semantics: a single non-thenable is delivered as
    // its raw value, with no wrap.
    const result = await withMepto(page, () => {
      let received: unknown = null
      let argsLength = 0
      $.when(5).done(function (...args: unknown[]) {
        received = args[0]
        argsLength = args.length
      })
      return { received, argsLength }
    })
    expect(result.received).toBe(5)
    expect(result.argsLength).toBe(1)
  })

  test('$.when() with no arguments delivers no value to the done callback', async ({ page }) => {
    // Regression: $.when() used to deliver [] to the done callback because
    // the all-non-thenables path wrapped []. jQuery 3.x semantics: no
    // arguments, so the done callback receives no value.
    const result = await withMepto(page, () => {
      let argsLength = -1
      let firstArg: unknown = 'unset'
      $.when().done(function (...args: unknown[]) {
        argsLength = args.length
        firstArg = args[0]
      })
      return { argsLength, firstArg }
    })
    expect(result.argsLength).toBe(0)
  })

  test('$.when() with multiple non-thenables delivers them as spread args', async ({ page }) => {
    // Regression: $.when(5, 10) used to deliver [5, 10] as a single arg
    // because of the same extra-array wrap. jQuery 3.x semantics: spread.
    const result = await withMepto(page, () => {
      let received: unknown[] = []
      $.when(5, 10).done(function (...args: unknown[]) {
        received = args
      })
      return { received, length: received.length }
    })
    expect(result.length).toBe(2)
    expect(result.received[0]).toBe(5)
    expect(result.received[1]).toBe(10)
  })
})
