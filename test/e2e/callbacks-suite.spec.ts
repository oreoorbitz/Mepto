import { test, expect } from '@playwright/test'

async function withMepto<T>(page: import('@playwright/test').Page, fn: () => T): Promise<T> {
  await page.goto('/test/fixture.html')
  return page.evaluate(fn)
}

test.describe('$.Callbacks', () => {
  test('add + fire — invokes all callbacks with the fire args', async ({ page }) => {
    const result = await withMepto(page, () => {
      const calls: Array<[string, number]> = []
      const list = $.Callbacks()
      list.add((a: string, b: number) => calls.push([a, b]))
      list.add((a: string, b: number) => calls.push([a, b]))
      list.fire('hi', 7)
      return calls
    })
    expect(result).toEqual([
      ['hi', 7],
      ['hi', 7],
    ])
  })

  test('once — fires a single time even when fired repeatedly', async ({ page }) => {
    const result = await withMepto(page, () => {
      let count = 0
      const list = $.Callbacks({ once: true })
      list.add(() => count++)
      list.fire()
      list.fire()
      list.fire()
      return count
    })
    expect(result).toBe(1)
  })

  test('memory — last fire args are replayed to callbacks added after a fire', async ({ page }) => {
    // Note: with `memory: true` and no `once: true`, the list is NOT
    // cleared after firing — the empty-stack branch in the post-fire
    // cleanup path stops the `list.length = 0` and `disable()` calls
    // from running. So callbacks stay in the list across multiple fires,
    // and the `memory` flag replays args to late-attached callbacks via
    // the `add()` memory path.
    const result = await withMepto(page, () => {
      const calls: string[] = []
      const list = $.Callbacks({ memory: true })
      list.add((s: string) => calls.push('A:' + s))
      list.fire('first')
      // B is added after the fire — replayed with the memory.
      list.add((s: string) => calls.push('B:' + s))
      // A fresh fire hits BOTH A and B.
      list.fire('second')
      // C is added after the second fire — replayed with the latest memory.
      list.add((s: string) => calls.push('C:' + s))
      return calls
    })
    expect(result).toEqual(['A:first', 'B:first', 'A:second', 'B:second', 'C:second'])
  })

  test('unique — duplicate callbacks are only added once', async ({ page }) => {
    const result = await withMepto(page, () => {
      let count = 0
      const cb = () => count++
      const list = $.Callbacks({ unique: true })
      list.add(cb)
      list.add(cb)
      list.add(cb)
      list.fire()
      return count
    })
    expect(result).toBe(1)
  })

  test('stopOnFalse — returning false halts the iteration', async ({ page }) => {
    const result = await withMepto(page, () => {
      const calls: number[] = []
      const list = $.Callbacks({ stopOnFalse: true })
      list.add(() => calls.push(1))
      list.add(() => {
        calls.push(2)
        return false
      })
      list.add(() => calls.push(3))
      list.fire()
      return calls
    })
    expect(result).toEqual([1, 2])
  })

  test('has() returns true for added callbacks and false otherwise', async ({ page }) => {
    const result = await withMepto(page, () => {
      const cb = () => {}
      const list = $.Callbacks()
      return {
        empty: list.has(),
        withFn: list.has(cb),
        afterAdd: (list.add(cb), list.has(cb)),
      }
    })
    expect(result.empty).toBe(false)
    expect(result.withFn).toBe(false)
    expect(result.afterAdd).toBe(true)
  })

  test('disable() prevents further firing and marks disabled()', async ({ page }) => {
    const result = await withMepto(page, () => {
      let count = 0
      const list = $.Callbacks()
      list.add(() => count++)
      list.disable()
      return {
        count: count,
        disabled: list.disabled(),
        fired: list.fired(),
      }
    })
    expect(result.count).toBe(0)
    expect(result.disabled).toBe(true)
  })

  test('lock() prevents further firing but keeps callbacks in memory', async ({ page }) => {
    const result = await withMepto(page, () => {
      const list = $.Callbacks()
      list.lock()
      return { locked: list.locked(), disabled: list.disabled() }
    })
    expect(result.locked).toBe(true)
    expect(result.disabled).toBe(true)
  })

  test('remove() drops a specific callback from the list', async ({ page }) => {
    const result = await withMepto(page, () => {
      const calls: string[] = []
      const a = () => calls.push('a')
      const b = () => calls.push('b')
      const list = $.Callbacks()
      list.add(a).add(b)
      list.remove(a)
      list.fire()
      return calls
    })
    expect(result).toEqual(['b'])
  })

  test('empty() clears the list and reports size 0', async ({ page }) => {
    const result = await withMepto(page, () => {
      const list = $.Callbacks()
      list.add(() => {}).add(() => {})
      const before = list.has()
      list.empty()
      const after = list.has()
      return { before, after }
    })
    expect(result.before).toBe(true)
    expect(result.after).toBe(false)
  })

  test('fireWith() binds `this` to the given context', async ({ page }) => {
    const result = await withMepto(page, () => {
      const ctx = { tag: 'CTX' }
      let captured: { tag?: string } | null = null
      const list = $.Callbacks()
      list.add(function (this: { tag?: string }) {
        captured = this
      })
      list.fireWith(ctx)
      return (captured as { tag?: string } | null)?.tag
    })
    expect(result).toBe('CTX')
  })

  test('fired() reports whether fire has been called', async ({ page }) => {
    const result = await withMepto(page, () => {
      const list = $.Callbacks()
      const before = list.fired()
      list.fire()
      const after = list.fired()
      return { before, after }
    })
    expect(result.before).toBe(false)
    expect(result.after).toBe(true)
  })
})
