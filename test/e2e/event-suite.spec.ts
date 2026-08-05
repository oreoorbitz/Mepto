import { test, expect } from '@playwright/test'

async function withMepto<T>(page: import('@playwright/test').Page, fn: () => T): Promise<T> {
  await page.goto('/test/fixture.html')
  return page.evaluate(fn)
}

test.describe('Event delegation', () => {
  test('event delegation: this is the matched descendant, not the bound element', async ({
    page,
  }) => {
    const result = await withMepto(page, () => {
      const parent = document.createElement('div')
      const child = document.createElement('button')
      child.id = 'kid'
      parent.appendChild(child)
      document.body.appendChild(parent)
      let handlerThis: Element | null = null
      $(parent).on('click', '#kid', function (this: Element) {
        handlerThis = this
      })
      child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return { thisIsChild: handlerThis === child, thisIsParent: handlerThis === parent }
    })
    expect(result.thisIsChild).toBe(true)
    expect(result.thisIsParent).toBe(false)
  })

  test('event delegation: event.currentTarget is the bound element (regression)', async ({
    page,
  }) => {
    // Regression: previously event.currentTarget was set to the matched
    // descendant instead of the bound element, breaking jQuery's contract
    // that currentTarget always points to the listener host.
    // Extract ids in the page context because Element references don't
    // survive Playwright's cross-realm serialization.
    const result = await withMepto(page, () => {
      const parent = document.createElement('div')
      const child = document.createElement('button')
      parent.id = 'par'
      child.id = 'kid'
      parent.appendChild(child)
      document.body.appendChild(parent)
      let captured: { currentTargetId: string | null; targetId: string | null } | null = null
      $(parent).on('click', '#kid', function (this: Element, e: Event) {
        captured = {
          currentTargetId: e.currentTarget ? (e.currentTarget as Element).id : null,
          targetId: e.target ? (e.target as Element).id : null,
        }
      })
      child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return captured
    })
    expect(result?.currentTargetId).toBe('par')
    expect(result?.targetId).toBe('kid')
  })

  test('event delegation: liveFired is set to the bound element (for .live() compat)', async ({
    page,
  }) => {
    const result = await withMepto(page, () => {
      const parent = document.createElement('div')
      const child = document.createElement('button')
      child.id = 'kid'
      parent.appendChild(child)
      document.body.appendChild(parent)
      let liveFired: Element | null = null
      $(parent).on('click', '#kid', function (this: Element, e: Event) {
        liveFired = (e as Event & { liveFired?: Element }).liveFired ?? null
      })
      child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return { liveFired, isParent: liveFired === parent }
    })
    expect(result.isParent).toBe(true)
  })
})

test.describe('$.fn.remove() / empty() event cleanup', () => {
  test('.remove() unbinds event handlers (regression)', async ({ page }) => {
    // Regression: previously .remove() only called removeData() and left
    // event handlers in the handlers WeakMap, so handlers still fired
    // on detached/re-attached nodes — both a memory leak and a behavior
    // bug. Now matches jQuery's cleanData behavior.
    const result = await withMepto(page, () => {
      const div = $('<div>').appendTo('body')
      let count = 0
      div.on('click', () => count++)
      div.trigger('click')
      const beforeRemove = count
      div.remove()
      div.trigger('click') // detached — should NOT fire
      return { beforeRemove, afterRemove: count }
    })
    expect(result.beforeRemove).toBe(1)
    expect(result.afterRemove).toBe(1)
  })

  test('.empty() unbinds event handlers on removed children', async ({ page }) => {
    const result = await withMepto(page, () => {
      const div = $('<div>').appendTo('body')
      const span = $('<span>').appendTo(div)
      let count = 0
      span.on('click', () => count++)
      span.trigger('click')
      const beforeEmpty = count
      div.empty()
      span.trigger('click') // detached — should NOT fire
      return { beforeEmpty, afterEmpty: count }
    })
    expect(result.beforeEmpty).toBe(1)
    expect(result.afterEmpty).toBe(1)
  })

  test('.remove() on a parent unbinds handlers on all descendants', async ({ page }) => {
    const result = await withMepto(page, () => {
      const parent = $('<div></div>').appendTo('body')
      const child1 = $('<span></span>').appendTo(parent)
      const child2 = $('<p></p>').appendTo(parent)
      let child1Calls = 0
      let child2Calls = 0
      child1.on('click', () => child1Calls++)
      child2.on('click', () => child2Calls++)
      parent.remove()
      child1.trigger('click')
      child2.trigger('click')
      return { child1Calls, child2Calls }
    })
    expect(result.child1Calls).toBe(0)
    expect(result.child2Calls).toBe(0)
  })

  test(".remove() leaves other elements' handlers intact", async ({ page }) => {
    // Sanity: removing one element shouldn't affect handlers on siblings.
    const result = await withMepto(page, () => {
      const a = $('<div id="a"></div>').appendTo('body')
      const b = $('<div id="b"></div>').appendTo('body')
      let aCalls = 0
      let bCalls = 0
      a.on('click', () => aCalls++)
      b.on('click', () => bCalls++)
      a.remove()
      a.trigger('click')
      b.trigger('click')
      return { aCalls, bCalls }
    })
    expect(result.aCalls).toBe(0)
    expect(result.bCalls).toBe(1)
  })
})
