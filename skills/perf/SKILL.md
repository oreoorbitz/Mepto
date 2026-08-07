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

## Patterns to prefer

| Prefer                                    | Over                                              |
| ----------------------------------------- | ------------------------------------------------- |
| `DocumentFragment` + single `appendChild` | Repeated per-element `appendChild` in a loop      |
| `element.classList` or batch `cssText`    | Many individual `element.style.prop = value` sets |
| Cache `querySelector` before a loop       | Repeated `querySelector` inside a loop            |
| `WeakMap` for element-associated data     | Expanding properties directly onto DOM nodes      |
| `<template>` clone + insert               | Many `createElement` + `setAttribute` calls       |
| CSS `transform`/`opacity` for animation   | JS-driven `style.top`/`style.left` updates        |
| Modify existing elements in-place         | Remove + recreate cycles                          |

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
