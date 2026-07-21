# Todo app — a Mepto validation tool

**Date:** 2026-07-21
**Branch:** `example-web-app`
**Status:** Approved (brainstormed 2026-07-21)
**Related:** This spec is the source of truth; the implementation plan is derived
from it.

## Purpose

Build a TodoMVC-feature-parity todo app whose primary job is to **validate Mepto
by exercising as much of its real-world API surface as possible**, surfacing
gotchas the existing 234-test unit suite cannot catch.

This is explicitly **not** a polished showcase or marketing demo. It is a
regression net: every feature exists because it stresses a Mepto subsystem, and
discovered bugs feed back into the unit suite as new assertions.

## Non-goals (YAGNI)

- Production-grade architecture (MVC split, plugin layer, keyed diffing).
- Polish/marketing-grade visual design (styling is "good enough to use").
- AJAX, backend, or remote sync — settled against in brainstorming.
- Animation beyond `show`/`hide`/`toggle` (fx module gets incidental exercise; no
  dedicated animation features).

## Decisions (from brainstorming)

| Decision     | Choice                                          | Rationale                                                   |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| Purpose      | Validation tool (Option A)                      | Coverage-first; lives in repo                               |
| Location     | `examples/todo/`                                | Served by existing Vite dev server, no config               |
| Persistence  | `localStorage`                                  | Codebase's first; no server needed; reload-testable         |
| Features     | Full TodoMVC parity                             | Maximizes Mepto API surface                                 |
| Routing      | `$(window).on('hashchange')` + `$.Callbacks`    | Pulls callback machinery into real use                      |
| Architecture | Approach 1 — single `app.ts`, max Mepto surface | Most honest validation; fewest abstraction layers           |
| Render       | Full re-render via `DocumentFragment`           | Stresses batching; bugs are Mepto bugs, not diff bugs       |
| Events       | All delegation, bound once on `<ul>`            | Highest-value real-world pattern; main gotcha probe         |
| Verification | Playwright e2e spec + manual                    | Regression net + human smoke testing                        |
| IDs          | `crypto.randomUUID()`                           | Stable across renders/deletes; survives `$.fn.data` lookups |

## File layout

```
examples/todo/
├── index.html        # markup skeleton + <script type="module"> importing app.ts
├── styles.css        # minimal TodoMVC-ish styling so it's actually usable
└── app.ts            # all app logic (state, render, events, storage, routing)

test/e2e/
└── todo-app.spec.ts  # new spec — mirrors unit-suite.spec.ts pattern

docs/superpowers/specs/
└── 2026-07-21-todo-app-design.md   # this document
```

No new config files, no `vite.config.ts` changes, no new dependencies. Vite
already serves HTML under the project root by path; Playwright already
auto-starts the dev server via the existing `playwright.config.ts` `webServer`.

## Loading

Mirror the existing `index.html` load-from-source pattern — Mepto is imported
directly from source, **no build step**:

```html
<script type="module">
  import { $ } from '/src/meptos.ts'
  // app code, or: import '/examples/todo/app.ts'
</script>
```

Editing `app.ts` and refreshing re-runs everything. The Playwright spec
navigates to the same URL the developer opens.

## Data model

Plain object, no class. Minimal shape so `JSON.stringify` round-trips cleanly
through `localStorage`:

```ts
interface Todo {
  id: string // crypto.randomUUID() — stable across renders; key for $.fn.data lookup
  title: string // trimmed, non-empty (empty input rejected before reaching storage)
  completed: boolean
}
```

`id` is generated at creation time, never mutated, never reused. UUIDs (not
array index) are deliberate: deletion + re-add must not resurrect stale
element↔data bindings, and `$.fn.data(li, 'todoId')` lookups must stay correct
after any reordering. Array-index ids silently break this.

## State

Module-scope, single source of truth:

```ts
let todos: Todo[] = []
let currentFilter: Filter = 'all' // 'all' | 'active' | 'completed'
let editingId: string | null = null // transient edit-in-place state; not persisted
```

`todos` is never exposed by reference — only via read methods.

All mutations go through small functions (`addTodo`, `toggleTodo`, `deleteTodo`,
`editTodo`, `toggleAll`, `clearCompleted`). Each mutation does three things in
order:

1. Update the `todos` array via **immutable replace** — `todos = todos.filter(...)`,
   `todos = [...todos, newTodo]`, etc. Never in-place `splice`/push.
2. Call `persist()` — direct `localStorage.setItem` per mutation (no debounce;
   writes are user-paced).
3. Call `render()` — full list re-render via `DocumentFragment`.

Immutable replace sidesteps the "mutated a node's data after delegating against
it" class of bug and makes the `$.fn.data`-after-re-render probe meaningful: we
_know_ nodes are fully replaced each render.

## Persistence adapter

The codebase's first `localStorage` usage. A tiny module:

```ts
const KEY = 'mepto-todos'

function load(): Todo[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Todo[]) : []
  } catch {
    return [] // corrupted JSON, quota errors, private mode — all degrade to empty
  }
}

function save(todos: Todo[]): void {
  localStorage.setItem(KEY, JSON.stringify(todos))
}
```

The defensive `try/catch` on load handles: corrupted JSON, Safari private-mode
`localStorage` throws, and quota-exceeded on save. The app stays usable even if
persistence is unavailable — it just won't survive reload. This is realistic and
validates that `localStorage` edge cases don't interfere with Mepto's render
path.

## Filter ↔ URL hash

| Hash          | Filter        |
| ------------- | ------------- |
| `#/` or empty | `'all'`       |
| `#/active`    | `'active'`    |
| `#/completed` | `'completed'` |

On load, read `location.hash` once to set `currentFilter`. On `hashchange`,
update `currentFilter` and re-render. Initial load order:
`load()` → parse hash → `render()`.

## Rendering

**Full re-render via `DocumentFragment`, not incremental diff.** Every mutation
calls a single `render()` that rebuilds the entire list:

```ts
function render(): void {
  const $list = $('#todo-list').empty()
  const frag = document.createDocumentFragment()

  todos.filter(byFilter(currentFilter)).forEach(todo => {
    const $li = $(template(todo)) // $() from HTML string — exercises fragment()
    $li.data('todoId', todo.id) // probe: store id on element
    frag.appendChild($li[0])
  })

  $list.append(frag) // single DOM write — one reflow
  renderCount()
  renderToggleAll()
}
```

Why full re-render over keyed updates:

- Simplest correct strategy, so any bug we hit is a _Mepto_ bug, not a diffing bug.
- Maximally stresses `$.fn.empty` + `append` with a fragment — the exact batching
  pattern `AGENTS.md` recommends. If this is slow or buggy, that's a finding.
- Re-render is user-paced (one per click/keystroke-commit), not per-frame, so
  the cost is invisible.

**Subtlety to probe deliberately:** `$.fn.empty` must detach event handlers and
`$.fn.data` for removed nodes (jQuery/Zepto semantics). Since we use _delegated_
handlers bound once on the parent `<ul>`, removing children should be safe — but
we validate that `$.fn.data` lookups in handlers still work after a full
re-render, because that's the realistic gotcha.

### Template

HTML string built per todo, parsed by `$()`:

```ts
function template(todo: Todo): string {
  return `
    <li class="${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
      <div class="view">
        <input class="toggle" type="checkbox" ${todo.completed ? 'checked' : ''} />
        <label class="todo-label">${escapeHtml(todo.title)}</label>
        <button class="destroy"></button>
      </div>
      <input class="edit" type="text" value="${escapeAttr(todo.title)}" />
    </li>`
}
```

Two probes hidden here:

1. **`$()` parsing a multi-line HTML string with nested elements** — exercises
   Mepto's `fragment()` and the table-wrapping logic path (though no tables in a
   todo list, so the `<tbody>` wrapping branch won't fire; the general fragment
   path will).
2. **XSS hygiene via `escapeHtml`/`escapeAttr`** — vanilla helpers, not Mepto.
   The app must be safe to click-test with adversarial input, and this validates
   that `$().html(string)` does _not_ sanitize (it shouldn't — jQuery-compat).

## Events

**All delegation, bound once on init.** No handler is ever bound directly to a
child `<li>`:

```ts
function bind(): void {
  $('#new-todo-form').on('submit', onSubmit) // add
  $('#toggle-all').on('change', onToggleAll) // bulk toggle
  $('#clear-completed').on('click', onClearCompleted) // bulk delete

  // Delegated — survive full re-renders; this is the main gotcha probe
  $('#todo-list')
    .on('change', '.toggle', onToggle)
    .on('click', '.destroy', onDestroy)
    .on('dblclick', '.todo-label', onEditStart)
    .on('keydown', '.edit', onEditKey)
    .on('blur', '.edit', onEditCommit)

  $(window).on('hashchange', onHashChange)
}
```

The delegation block is the heart of the validation. Every per-todo interaction
goes through `$('#todo-list').on(event, selector, handler)`, which means Mepto's
internal `matches()` + zid/handler lookup path runs on every click. If delegation
has any regression, this app surfaces it within seconds of manual testing.

### Routing via `$.Callbacks`

Deliberate over-use of `$.Callbacks` for a 3-way fan-out — exactly the kind of
real-world pub/sub the module needs exercised (currently only covered
synthetically per `AGENTS.md`). The fire/add/remove lifecycle gets real traffic:

```ts
const filterBus = $.Callbacks() // default options: not memory, not once, not unique

filterBus.add((f: Filter) => {
  currentFilter = f
  $('#filters a').removeClass('selected')
  $(`#filters a[href="#/${f === 'all' ? '' : f}"]`).addClass('selected')
  render()
})

function onHashChange(): void {
  const f: Filter =
    location.hash === '#/active' ? 'active' : location.hash === '#/completed' ? 'completed' : 'all'
  filterBus.fire(f)
}
```

### Edit-in-place

`onEditStart` sets `editingId`, adds `'editing'` class to the `<li>`, focuses
the edit input. `onEditCommit` (blur or Enter) clears it and saves. Esc cancels
without saving. Exercises `addClass`/`removeClass`, `focus()`, `val` get/set,
and per-key handling — fiddly interactions unit tests rarely cover.

## Mepto API coverage map

Every feature has a deliberate API target, making the validation goal auditable:

| Feature          | Mepto APIs exercised                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render todo list | `$()` creation from HTML string, `$.fn.append` with `DocumentFragment`, `$.fn.empty`, `find`, `attr`, `prop`, `addClass`/`removeClass`/`toggleClass`, `html`, `data` |
| Add todo         | `$(form).on('submit')`, `e.preventDefault()`, `serializeArray`, `val` (clear input after commit); count refresh via `render()` → `renderCount()`                     |
| Toggle complete  | Event delegation `$.fn.on('change', '.toggle', ...)`, `prop('checked')`, `closest`, `toggleClass('completed')`, `data`                                               |
| Edit-in-place    | `$.fn.on('dblclick', '.todo-label')`, `addClass('editing')`, `val`/`focus`, `keydown` (Enter/Esc), `blur` to commit, `trigger('blur')`                               |
| Delete           | `$.fn.on('click', '.destroy')`, `closest('li')`, `remove`                                                                                                            |
| Toggle all       | `$.fn.on('change', '#toggle-all')`, `.each`, `prop`, batched re-render                                                                                               |
| Filter           | `$(window).on('hashchange')`, `$.Callbacks`, `addClass('selected')` on filter links, conditional re-render                                                           |
| Clear completed  | `$.fn.on('click', '#clear-completed')`, filtered re-render                                                                                                           |
| Item count       | `$.fn.length`, `text`, conditional `show`/`hide` on `#main`/`#footer`                                                                                                |
| Persistence      | `localStorage` via adapter; `data` (WeakMap) for element↔todo id mapping                                                                                             |

## Verification

A Playwright e2e spec at `test/e2e/todo-app.spec.ts`, mirroring the existing
`unit-suite.spec.ts` pattern. One `test.describe` per feature area. Each `test`
clears `localStorage` first so cases are independent.

```ts
import { test, expect } from '@playwright/test'

const APP = '/examples/todo/'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto(APP)
})

test.describe('todo app', () => {
  test('add a todo', async ({ page }) => {
    await page.fill('#new-todo', 'Write design doc')
    await page.press('#new-todo', 'Enter')
    await expect(page.locator('#todo-list li')).toHaveCount(1)
    await expect(page.locator('#todo-list .todo-label')).toHaveText('Write design doc')
  })

  // Each test below follows the same fill/press/expect pattern as 'add a todo'.
  // Bodies are written during implementation; names + descriptions here are the
  // acceptance criteria.
  test(
    'toggle complete' /* add → check .toggle → assert li.completed, checkbox.checked, items-left count drops */
  )
  test(
    'edit in place — Enter commits, Esc cancels' /* dblclick label → edit input visible → type + Enter saves; Esc restores original */
  )
  test('delete' /* add → click .destroy → assert li removed and count updated */)
  test(
    'toggle all' /* add 3 → check #toggle-all → assert all li.completed and all checkboxes checked */
  )
  test(
    'clear completed' /* add 2, complete 1 → click #clear-completed → assert only the incomplete one remains */
  )
  test(
    'filter active/completed + selected link' /* add 2, complete 1 → go #/active → 1 visible; #/completed → 1 visible; selected class on correct <a> */
  )
  test(
    'persistence across reload' /* add 2 → reload → assert list restored from localStorage and hash honored */
  )
  test(
    '$.Callbacks fires on hashchange' /* add 2, complete 1 → go #/active → assert 1 visible (proves filterBus fired) */
  )
  test(
    'XSS-safe — script tag in title is rendered as text' /* add '<img src=x onerror=alert(1)>' → assert li count 1 and no dialog/error event */
  )
})
```

Properties:

- **No `waitFor`/sleeps** — Playwright auto-waits on assertions.
- **`localStorage.clear()` in `beforeEach`** — cases don't bleed.
- **One `test` per feature** — a regression points at the exact broken interaction.
- **The persistence test reloads** — validates `load()` on a fresh page load,
  which the unit suite fundamentally cannot do.
- **The XSS test** validates that `$().html(string)` is _not_ sanitizing
  (correct jQuery-compat behavior) and that the app's own `escapeHtml` is doing
  the work.

## Gotcha probes (regression targets)

These are deliberately validated. They are not accidents:

1. `$.fn.data` survives full re-render of other elements, drops for removed nodes.
2. Delegated handlers fire on dynamically inserted `<li>`s (bound once on `<ul>`).
3. `$.Callbacks` fire/add/remove lifecycle under real traffic.
4. `$()` parses multi-line HTML with nested elements (`fragment()` path).
5. `$.fn.empty` removes delegated handlers correctly.
6. Edit-in-place: focus/blur/keydown cycling, `val()` get/set.
7. `localStorage` edge cases don't break the render path.
8. Persistence survives page reload (`load()` on fresh page).
9. XSS hygiene — `$().html()` is jQuery-compat (no sanitization).
10. `hashchange` routing drives filter re-render.

## Feedback loop

If any probe finds a bug:

1. The fix goes into Mepto source (`src/*.ts`).
2. The Playwright case stays as a regression test.
3. A corresponding assertion is added to the unit suite (`index.html` and/or
   `src/mepto.test.ts`) once the bug is understood at the unit level.

This is the feedback loop the validation tool exists to create.

## Out of scope for this spec

- Tightening `tsconfig.json` (separate workstream, per `AGENTS.md` progress report).
- Converting remaining untyped modules to TypeScript.
- Any changes to `AGENTS.md`, `plans/`, `.claude/settings.local.json`, or
  `tools/llm-test-harness/` (per "Do not edit these files").
