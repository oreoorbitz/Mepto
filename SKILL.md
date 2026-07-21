# Mepto Skills

Action-oriented procedures for working in this repo. For library goals, performance philosophy, and TS-transition status, see `AGENTS.md`.

---

## Verify a change (fast path — no build needed)

The root `index.html` loads Mepto from source via ES module imports. Both Vitest and Playwright run directly against source, so no build step is required for testing.

```bash
npm test                              # Vitest: 73 tests in jsdom, ~1s
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium  # 228 tests in real browser, ~2s
```

One-shot full validation (kills old servers, runs vitest + playwright):

```bash
npm run test:all
```

### Three test commands, ranked by speed

| Command                                      | Time | Tests                | What it checks                                      |
| -------------------------------------------- | ---- | -------------------- | --------------------------------------------------- |
| `npm test`                                   | ~1s  | 73                   | Vitest in jsdom — fast unit tests                   |
| `npx playwright test ... --project=chromium` | ~2s  | 228                  | Full suite in real Chromium                         |
| `npm run test:e2e`                           | ~5s  | All Playwright specs | All browsers (chromium + firefox + webkit + mobile) |

Prefer `npm test` for rapid iteration. Use `npx playwright test ...` for final verification.

### Port conflicts

Dev servers linger on ports 3000–3099. Kill them first:

```bash
npm run killports                     # kills all servers on 3000-3099
npx playwright test ...               # Playwright will auto-start a fresh dev server
```

### About `npm run build`

The build will print TypeScript errors. This is **expected** — ~30% through a TS transition; 10 of 17 modules are unconverted. Errors come from `vite-plugin-dts`, not esbuild.

- Build **succeeds** (exit 0) despite the errors
- `dist/meptos.umd.cjs` and `dist/meptos.js` are produced correctly
- To check for new errors you introduced, use `npm run typecheck` with a baseline comparison

---

## Module Conversion Playbook

Step-by-step process for converting a JS-style module to typed TS. Follow in order. Do not skip steps.

### Object graph (read this first)

The word "mepto" is overloaded. Before touching any module, internalize this:

| Name                                   | What it is                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Outer `mepto` (in `meptos.ts`)         | The exported `MeptoStatic` — same as `window.$` and `window.mepto`                    |
| Inner `mepto` (inside `mepto.ts` IIFE) | The private implementation namespace: `mepto.init`, `mepto.Z`, `mepto.fragment`, etc. |
| `$.mepto`                              | The inner `mepto` exposed for plugins/other modules                                   |
| `$` inside each module's IIFE          | The outer `mepto` — the full `MeptoStatic` public API                                 |

Every unconverted module is wrapped in:

```typescript
;(function ($: MeptoStatic) {
  // $ === window.$ === window.mepto === MeptoStatic
  // Collection methods go on $.fn
  // Static utilities go directly on $
})(mepto)
```

Reference completed conversions for patterns in practice:

- `src/callbacks.ts` — typed closure state, all method signatures typed
- `src/data.ts` — WeakMap for element-associated state, typed expando Symbol
- `src/form.ts` — short and clean, best first read

### Step 0 — Establish a baseline

Record the passing test count before changes. Every step must maintain it.

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

Clean baseline: `1 passed` (the single Playwright test internally asserts 228 pass / 0 fail).

### Step 1 — Type the IIFE parameter

```typescript
import { type MeptoStatic } from './types'
;(function ($: MeptoStatic) {
  // ...
})(mepto)
```

### Step 2 — `var` → `const`/`let`

Replace every `var`. Use `const` if never reassigned; `let` otherwise. Prefer `const` — if ESLint's `prefer-const` doesn't complain, use it. Applies to module-level and function-level.

### Step 3 — Type module-level variables

Give explicit types to all module-level bindings. Do **not** eliminate shared mutable state yet — type it, leave the mutability, move on. Removing shared state is a larger refactor.

```typescript
// Before
var handlers = {}
var _zid = 1

// After
const handlers: Record<number, EventHandler[]> = {}
let _zid = 1
```

Use types from `src/types.ts` where they fit (`MeptoStatic`, `MeptoCollection`, `AjaxSettings`, `EventHandler`, etc.).

### Step 4 — Type all function parameters and return values

Function by function. Type every parameter; add return types where the inferred type is non-obvious.

- Use types from `types.ts` when they fit
- Prefer union types over `any` when the domain is known (e.g. `string | Element`)
- `any` is allowed during the transition — type what you can, annotate the rest `any`, move on
- Do not introduce `@types/` packages. If the DOM lib is missing a type for a modern API, use a type assertion

### Step 5 — Fix local antipatterns

Address these inside the module being converted only. Do not fix them in other files.

| Antipattern                                                         | Fix                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `let x` where `x` is never reassigned                               | → `const x`                                              |
| Parameter mutation (`arg = newValue`)                               | → introduce a local: `let local = arg; local = newValue` |
| `var` in function scope                                             | → `const`/`let` as above                                 |
| Callback `function` expressions that don't use `this`               | → arrow function                                         |
| `fn` property monkey-patched inside a helper (e.g. hover emulation) | → keep but type `fn` explicitly                          |

### Step 6 — Build and verify

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

`1 passed` is the only acceptable result. If tests regress, revert the last change and diagnose before continuing.

---

## Start the dev server and confirm it's ready

```bash
npm run dev &
cat .port                          # → e.g. 3000
```

`npm run dev` scans 3000–3099, binds to the first free port, writes it to `.port` when ready.

Never assume the server is up just because `.port` exists. Use this one-liner — it retries on connection-refused and exits the moment the server responds:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  --retry 5 --retry-delay 1 --retry-connrefused \
  "http://localhost:$(cat .port)/"
```

- `200` — healthy
- `000` — curl ran out of retries, wait and try again
- `curl: (7) Failed to connect` — server not started; `.port` may not exist yet

Do **not** use `curl ... && <next command>` without the retry flags — if the server is still starting, `&&` short-circuits and produces blank output, which is ambiguous.

### Landing page is the test suite

`http://localhost:$(cat .port)/` is the 228-test unit suite, loaded from source.

- `#summary.pass` / `#summary.fail`
- `document.body.dataset.status` — `"passed"` or `"failed"` (machine-readable)
- `window.meptoTestResults` — `{ passed, failed, total, results[] }`

Editing a `.ts` file and refreshing re-runs the suite. No `npm run build` needed.

---

## Write a one-off Playwright spec

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

Playwright handles waiting automatically — no manual `setTimeout` or retry loops.

---

## LLM Test Harness — safe code execution

Secure Puppeteer-based harness at `tools/llm-test-harness/` for isolated execution of JS/TS snippets against Mepto. Detects prompt-injection attempts, blocks `eval`/`Function`/dynamic imports/network/`process`/`require`/filesystem.

### Install

```bash
cd tools/llm-test-harness && npm install
cd ../..
cd tools/llm-test-harness && npm run build && cd ../..
```

### Run a snippet

Use an explicit `return` to surface a value — multi-statement code runs inside a function body, so `return` is always valid.

```bash
# DOM manipulation
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" \
  --json

# Element count
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('div').length" \
  --html="<div>A</div><div>B</div>"

# Event handling
node tools/llm-test-harness/bin/mepto-test.js \
  --code="
    var clicked = false;
    $('.btn').on('click', function() { clicked = true; });
    $('.btn').trigger('click');
    return clicked;
  " \
  --html="<button class='btn'>Click</button>"
```

### Validate without executing

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --validate \
  --code="return $('.item').length"
```

### Run from file

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --file=./my-test.js \
  --html-file=./fixture.html
```

### Visible browser (debugging)

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').fadeIn()" \
  --html="<div class='test' style='display:none'>Hello</div>" \
  --no-headless
```

### Assertions

`assert(cond, msg?)` and `expect(actual)` (with `.toBe`/`.toEqual`/`.toBeTruthy`/`.toBeFalsy`
and `.not`) are injected into the page before each run. Use them in place of
eyeballing a returned boolean:

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="assert($('.x').addClass('a').hasClass('a'), 'addClass'); expect(2+2).toEqual(4)" \
  --html="<div class='x'></div>" --json
```

### Run a batch of cases in one session

When you have several checks, run them as a batch — one browser launch instead
of N cold starts (~2× faster for 6 cases, more for more). Each case runs in a
fresh page so DOM/listeners don't bleed between cases.

`cases.json`:

```json
{
  "cases": [
    {
      "name": "addClass",
      "code": "return $('.x').addClass('a').hasClass('a')",
      "html": "<div class='x'></div>"
    },
    { "name": "count", "code": "return $('div').length", "html": "<div>a</div><div>b</div>" },
    { "name": "async", "code": "return await Promise.resolve('ok')" },
    {
      "name": "checks",
      "code": "assert($('p').text()==='hi'); expect(1).toBe(1)",
      "html": "<p>hi</p>"
    }
  ]
}
```

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --json
```

Exit code is 0 only when every case passes. The JSON carries
`summary: { total, passed, failed, errored, duration }` and a `results[]`
array with one entry per case.

### Compare Mepto vs jQuery

Add `--compare` to a `--batch` run: each case runs against **both** Mepto and
jQuery (each exposed as `$`) and the return values are diffed. Surfaces
behavioral mismatches against the jQuery-compatibility target. jQuery is bundled
with the harness (no network).

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare --json
```

Output carries `summary: { total, matched, differed, duration }` and a
`results[]` where each entry has `mepto` and `jquery` sub-results plus a `match`
flag. Exit 0 only when every case matches. Note: compares _return values_ — to
catch DOM side-effect differences, have the case return observable state (e.g.
`return $('div')[0].outerHTML`).

### Output shape

Single run:

```json
{
  "success": true,
  "passed": true,
  "result": true,
  "assertions": { "passed": 2, "failed": 0, "failures": [] },
  "console": [{ "type": "log", "message": "Mepto loaded", "timestamp": "2024-01-01T00:00:00Z" }],
  "timing": { "duration": 523 },
  "security": { "safe": true, "violations": [], "warnings": [] }
}
```

`success` = code executed without throwing; `passed` = success AND no assertion
failed (or no assertions used). With no assertions, `passed === success`.

---

## Key commands

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
| `npm run killports`  | Kill any dev servers on 3000–3099               |

### Playwright

| Command                                                              | Description                     |
| -------------------------------------------------------------------- | ------------------------------- |
| `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` | Run the 228-test unit suite     |
| `npx playwright test test/e2e/scratch.spec.ts --project=chromium`    | Run a scratch spec              |
| `npx playwright test --project=chromium`                             | All e2e specs in Chromium       |
| `npx playwright test --headed`                                       | Run with visible browser window |

---

## Do not edit

- `.claude/settings.local.json` — Claude permissions/settings
- `plans/` — planning documents
- `tools/llm-test-harness/` — Harness source; only modify if improving the harness itself
