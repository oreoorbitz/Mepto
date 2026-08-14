# Plan: Deep Investigation — Optimal DOM Element Querying in Frontend JavaScript

**Goal**: Produce the definitive, finicky reference for high-performance library authors on every
way of reaching a specific element in JS — `getElementById`, `getElementsByClassName/TagName/Name`,
`querySelector(All)`, `closest`, `children`/`childNodes[i]`, manual traversal loops, `TreeWalker`,
`elementFromPoint`, XPath, caching/identity tricks — with measured numbers, engine internals
(Blink/WebKit/JSC/V8), and situation-by-situation recommendations. Readability is NOT a goal; raw
throughput is.

**Deliverable**: `/mnt/agents/output/dom-query-performance-reference.md` (+ `.docx`) and a runnable
benchmark sandbox under `/mnt/agents/output/dom-bench/`.

---

## Stage 1 — Research Swarm (skill: deep-research-swarm)

4 parallel explore subagents (background), non-overlapping:

- **R1 — API surface & semantics**: every query/traversal API, live vs static collections,
  spec-level cost drivers, invalidation behavior, historical benchmark lore.
- **R2 — Engine internals**: Blink (ElementRareData, id/class name maps, SelectorQuery JIT,
  querySelector fast paths), WebKit/JSC, V8 binding overhead (IDL attribute vs method), why
  `querySelector('#id')` is slower than `getElementById`, caching of selectors, recalc-style
  interactions. Source-level evidence (Chromium/WebKit source + commit logs + perf bugs).
- **R3 — Benchmark evidence**: measurethat.net / jsbench / jsperf archives, perflink, existing
  published numbers (e.g. getElementById vs qS('#id') ~ n× faster), live HTMLCollection
  performance cliffs, closest() vs manual loop, TreeWalker stats.
- **R4 — Library practice**: how jQuery/Sizzle, React, Vue, Solid, Preact, htmx, Alpine,
  lit do element lookup; id-to-element caches, WeakMap caching, avoiding selector parsing.

Output: 4 research briefs in `/mnt/agents/output/research/`.

## Stage 2 — Real-engine benchmark sandbox (coder subagent)

- Build a self-contained HTML benchmark suite (median-of-N ops/sec harness, warmup, GC
  discipline, dead-code-elimination guards) covering ~25 scenarios:
  id vs class vs tag vs attr selectors; qS('#id') vs getElementById; qS vs qSA[0];
  live vs static collections; `.closest()` vs while-loop tagName match vs `parentNode` chain;
  `children[0]` vs `firstElementChild` vs `childNodes` filtering; TreeWalker vs manual;
  deep-DOM scaling (100 / 1k / 10k nodes); cached-reference vs re-query; `matches()` cost.
- Run in **headless Chromium (real Blink+V8)** via CDP/puppeteer-core, collect ops/sec,
  export JSON + a results table.
- Also run in Node/jsdom only as a counter-example (why jsdom numbers don't transfer).

## Stage 3 — Writing (skill: report-writing)

- Writer subagent drafts the reference document from research briefs + measured JSON.
- Structure: mental model → per-API deep dive → engine internals → measured tables →
  decision matrix by situation → library-author playbook (caching, identity, WeakMaps,
  avoiding live collections, delegation patterns).

## Stage 4 — Verify & deliver

- Verifier subagent cross-checks numeric claims against benchmark JSON.
- Convert to .docx via docx skill. Deliver both + sandbox folder.

## Gates

- G1: research briefs complete & non-contradictory → Stage 2
- G2: benchmark JSON sane (variance < ~5% on medians) → Stage 3
- G3: verifier pass → deliver
