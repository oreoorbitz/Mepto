# Mepto Modernization Audit

**Date:** 2026-07-20
**Scope:** All 17 source files in `src/`
**Method:** 5 parallel sub-agent audits (core, events/input, DOM/data, async, effects/utils)

---

## Cross-cutting themes

**1. The codebase is further along than AGENTS.md says.** Three claims are stale: `class2type`/`classCache` are already gone, `elementDisplay` is already a `Map`, and `mepto.matches` already has a proper signature. The "Done" markers on `data.ts`/`form.ts`/`callbacks.ts`/`deferred.ts` are also optimistic — all four still use `$: any` on their IIFE params and ignore the rich interfaces already defined in `types.ts`.

**2. A decade of legacy browser-compat code is dead weight.** Vendor-prefix detection (fx.ts), `document.createEvent`/`initEvent` (event.ts), `mouseenter`/`mouseleave` emulation (event.ts), `<a>`-anchor URL parsing (ajax.ts), `RegExp.$1` statics (ajax.ts), `'ontouchstart' in document` branching (touch.ts), `navigator.platform` (detect.ts), the `classTag` class-mutation hack (selector.ts), `window.JSON` guards (mepto.ts) — all unreachable or unnecessary on evergreen targets.

**3. Test coverage gaps gate the riskiest changes.** Zero tests exist for AJAX, Deferred, Callbacks, touch, gesture, animations, jQuery pseudo-selectors (`:visible`/`:eq`), `.end()`, or `.andSelf()`. Any behavioral modernization in these areas needs tests added first.

**4. `eval` and `expando` patterns are the security/correctness debt.** Indirect eval runs server-provided script with page privileges (ajax.ts). `_zid` stamps mutable properties on DOM nodes + handler functions and leaks handler closures for detached elements (event.ts) — the exact pattern `data.ts` already migrated to `WeakMap`.

---

## Prioritized action list

### P0 — Bugs & correctness (fix first, isolated, low risk)

| #   | Location             | Issue                                                                                                                                                                                                      |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `mepto.ts:1088`      | **`letructor` is a corrupted `constructor`** — botched find/replace during the `let` cleanup. Breaks `.constructor`-based detection. Grep confirms zero references to `letructor`. Trivial rename.         |
| 2   | `types.ts:291-300`   | **`slideDown`/`slideUp`/`slideToggle` declared but never implemented** — runtime `TypeError` for any caller. Either implement or delete the declarations.                                                  |
| 3   | `selector.ts:79-82`  | **`:last` filter crashes in `.is()`/`.not()`** — `mepto.matches` passes `null` as nodes arg, `nodes.length` throws.                                                                                        |
| 4   | `gesture.ts:7,16`    | **`gestureTimeout` declared but never assigned** — dead variable, `clearTimeout(undefined)` no-op. Delete both.                                                                                            |
| 5   | `data.ts:18-22`      | **`removeData`-then-read resurrects attribute values** — clears in-memory cache but next read falls through to `dataAttr` and re-reads the live `data-x` attribute. Latent jQuery-parity bug.              |
| 6   | `mepto.ts:2454-2464` | **Inline-script execution can't handle `type="module"`** — uses indirect `eval` which can't evaluate module source. Also misses `application/javascript` MIME type. Should re-insert a `<script>` element. |

### P1 — Dead code (delete with confidence)

| Location                               | What                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`assets.ts` (entire file)**          | Not imported by `meptos.ts`. Ships nothing. 21 lines of dead module.                                                                                     |
| **`types.ts:485-496`**                 | Dead `Mepto` interface — duplicate of `MeptoNamespace` from mepto.ts, already drifted. Zero imports.                                                     |
| **`data.ts:12` + `types.ts:470`**      | `$.expando` vestigial from pre-WeakMap era. Zero readers. `types.ts` declares it `string` but code assigns `Symbol` — type lie hidden by `strict:false`. |
| **`detect.ts` dead-platform branches** | webOS, BlackBerry, BB10, PlayBook, Firefox OS, Kindle Silk — all EOL years before the evergreen cutoff. ~25 lines of unreachable regex branches.         |
| **`stack.ts:10-12`**                   | `andSelf` deprecated jQuery 1.8, removed in 3.x. Consistent with earlier `live`/`die` removal.                                                           |
| **`fx.ts:36`**                         | `$.fx.off` is permanently `false` — the escape hatch never trips.                                                                                        |

### P2 — Legacy compat deletable for evergreen target

| Location                             | Change                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **`event.ts:454-468`**               | `document.createEvent`/`initEvent` → `new Event()` constructor. Also kills the `specialEvents` map.                                   |
| **`event.ts:30-32, 76-81, 117-123`** | `focusinSupported` always true; `mouseenter`/`mouseleave` emulation is pure overhead. Bind real event names directly.                 |
| **`event.ts:243-256`**               | `compatible()` IE/DOM2 fallbacks: `returnValue`, `getPreventDefault`, `timeStamp` try/catch — all dead on evergreen.                  |
| **`ajax.ts:14-17, 204-209`**         | `<a>`-anchor URL parsing → native `URL` API. Deletes shared mutable `originAnchor`.                                                   |
| **`ajax.ts:228`**                    | `RegExp.$1` deprecated statics → `exec()` capture.                                                                                    |
| **`fx.ts:6, 17-22`**                 | Vendor-prefix detection (`Webkit`/`Moz`/`O` map + probe) unreachable — `testEl.style.transform` always defined. Hardcode `prefix=''`. |
| **`selector.ts:38-39, 62-66`**       | `classTag` class-mutation hack → native `:scope`. Eliminates two DOM writes + forced reflow around every child-selector query.        |
| **`detect.ts:68`**                   | `navigator.platform` deprecated → `navigator.userAgentData.platform` or feature-detect.                                               |
| **`mepto.ts:1039, 759`**             | `window.JSON` guard, `getElementsByClassName` feature check — dead.                                                                   |

### P3 — Performance wins

| Location                       | Change                                                                                                                                                      | Impact                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **`event.ts` handler storage** | `_zid`-expando → `WeakMap<EventTarget, Handler[]>`. Mirrors the completed `data.ts` migration. Prevents handler-closure leaks for detached nodes.           | HIGH — the biggest single perf/correctness win |
| **`selector.ts:37, 41-44`**    | `process()` runs regex+replace on every `$()`/`.find()`/`.is()` call. Gate behind `sel.indexOf(':')` check, or delete if pseudo-selectors confirmed unused. | HIGH — touches every query                     |
| **`selector.ts:8-10`**         | `visible()` allocates `$(elem)` wrapper + 3 layout reads per element. Use `elem.offsetWidth`/`offsetHeight` directly.                                       | MED                                            |
| **`data.ts:85-88`**            | `remove`/`empty` unconditionally runs `querySelectorAll('*')` + builds collection. Walk nodes directly, call `dataMap.delete(el)`.                          | MED                                            |
| **`mepto.ts:2000, 2411-2421`** | `type(property) == 'string'` uses heavyweight `Object.prototype.toString` sniff where `typeof` suffices.                                                    | LOW                                            |

### P4 — TypeScript typing debt

All four "Done" modules (`data.ts`, `form.ts`, `callbacks.ts`, `deferred.ts`) still use `$: any` and ignore the interfaces in `types.ts`. The 9 "Not started" modules need the full playbook. Specific type bugs:

- `types.ts:56` — `AjaxSettings.type` literal union collapsed by trailing `| string`
- `types.ts:165-166` — `css()` getter return missing `| undefined`
- `types.ts:430-440` — `Callbacks` methods return `unknown`, should return the callbacks type for chaining
- `types.ts:473-477` — `$.fx` type wrong: declares `step` (never set), omits `cssPrefix`/`transitionEnd`/`animationEnd`

---

## Architectural decisions that need a call

These are the big questions where the right answer depends on project priorities:

### 1. XHR → fetch (ajax.ts)

Feasible for the happy path, but `$.ajax()` returns a live XHR object (callers read `.status`/`.responseText`/`.abort()`), so a fetch port requires synthesizing an XHR-shaped shim backed by `AbortController`. `async: false` is impossible in fetch (and deprecated anyway — drop it). Largest single opportunity, highest risk.

**Recommendation:** defer behind a test suite; do the eval→`<script>` fix independently first.

### 2. jQuery pseudo-selectors (selector.ts)

The entire `process()`/filter engine adds overhead to every query for features that have zero test coverage. Options:

- (a) Delete entirely and rely on native CSS (`:has`, `:checked`, `:scope`)
- (b) Keep but gate behind a `:` presence check
- (c) Keep as-is

**Recommendation:** (b) as a safe middle ground.

### 3. JSONP (ajax.ts)

Pre-CORS hack, inherently insecure (remote endpoint returns executable JS). CORS is universal in evergreen.

**Recommendation:** keep public surface, mark as legacy in docs.

### 4. gesture.ts

iOS-proprietary `gesturestart`/`gesturechange`/`gestureend` events. Only consumer path is `$.os.ios` → `gesture.ts`.

**Recommendation:** decide if iOS-only pinch is still a product requirement. If not, delete the module and trim `detect.ts` to just what's needed.

### 5. Deferred → native Promise

Cannot delegate (progress channel, context-bound resolution, sync `state()` have no Promise equivalent).

**Recommendation:** keep custom impl, but make it accept native thenables in `when`/`then` (additive, non-breaking).

---

## Do-not-touch zones

These already carry perf-justifying comments and are correct as-is:

### mepto.ts

- `qsa` ID/class/tag fast paths
- `compact`/`flatten`/`uniq`/`filter` manual loops (V8 elements-kind fast paths)
- `elementDisplay` probe + `Map` cache
- `camelize`/`dasherize` memoization
- `css()` setter's pre-computed `entries` approach
- `extend`'s `Object.keys` + manual loop

### fx.ts / fx_methods.ts

- CSS-transition-based animation (not JS-tweened)
- `opacity` + `scale` transforms (not layout properties)
- The forced-reflow at fx.ts:107 (needed for newly-inserted elements)

### touch.ts

- `setTimeout(0)` for tap/swipe deferral (NOT a `queueMicrotask` candidate — intentional macrotask yield for scroll-cancel ordering)
- `longTapDelay = 750` and 30px thresholds (tuned UX constants)

### callbacks.ts

- The `stack`-based re-entrancy guard (correct, jQuery-faithful, do not "optimize" into a flat loop)

### selector.ts

- `mepto.uniq` already uses `Set` internally

---

## Recommended sequencing

1. **P0 bugs first** — `letructor` rename, slide-method decision, dead `gestureTimeout`. All isolated, zero behavioral risk.
2. **P1 dead code** — delete `assets.ts`, dead `Mepto` interface, `$.expando`, detect.ts dead platforms. Pure subtraction.
3. **P2 legacy compat** — batch the evergreen-only deletions (`createEvent`→`Event`, vendor prefixes, `:scope` replacement, `<a>`→`URL`). Each is independent.
4. **Add tests** for the untested modules (AJAX, Deferred, touch, animations) — gates P3/P4 work.
5. **event.ts WeakMap migration** — the highest-value single change, mirrors completed `data.ts` work.
6. **TS conversion** of the 9 remaining modules, fixing the type bugs in `types.ts` as you go.

---

## Per-module detail

### Core modules (`mepto.ts`, `meptos.ts`, `types.ts`)

- **`meptos.ts:32`** — Entry point recovers the library from a global side effect (`window.mepto`) rather than importing the returned `mepto` value from `mepto.ts`. Architecturally fragile.
- **`meptos.ts:44`** — `typeof window !== 'undefined'` guard is dead for evergreen-only target.
- **`types.ts:485-496`** — Dead `Mepto` interface, duplicate of `MeptoNamespace`, already drifted. Delete or reconcile.
- **`types.ts:253, 269`** — `submit(handler?)` declared twice in `MeptoCollection`.
- **`types.ts:56`** — `type?: 'GET' | 'POST' | ... | string` — trailing `| string` collapses the union.
- **`mepto.ts:1086-1088`** — `letructor: mepto.Z` is a corrupted `constructor`. **Bug.**
- **`mepto.ts:2454-2464`** — Inline-script re-execution via indirect `eval` can't handle `type="module"`. Should re-insert a `<script>` element.
- **`mepto.ts:2000`** — `type(property) == 'string'` should be `typeof property === 'string'`.
- **`mepto.ts:867, 1137, 1180`** — Three remaining `: any` annotations (`deserializeValue`, `concat`, `get`).

### Event & input modules (`event.ts`, `touch.ts`, `gesture.ts`)

- **`event.ts:28, 40-42, 50`** — `_zid`-expando handler storage should be `WeakMap`. Mirrors completed `data.ts` migration. Highest-value single change.
- **`event.ts:454-468`** — `document.createEvent`/`initEvent` deprecated → `new Event()`.
- **`event.ts:30-32, 76-81`** — `focusinSupported` always true; `mouseenter`/`mouseleave` emulation dead overhead.
- **`event.ts:243-256`** — `compatible()` IE/DOM2 fallbacks (`returnValue`, `getPreventDefault`, `timeStamp` try/catch) dead.
- **`event.ts:177, 180, 10`** — `arguments` + `Array.prototype.slice.call` in `$.proxy` → rest params.
- **`event.ts:311-319, 374-375`** — Parameter mutation via comma-operator for jQuery arg overloading → extract `normalizeOnArgs()` helper.
- **`event.ts:201-214`** — All `$.fn` event methods cast through `Record<string, any>` despite typed interfaces existing in `types.ts`.
- **`touch.ts:65-72`** — Dual Touch Events / Pointer Events paths. Pointer Events universal in evergreen; `'ontouchstart'` branch legacy.
- **`touch.ts:89`** — Stores full Mepto collection in `touch.el` just to call `.trigger()`. Store bare `Element`.
- **`gesture.ts:7, 16`** — `gestureTimeout` declared but never assigned. Dead code.
- **`gesture.ts:13-26`** — `gesturestart`/`gesturechange`/`gestureend` are iOS-proprietary. Decide if still needed.

### DOM & data modules (`data.ts`, `form.ts`, `selector.ts`, `stack.ts`)

- **`data.ts:12`** — `$.expando` vestigial. Zero readers. Type lie (`string` declared, `Symbol` assigned).
- **`data.ts:18-22`** — `removeData`-then-read resurrects attribute values. Latent bug.
- **`data.ts:85-88`** — `remove`/`empty` unconditionally runs `querySelectorAll('*')`. Walk nodes directly.
- **`form.ts:13`** — Non-form containers silently serialize to nothing (`.elements` only on `HTMLFormElement`).
- **`selector.ts:38-39, 62-66`** — `classTag` class-mutation hack → native `:scope`. Eliminates DOM writes around every child-selector query.
- **`selector.ts:37, 41-44`** — `process()` runs regex+replace on every query. Gate behind `:` presence check.
- **`selector.ts:8-10`** — `visible()` allocates `$(elem)` wrapper + 3 layout reads per element.
- **`selector.ts:79-82`** — `:last` filter crashes in `.is()`/`.not()`.
- **`stack.ts:10-12`** — `andSelf` deprecated jQuery 1.8, removed in 3.x.

### Async modules (`ajax.ts`, `deferred.ts`, `callbacks.ts`)

- **`ajax.ts:199-272`** — `$.ajax` returns live XHR object augmented with promise methods. Central fact for any fetch rewrite.
- **`ajax.ts:264-265`** — `async: false` impossible in fetch. Drop as deprecated.
- **`ajax.ts:247`** — `(1,eval)(result)` indirect eval is XSS vector. Replace with `<script>` injection (matches JSONP path).
- **`ajax.ts:81-142`** — JSONP is pre-CORS hack. Keep public surface, mark legacy.
- **`ajax.ts:14-17, 204-209`** — `<a>`-anchor URL parsing → native `URL` API.
- **`ajax.ts:228`** — `RegExp.$1` deprecated statics → `exec()`.
- **`ajax.ts:8-9`** — Shared module-level loop vars `key`/`name`. Make local `const`.
- **`ajax.ts:283-307`** — `arguments` + comma-operator arg shuffling in `$.get`/`$.post`/`$.getJSON` → rest params.
- **`deferred.ts`** — Cannot delegate to native Promise (progress channel, context-bound resolution, sync `state()`). Keep custom impl.
- **`deferred.ts:26-46`** — Make Deferred accept native thenables in `when`/`then` (additive interop).
- **`callbacks.ts`** — No native API replaces this. Keep. Re-entrancy via `stack` is correct.

### Effects & utils modules (`fx.ts`, `fx_methods.ts`, `assets.ts`, `detect.ts`)

- **`assets.ts`** — Entire file is dead code. Not imported by `meptos.ts`.
- **`fx.ts:6, 17-22`** — Vendor-prefix detection unreachable on evergreen. Hardcode `prefix=''`.
- **`fx.ts:36`** — `$.fx.off` permanently `false`.
- **`fx.ts:24-33`** — `cssReset` built by chained side-effecting assignment → plain object literal.
- **`fx.ts:111-113`** — `setTimeout(fn, 0)` for duration<=0 path → `queueMicrotask` candidate (verify intent first).
- **`fx_methods.ts:3`** — `var document = window.document` unused shadow. Delete.
- **`fx_methods.ts:50`** — `this.css('opacity')` returns string, compared with `>`. Use `parseFloat()`.
- **`detect.ts`** — 90% dead platforms (webOS, BlackBerry, BB10, PlayBook, Firefox OS). UA sniffing deprecated.
- **`detect.ts:68`** — `navigator.platform` deprecated.
