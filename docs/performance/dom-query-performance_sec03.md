## 3. Measured Results: Chrome 150 Sandbox

This chapter reports the original measurements of the investigation. Every number below was measured in this investigation's sandbox (Chrome 150.0.7871.181, Blink+V8, headless; median of 10 samples, two full suite runs × 5 repetitions of ≥300 ms each after 200 ms warmup; case order rotated per repetition; a global XOR sink guarded against dead-code elimination; `gc()` ran between suites; timed loops were read-only, no layout thrash). Fixtures were synthetic documents of 261 (small), 2,061 (medium), and 20,097 (large) actual nodes including injected targets, ~8 levels deep, div/span/input mix, classes `.a`/`.b`/`.c` round-robin, ids on ~1% of nodes, `data-x="1"` (plus class `.dx`) on 10%; a separate 500-deep div chain served the traversal cases. Tables report median ops/sec with CV (stdev/median across the 10 samples) and a rel column normalized to the fastest variant in the same table (1.00 = fastest). Two independent full runs agreed within ±10% on nearly all medians (worst ~13%). A handful of cases show elevated CV (10–18%) from occasional GC pauses inside 300 ms samples; medians were stable across runs. Absolute numbers are machine-specific; ratios are the signal.

Chapter 2 predicted three patterns: map-backed lookups flat in document size, tree-scan APIs degrading ~linearly, and a narrowed getElementById-vs-querySelector gap after the 2026 Blink SelectorQuery rewrite. Each section below confirms or refutes those predictions against the data. (Chapter 4 contrasts these numbers with historically published figures; no history is discussed here.)

### 3.1 Single-hit lookups: ID, class, tag

#### 3.1.1 getElementById vs querySelector('#id') vs querySelectorAll('#id'): 1.18×/2.3× spread, O(1) flat across 261→20,097 nodes

|                     variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| --------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
|            `getElementById` |       5.80M (2%) |        5.85M (4%) |       6.02M (2%) |      1.00 |       1.00 |      1.00 |
|    `querySelector(#target)` |       4.81M (1%) |        5.00M (2%) |       5.09M (2%) |      0.83 |       0.86 |      0.85 |
| `querySelectorAll(#target)` |       2.59M (4%) |        2.64M (5%) |       2.64M (8%) |      0.45 |       0.45 |      0.44 |

All three variants are flat within noise from 261 to 20,097 nodes — getElementById even drifts upward (5.80M → 6.02M ops/s, 1.04×), ruling out any residual tree walk. Its margin over `querySelector('#id')` is only 1.18× at the large fixture, far narrower than the multi-x gap library folklore assumes; both resolve through the same per-document id map, and the residual difference is selector-parsing and entry-point overhead, not lookup cost (see Chapter 2 for the map mechanics). This confirms the Chapter 2 prediction of a narrowed id gap post-Blink-rewrite. `querySelectorAll('#id')` is 2.3× slower at every size — a constant factor from static NodeList allocation — yet still O(1), so even the "bad" id path never degrades with document growth. CVs of 1–8% make the spread solidly significant.

#### 3.1.2 getElementsByClassName (O(1), 9.3M ops/s @20K) vs querySelectorAll('.c-target') (10× degradation, 57× slower @20K)

|                           variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| --------------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
| `getElementsByClassName(.length)` |       9.39M (2%) |       9.39M (17%) |       9.28M (5%) |      1.00 |       1.00 |      1.00 |
|       `getElementsByClassName[0]` |       4.80M (2%) |       4.91M (18%) |       4.83M (4%) |      0.51 |       0.52 |      0.52 |
|        `querySelector(.c-target)` |       3.98M (2%) |       3.66M (14%) |       3.52M (3%) |      0.42 |       0.39 |      0.38 |
|     `querySelectorAll(.c-target)` |       1.61M (2%) |        1.27M (4%) |      163.9K (7%) |      0.17 |       0.14 |      0.02 |

The table splits cleanly into cache-backed and scan-backed rows. getElementsByClassName holds at 9.3M ops/s at 20K nodes (0.99× vs small) — O(1) via Blink's tree-indexed class cache. Reading `[0]` instead of `.length` halves throughput (0.51–0.52 rel): indexed access forces element materialization rather than a cheap count, but stays flat. Single-hit `querySelector('.c-target')` is ~1.4× slower than `gEBCN[0]` and also roughly O(1) here (0.88× large/small), because Blink's document-level class cache locates a rare class without a full scan. The outlier is `querySelectorAll('.c-target')`: 1.61M → 163.9K ops/s, a 10× degradation small→large, ending 57× slower than getElementsByClassName at 20K nodes — building a static list forces a full tree walk. Elevated CVs (14–18%) at medium are GC noise; medians were stable across runs.

#### 3.1.3 getElementsByTagName vs querySelectorAll('span'): 38× / 273× / 3292× by size

|                      variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| ---------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
| `getElementsByTagName(span)` |      11.09M (7%) |       11.01M (9%) |      11.46M (4%) |      1.00 |       1.00 |      1.00 |
|     `querySelectorAll(span)` |      290.5K (2%) |        40.3K (4%) |        3.5K (6%) |      0.03 |       0.00 |      0.00 |

This is the widest gap measured in the investigation. getElementsByTagName('span') delivers ~11M ops/s at every fixture size (large/small 1.03×) — perfectly O(1), served from the tag-name index. `querySelectorAll('span')` pays a full tree scan plus static-list construction, so throughput collapses with node count: 290.5K → 40.3K → 3.5K ops/s. The margins are 38× at small, 273× at medium, and 3292× at large (computed from unrounded medians in results.json; the table's 3.5K is rounded). No selector-level optimization can close a gap of this shape: qSA must visit every node while gEBTN visits none. This is the strongest confirmation of the Chapter 2 scan-vs-map dichotomy, and why tag-name hot paths should never route through qSA regardless of expected document size.

### 3.2 Collection iteration and the caching multiplier

#### 3.2.1 Iteration: cached-length live loop fastest; 1.23× over uncached .length; 1.37× over static NodeList; 2.4× over NodeList.forEach

|                                    variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| -----------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|      `live HTMLCollection (cached length)` |        11.7K (2%) |        1.1K (2%) |       1.00 |      1.00 |
| `live HTMLCollection (c.length each iter)` |         9.4K (5%) |         873 (6%) |       0.80 |      0.82 |
|       `static NodeList (querySelectorAll)` |         8.3K (1%) |         780 (3%) |       0.71 |      0.73 |
|                  `static NodeList forEach` |         5.0K (3%) |         438 (6%) |       0.43 |      0.41 |

All four variants scale ~linearly downward with fixture size because iteration itself is O(n); the differentiator is constant factor. A classic `for` loop over a live HTMLCollection with the length hoisted into a local is fastest at both sizes. Re-reading `.length` per iteration costs 1.23×: on a live collection each access re-validates the cached snapshot, a real (if small) C++ round-trip per element. Iterating the static NodeList from querySelectorAll — qSA construction included in the timed region — is 1.37× slower, quantifying the list-building tax amortized over a single pass. `NodeList.forEach` trails at 2.4× behind the leader, callback invocation overhead dominating at ~2K–20K elements. CVs of 1–6% are among the tightest in the suite, so all three ratios are reliable. Rule: cache the collection _and_ its length; avoid forEach on hot paths.

#### 3.2.2 ×100 re-query: cached live collection = 6.1× over fresh gEBCN, ~13,700× over fresh qSA at large size

|                            variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ---------------------------------: | ----------------: | ---------------: | ---------: | --------: |
| `cache live collection x100 reads` |       415.6K (7%) |      420.6K (1%) |       1.00 |      1.00 |
|              `re-query gEBCN x100` |        68.2K (4%) |       68.9K (1%) |       0.16 |      0.16 |
|                `re-query qSA x100` |         431 (14%) |          31 (3%) |       0.00 |      0.00 |

The benchmark performs 100 accesses per timed unit, either by re-querying or by reading a collection cached once. Caching wins even though the HTMLCollection is "live": holding the reference costs 6.1× less than re-calling getElementsByClassName 100 times, proving that construction — not liveness maintenance — is the expense; liveness only charges when the DOM mutates, and these loops are read-only. Against re-running querySelectorAll 100 times the multiplier reaches 13,715× at the large fixture (420.6K vs 31 ops/s), each qSA re-executing a full O(n) scan. Note the flat medium→large profile of both gEBCN rows (68.2K → 68.9K, 415.6K → 420.6K) versus qSA's 431 → 31 collapse — the §3.1 map-vs-scan law amplified 100-fold. The 14% CV on medium qSA is GC noise on a near-floor measurement and does not affect the ordering.

### 3.3 Tree traversal: closest(), children, siblings

#### 3.3.1 closest() 4.1× over manual parentNode+classList loop, 3.7× over matches() loop; selector complexity irrelevant (0.99×)

|                            variant | chain-500 ops/s (CV) |  rel |
| ---------------------------------: | -------------------: | ---: |
|   `closest(.ancestor-at-depth-50)` |          793.3K (2%) | 1.00 |
|   `closest(.ancestor[data-x="1"])` |          788.1K (2%) | 0.99 |
|            `closest(div.ancestor)` |          492.1K (2%) | 0.62 |
|          `manual loop + matches()` |          211.7K (2%) | 0.27 |
| `manual loop + classList.contains` |          193.2K (2%) | 0.24 |

On a 500-deep div chain with the match 50 levels above the leaf, native `closest()` beats the hand-rolled `parentNode` loop by 4.1× when the manual loop guards with `classList.contains` and by 3.7× with `matches()`. The engine walks the same 50 ancestors in C++ with no JS↔C++ boundary crossing per step, while the manual versions pay a property access and a call per level (see Chapter 2 for the boundary-cost model). Selector complexity is nearly irrelevant: `closest('.ancestor[data-x="1"]')` runs at 0.99× of the plain class selector — the walk dominates, not the test. The one complexity effect is inverted: `closest('div.ancestor')` drops to 0.62× because the compound fails fast at intermediate divs lacking the class, changing early-out behavior. All CVs are 2%; the 4× ordering is unambiguous. Libraries still shipping manual ancestor loops should delete them.

#### 3.3.2 firstElementChild 2.1× over children[0], 3.7× over childNodes[0]; nextElementSibling 2.3× over nextSibling skip, ~2.2×/2.4× over TreeWalker/NodeIterator

|                             variant | unit ops/s (CV) |  rel |
| ----------------------------------: | --------------: | ---: |
|              `el.firstElementChild` |     15.74M (2%) | 1.00 |
| `manual firstElementChild polyfill` |     10.66M (2%) | 0.68 |
|                    `el.children[0]` |      7.33M (2%) | 0.47 |
|     `el.childNodes[0] (text node!)` |      4.26M (3%) | 0.27 |

|                                 variant | unit ops/s (CV) |  rel |
| --------------------------------------: | --------------: | ---: |
|              `nextElementSibling chain` |     252.5K (1%) | 1.00 |
|              `TreeWalker(SHOW_ELEMENT)` |     116.5K (4%) | 0.46 |
| `nextSibling chain (skip non-elements)` |     108.1K (3%) | 0.43 |
|            `NodeIterator(SHOW_ELEMENT)` |     105.7K (3%) | 0.42 |

Two unit fixtures back these ratios. For first-child access (text nodes deliberately present before the first element), `firstElementChild` at 15.74M ops/s beats `children[0]` by 2.1× — the latter constructs a full HTMLCollection to read one entry — and beats `childNodes[0]` by 3.7×; note `childNodes[0]` here returns the _text_ node and is not semantically equivalent, included only to price the trap. Even a manual firstChild/nextSibling polyfill (10.66M ops/s) beats `children[0]`. For walking 200 element siblings with interleaved text nodes, the `nextElementSibling` chain wins at 252.5K walks/s: 2.34× over a `nextSibling` chain with JS-side nodeType filtering, and ~2.2× over TreeWalker (116.5K) and 2.4× over NodeIterator (105.7K), whose iterator allocation dominates at this range. Element-only accessors keep filtering in C++; every JS-visible alternative pays per-step boundary or allocation costs.

#### 3.3.3 Delegation guard: tagName === > classList.contains (0.63×) > matches() (0.44×)

|                        variant | unit ops/s (CV) |  rel |
| -----------------------------: | --------------: | ---: |
|         `el.tagName === "DIV"` |     23.97M (3%) | 1.00 |
| `el.classList.contains("cls")` |     15.17M (3%) | 0.63 |
|           `el.matches(".cls")` |     10.46M (3%) | 0.44 |

Delegation guards run once per bubbled event, so their relative cost matters at high event rates. A plain `tagName ===` comparison is fastest at 23.97M ops/s: a cached-string identity check with no selector machinery. `classList.contains` runs at 0.63× of that, `matches('.cls')` at 0.44× — i.e. `matches()` is ~1.4× slower than `classList.contains` for a pure class guard, the price of parsing and evaluating a selector where a token-set lookup suffices. The best-to-worst spread is 2.3×, yet the honest caveat is that all three exceed 10M ops/s: guard choice matters only in genuinely hot dispatch loops, never as a correctness decision. CVs are a uniform 3%; the ordering tagName > classList.contains > matches() is stable and matches Chapter 2's cost model (string compare < token lookup < selector match).

### 3.4 Exotic paths: XPath, attribute selectors, named access

#### 3.4.1 XPath slowest: 26× over qSA, ~70,000× over class lookup @20K

|                                  variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ---------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
| `getElementsByClassName(dx) [equiv set]` |       11.47M (2%) |      11.31M (3%) |       1.00 |      1.00 |
|         `querySelectorAll([data-x="1"])` |        74.7K (2%) |        4.2K (6%) |       0.01 |      0.00 |
|    `document.evaluate(//*[@data-x="1"])` |         1.6K (3%) |         162 (3%) |       0.00 |      0.00 |

`document.evaluate('//*[@data-x="1"]')` is the slowest lookup measured in this investigation: 1.6K ops/s at medium, 162 at large — 26× slower than the equivalent `querySelectorAll('[data-x="1"]')` at large and 69,702× slower than getElementsByClassName on an equivalent class at 20K nodes. XPath in Blink combines an interpreted expression engine, its own result-set snapshot object, and zero index acceleration: every evaluation is a full O(n) walk with heavyweight per-node dispatch (see Chapter 2). Mirroring the attribute set with a class buys four to five orders of magnitude (11.31M vs 162 ops/s at large) — the single largest lever in this chapter when the markup is under the consumer's control. The XPath row degrades ~10× and the qSA('[data-x]') row ~18× medium→large, both consistent with the linear-scan law of §3.5.2.

#### 3.4.2 qSA('[data-x="1"]') 19×/12× over gEBTN('\*')+manual filter; getElementById 2.8× over window['id'], 8.8× over document.forms['name']

|                                   variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ----------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|          `querySelectorAll([data-x="1"])` |        75.5K (3%) |        4.6K (6%) |       1.00 |      1.00 |
| `getElementsByTagName(*) + manual filter` |         3.9K (3%) |         382 (2%) |       0.05 |      0.08 |

|                       variant | unit ops/s (CV) |  rel |
| ----------------------------: | --------------: | ---: |
|   `getElementById("namedId")` |      8.05M (2%) | 1.00 |
|           `window["namedId"]` |      2.89M (1%) | 0.36 |
| `document.forms["benchForm"]` |     912.2K (1%) | 0.11 |

The attribute-selector table refutes the old advice to "grab everything and filter in JS": `querySelectorAll('[data-x="1"]')` beats `getElementsByTagName('*')` plus a manual `getAttribute` filter by 19× at medium and 12× at large. Both are O(n) scans, but the manual variant materializes a live collection of every element and crosses the JS↔C++ boundary for each `getAttribute` call, while qSA evaluates the predicate inside the engine. The named-access table prices legacy shortcuts: getElementById (8.05M ops/s) beats `window['namedId']` named-property resolution by 2.8× and `document.forms['benchForm']` by 8.8× — the named paths route through the named getter on the Window/HTMLFormElement objects rather than the id map, and `document.forms` additionally constructs the forms collection. Both legacy paths are also spec-fragile; there is no performance excuse for them.

### 3.5 Selector complexity ladder and scaling behavior

#### 3.5.1 Ladder @20K: span 3.6K > .c 3.2K > [data-x] 3.1K > span.c 1.9K > div > span.c 1.8K > div span.c 1.5K > :nth-child(3) 1.0K ops/s

|         variant | large ops/s (CV) |  rel |
| --------------: | ---------------: | ---: |
|          `span` |        3.6K (3%) | 1.00 |
|            `.c` |        3.2K (9%) | 0.88 |
|      `[data-x]` |       3.1K (16%) | 0.85 |
|        `span.c` |       1.9K (18%) | 0.52 |
|  `div > span.c` |       1.8K (16%) | 0.50 |
|    `div span.c` |       1.5K (17%) | 0.42 |
| `:nth-child(3)` |        1.0K (6%) | 0.29 |

All seven selectors are full tree scans via querySelectorAll on the 20K-node fixture, so the ladder prices constant factors alone — the simplest-to-hardest spread is only 3.5×, nothing like the orders-of-magnitude gaps in §3.1. Simple selectors cluster tightly (3.1–3.6K ops/s); compounding (`span.c`) nearly halves throughput because each candidate element runs two tests; combinators cost a further 4–19% (`div > span.c` at 0.50, `div span.c` at 0.42 — the descendant variant's ancestor walk edges the child variant's single parent check in this 8-level tree); `:nth-child(3)` is worst at 0.29 rel, the structural pseudo-class forcing sibling-position evaluation per candidate. CVs of 16–18% on the compound rows are the suite's GC-noise caveat; medians held across both runs. Lesson: simplify selectors for constant-factor wins, but never expect selector tuning to fix an algorithmically wrong API choice.

#### 3.5.2 Scaling law: map-backed APIs flat (0.99–1.06×); tree-scan APIs degrade ~linearly (qSA span 83×)

|                           variant |  small | medium |  large | med/small | large/small |
| --------------------------------: | -----: | -----: | -----: | --------: | ----------: |
|                  `getElementById` |  5.80M |  5.85M |  6.02M |     1.01x |       1.04x |
|          `querySelector(#target)` |  4.81M |  5.00M |  5.09M |     1.04x |       1.06x |
|       `querySelectorAll(#target)` |  2.59M |  2.64M |  2.64M |     1.02x |       1.02x |
| `getElementsByClassName(.length)` |  9.39M |  9.39M |  9.28M |     1.00x |       0.99x |
|       `getElementsByClassName[0]` |  4.80M |  4.91M |  4.83M |     1.02x |       1.01x |
|        `querySelector(.c-target)` |  3.98M |  3.66M |  3.52M |     0.92x |       0.88x |
|     `querySelectorAll(.c-target)` |  1.61M |  1.27M | 163.9K |     0.79x |       0.10x |
|      `getElementsByTagName(span)` | 11.09M | 11.01M | 11.46M |     0.99x |       1.03x |
|          `querySelectorAll(span)` | 290.5K |  40.3K |   3.5K |     0.14x |       0.01x |

This is the chapter's central table: it sorts every lookup API by asymptotic behavior across 77× fixture growth (261 → 20,097 nodes). The map-backed group — getElementById, both getElementsByClassName variants, getElementsByTagName, and both id-selector querySelector forms — holds within 0.99–1.06×, flat inside noise: O(1) lookups served by Blink's per-document indexes and caches, confirming the Chapter 2 scaling prediction. The tree-scan group degrades with size: `querySelectorAll('span')` falls 83× small→large (0.01×, slightly exceeding the 77× node growth due to larger static-list allocation), `querySelectorAll('.c-target')` falls 10×, XPath (§3.4.1) ~10× medium→large — all ~linear. The only anomaly is `querySelector('.c-target')` at 0.88×: nominally cache-assisted, it drifts slightly, consistent with lower cache-hit probability as the tree grows. Corollary: any API whose throughput trends down with n is borrowing against document growth.

### 3.6 Counter-intuitive results: scoped querySelector slower than document-level (1.28×) — fixture-dependent class-cache effect

|                                 variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| --------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|  `document.querySelector(.deep-target)` |       3.56M (13%) |      3.45M (17%) |       1.00 |      1.00 |
| `scopeRoot.querySelector(.deep-target)` |       2.66M (18%) |       2.69M (7%) |       0.75 |      0.78 |

Conventional wisdom says "scope your queries to a subtree"; this investigation measured the opposite. `document.querySelector('.deep-target')` beat `scopeRoot.querySelector` by 1.28× at the large fixture (3.45M vs 2.69M ops/s). The mechanism is the document-level class cache: for a rare class, Blink resolves the document-wide query through the cache without walking the tree, whereas the scoped call must walk the subtree because element-level querySelector cannot use the document cache (see Chapter 2). Two caveats from the RESULTS data must be reproduced. First, the result is fixture-dependent: the scoped root sat near the top of the document and the target class was rare, so the cache hit decisively; with a common class or a deeper, smaller scope the outcome can differ — scoping only pays when document-level caches miss and the subtree is small. Second, CVs here are among the suite's highest (7–18%, GC pauses inside 300 ms samples), but both rows are flat medium→large and the 1.28× ordering held in both full runs. Treat scoping as a cache-miss optimization, not a universal one.
