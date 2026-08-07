---
name: migrate
description: TypeScript migration playbook for Mepto — object graph, 6-step module conversion, and per-file status.
---

# Migrate — TypeScript Conversion Playbook

## Current task

Transition all source files to TypeScript, adding parameter types to untyped functions. Refactor antipatterns (shared mutable module-level vars, parameter mutation, `let` where `const` applies) as encountered. Verify each change with the 234-test suite before moving on.

**Overall ~40% complete** (Jul 2026). Legacy files deleted, `mepto.ts` `let`→`const` and vendor-prefix removal done, 5 of 17 modules fully converted (`data.ts`, `callbacks.ts`, `deferred.ts`, `form.ts`, `event.ts`). 9 modules remain as JS in practice.

### Completed

- [x] Delete dead legacy files: `ie.ts`, `ios3.ts`, `amd_layout.ts`
- [x] Remove legacy IE code from `touch.ts` (`MSGesture`, `MSPointer*`, `onmspointerdown`)
- [x] Remove deprecated jQuery APIs from `event.ts` (`$.fn.live`, `$.fn.die`)
- [x] Convert `mepto.ts` antipatterns: `let`→`const` for 25+ module-level vars, removed `const undefined = void 0`, simplified `mepto.matches`
- [x] Convert `data.ts`: `var`→`const`/`let`, typed params, `WeakMap` cache, `Symbol` expando
- [x] Convert `callbacks.ts`: `var`→`const`/`let`, typed closure state
- [x] Convert `deferred.ts`: `var`→`const`/`let`, typed tuples/deferred/promise
- [x] Convert `form.ts`: `var`→`const`/`let`, typed params/returns
- [x] Convert `event.ts`: `var`→`const`/`let`, `Handler`/`ZidTarget` interfaces, typed IIFE with `MeptoStatic`

### Per-file status

| File            | Lines | Typing          | Key issues                                                                                                    |
| --------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | 496   | **Done**        | `Mepto.matches` typed as bare `Function` — needs proper signature                                             |
| `meptos.ts`     | 54    | **Mostly done** | Dead-code guard `if($ === undefined)` always false                                                            |
| `mepto.ts`      | ~2180 | **Partial**     | Many `any` remain. Shared mutable `elementDisplay`, `classCache`, `class2type`                                |
| `data.ts`       | 92    | **Done**        | `WeakMap` cache, `Symbol` expando, typed                                                                      |
| `callbacks.ts`  | 119   | **Done**        | Typed closure state                                                                                           |
| `deferred.ts`   | 116   | **Done**        | Typed tuples/deferred/promise                                                                                 |
| `form.ts`       | 41    | **Done**        | Typed params/returns                                                                                          |
| `event.ts`      | 470   | **Done**        | `Handler`/`ZidTarget`. Shared mutable `handlers`, `_zid`. `fn` mutation for hover                             |
| `ajax.ts`       | 381   | **Not started** | All `var`, zero annotations. Shared mutable `jsonpID`, `originAnchor`. `settings` mutated. `(1,eval)(result)` |
| `fx.ts`         | 123   | **Not started** | All `var`. Vendor-prefix detection vars. `cssReset` by chained side-effect                                    |
| `fx_methods.ts` | 71    | **Not started** | All `var`                                                                                                     |
| `selector.ts`   | 85    | **Not started** | All `var`. Shared mutable `classTag` with timestamp. `process()` mutates `sel`/`arg`                          |
| `assets.ts`     | 21    | **Not started** | All `var`. Shared mutable `cache`, `timeout`                                                                  |
| `detect.ts`     | 72    | **Not started** | All `var`. Sets `this.os`/`this.browser` on `$`                                                               |
| `stack.ts`      | 22    | **Not started** | All `var`                                                                                                     |
| `gesture.ts`    | 35    | **Not started** | All `var`. Shared mutable `gesture`, `gestureTimeout`                                                         |
| `touch.ts`      | 189   | **Not started** | All `var`. Shared mutable `touch`, 4 timeout IDs                                                              |

### Recommended next steps

1. Continue `mepto.ts` typing — remaining `any` on `mepto.init`, `$()`, `$.extend`, `$.fn.*`
2. Convert remaining modules: `ajax.ts` → `fx.ts` → `fx_methods.ts` → `selector.ts` → `detect.ts` → `touch.ts` → `gesture.ts` → `assets.ts` → `stack.ts`
3. Expand test coverage for AJAX, deferreds, callbacks, animations, touch, detect
4. Tighten `tsconfig.json` (`strict`, `noImplicitAny`) after all files typed

---

## Object graph — read this first

The word "mepto" is overloaded:

| Name                                   | What it is                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| Outer `mepto` (in `meptos.ts`)         | Exported `MeptoStatic` — same as `window.$` and `window.mepto` |
| Inner `mepto` (inside `mepto.ts` IIFE) | Private impl: `mepto.init`, `mepto.Z`, `mepto.fragment`, etc.  |
| `$.mepto`                              | Inner `mepto` exposed for plugins/other modules                |
| `$` inside each module's IIFE          | Outer `mepto` — the full `MeptoStatic` public API              |

Every unconverted module is wrapped in:

```typescript
;(function ($: MeptoStatic) {
  // $ === window.$ === window.mepto === MeptoStatic
  // Collection methods go on $.fn
  // Static utilities go directly on $
})(mepto)
```

**Reference conversions for patterns:** `src/callbacks.ts` (typed closure state), `src/data.ts` (WeakMap + Symbol expando), `src/form.ts` (shortest, best first read), `src/event.ts` (typed IIFE, Handler/ZidTarget interfaces).

---

## 6-step module conversion playbook

Follow in order. Do not skip steps.

### Step 0 — Baseline

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

Clean baseline is `1 passed` (single Playwright test asserting 234 pass / 0 fail). No build needed — suite loads from source via `test/index.html` → `src/meptos.ts`.

### Step 1 — Type the IIFE parameter

Add `MeptoStatic` to the module's IIFE. Add the import if missing:

```typescript
import { type MeptoStatic } from './types'
;(function ($: MeptoStatic) {
  // ...
})(mepto)
```

### Step 2 — `var` → `const`/`let`

Replace every `var`. Use `const` if never reassigned; `let` otherwise. Prefer `const` — if `prefer-const` wouldn't complain, use it. Applies to module-level and function-level.

### Step 3 — Type module-level variables

Give explicit types to all module-level bindings. Do **not** eliminate shared mutable state yet — type it, leave the mutability, move on.

```typescript
// Before
var handlers = {}
var _zid = 1
// After
const handlers: Record<number, EventHandler[]> = {}
let _zid = 1
```

Use types from `src/types.ts` (`MeptoStatic`, `MeptoCollection`, `AjaxSettings`, `EventHandler`, etc.).

### Step 4 — Type all function params and returns

Function by function. Type every param; add return types where inferred type is non-obvious.

- Use types from `types.ts` when they fit
- Prefer union types over `any` when domain is known (e.g. `string | Element`)
- `any` is allowed during transition — type what you can, annotate the rest `any`, move on
- Do not introduce `@types/` packages. If DOM lib is missing a modern API type, use a type assertion

### Step 5 — Fix local antipatterns

Address only inside the module being converted. Do not fix other files.

| Antipattern                                         | Fix                                               |
| --------------------------------------------------- | ------------------------------------------------- |
| `let x` where `x` never reassigned                  | → `const x`                                       |
| Parameter mutation (`arg = newValue`)               | → local copy: `let local = arg; local = newValue` |
| `var` in function scope                             | → `const`/`let` as above                          |
| `function` callbacks not using `this`               | → arrow function                                  |
| `fn` monkey-patched inside helper (hover emulation) | → keep but type `fn` explicitly                   |

### Step 6 — Build and verify

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
```

`1 passed` is the only acceptable result. If tests regress, revert and diagnose before continuing.

---

## Browser target

**Evergreen only.** No IE, no legacy Edge, no Safari < 14. Do not add polyfills, fallbacks, or feature-detection for old browsers. Use `WeakMap`, `WeakSet`, `queueMicrotask`, `AbortController`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, `classList`, `closest`, `dataset` freely. If you encounter legacy-compatibility code, you may remove it.
