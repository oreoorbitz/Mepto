---
name: perf
description: Performance philosophy for Mepto — minimize browser layout work, batch DOM, cache queries, and schedule with rAF. Read before changing any DOM-heavy API.
---

# Perf — Performance Philosophy

Every API decision should minimize live DOM touches. The browser's layout engine dominates cost. jQuery convenience hides per-operation overhead (selector engine, wrapper allocations, repeated traversals) that compounds in loops and large UIs. Mepto wins by providing ergonomic APIs that internally batch, cache, and reuse — with zero dependencies and modern code.

**Browser target is evergreen only** — no IE, no legacy Edge, no Safari < 14. Use native platform APIs freely. See `skills/migrate/SKILL.md` for the full target note.

## High-impact areas (priority order)

1. **Batch DOM updates** — `DocumentFragment` for bulk insertions. One-by-one appends trigger multiple reflows; a fragment batches into one.
2. **Read/write separation** — Never interleave layout reads (`getBoundingClientRect`, `offsetWidth`, `scrollTop`) with DOM writes. A read after a write forces a synchronous layout recalc.
3. **Caching & minimal queries** — `querySelector` and traversals are slow when repeated. Cache results; scope queries narrowly. Use `WeakMap` for element-associated data.
4. **Scheduling with rAF** — Batch visual changes to align with paint cycles. `requestAnimationFrame` for animations and high-frequency updates.
5. **Memory & cleanup** — `WeakMap`/`WeakSet` for element data so GC can collect removed nodes. Prefer modify-in-place over destroy/create.
6. **Event delegation** — Single listener on a container scales better than per-element listeners, especially for dynamic content.

## Query routing — measured (js_query_performance/, Chrome 150, Blink/V8, 10 medians)

> `js_query_performance/dom-bench/RESULTS.md` — fixtures small 261 / medium 2061 / large 20097 nodes. Ratios are signal; abs ops/s machine-specific.

| Prefer                                           | Over                                                           | Why (median)                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `#id` → `getElementById`                         | `querySelector('#id')`                                         | 1.18× faster, both O(1) flat 5.8→6.0M ops/s; `qSA('#id')` 2.3× slower (static-list alloc) |
| `.cls` → `getElementsByClassName`                | `qSA('.cls')`                                                  | 57× @20K (9.3M flat vs 163K degraded 10×), tree-indexed live collection                   |
| `tag` → `getElementsByTagName`                   | `qSA('tag')`                                                   | 3292× @20K (11M flat vs 3.5K), 273× @medium — widest gap measured                         |
| `el.closest(sel)`                                | manual `parentNode` loop + `classList.contains`/`matches`      | 4.1× / 3.7× @50 depth (C++ walk, no per-level JS↔C++ crossing)                            |
| `el.classList.contains('cls')`                   | `el.matches('.cls')` for pure class guard                      | 0.63× vs 0.44× of `tagName===` (23.9M); 1.4× cheaper                                      |
| `el.tagName === 'DIV'`                           | `matches`/`classList` when tag guard suffices                  | 23.9M ops/s — cached-string compare                                                       |
| `qSA('[data-x]')`                                | `getElementsByTagName('*')` + manual `getAttribute` filter     | 19×/12× — engine predicate vs JS boundary per-element                                     |
| `document.querySelector('.rare')`                | `scopeRoot.querySelector('.rare')` for rare class              | 1.28× @large via doc class cache (fixture-dependent)                                      |
| `firstElementChild` / `nextElementSibling` chain | `children[0]` / `children` HTMLCollection + `nextSibling` skip | 2.1× / 2.34×; 2.2× over TreeWalker/NodeIterator                                           |
| Cached-length `for (i=0,n=list.length;i<n;i++)`  | `for (i=0;i<live.length;i++)` / `NodeList.forEach`             | 1.23× / 2.4×; live `.length` re-validates per access                                      |

Mepto implements: `mepto.qsa` rquickExpr routing (`#id`→`getElementById` on Document/Fragment with `contains` guard, `.cls`→`gEBCN`, `tag`→`gEBTN` on Document/Element/Fragment), `mepto.findFast(sel, ctx)` for explicit O(1) path, `$.fn.filter` fast class/tag via `classList.contains`/`tagName===`, `siblings` via `firstElementChild`/`nextElementSibling` walk, `prev`/`next` already `previous/nextElementSibling`, delegation via `closest`. Keep jQuery `$(sel)` compat — fast paths are drop-in (`mepto.qsa` inside `$()`/`find`).

## Patterns to prefer

| Prefer                                                                                                  | Over                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `mepto.getElementById` / `getElementsByClassName` / `getElementsByTagName` / `findFast` for bare tokens | `$('#id')` / `$('.cls')` / `$('tag')` via `qSA` in hot loops |
| `closest(sel)`                                                                                          | Manual `while (el = el.parentNode)` + `matches`              |
| `classList.contains` / `tagName===`                                                                     | `matches('.cls')` for pure class/tag guard                   |
| `DocumentFragment` + single `appendChild`                                                               | Repeated per-element `appendChild` in a loop                 |
| `element.classList` or batch `cssText`                                                                  | Many individual `element.style.prop = value` sets            |
| Cache `querySelector` before a loop                                                                     | Repeated `querySelector` inside a loop                       |
| `WeakMap` for element-associated data                                                                   | Expanding properties directly onto DOM nodes                 |
| `<template>` clone + insert                                                                             | Many `createElement` + `setAttribute` calls                  |
| CSS `transform`/`opacity` for animation                                                                 | JS-driven `style.top`/`style.left` updates                   |
| Modify existing elements in-place                                                                       | Remove + recreate cycles                                     |

## Patterns to avoid

- **Layout thrashing**: reading `offsetWidth`, `getBoundingClientRect`, `scrollTop` inside a write loop forces sync layout recalc every iteration.
- **Per-element listeners** on dynamic content — use event delegation.
- **Repeated DOM queries inside loops** — cache before the loop.
- **Unnecessary `$(el)` wrapper allocations** in hot paths — call helpers directly when possible.

## Measurement

Profile with Chrome DevTools **Performance** tab on realistic scenarios (large lists, frequent updates, mobile). Focus on:

- Reflow/repaint count and long tasks
- Heap growth over time
- Direct comparison against jQuery equivalents

Target: smooth 60fps and good INP (Interaction to Next Paint).

## V8 note (library internals only)

In hot internal helpers, prefer consistent object shapes (fixed property order in config objects). Do not sacrifice API clarity for marginal JIT gains — the layout engine dominates costs. See `V8_OPTIMIZATION_RULES.md` for the detailed V8 rules distilled from v8.dev.

## Prior work

`src/data.ts` already migrated its plain-object cache to `WeakMap` and `node[exp]` expansion to `Symbol` — follow that pattern for new element-associated state. `OPITMIZATIONS.md` (typo preserved) contains additional historical notes.
