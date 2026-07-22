import { test, expect } from '@playwright/test'

/**
 * End-to-end spec for the Mepto Todo example app.
 *
 * The todo app is a validation tool: every feature exists to exercise a slice
 * of Mepto's real-world API surface. These tests are the regression net. Each
 * test clears localStorage first so cases stay independent.
 *
 * See docs/superpowers/specs/2026-07-21-todo-app-design.md
 */

const APP = '/examples/todo/'

test.beforeEach(async ({ page }) => {
  // Clear localStorage once per test, then reload so the app's init() reads a
  // clean store. We deliberately do NOT use addInitScript here: it would run on
  // every navigation (including reloads within a test), which would wipe state
  // the persistence test needs to survive a reload.
  await page.goto(APP)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

// Small helper: type into the new-todo input and press Enter to add one item.
async function addTodo(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.fill('#new-todo', title)
  await page.press('#new-todo', 'Enter')
}

// The TodoMVC stylesheet hides `.destroy` until `:hover` and makes `.toggle`
// / `#toggle-all` opacity:0 with overlapping hit areas. Coordinate-based clicks
// can't reach these reliably (no `:hover` on touch devices, overlap on desktop),
// so we dispatch real DOM events instead — they still flow through Mepto's
// delegated `on('click'/'change', selector, ...)` handlers.
async function toggleCheckbox(
  page: import('@playwright/test').Page,
  selector: string
): Promise<void> {
  await page.locator(selector).evaluate((el: HTMLInputElement) => {
    el.checked = true
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickHidden(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.locator(selector).dispatchEvent('click')
}

test.describe('todo app', () => {
  test('add a todo', async ({ page }) => {
    await addTodo(page, 'Write design doc')
    await expect(page.locator('#todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('Write design doc')
  })

  test('toggle complete', async ({ page }) => {
    await addTodo(page, 'Task one')

    // Check the toggle checkbox.
    await toggleCheckbox(page, '#todo-list li:first-child .toggle')

    // The <li> gains the 'completed' class; the checkbox is checked.
    await expect(page.locator('#todo-list li:first-child')).toHaveClass(/completed/)
    await expect(page.locator('#todo-list li:first-child .toggle')).toBeChecked()

    // items-left count drops to 0.
    await expect(page.locator('#todo-count-num')).toHaveText('0')
  })

  test('edit in place — Enter commits, Esc cancels', async ({ page }) => {
    await addTodo(page, 'original title')

    // Enter edit mode.
    await page.dblclick('#todo-list .todo-label')
    await expect(page.locator('#todo-list li:first-child')).toHaveClass(/editing/)

    // Type a new title and commit with Enter.
    const edit = page.locator('#todo-list .edit')
    await edit.fill('committed title')
    await edit.press('Enter')
    await expect(page.locator('#todo-list .todo-label')).toHaveText('committed title')
  })

  test('edit in place — Esc cancels without saving', async ({ page }) => {
    await addTodo(page, 'keep me')

    await page.dblclick('#todo-list .todo-label')
    const edit = page.locator('#todo-list .edit')
    await edit.fill('should be discarded')
    await edit.press('Escape')

    // Original title is preserved; editing class is gone.
    await expect(page.locator('#todo-list .todo-label')).toHaveText('keep me')
    await expect(page.locator('#todo-list li:first-child')).not.toHaveClass(/editing/)
  })

  test('delete', async ({ page }) => {
    await addTodo(page, 'doomed')

    await expect(page.locator('#todo-list li')).toHaveCount(1)
    // .destroy is display:none until :hover (no hover on touch). Dispatch the
    // click so it flows through Mepto's delegated handler.
    await clickHidden(page, '#todo-list .destroy')
    await expect(page.locator('#todo-list li')).toHaveCount(0)
    // main + footer collapse when the list empties.
    await expect(page.locator('#main')).toBeHidden()
    await expect(page.locator('#footer')).toBeHidden()
  })

  test('toggle all', async ({ page }) => {
    await addTodo(page, 'one')
    await addTodo(page, 'two')
    await addTodo(page, 'three')

    // #toggle-all is opacity:0 and overlapped by a list .toggle checkbox, so a
    // coordinate-based click can't reach it reliably. Drive it via its real
    // 'change' handler (which Mepto binds directly on the element) — this still
    // exercises the app's onToggleAll path.
    await toggleCheckbox(page, '#toggle-all')

    // Every item is completed and every checkbox is checked.
    await expect(page.locator('#todo-list li.completed')).toHaveCount(3)
    await expect(page.locator('#todo-list .toggle')).toHaveCount(3)
    for (const cb of await page.locator('#todo-list .toggle').all()) {
      await expect(cb).toBeChecked()
    }
    // items-left is 0.
    await expect(page.locator('#todo-count-num')).toHaveText('0')
  })

  test('clear completed', async ({ page }) => {
    await addTodo(page, 'finish me')
    await addTodo(page, 'done already')

    // Complete only the second item.
    await toggleCheckbox(page, '#todo-list li:nth-child(2) .toggle')

    // #clear-completed is float:right and overlapped by #footer's hit area on
    // some viewports. Dispatch the click through Mepto's real handler.
    await clickHidden(page, '#clear-completed')

    // Only the incomplete item remains.
    await expect(page.locator('#todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('finish me')
  })

  test('filter active/completed + selected link', async ({ page }) => {
    await addTodo(page, 'active item')
    await addTodo(page, 'completed item')
    await toggleCheckbox(page, '#todo-list li:nth-child(2) .toggle')

    // #/active shows only the incomplete one.
    await page.goto(APP + '#/active')
    await expect(page.locator('#todo-list li:visible, #todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('active item')
    await expect(page.locator('#filters a[href="#/active"]')).toHaveClass(/selected/)

    // #/completed shows only the completed one.
    await page.goto(APP + '#/completed')
    await expect(page.locator('#todo-list li:visible, #todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('completed item')
    await expect(page.locator('#filters a[href="#/completed"]')).toHaveClass(/selected/)
  })

  test('persistence across reload', async ({ page }) => {
    await addTodo(page, 'persisted one')
    await addTodo(page, 'persisted two')
    await toggleCheckbox(page, '#todo-list li:first-child .toggle')

    // Reload: state must be restored from localStorage and hash honored.
    await page.reload()
    await expect(page.locator('#todo-list li')).toHaveCount(2)
    await expect(page.locator('#todo-list .todo-label').nth(0)).toHaveText('persisted one')
    await expect(page.locator('#todo-list li:first-child')).toHaveClass(/completed/)
  })

  test('$.Callbacks fires on hashchange', async ({ page }) => {
    await addTodo(page, 'active item')
    await addTodo(page, 'completed item')
    await toggleCheckbox(page, '#todo-list li:nth-child(2) .toggle')

    // Navigate via hashchange (not full reload) so filterBus.fire() runs.
    await page.evaluate(() => {
      location.hash = '#/active'
    })
    await expect(page.locator('#todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('active item')
    await expect(page.locator('#filters a[href="#/active"]')).toHaveClass(/selected/)
  })

  test('XSS-safe — script tag in title is rendered as text', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e)))

    // An inline event handler in the title must NOT execute when rendered.
    const dialogPromise = page
      .waitForEvent('dialog', { timeout: 1000 })
      .then(d => d.dismiss())
      .catch(() => null)

    await addTodo(page, '<img src=x onerror=alert(1)>')

    // No dialog fired and the payload is rendered as inert text.
    expect(await dialogPromise).toBeNull()
    await expect(page.locator('#todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('<img src=x onerror=alert(1)>')
    expect(errors).toHaveLength(0)
  })

  test('empty/whitespace input is rejected', async ({ page }) => {
    await addTodo(page, '   ')
    await expect(page.locator('#todo-list li')).toHaveCount(0)
    await expect(page.locator('#main')).toBeHidden()
  })
})
