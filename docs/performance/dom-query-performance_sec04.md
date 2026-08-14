## 4. Historical & Cross-Browser Evidence

Published DOM-query benchmarks span fourteen years of engine history, and their ratios disagree with each other far more than they disagree with folklore. That disagreement is not noise to be averaged away; it is the chapter's subject. Every number below carries its browser, version, and year, because a ratio without a UA string is not evidence — it is an anecdote with arithmetic.

### 4.1 Published ratios over time

| Comparison                                        | Ratio                   | Browser / Year                     | Source          |
| ------------------------------------------------- | ----------------------- | ---------------------------------- | --------------- |
| gEBI vs qS('#id'), fixed loop                     | 1.08×                   | Chrome, 2019                       | [^15^]          |
| gEBI vs qS                                        | 1.7× / 2.7×             | Chrome 73 / 75, 2019               | [^6^][^5^]      |
| gEBI vs qS, 100k-node DOM                         | 8.9× FF / 4.7× Chromium | FF 92 / Chromium 93, 2021          | [^11^]          |
| gEBI vs qS                                        | 1.9×                    | Chrome 93, 2021                    | [^7^]           |
| gEBI vs qS                                        | 1.4×                    | Chrome 115, 2023                   | [^8^]           |
| gEBI vs qS                                        | 1.8× (mobile)           | FF Mobile 129, 2024                | [^9^]           |
| gEBI vs qS('#id')                                 | 6.4× / 4.3× / 2.1×      | Chrome 145/146/126, 2026 runs      | [^2^][^1^][^3^] |
| gEBCN vs qSA('.class')                            | ~29×                    | Chrome, ~2016 (jsperf)             | [^12^]          |
| gEBCN vs qSA('.class')                            | ~51×                    | Chrome 68, 2018                    | [^13^]          |
| gEBCN vs qSA('.class')                            | ~4.5×                   | Chrome 100, 2022                   | [^14^]          |
| qSA vs TreeWalker (filter H1)                     | qSA ~3.9× faster        | Chrome; Safari 26 ~2.3×            | [^20^]          |
| TreeWalker vs qSA('\*')                           | TreeWalker ~2.3× faster | Chrome, ~2024–25                   | [^21^]          |
| NodeIterator JS-filter vs TreeWalker param-filter | 32× / 13× / ~20×        | Chrome / FF / Safari               | [^22^]          |
| closest() vs manual while-loop                    | parity (~1.04×)         | Chrome 131, 2024; Chrome 109, 2023 | [^24^][^25^]    |

#### 4.1.1 getElementById vs qS('#id'): folklore 10–100× vs measured 1.1×–9×

The folklore ratio — "`getElementById` is ten to a hundred times faster than `querySelector`" — circulates in blog posts and interview prep sheets without provenance. The published record does not support it. As the table shows, community runs on measurethat.net and its mirrors cluster between 1.4× and 6.4× across eight Chrome generations (2019–2026)[^1^][^2^][^3^][^5^][^6^][^7^][^8^]; a 2019 fixed-loop timing put the id case at just 1.08× (691 ms vs 749 ms)[^15^]. The earliest archived comparison, from the jsperf era in 2012, reported only an ordinal ranking, with anomalies such as Opera 12.11 beating everyone at qSA and Safari 6 being "immensely fast" at getElementById[^27^].

The most rigorous published study is Wesley Aptekar-Cassels' 2021 experiment on a 100k-element DOM with a select-all loop: Firefox 92 returned 7 ms for getElementById against 62 ms for querySelector (**8.9×**); Chromium 93 on the same machine returned 44 ms vs 206 ms (**4.7×**), with markedly higher variance on the querySelector side[^11^]. What drives this number to the top of the range: a huge DOM plus repeated identical selectors. The honest summary of the corpus is **1.1×–9×** — the "10–100×" claim appears only in buggy tests (§4.2.1) or in extrapolation from large-DOM setups like Aptekar-Cassels', which tops out at 8.9×.

#### 4.1.2 Class lookup gap collapse: 51× → 4.5×

The class-selector comparison is the clearest record of an engine closing a real gap. In the jsperf era (~2016, Chrome), getElementsByClassName posted 1,138,018 ops/s against querySelectorAll's 39,033 — **~29×**[^12^]. A 2018 run on Chrome 68 widened it to **~51×** (3,567,748 vs 69,880 ops/s)[^13^]. Then the same suite, re-run on Chrome 100 in 2022, collapsed to **~4.5×** (4,205,284 vs 944,033 ops/s)[^14^]; a 2019 fixed-iteration timing found only **1.9×** even then[^15^]. The mechanism is documented engine-side: Chrome's 2024 Speedometer 3 work streamlined common querySelector selector paths[^39^]. A 51× figure from Chrome 68 is not reproducible on Chrome 146+; quoting it today without the UA string is a category error.

#### 4.1.3 Contradictory TreeWalker results; the NodeIterator callback cliff

Traversal is where the published corpus contradicts itself outright, and both sides deserve to be shown. Filtering H1 elements, querySelectorAll beat TreeWalker **~3.9×** (735,159 vs 196,298 ops/s, Chrome; Safari 26 confirms ~2.3×)[^20^]. Collecting all elements, TreeWalker beat querySelectorAll('\*') **~2.3×** (5,856,998 vs 2,580,535 ops/s, Chrome)[^21^]. The contradiction resolves on inspection: the first fixture filters a sparse match set, the second walks everything; DOM size and setup differ, and neither suite controls for the other's regime. Treat "TreeWalker is faster/slower than qSA" as fixture-dependent, not a property of the APIs.

One traversal result is unambiguous across all three engines: NodeIterator with a JavaScript filter _function_ is a cliff — **32×** slower than TreeWalker with a filter parameter on Chrome (29,576 vs 946,711 ops/s), 13× on Firefox, ~20× on Safari[^22^]. The penalty is the per-node JS callback crossing the binding boundary, not the walker itself. Manual `nextSibling` traversal functions fare similarly against TreeWalker's native filter (~5.4×, Chrome 144, 2026)[^23^].

### 4.2 Why numbers differ across eras and browsers

#### 4.2.1 Engine evolution, fixture sensitivity, and the '.test'-with-dot bug

Two forces move published ratios. The first is genuine engine change: Blink's 2024 selector streamlining[^39^] and the 2026 unified querySelector() cache — "a unified querySelector() cache across the rendering engine to cut down on redundant DOM lookups"[^30^] — each compress repeat-query gaps. The second is fixture sensitivity: Aptekar-Cassels' 8.9× depends on a 100k-node DOM, while measurethat runs on toy fixtures show 1.4–2.7× for the same comparison[^3^][^5^][^6^][^8^]. And some published numbers are simply wrong. A widely circulated "~10×" gEBCN-vs-qSA console.time test (2023) passed `'.test'` — dot included — to `getElementsByClassName`, which silently returned an empty collection; the "winner" performed zero work[^29^]. The same thread popularized the claim that querySelector* is O(n) while getElement* is O(1)[^29^] — an oversimplification given engine ID/class caches, best treated as folklore pending controlled verification.

#### 4.2.2 Microbenchmark pitfalls catalog

| Pitfall                                    | Mechanism                                                                                                                              | Documented magnitude                                      | Source                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| Dead code elimination                      | JIT removes result-free loops; DOM calls are partly protected by the JS→C++ boundary, but identical-selector hoisting distorts instead | discarded results may vanish entirely                     | Egorov 2012[^33^]; mitata[^34^]       |
| Loop-invariant hoisting / selector caching | repeated `querySelector('#same')` hoisted or served from Blink's 2026 cache                                                            | inflates repeat-query suites                              | Chromium blog[^30^]                   |
| Warmup / JIT tiering                       | cold interpreter passes counted; Firebug historically disabled Firefox's JIT                                                           | interpreter-speed numbers reported as optimized           | Bynens 2010[^35^]; Benchmark.js[^36^] |
| Timer granularity                          | post-Spectre `performance.now()` reduction; Firefox rounds to 2 ms from FF59                                                           | sub-100 ns calls individually unmeasurable                | MDN via SO[^37^]                      |
| Layout thrashing contamination             | geometry reads interleaved with style writes force synchronous layout                                                                  | 1.5–2.3× speedup from batching alone (Chromium 147, 2026) | Stack Insight study[^38^]             |
| Live vs static collections                 | re-reading `.length` of a live HTMLCollection forces re-resolution                                                                     | ~4× penalty; 15.3M → 3.85M ops/s (Edge/Chrome 148)        | measurethat #28558[^16^]              |
| Selector-string bugs                       | `'.test'` with dot → empty collection; asymmetric query counts                                                                         | spurious "~10×"                                           | richardmyu[^29^]; SO #57159219[^15^]  |
| Setup / GC contamination                   | DOM construction or allocation inside the timed region; GC between samples                                                             | margin-of-error reporting required                        | Benchmark.js practice[^34^][^36^]     |

Egorov's standing advice — "In general I advise against microbenchmarking"[^33^] — applies with a DOM-specific twist: because query calls cross the binding boundary, classic DCE is rare, but hoisting and engine-side caching produce the identical distortion by a different door[^30^]. And any suite that touches styles or geometry between queries is measuring the renderer, not the selector engine; the Chromium-147 study's protocol (30 trials, discard 5 warmup, accept 25 at CV<15%, median) is a reasonable template[^38^].

### 4.3 Reconciling published numbers with our Chrome-150 measurements

Chapter 3's sandbox numbers sit at the extreme low end of every published range, and the gap is explicable rather than alarming. Our getElementById advantage over qS('#id') measured **1.18×**, against 4.3–6.4× in 2026-era community runs[^1^][^2^] and 8.9×/4.7× in the 2021 large-DOM study[^11^]. Two mechanisms close most of the distance. First, the 2026 Blink SelectorQuery rewrite and unified querySelector() cache explicitly target redundant DOM lookups[^30^]: community suites that re-query an identical selector string — the dominant pattern in measurethat loops — now hit cache, compressing the repeat-query gap that produced the 4–9× era. Our sandbox alternates selectors and controls for cache warmth, so 1.18× is the _cold-path_ residual: the true marginal cost of selector parsing and dispatch once caching is neutralized. Second, the 2024 Speedometer 3 selector streamlining[^39^] had already removed the pathological slow paths that made 2016–2018 Chrome show 29–51× on classes[^12^][^13^][^14^].

The same logic reconciles the class and tag results in the opposite direction. Our gEBCN-over-qSA('.c-target') ratio of **57×** at 20K nodes exceeds every post-2022 published figure (~4.5× on Chrome 100[^14^]) — because published suites use small fixtures where qSA's per-call overhead dominates, while at 20K nodes qSA's static-list construction cost scales and gEBCN's cached class index does not. The published 4.5× and our 57× are the same curve sampled at different DOM sizes. Likewise gEBTN-over-qSA('span') at **3,292×** is the large-fixture extreme of the trend in older suites[^5^][^17^].

For closest(), the inversion runs the other way. Both public suites show parity — 1.04× on Chrome 131 (2024)[^24^], parity on Chrome 109 (2023)[^25^] — but both walk shallow ancestors in tiny DOMs, where the while-loop's per-step JS overhead is negligible. Our **4.1×** closest() advantage was measured at realistic ancestor depths, where the manual loop pays a JS↔C++ boundary crossing per hop and closest() walks natively. Published parity and our 4.1× are both correct — for different depths. The general lesson of this chapter: published ratios are points on curves parameterized by DOM size, depth, cache warmth, and engine vintage. Quote them with their coordinates, or not at all.
