# Agent Development Guide for Mepto

## Library Goal

Mepto is a lightweight, modern replacement for jQuery. The core aim is to match jQuery's ergonomics while outperforming it by reducing browser overhead — fewer reflows, repaints, layout thrashes, and unnecessary DOM queries. Teams should be able to gradually replace jQuery with Mepto without sacrificing performance, and often gaining it.

**Browser target: evergreen browsers only.** No IE, no legacy Edge, no Safari < 14. Do not add polyfills, fallbacks, or feature-detection code for old browsers. Use native platform APIs (`WeakMap`, `WeakSet`, `queueMicrotask`, `AbortController`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, `classList`, `closest`, `dataset`, etc.) freely — they are all available in the target environment. If you encounter legacy-compatibility code in the existing source, you may remove it.

## Quick Start for LLMs

When making changes to this codebase, follow this routine to avoid common pitfalls:

### Verify your change (fast path — no build needed)

```bash
npm test                              # Vitest: 73 tests in jsdom, ~1s
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium  # Playwright: 228 tests in real browser, ~2s
```

**The root `index.html` loads Mepto from source via ES module imports.** No build step is required for testing. Both Vitest and Playwright work directly against source.

### One-shot full validation

```bash
npm run test:all                      # kills old servers, runs vitest + playwright
```

### If you get port conflicts

Dev servers linger on ports 3000-3099. Kill them first:

```bash
npm run killports                     # kills all servers on 3000-3099
npx playwright test ...               # Playwright will auto-start a fresh dev server
```

### About `npm run build`

**The build will print TypeScript errors.** This is expected. The project is ~30% through a TypeScript transition — 10 of 17 modules are unconverted and contain type errors. These errors come from `vite-plugin-dts` (type declaration generator), not from esbuild (which strips types and produces working JS).

- The build **succeeds** (exit code 0) despite the errors
- `dist/meptos.umd.cjs` and `dist/meptos.js` are produced correctly
- If you see a flood of red error output from `vite build`, that's normal — ignore it
- To check if YOU introduced a new error, use `npm run typecheck` (runs `tsc --noEmit`) with a baseline comparison, or just compare build error count

### The three test commands, ranked by speed

| Command                                      | Time | Tests                | What it checks                                      |
| -------------------------------------------- | ---- | -------------------- | --------------------------------------------------- |
| `npm test`                                   | ~1s  | 73                   | Vitest in jsdom — fast unit tests                   |
| `npx playwright test ... --project=chromium` | ~2s  | 228                  | Full suite in real Chromium                         |
| `npm run test:e2e`                           | ~5s  | All Playwright specs | All browsers (chromium + firefox + webkit + mobile) |

Prefer `npm test` for rapid iteration. Use `npx playwright test ...` for final verification.

### How the dev server works

`npm run dev` scans ports 3000–3099, binds to the first available one, and writes it to `.port`. The Playwright config reads `.port` at startup and navigates to `http://localhost:<port>/`. The test page at `/` (root `index.html`) loads Mepto from source and runs 228 assertions.

### Do not edit these files

- `.claude/settings.local.json` — Claude permissions/settings
- `plans/` — planning documents
- `tools/llm-test-harness/` — Harness source; only modify if improving the harness itself

### What's tested / what's not

The 228-test suite in `index.html` and the 73-test Vitest suite in `src/mepto.test.ts` cover: type utilities, selectors, DOM manipulation, attributes, CSS, events, form serialization, and dimensions. **Not covered:** AJAX, deferreds/promises, callbacks, animations (fx), touch events, gesture, browser detection, assets, stack methods. When modifying those modules, add tests to the root `index.html` suite.

---

## Current Task

Transition all source files to TypeScript, adding parameter types to untyped functions. Refactor antipatterns (shared mutable module-level variables, parameter mutation, `let` where `const` applies) as they are encountered. Verify each change with the 228-test suite before moving on.

---

## Progress Report (as of Apr 2026)

### Overall: ~30% complete

Legacy files deleted. `mepto.ts` `let` → `const` cleanup and vendor-prefix removal done. 4 of 17 modules fully converted (`data.ts`, `callbacks.ts`, `deferred.ts`, `form.ts`). 10 modules remain as JavaScript in practice.

### Completed

- [x] **Delete dead legacy files**: Removed `ie.ts`, `ios3.ts`, `amd_layout.ts`
- [x] **Remove legacy IE code from `touch.ts`**: Removed `MSGesture`, `MSPointer*`, `onmspointerdown` vendor-prefixed code
- [x] **Remove deprecated jQuery APIs from `event.ts`**: Removed `$.fn.live` and `$.fn.die`
- [x] **Convert `mepto.ts` antipatterns**: `let` → `const` for 25+ module-level variables. Removed `const undefined = void 0` antipattern. Simplified `mepto.matches` (removed vendor-prefix fallbacks). `const` for local vars where applicable.
- [x] **Convert `data.ts`**: `var` → `const`/`let`, added type annotations, migrated plain object cache to `WeakMap`, replaced `node[exp]` property expansion with `Symbol`
- [x] **Convert `callbacks.ts`**: `var` → `const`/`let`, typed closure state and all params
- [x] **Convert `deferred.ts`**: `var` → `const`/`let`, typed tuples, deferred, and promise objects
- [x] **Convert `form.ts`**: `var` → `const`/`let`, typed all params and return values

### Per-File Status

| File            | Lines | Typing          | Key Issues                                                                                                                                                 |
| --------------- | ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | 466   | **Done**        | `Mepto.matches` typed as bare `Function` — should get a proper signature                                                                                   |
| `meptos.ts`     | 55    | **Mostly done** | Minor: dead-code guard (`if($ === undefined)`) always false                                                                                                |
| `mepto.ts`      | ~1430 | **Partial**     | `let` → `const` done. Vendor-prefix code removed. Many `any` types remain on core APIs. Shared mutable `elementDisplay`, `classCache`, `class2type`        |
| `data.ts`       | 92    | **Done**        | `WeakMap` cache, `Symbol` expando, typed params                                                                                                            |
| `callbacks.ts`  | 122   | **Done**        | Typed closure state and all methods                                                                                                                        |
| `deferred.ts`   | 118   | **Done**        | Typed tuples, deferred/promise objects                                                                                                                     |
| `form.ts`       | 40    | **Done**        | All params and return values typed                                                                                                                         |
| `event.ts`      | ~270  | **Not started** | All `var`, zero annotations. Shared mutable `handlers` map and `_zid` counter. Untyped params throughout. `fn` mutation inside `add()` for hover emulation |
| `ajax.ts`       | 381   | **Not started** | All `var`, zero annotations. Shared mutable `jsonpID`, `originAnchor`. `settings` mutated throughout. Indirect `(1,eval)(result)`                          |
| `fx.ts`         | 123   | **Not started** | All `var`, zero annotations. Shared mutable vendor-prefix detection vars. `cssReset` built by chained side-effect                                          |
| `fx_methods.ts` | 71    | **Not started** | All `var`, zero annotations                                                                                                                                |
| `selector.ts`   | 85    | **Not started** | All `var`, zero annotations. Shared mutable `classTag` with timestamp. `process()` mutates `sel`/`arg`                                                     |
| `assets.ts`     | 21    | **Not started** | All `var`, zero annotations. Shared mutable `cache` array and `timeout` ID                                                                                 |
| `detect.ts`     | 72    | **Not started** | All `var`, zero annotations. Sets `this.os`/`this.browser` on `$` context                                                                                  |
| `stack.ts`      | 22    | **Not started** | All `var`, zero annotations                                                                                                                                |
| `gesture.ts`    | 35    | **Not started** | All `var`, zero annotations. Shared mutable `gesture` object and `gestureTimeout`                                                                          |
| `touch.ts`      | ~190  | **Not started** | All `var`, zero annotations. Shared mutable `touch` object, 4 timeout IDs (legacy IE code removed)                                                         |

### Recommended Next Steps

1. ~~**Delete dead legacy files**: `ie.ts`, `ios3.ts`, and evaluate `amd_layout.ts`~~ **Done**
2. **Continue `mepto.ts` typing**: Resolve remaining `any` types on core APIs (`mepto.init`, `$()`, `$.extend`, `$.fn.*` methods)
3. **Convert remaining modules**: `event.ts` → `ajax.ts` → `fx.ts` → `fx_methods.ts` → `selector.ts` → `detect.ts` → `touch.ts` → `gesture.ts` → `assets.ts` → `stack.ts`
4. ~~**Migrate `data.ts` cache to `WeakMap`** per performance philosophy~~ **Done**
5. **Expand test coverage**: The 228-test suite does not cover AJAX, deferreds, callbacks, animations, touch, or detect. These modules need tests before/alongside conversion
6. **Tighten `tsconfig.json`** after all files are typed (incrementally enable `strict`, `noImplicitAny`, etc.)

---

## Module Conversion Playbook

This is the step-by-step process for converting a module. Follow it in order. Do not skip steps.

### Understanding the Object Graph

The naming is confusing because the word "mepto" is reused. Before touching any module, internalize this:

| Name                                   | What it is                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Outer `mepto` (in `meptos.ts`)         | The exported `MeptoStatic` object — same as `window.$` and `window.mepto`             |
| Inner `mepto` (inside `mepto.ts` IIFE) | The private implementation namespace: `mepto.init`, `mepto.Z`, `mepto.fragment`, etc. |
| `$.mepto`                              | The inner `mepto` object exposed for plugins and other modules                        |
| `$` inside each module's IIFE          | The outer `mepto` — i.e., the full `MeptoStatic` public API                           |

Every unconverted module is wrapped in:

```typescript
;(function ($: MeptoStatic) {
  // $ === window.$ === window.mepto === MeptoStatic
  // Collection methods go on $.fn
  // Static utilities go directly on $
})(mepto)
```

Reference completed conversions to see these patterns in practice:

- **`src/callbacks.ts`** — typed closure state, all method signatures typed
- **`src/data.ts`** — WeakMap for element-associated state, typed expando Symbol
- **`src/form.ts`** — short and clean, best first read

---

### Step 0 — Establish a baseline

Build the library and record the passing test count before making any changes. Every step must maintain this baseline.

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

A clean baseline looks like: `1 passed` (the single Playwright test, which internally asserts 228 pass and 0 fail).

> **Important:** The test suite loads `/dist/meptos.umd.cjs`. Always run `npm run build` before running tests — the harness tests the compiled output, not the source.

---

### Step 1 — Type the IIFE parameter

Add `MeptoStatic` to the module's IIFE parameter. If the file has no import yet, add one.

```typescript
import { type MeptoStatic } from './types'
;(function ($: MeptoStatic) {
  // ...
})(mepto)
```

---

### Step 2 — `var` → `const`/`let`

Replace every `var` declaration. Use `const` if the binding is never reassigned after declaration; `let` otherwise. Prefer `const` — if ESLint's `prefer-const` doesn't complain, use it.

This applies to both module-level and function-level declarations.

---

### Step 3 — Type module-level variables

Give explicit types to all module-level bindings. Do not eliminate shared mutable state yet — type it, leave the mutability, and move on. Removing shared state is a larger refactor that comes later.

```typescript
// Before
var handlers = {}
var _zid = 1

// After
const handlers: Record<number, EventHandler[]> = {}
let _zid = 1
```

Use types from `src/types.ts` where they fit (`MeptoStatic`, `MeptoCollection`, `AjaxSettings`, `EventHandler`, etc.).

---

### Step 4 — Type all function parameters and return values

Go function by function. Add types to every parameter and add return types where the inferred type is not obvious.

- Use types from `types.ts` when they fit.
- Prefer union types over `any` when the domain is known (e.g. `string | Element` instead of `any`).
- `any` is allowed during the transition — do not block on it. Type what you can, annotate the rest `any` and move on.
- Do not introduce `@types/` packages. If the DOM lib is missing a type for a modern API, use a type assertion.

---

### Step 5 — Fix local antipatterns

Address these as you encounter them inside the module being converted. Do not fix them in other files.

| Antipattern                                                         | Fix                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `let x` where `x` is never reassigned                               | → `const x`                                                   |
| Parameter mutation (`arg = newValue`)                               | → introduce a local copy: `let local = arg; local = newValue` |
| `var` in function scope                                             | → `const`/`let` as above                                      |
| Callback `function` expressions that don't use `this`               | → arrow function                                              |
| `fn` property monkey-patched inside a helper (e.g. hover emulation) | → keep but type `fn` explicitly                               |

---

### Step 6 — Build and verify

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

`1 passed` is the only acceptable result. If tests regress, revert the last change and diagnose before continuing.

---

## Performance Philosophy

Every API decision should minimize live DOM touches. The browser's layout engine dominates real-world cost. jQuery's convenience hides per-operation overhead (selector engine, wrapper allocations, repeated traversals) that compounds in loops and large UIs. Mepto wins by providing ergonomic APIs that internally batch, cache, and reuse — while exposing zero-dependency, modern code.

### High-Impact Areas (in priority order)

1. **Batching DOM updates** — Use `DocumentFragment` for bulk insertions. One-by-one appends trigger multiple reflows; a fragment batches them into one.
2. **Read/write separation** — Never interleave layout reads (`getBoundingClientRect`, `offsetWidth`, `scrollTop`) with DOM writes. A read after a write forces a synchronous layout recalculation.
3. **Caching & minimal queries** — `querySelector` and traversals are slow when repeated. Cache results; scope queries narrowly. Use `WeakMap` for element-associated data.
4. **Scheduling with rAF** — Batch visual changes to align with paint cycles. Use `requestAnimationFrame` for animations and high-frequency updates.
5. **Memory & cleanup** — Use `WeakMap`/`WeakSet` for element data so GC can collect removed nodes. Prefer modify-in-place over destroy/create cycles.
6. **Event delegation** — A single listener on a container scales better than per-element listeners, especially for dynamic content.

### Patterns to Prefer

| Prefer                                     | Over                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `DocumentFragment` + single `appendChild`  | Repeated per-element `appendChild` in a loop                 |
| `element.classList` or batch `cssText`     | Many individual `element.style.prop = value` sets            |
| Cache `querySelector` result before a loop | Repeated `querySelector` for the same selector inside a loop |
| `WeakMap` for element-associated data      | Expanding properties directly onto DOM nodes                 |
| `<template>` clone + insert                | Many `createElement` + `setAttribute` calls                  |
| CSS `transform`/`opacity` for animation    | JS-driven `style.top`/`style.left` updates                   |
| Modify existing elements in-place          | Remove + recreate cycles                                     |

### Patterns to Avoid

- **Layout thrashing**: reading `offsetWidth`, `getBoundingClientRect`, `scrollTop` etc. inside a write loop forces synchronous layout recalc on every iteration.
- **Per-element listeners** on dynamic content — use event delegation instead.
- **Repeated DOM queries inside loops** — cache the result before the loop.
- **Unnecessary `$(el)` wrapper allocations** in hot paths — call helpers directly when possible.

### Measurement

Profile with Chrome DevTools **Performance** tab on realistic scenarios (large lists, frequent updates, mobile). Focus on:

- Reflow/repaint count and long tasks
- Heap growth over time
- Direct comparison against jQuery equivalents

Target: smooth 60fps and good INP (Interaction to Next Paint).

### V8 Note (library internals only)

In hot internal helper functions, prefer consistent object shapes (fixed property order in config objects). Do not sacrifice API clarity for marginal JIT gains — the layout engine dominates costs.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev &
```

The dev server scans ports 3000–3099 and binds to the first available one. The chosen port is written to `.port` the moment the server is ready.

```bash
cat .port                          # → e.g. 3000
```

### Landing Page — Unit Test Suite

`http://localhost:$(cat .port)/` is the unit test suite. It loads Mepto directly from source — **no build step required**. All 228 tests run automatically on page load and the result is visible immediately.

- `#summary.pass` — all tests passed
- `#summary.fail` — one or more tests failed (failures listed inline with ✗)
- `document.body.dataset.status` — `"passed"` or `"failed"` (machine-readable)
- `window.meptoTestResults` — `{ passed, failed, total, results[] }`

Because it loads from source, editing a `.ts` file and refreshing the page is enough to re-run the suite — no `npm run build` needed.

### 3. Confirm the Server is Ready

Never assume the server is up just because `.port` exists — it may still be binding. Use this one-liner, which retries on connection refused and exits the moment the server responds:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  --retry 5 --retry-delay 1 --retry-connrefused \
  "http://localhost:$(cat .port)/"
```

**Healthy output:** `200`
**Not ready yet / failed:** `000` (curl ran out of retries — wait a moment and try again)
**Server not started:** `curl: (7) Failed to connect` (`.port` may not exist yet)

Do not use `curl ... && <next command>` without the retry flags — if the server is still starting, `&&` short-circuits and produces blank output, which is ambiguous.

### 4. Build the Library

```bash
npm run build
```

---

## LLM Test Harness (For Safe Code Testing)

We have built a secure Puppeteer-based testing harness at `tools/llm-test-harness/` that allows safe execution of JavaScript/TypeScript code.

### Why Use the Harness?

- **Security**: Runs code in an isolated browser sandbox
- **Safety**: Detects and blocks prompt injection attempts
- **Convenience**: Single command starts both Vite and Puppeteer
- **Console Access**: Captures all console output for debugging

### Installation

```bash
# Install harness dependencies
cd tools/llm-test-harness && npm install
cd ../..
# Build the harness
cd tools/llm-test-harness && npm run build && cd ../..
```

---

## Vitest — Fast Unit Tests (no browser)

`src/mepto.test.ts` covers the same API surface as the browser suite but runs in jsdom via Vitest. No browser, no build step — just fast per-method feedback.

```bash
npm test              # single run, exits with pass/fail
npm run test:watch    # re-runs on every file save
```

Output on success:

```
✓ src/mepto.test.ts  (73 tests)
Tests  73 passed
```

On failure, Vitest prints the exact assertion, the expected value, and the received value — no need to open a browser.

**jsdom limitation:** `$.isWindow(window)` returns `false` in jsdom because jsdom's `window` is not a native `Window` instance. The positive case is covered by the Playwright browser suite. All other tests run correctly in jsdom.

**When to use which:**
| | Vitest (`npm test`) | Playwright (`npx playwright test`) |
|---|---|---|
| Speed | ~1s | ~2s |
| Needs build | No | No |
| Needs dev server | No | Yes (auto-started) |
| DOM fidelity | jsdom (good) | Real Chromium (exact) |
| Use for | Fast iteration on a method | Final verification, CI |

---

## Running the Full Unit Test Suite

The landing page (`/`) is the unit test suite. It loads from source — no build step needed.

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

Playwright navigates to `/`, waits for `#summary` to get class `pass` or `fail`, then asserts `failed === 0` and `passed === 228`. On failure it prints the names of every failing test.

---

### Harness Usage Examples

#### Test Mepto DOM Manipulation

```bash
# Test adding a class (use `return` for expression values)
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" \
  --json

# Test element count
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('div').length" \
  --html="<div>A</div><div>B</div>"

# Test event handling (return gives back the assertion value)
node tools/llm-test-harness/bin/mepto-test.js \
  --code="
    var clicked = false;
    $('.btn').on('click', function() { clicked = true; });
    $('.btn').trigger('click');
    return clicked;
  " \
  --html="<button class='btn'>Click</button>"
```

> **Note:** To return a value from `--code`, use an explicit `return` statement.
> Multi-statement code runs in a function body so `return` is always valid.

#### Validate Code Before Execution

```bash
# Check if code is safe (doesn't execute)
node tools/llm-test-harness/bin/mepto-test.js \
  --validate \
  --code="return $('.item').length"
```

#### Run From File

```bash
# Execute code from file
node tools/llm-test-harness/bin/mepto-test.js \
  --file=./my-test.js \
  --html-file=./fixture.html
```

#### Assertions

`assert(cond, msg?)` and `expect(actual)` (with `.toBe`/`.toEqual`/`.toBeTruthy`/`.toBeFalsy`
and `.not`) are available in every run. Prefer them over returning a boolean:

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="assert($('.x').addClass('a').hasClass('a')); expect(2+2).toEqual(4)" \
  --html="<div class='x'></div>" --json
```

#### Run a Batch of Cases

One browser session for many cases (~2× faster than N cold starts; each case
gets a fresh page so DOM/listeners don't bleed). `cases.json`:

```json
{
  "cases": [
    {
      "name": "addClass",
      "code": "return $('.x').addClass('a').hasClass('a')",
      "html": "<div class='x'></div>"
    },
    { "name": "count", "code": "return $('div').length", "html": "<div>a</div><div>b</div>" },
    { "name": "async", "code": "return await Promise.resolve('ok')" }
  ]
}
```

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --json
```

Exit code is 0 only when every case passes. JSON carries
`summary: { total, passed, failed, errored, duration }` and `results[]`.

#### Compare Mepto vs jQuery

Add `--compare` to a `--batch` run: each case runs against **both** Mepto and
jQuery (each exposed as `$`) and return values are diffed. Surfaces behavioral
mismatches against the jQuery-compatibility target. jQuery is bundled with the
harness (no network needed).

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare --json
```

Output carries `summary: { total, matched, differed, duration }` and `results[]`
where each entry has `mepto` and `jquery` sub-results plus a `match` flag. Exit 0
only when every case matches. Compares _return values_ — to catch DOM side-effect
differences, have the case return observable state (e.g.
`return $('div')[0].outerHTML`).

#### Interactive Mode (Visible Browser)

```bash
# See the browser while testing
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').fadeIn()" \
  --html="<div class='test' style='display:none'>Hello</div>" \
  --no-headless
```

### Output Format

The harness returns JSON. `success` = code executed without throwing;
`passed` = success AND no assertion failed (equals `success` when no
assertions are used):

```json
{
  "success": true,
  "passed": true,
  "result": true,
  "assertions": { "passed": 2, "failed": 0, "failures": [] },
  "console": [{ "type": "log", "message": "Mepto loaded", "timestamp": "2024-01-01T00:00:00Z" }],
  "timing": {
    "duration": 523
  },
  "security": {
    "safe": true,
    "violations": [],
    "warnings": []
  }
}
```

### Security Model

Two tiers (see `tools/llm-test-harness/src/security/sanitizer.ts`):

- **Hard-block** (rejects the run): dynamic code execution (`eval`/`Function`/
  string-arg timers), prototype pollution (`__proto__`, `constructor.prototype`),
  unambiguous Node-only identifiers (`child_process`, `require('fs')`).
- **Advisory** (warns only, enforced at runtime): storage, network, navigation,
  `document.write`, markup/`on*=` handlers. The Puppeteer page neuters these
  via `evaluateOnNewDocument` — e.g. `localStorage`/`document.cookie`/`window.open`
  throw `[<name>] is disabled in the test sandbox`.

The regex patterns are a first-pass gate, not the boundary — the real isolation
is the browser page itself (no Node surface, request interception blocks
non-local network).

---

## Project Structure

```
mepto/
├── src/                      # Source TypeScript files
│   ├── mepto.ts             # Core module
│   ├── event.ts             # Event handling
│   ├── ajax.ts              # AJAX functionality
│   ├── form.ts              # Form utilities
│   ├── fx.ts                # Animations
│   └── ...                  # Other modules
├── tools/
│   └── llm-test-harness/    # Testing harness for agents
│       ├── bin/mepto-test.js
│       └── src/
├── index.html                # Unit test suite (228 tests, loads from source)
├── test/                     # Test files
│   ├── blank.html           # LLM test harness bridge page
│   ├── e2e/                 # Playwright e2e specs
│   └── functional/          # Manual interactive tests
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

---

## Development Workflow

### 1. Make Changes to Source Files

Edit files in `src/` — all files are TypeScript (`.ts`).

### 2. Build the Library

```bash
npm run build
```

### 3. Run the Full Test Suite

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

The landing page loads from source — no build step needed. A passing run prints `1 passed`. Any failure prints the names of the specific failing tests.

### 4. Test a Specific Behaviour

Write a short spec in `test/e2e/` and run it directly:

```ts
// test/e2e/scratch.spec.ts
import { test, expect } from '@playwright/test'

test('addClass works', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(() => $('.test').addClass('active').hasClass('active'))
  expect(result).toBe(true)
})
```

```bash
npx playwright test test/e2e/scratch.spec.ts --project=chromium
```

Playwright handles waiting automatically — no manual `setTimeout` or retry loops needed.

### 5. Run Linting

```bash
npm run lint
```

---

## TypeScript Configuration

The project uses relaxed TypeScript settings (`tsconfig.json`):

- `strict: false` - Allows gradual typing
- `allowJs: true` - Can import JavaScript
- `noImplicitAny: false` - No errors on implicit any

This enables progressive enhancement — add types as needed without breaking existing code. Do not tighten these settings during the TS transition; correctness comes first.

Do not introduce `@types/` packages or type stubs for legacy browser APIs that don't exist in the target environment. If the TypeScript DOM lib is missing a type for a modern API, use a type assertion rather than polyfilling or downgrading.

---

## Key Commands

| Command              | Description                                     |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start Vite dev server (port written to `.port`) |
| `cat .port`          | Get the port the dev server is running on       |
| `npm test`           | Run Vitest unit tests (jsdom, ~1s, no browser)  |
| `npm run test:watch` | Vitest in watch mode — reruns on every save     |
| `npm run build`      | Build library to `dist/`                        |
| `npm run lint`       | Run ESLint                                      |
| `npm run format`     | Run Prettier                                    |
| `npm run typecheck`  | Check TypeScript                                |

### Playwright Commands

| Command                                                              | Description                     |
| -------------------------------------------------------------------- | ------------------------------- |
| `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` | Run the 228-test unit suite     |
| `npx playwright test test/e2e/scratch.spec.ts --project=chromium`    | Run a scratch spec              |
| `npx playwright test --project=chromium`                             | Run all e2e specs in Chromium   |
| `npx playwright test --headed`                                       | Run with visible browser window |

---

## Testing Tips

1. **Always use the harness first** - Test your changes in isolation before running full test suite
2. **Use `--json` flag** - For programmatic result parsing
3. **Use `--validate`** - Check code safety before execution
4. **Start with simple fixtures** - Test with minimal HTML, then add complexity

---

## Migration Notes

- All source files converted from `.js` to `.ts`
- Original mepto IIFE pattern preserved in `mepto.ts`
- Modules use `;(function($){...})(mepto)` pattern
- Entry point is `src/meptos.ts` which imports all modules

---

## Need Help?

1. Check the harness architecture in `plans/llm-test-harness.md`
2. Review example tests in `test/` directory
3. Use `--json` flag for structured output when debugging
