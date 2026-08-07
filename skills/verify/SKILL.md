---
name: verify
description: Verify changes with Vitest, Playwright, dev server, and build. Handles port conflicts, build noise, and dual TypeScript toolchains.
---

# Verify — Testing, Dev Server & Build

## Quick check (no build needed)

The suite loads from source via ES modules — editing a `.ts` file and re-running is enough.

```bash
npm test                                              # Vitest in jsdom, ~1s, 96 tests
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium  # 234 tests in real browser, ~2s
npm run test:all                                      # kills old servers + both suites
```

## Three test tiers, ranked by speed

| Command                                                              | Time | Tests | What it checks                                                                    |
| -------------------------------------------------------------------- | ---- | ----- | --------------------------------------------------------------------------------- |
| `npm test`                                                           | ~1s  | 96    | Vitest in jsdom — fast unit tests (`src/mepto.test.ts`)                           |
| `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` | ~2s  | 234   | Full suite in real Chromium (`test/index.html` via `test/e2e/unit-suite.spec.ts`) |
| `npm run test:e2e`                                                   | ~5s  | all   | All Playwright specs, all engines (chromium+firefox+webkit+mobile)                |

Prefer `npm test` for iteration, `npx playwright test ... --project=chromium` for final verification. Clean baseline is `1 passed` (one Playwright test that internally asserts 234 pass / 0 fail).

**What's covered:** type utilities, selectors, DOM manipulation, attributes, CSS, events, form serialization, dimensions, AJAX, deferreds, callbacks, todo app.
**Not yet covered:** animations (fx), touch, gesture, browser detection, assets, stack. Add tests alongside changes to those modules.

### jsdom limitation

`$.isWindow(window)` is `false` in jsdom (not a native `Window`). Covered by Playwright, all other tests run correctly in jsdom.

## Dev server

```bash
npm run dev &           # scans 3000–3099, binds first free port, writes to .port
cat .port               # e.g. 3000
```

The landing page at `/` is a QA directory; the 234-test suite is at `/test/` (`test/index.html`) and loads Mepto from source.

Never assume the server is up because `.port` exists — it may still be binding. Use the retrying probe:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  --retry 5 --retry-delay 1 --retry-connrefused \
  "http://localhost:$(cat .port)/"
# 200 = healthy, 000 = not ready yet, (7) = not started
```

Do not use `curl ... && <next>` without the retry flags — if the server is still starting, `&&` short-circuits to blank output.

### Landing page contract

- `#summary.pass` / `#summary.fail`
- `document.body.dataset.status` — `"passed"` or `"failed"`
- `window.meptoTestResults` — `{ passed, failed, total, results[] }`

Editing a `.ts` file and refreshing re-runs the suite. No `npm run build` needed.

### Port conflicts

Dev servers linger on 3000–3099. Kill before re-running Playwright:

```bash
npm run killports
```

Playwright auto-starts a fresh dev server if needed.

## Write a one-off Playwright spec

```ts
// test/e2e/scratch.spec.ts
import { test, expect } from '@playwright/test'
test('addClass works', async ({ page }) => {
  await page.goto('/test/')
  const result = await page.evaluate(() => $('.test').addClass('active').hasClass('active'))
  expect(result).toBe(true)
})
```

```bash
npx playwright test test/e2e/scratch.spec.ts --project=chromium
```

## Build — expected TypeScript noise

```bash
npm run build           # produces dist/meptos.js + dist/meptos.umd.cjs + .d.ts
```

The build **will print TypeScript errors** — expected. ~40% through a TS transition; 9 of 17 modules are unconverted and errors come from `vite-plugin-dts`, not esbuild. Build succeeds (exit 0) and bundles are correct. Ignore the red flood. To check for _new_ errors you introduced, diff `npm run typecheck` before/after.

## TypeScript toolchain — two compilers, on purpose

- `npm run typecheck` — **TypeScript 7** (Go-native, alias `typescript-7`) — sub-second, same semantics as TS 5.
- `typescript` 5.9.x stays as root dep because `typescript-eslint` and `vite-plugin-dts` need the TS 5 programmatic API (missing in TS 7, expected in 7.1).
- Never run bare `tsc` — with two TS installs `node_modules/.bin/tsc` is nondeterministic. Scripts call each compiler by explicit path (`typecheck` vs `typecheck:ts5`).

### Known typecheck debt (baseline)

`npm run typecheck` currently reports errors in these modules — expected, not yours to fix unless you're working on the transition:

- [ ] `src/ajax.ts` (~18 errors)
- [ ] `tools/llm-test-harness/src/index.ts` (6, TS1205)
- [ ] `src/mepto.ts` (3)
- [ ] `src/callbacks.ts` (2)
- [ ] `src/data.ts` (1)
- [ ] `src/deferred.ts` (1)
- [ ] `src/form.ts` (1)
- [ ] `src/selector.ts` (1)

When a module is fixed, check it off and confirm error count dropped.

### tsconfig is intentionally relaxed

`strict: false`, `allowJs: true`, `noImplicitAny: false` — enables progressive typing. Do not tighten during the transition. Do not add `@types/` for legacy browser APIs; use a type assertion for missing DOM lib types.

## Key commands

| Command                 | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | Start Vite dev server (port → `.port`)                                |
| `cat .port`             | Read dev server port                                                  |
| `npm test`              | Vitest (jsdom, ~1s)                                                   |
| `npm run test:watch`    | Vitest watch mode                                                     |
| `npm run test:all`      | `killports` + Vitest + Playwright unit suite                          |
| `npm run verify`        | `typecheck && lint && test && build && size:check` (non-browser gate) |
| `npm run lint:fast`     | oxlint — sub-second first pass                                        |
| `npm run lint`          | ESLint — thorough, type-aware                                         |
| `npm run typecheck`     | TS 7 (Go)                                                             |
| `npm run typecheck:ts5` | TS 5 (for dts)                                                        |
| `npm run build`         | Vite build to `dist/`                                                 |
| `npm run format`        | Prettier                                                              |
| `npm run killports`     | Kill dev servers on 3000–3099                                         |
