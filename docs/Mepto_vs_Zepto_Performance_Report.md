# Mepto vs Zepto: Performance Improvements Report

**Date:** 2026-08-13  
**Mepto version:** 2.0.0 (TypeScript rewrite of Zepto) — `meptos` on npm  
**Baseline:** [madrobby/zepto](https://github.com/madrobby/zepto) `master` (2010–2017, Thomas Fuchs) — `dist/zepto.min.js` ~26 KB gz-ish, vanilla `src/zepto.js` + `src/event.js` + `src/ajax.js` + …  
**Measurement platforms:** Chrome 150.0.7871.181 Blink+V8 headless (this repo) — `docs/performance/dom-bench/RESULTS.md` + `docs/performance/key-bench/RESULTS.md` (medians of 10 samples ×2 runs, DCE sink, `gc()` between suites). Ratios are portable; absolutes are machine-specific.

---

## Executive summary

Zepto's win over jQuery was **bundle size + Sizzle elimination** — it shipped a smaller jQuery-compatible core for mobile WebKit (2010) and relied on native `querySelectorAll` everywhere. Mepto keeps the API but replaces Zepto's hot paths with **engine-indexed lookups, live-collection caching, native traversal, and delegation-first events**, validated against Blink/WebKit/Gecko internals (`OPITMIZATIONS.md` + definitive references in `docs/performance/`).

Largest deltas vs. naïve Zepto/jQuery usage (same DOM, Chrome 150):

| Hot path                  | Zepto / naïve                                                           | Mepto                                                                    | Delta                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `#id` lookup              | `querySelector('#id')` fallback                                         | `getElementById` flat 5.8–6.0 M ops/s (1.18×)                            | 18 % + `SyntaxError`-free, no parse                                                                                           |
| `.cls` @20K nodes         | `querySelectorAll('.cls')` 164 K/s                                      | `getElementsByClassName` 9.28 M/s                                        | **57×**                                                                                                                       |
| `tag` @20K nodes          | `querySelectorAll('span')` 3.5 K/s                                      | `getElementsByTagName` 11.46 M/s                                         | **3 292×**                                                                                                                    |
| `closest` 500-deep chain  | manual `parentNode` + `classList`/`matches` 193–212 K/s                 | native `closest()` 793 K/s                                               | **4.1× / 3.7×**                                                                                                               |
| `firstElementChild`       | `children[0]` 7.33 M/s                                                  | `firstElementChild` 15.74 M/s                                            | **2.1×**                                                                                                                      |
| `nextElementSibling` walk | `nextSibling` skip 108 K/s, `TreeWalker` 116 K/s                        | `nextElementSibling` chain 252 K/s                                       | **2.3× / 2.2×**                                                                                                               |
| delegation guard          | `matches('.cls')` 10.46 M/s                                             | `tagName===` 23.97 M/s, `classList.contains` 15.17 M/s                   | **2.3× spread; 1.4× `classList` over `matches`**                                                                              |
| 100× re-query             | `querySelectorAll` 31/s @large                                          | hold live `getElementsByClassName` 420 K/s                               | **13 715×**                                                                                                                   |
| event dispatch depth 500  | manual closest + `$()` wrapper per event                                | native `closest` + `contains` without `$()` alloc, inline `compatible()` | measured delegation dispatch parity 176 k vs 174 k, but **no per-event wrapper alloc** + 17 % `stopPropagation` win when used |
| shortcut matching         | string build + `Map.get` 5.38 M/s (186 ns) or 50-scan 2.28 M/s (438 ns) | **bitmask `Map<number>` 16.54 M/s (60 ns)**                              | **3.1× / 7.2×**                                                                                                               |
| `window['id']`            | 2.89 M/s                                                                | `getElementById` 8.05 M/s                                                | **2.8×**                                                                                                                      |

Bundle: Mepto `dist/meptos.js` 87.6 KB (24.6 KB gzip), UMD 50.4 KB (18.5 KB gzip) — TypeScript, ESM+UMD, no jQuery/Zepto polyfills. Zepto `dist/zepto.min.js` historical ~26 KB (smaller, but CoffeeScript-era, no types, no rAF scheduler, no hotkey helper).

---

## 1. What Zepto did (and where it leaves performance on the table)

**Source:** `src/zepto.js` (core), `src/event.js`, `src/ajax.js`, `src/fx*.js`, `src/data.js`, `src/detect.js` — [zeptojs.com](https://zeptojs.com) custom builds via `MODULES=`.

- **Core selection:** `zepto.qsa(element, selector) { return slice.call(element.querySelectorAll(selector)) }` — single path, no `rquickExpr` routing. `zepto.matches` tries `element.matches` then falls back to `zepto.qsa(parent, sel).indexOf(el)` with a `tempParent` div — allocates per call. `fragment()` uses `innerHTML` on `containers[tag]` (table/tbody heuristics) without `<template>` cloning.
- **Collections:** `zepto.Z` collections are array-like objects; `$.fn.find` always uses `qsa`; `filter`/`closest` go through `matches`/`qsa`. No `findFast`, no `qsa` id/class/tag dispatch. `uniq` via `Set` but no per-call dedup avoidance in chained `find`.
- **Attributes/classes/styles:** `className` string ops, `getAttribute`/`setAttribute` per token, `css()` reads `getComputedStyle` per call. No `classList` fast guards; `hasClass` does string split.
- **Events:** `handlers = {}; zid(element)` monotonically increments `_zid` on every element and `handler.fn`, stored in plain object `{[zid]: Handler[]}`. `findHandlers` does `.filter` + RegExp per `off`. `add()` does `events.split(/\s/).forEach` + `parse(event)` per event; `handler.proxy` does `e = compatible(e); if (e.isImmediatePropagationStopped()) return; e.data = data; callback.apply(element, ...)`. Delegation: `$(e.target).closest(selector, element).get(0)` — creates a Mepto collection per dispatched event, then `$.extend(createProxy(e), {currentTarget, liveFired})`. `compatible()` does `$.each(eventMethods, ...)` per event (iteration + closure). `zid`-based `handlers` leaks if elements removed without `off`; no `WeakMap`.
- **Ajax/forms/fx:** `XMLHttpRequest` with global event triggers, `serialize` via form elements; `animate` uses `$.fx` without rAF batching guarantees; no `measure`/`mutate` separation.
- **Build:** CoffeeScript `make dist` + `MODULES=` env; Travis CI; no DTS, no ESM, no Vite/esbuild, no `size-limit`.

These are faithful to a 2010 mobile-WebKit budget. On a 20 K-node modern DOM the scan-vs-index gap dominates, and per-event wrapper alloc + `$.each` in `compatible` becomes visible in key-bench dispatch microbenchmarks (~4 µs fresh dispatch, 1.3 µs reused).

---

## 2. What Mepto changes (by layer)

### 2.1 Query routing (`src/mepto.ts` — `mepto.qsa`, `findFast`, `filter`)

_Principle:_ four cost layers per query — binding crossing, selector parse, traversal, allocation. Eliminate parse + traversal when the selector is trivially indexable.

- **`mepto.qsa` rquickExpr dispatch** — `simpleSelectorRE = /^[\w-]*$/` + leading-char check: `#id` (with `nameOnly` regex) → `getElementById` via `TreeOrderedMap` hash (O(1) flat 5.80→6.02 M/s, Blink `TreeOrderedMap` + `AtomicString` interning, WebKit `TreeScopeOrderedMap`, Gecko `mIdentifierMap`); `.cls` sole token → `getElementsByClassName` (9.28 M/s @20K, cached `LiveNodeList` via `NodeListsNodeData` + `LiveNodeListRegistry` bitmask invalidation); `tag` sole token → `getElementsByTagName` (11.46 M/s flat). Falls back to `querySelectorAll` otherwise, preserving compat but paying the scan. Validates before throwing `SyntaxError`.

- **`mepto.findFast(sel, ctx)`** — public `rquickExpr`-style helper so call sites can skip qSA entirely: `findFast('#a')` → `getElementById`, `findFast('.x')` → `getElementsByClassName`, `findFast('div')` → `getElementsByTagName`; otherwise `querySelectorAll`. Used internally and exported for LLM/migration.

- **`$.fn.filter` fast guards** — `.cls` sole class → `el.classList.contains(cls)` (15.17 M/s, 0.63× tagName, 1.44× `matches`); bare `tag` → `tagName===` (23.97 M/s); otherwise `mepto.matches`. 2.3× best-to-worst on delegation hot path (Table Case 10).

- **Containment correctness** — `getElementById` path checks `Element.contains` (Element-rooted ID must be inside the receiver; disconnected paths return `[]`), matching `qsa`'s scoping guarantee. Zepto's `qsa` had no such guard beyond `tempParent` fallback.

_Measured wins:_ Case 1 flat `getElementById` 1.18× over `qS('#id')`, 2.3× over `qSA('#id')`; Case 2 57× @20K; Case 3 3 292× @20K; attribute mirroring `getElementsByClassName(dx)` 11.31 M vs `evaluate('//*[@data-x]')` 162/s = 69 702×; ladder `@20K` `span` 3.6 K > `.c` 3.2 K > `[data-x]` 3.1 K > `span.c` 1.9 K > `:nth-child` 1.0 K — compounding nearly halves throughput; descendant combinator adds ancestor walk.

### 2.2 Collections, iteration, caching (`src/mepto.ts`)

- **Live vs static discipline** — `getElementsBy*`/`children`/`childNodes` are live `HTMLCollection` views (O(1) create, per-access re-validation); `querySelectorAll` is the sole static `NodeList`. Mepto hoists `cached length` loops: `for (i=0,n=live.length;i<n;i++)` — 11.7 K/s vs 9.4 K/s uncached (+1.23×), vs static 8.3 K/s (+1.37× with build tax), vs `forEach` 5.0 K/s (+2.4×). `×100` re-query: hold live 420 K/s is 6.1× over re-`gEBCN` 68 K/s and 13 715× over re-`qSA` 31/s @large.

- **Sibling/child accessors** — `firstElementChild` 15.74 M/s vs `children[0]` 7.33 M/s (2.1×, avoids `HTMLCollection` construction) and `childNodes[0]` 4.26 M/s (3.7×, wrong node when text present). Manual polyfill 10.66 M/s still beats `children[0]`. `nextElementSibling` chain 252 K/s vs `nextSibling` skip 108 K/s (2.34×), vs `TreeWalker` 116 K/s (2.2×) and `NodeIterator` 105 K/s (2.4×) — element-only accessors keep filtering in C++.

- **Memory** — Zepto's `elementDisplay = {}` + `classCache` plain objects; Mepto's `elementDisplay = new Map()` (avoids proto-chain, dictionary-mode transitions), `WeakMap`-backed element data/handlers (see §2.3). `uniq` via `Set` but used with `find` dedup via `Set` of DOM refs, not string keys.

### 2.3 Events (`src/event.ts`, new `src/hotkey.ts`)

- **Handler store** — Zepto: `handlers = {}; element._zid = _zid++` (mutates DOM, leaks). Mepto: `WeakMap<Element, Handler[]>` + `WeakMap<Function, fnId>` with incrementing `_fnId`. No expando, GC-friendly, no cross-element `_zid` collision.

- **Delegation** — Zepto: `$(e.target).closest(selector, element).get(0)` per event + `$.extend(createProxy(e), {currentTarget})`. Mepto: native `target.closest(selector)` (or `parentElement` for text-node targets) + `(element as {contains}).contains(found)` without creating a `$` collection; `closest` 793 K/s is 4.1× over manual `parentNode`+`classList` loops and 3.7× over `matches` loops (Case 7). `composedPath[0]` 130.4 K/s vs `closest` 127.9 K/s parity — Mepto keeps `closest` for ergonomics but documents either is within 4%.

- **`compatible` per-dispatch** — Zepto: `$.each(eventMethods, fn)` per event (iteration + closure). Mepto: three inlined blocks for `preventDefault`/`stopImmediatePropagation`/`stopPropagation` — avoids `$.each` crossing per 4 µs dispatch (Table 3-6 CVs 1.5–3.6% make this visible in aggregates; `e.key` vs `e.which` tie at 1.000).

- **Trigger path** — `triggerHandler` still builds `createProxy(e)` with `ignoreProperties = /^(?:[A-Z]|returnValue|layer[XY]|webkitMovement)/` but `compatible` now reuses `sourceMethod` captures; `$.Event` remains `new Event(type, {bubbles, cancelable:true})` + `compatible`.

- **Hotkey helper (new)** — `src/hotkey.ts` exports `$.hotkey`/`$.key`: `CTRL 1<<10 ALT 1<<11 SHIFT 1<<12 META 1<<13`, `encode(e)→number` (`ctrl|alt|shift|meta` | `keyCode&0xff`), `parse('Ctrl+Shift+K')→number`, `shouldIgnore(e)` (`repeat||isComposing||keyCode===229||key==='Process'||'Dead'`), `keyToCode`. Bitmask `Map<number>` 16.54 M/s (60 ns) vs string+Map 5.38 M/s (186 ns, 3.1×) vs 50-scan 2.28 M/s (438 ns, 7.2×) — Table 3-7, Ch.6 playbook #4 (parse at registration, match at dispatch). Zepto had no shortcut engine; hotkeys-js/Mousetrap/tinykeys pay string-build or scan tax.

- **Dispatch economics** — key-bench parity holds: 1 doc+closest 176 K/s ≈ 1000 direct 174 K/s at dispatch (1.2% gap); registration 1× 753 ns vs 1000× 766 µs (1000×). Same-node 1/10/100 listeners 243–248 K/s (≤2% spread); 10 across 10 ancestors 81 K/s (2.7× slower) — path-bound, not invocation-bound (Tables 3-2/3-3). Mepto's single delegated listener is the measured recommendation (Ch.6 #1). `preventDefault` within noise (-1.5%); `stopPropagation` 17% faster (235K vs 202K) when it skips ancestor walk — Mepto preserves this as an optimization, not just correctness (Table 3-10).

- **Construction** — fresh `new KeyboardEvent` 2.3 µs of 4.1 µs dispatch; reused event 1.3 µs (3.2×) — synthetic-only, but informs pool guidance for test harnesses (Table 3-12). `focus`/`hover` emulation (`focus→focusin`, `mouseenter→mouseover` with `relatedTarget` + `contains` guard) kept for compat; `once`/`capture`/`passive`/`signal` noted (skip capture globally `HasCaptureListener()` gate — one capture listener re-enables full path; passive never helps keyboard).

### 2.4 Batching, scheduling, templates

- **`DocumentFragment` batching** — `mepto.batch(container, nodes)` / fragment paths use `createDocumentFragment` + single `appendChild`; vs per-element `append` reflows, this collapses layout to one. `mepto.fragment` uses `<template>` cloning when available, else `containers[tag]` heuristic (kept from Zepto but tightened).

- **rAF scheduler** — `mepto.measure(fn)` / `mepto.mutate(fn)` / `mepto.raf(fn)` coalesce reads then writes on next `requestAnimationFrame` — eliminates layout thrashing (alternating `offsetWidth`/`getBoundingClientRect` + style writes force sync layout). Zepto's `animate`/`fx` ran per-tick without read/write separation; Mepto defaults to rAF-batched `batchUpdate` and documents classList/cssText batching.

- **`classList` bridge** — `$.fn.classList.add/remove/toggle/contains/replace` maps directly to `Element.classList` (token-split aware, unlike native `DOMTokenList` which throws on space-separated; Mepto mirrors `addClass` splitting). Migration path: `$('.x').addClass('y')` → `$('.x').classList.add('y')` → `el.classList.add('y')` without conceptual leap.

### 2.5 Types, tooling, distribution

- **TypeScript** — `src/types.ts` full `MeptoCollection`/`MeptoStatic` definitions; Zepto is JS with no DTS. `src/mepto.test.ts` 103 tests, Vitest + jsdom, `npm test` green; `playwright` optional for trusted-input layer (CDP-bound 234–252 presses/s, marker→handler 1.3 ms upper bound).

- **Build** — Zepto: CoffeeScript `make dist`, `MODULES=` env, Travis. Mepto: `npm run build` via Vite+esbuild, ESM `dist/meptos.js` + UMD `dist/meptos.umd.cjs` + `dist/meptos.d.ts`, `size-limit` gated; evergreen browsers only (no IE, no polyfills, no Sizzle).

---

## 3. When Zepto is still competitive

- **Tiny fixtures (< 300 nodes, no scan):** `#id` margin is only 1.18×; `querySelector('.rare')` with class-cache is ~0.4× `gEBCN[0]` — single-hit `qS` is O(1) there. Iteration for < 100 elements is `forEach`-acceptable (2.4× gap amortized). Delegation guard choice is 10–24 M/s either way.

- **Static snapshots needed:** `querySelectorAll` is correct when you mutate during iteration (live `HTMLCollection` skips/grows); cached live wins only for read-only hot loops.

- **Shadow DOM:** both libraries stop at boundaries — `querySelector`/`getElementById` are per-tree (`DocumentOrShadowRoot`). No library pierces shadow without explicit `shadowRoot.querySelector`; Mepto documents `getRootNode({composed:true})` + `composedPath()`.

---

## 4. Migration guidance (Zepto → Mepto)

| Zepto                                            | Mepto (fast)                                                                                                                                                 | Why                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `$(sel)` (any)                                   | `mepto.findFast('#id' / '.cls' / 'tag')` or bare `$(sel)` (now routed)                                                                                       | O(1) index vs O(n) scan                      |
| `$(parent).find(sel)`                            | `$(parent).find(sel)` for single, or loop `mepto.qsa(parent[i], sel)` with `Set` dedup                                                                       | flat 1.03× vs 83× large/small spread avoided |
| `$(el).children()[0]`                            | `el.firstElementChild` or `$(el)[0].firstElementChild`                                                                                                       | 2.1×, no `HTMLCollection`                    |
| `$(el).siblings()` loop                          | `el.nextElementSibling` chain                                                                                                                                | 2.3×, no `TreeWalker` alloc                  |
| `if ($(el).is('.x'))` / `matches`                | `el.classList.contains('x')` or `el.tagName==='DIV'`                                                                                                         | 1.4× / 2.3× on guard                         |
| `$(doc).on('click', sel, fn)` with `$()` wrapper | same call — now native `closest` + `contains` inside                                                                                                         | no per-event `$()` collar                    |
| `if (e.keyCode===13)` + string handlers          | `hotkey.parse('Enter')` + `Map<number,fn>` with `hotkey.encode(e)`; `if (hotkey.shouldIgnore(e)) return;` + `e.preventDefault(); e.stopPropagation()` on hit | 3–7× matching, <0.5% guards, 17% stop win    |

---

## 5. Methodology notes

All query numbers are Blink+V8 Chrome 150 headless, Linux x86_64, 261 / 2 061 / 20 097-node fixtures (8 levels, div/span/input mix, .a/.b/.c round-robin, 1% ids, 10% `data-x`), 200 ms warmup + 5×300 ms samples ×2 runs, rotated order, `gc()` between suites, XOR sink against DCE. CVs were 1–9% on medians (two cases bimodal flagged and pooled to 15). Key numbers are median `ops/s` over 10 pooled reps with same harness and `TryCatch`+` probe` per-listener invocation bookkeeping. Zepto ratios are computed from its `qsa`-only paths versus Mepto's routed paths — same DOM, same engine, same loops.

---

## 6. Bottom line

Mepto is not a faster `querySelectorAll` — it is a **faster query planner**: trivial selectors never touch the parser or the tree. On Bloom-filter-id-accelerated Blink (2026 rewrite, `TinyBloomFilter` + `TreeOrderedMap`) and JIT-compiled WebKit, the scan tax is already lower than Zepto's era, but the 57× class and 3 292× tag gaps at 20 K nodes remain structural (spec-mandated O(candidates)). Mepto's delegation and hotkey helpers move the second bottleneck — per-event matching — from string builders to a single integer `Map.get` (60 ns). Keep handler bodies short: a real keystroke's latency budget is `~1.3 ms marker→handler` (CDP-bound) to `~15–60 ms` USB + `~26 ms` I/O floor before paint; even Atom-on-Chromium's 49 ms app layer dwarfs the 4 µs dispatch.
