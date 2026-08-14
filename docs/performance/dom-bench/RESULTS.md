# DOM Element Querying Microbenchmark Results

- **Browser/engine**: Chrome/150.0.7871.181 (Blink + V8), headless, Linux x86_64
- **UA**: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36`
- **Harness**: in-page; warmup 200ms per benchmark, then samples of >= 300ms each; case order rotated per repetition; results are medians over **10 samples** (2 full suite runs x 5 reps). DCE guarded via a global XOR sink fed with nodeType/name data; Chromium launched with `--js-flags=--expose-gc`, `gc()` between suites; no DOM writes inside timed loops (read-only workloads, no layout thrash).
- **Fixtures** (actual node counts incl. injected targets): small = 261, medium = 2061, large = 20097 nodes; ~8 levels deep, div/span/input mix, classes .a/.b/.c round-robin, ids on ~1% of nodes, `data-x="1"` (+ class .dx) on 10% of nodes. Chain fixture: 500 nested divs, match target 50 levels above the leaf.
- **ops/s** = median ops/sec. **CV** = stdev/median across the 10 samples (lower = more stable). **rel** = speed relative to the fastest variant in the same table (1.00 = fastest).

## Case 1: ID lookup — getElementById vs querySelector(#id) vs querySelectorAll(#id)

|                     variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| --------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
|            `getElementById` |       5.80M (2%) |        5.85M (4%) |       6.02M (2%) |      1.00 |       1.00 |      1.00 |
|    `querySelector(#target)` |       4.81M (1%) |        5.00M (2%) |       5.09M (2%) |      0.83 |       0.86 |      0.85 |
| `querySelectorAll(#target)` |       2.59M (4%) |        2.64M (5%) |       2.64M (8%) |      0.45 |       0.45 |      0.44 |

## Case 2: Class lookup — getElementsByClassName vs querySelector(.class) vs querySelectorAll(.class)

|                           variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| --------------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
|       `getElementsByClassName[0]` |       4.80M (2%) |       4.91M (18%) |       4.83M (4%) |      0.51 |       0.52 |      0.52 |
| `getElementsByClassName(.length)` |       9.39M (2%) |       9.39M (17%) |       9.28M (5%) |      1.00 |       1.00 |      1.00 |
|        `querySelector(.c-target)` |       3.98M (2%) |       3.66M (14%) |       3.52M (3%) |      0.42 |       0.39 |      0.38 |
|     `querySelectorAll(.c-target)` |       1.61M (2%) |        1.27M (4%) |      163.9K (7%) |      0.17 |       0.14 |      0.02 |

## Case 3: Tag lookup — getElementsByTagName vs querySelectorAll(tag)

|                      variant | small ops/s (CV) | medium ops/s (CV) | large ops/s (CV) | rel small | rel medium | rel large |
| ---------------------------: | ---------------: | ----------------: | ---------------: | --------: | ---------: | --------: |
| `getElementsByTagName(span)` |      11.09M (7%) |       11.01M (9%) |      11.46M (4%) |      1.00 |       1.00 |      1.00 |
|     `querySelectorAll(span)` |      290.5K (2%) |        40.3K (4%) |        3.5K (6%) |      0.03 |       0.00 |      0.00 |

## Case 4: Iterating live HTMLCollection vs static NodeList (full scan, nodeType read per element)

|                                    variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| -----------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
| `live HTMLCollection (c.length each iter)` |         9.4K (5%) |         873 (6%) |       0.80 |      0.82 |
|      `live HTMLCollection (cached length)` |        11.7K (2%) |        1.1K (2%) |       1.00 |      1.00 |
|       `static NodeList (querySelectorAll)` |         8.3K (1%) |         780 (3%) |       0.71 |      0.73 |
|                  `static NodeList forEach` |         5.0K (3%) |         438 (6%) |       0.43 |      0.41 |

## Case 5: Re-query x100 vs caching live collection (live-collection caching benefit)

|                            variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ---------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|              `re-query gEBCN x100` |        68.2K (4%) |       68.9K (1%) |       0.16 |      0.16 |
| `cache live collection x100 reads` |       415.6K (7%) |      420.6K (1%) |       1.00 |      1.00 |
|                `re-query qSA x100` |         431 (14%) |          31 (3%) |       0.00 |      0.00 |

## Case 6: Subtree scoping — root.querySelector vs document.querySelector

|                                 variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| --------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
| `scopeRoot.querySelector(.deep-target)` |       2.66M (18%) |       2.69M (7%) |       0.75 |      0.78 |
|  `document.querySelector(.deep-target)` |       3.56M (13%) |      3.45M (17%) |       1.00 |      1.00 |

## Case 7: closest() vs manual parent traversal (leaf 500 divs deep, match 50 levels up)

|                            variant | chain-500 ops/s (CV) |  rel |
| ---------------------------------: | -------------------: | ---: |
|   `closest(.ancestor-at-depth-50)` |          793.3K (2%) | 1.00 |
| `manual loop + classList.contains` |          193.2K (2%) | 0.24 |
|          `manual loop + matches()` |          211.7K (2%) | 0.27 |
|            `closest(div.ancestor)` |          492.1K (2%) | 0.62 |
|   `closest(.ancestor[data-x="1"])` |          788.1K (2%) | 0.99 |

## Case 8: First-child access (text nodes present before first element)

|                             variant | unit ops/s (CV) |  rel |
| ----------------------------------: | --------------: | ---: |
|                    `el.children[0]` |      7.33M (2%) | 0.47 |
|              `el.firstElementChild` |     15.74M (2%) | 1.00 |
|     `el.childNodes[0] (text node!)` |      4.26M (3%) | 0.27 |
| `manual firstElementChild polyfill` |     10.66M (2%) | 0.68 |

## Case 9: Sibling walking over 200 element siblings (text nodes interleaved)

|                                 variant | unit ops/s (CV) |  rel |
| --------------------------------------: | --------------: | ---: |
|              `nextElementSibling chain` |     252.5K (1%) | 1.00 |
| `nextSibling chain (skip non-elements)` |     108.1K (3%) | 0.43 |
|              `TreeWalker(SHOW_ELEMENT)` |     116.5K (4%) | 0.46 |
|            `NodeIterator(SHOW_ELEMENT)` |     105.7K (3%) | 0.42 |

## Case 10: matches() vs classList.contains vs tagName (delegation hot-path guard)

|                        variant | unit ops/s (CV) |  rel |
| -----------------------------: | --------------: | ---: |
|           `el.matches(".cls")` |     10.46M (3%) | 0.44 |
| `el.classList.contains("cls")` |     15.17M (3%) | 0.63 |
|         `el.tagName === "DIV"` |     23.97M (3%) | 1.00 |

## Case 11: Attribute selector vs getElementsByTagName(\*) + manual filter

|                                   variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ----------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|          `querySelectorAll([data-x="1"])` |        75.5K (3%) |        4.6K (6%) |       1.00 |      1.00 |
| `getElementsByTagName(*) + manual filter` |         3.9K (3%) |         382 (2%) |       0.05 |      0.08 |

## Case 12: XPath document.evaluate vs querySelectorAll vs getElementsByClassName

|                                  variant | medium ops/s (CV) | large ops/s (CV) | rel medium | rel large |
| ---------------------------------------: | ----------------: | ---------------: | ---------: | --------: |
|    `document.evaluate(//*[@data-x="1"])` |         1.6K (3%) |         162 (3%) |       0.00 |      0.00 |
|         `querySelectorAll([data-x="1"])` |        74.7K (2%) |        4.2K (6%) |       0.01 |      0.00 |
| `getElementsByClassName(dx) [equiv set]` |       11.47M (2%) |      11.31M (3%) |       1.00 |      1.00 |

## Case 13: Named access — window[id] / document.forms[name] vs getElementById

|                       variant | unit ops/s (CV) |  rel |
| ----------------------------: | --------------: | ---: |
|           `window["namedId"]` |      2.89M (1%) | 0.36 |
| `document.forms["benchForm"]` |     912.2K (1%) | 0.11 |
|   `getElementById("namedId")` |      8.05M (2%) | 1.00 |

## Case 15: Selector complexity ladder (querySelectorAll, large fixture)

|         variant | large ops/s (CV) |  rel |
| --------------: | ---------------: | ---: |
|          `span` |        3.6K (3%) | 1.00 |
|            `.c` |        3.2K (9%) | 0.88 |
|        `span.c` |       1.9K (18%) | 0.52 |
|      `[data-x]` |       3.1K (16%) | 0.85 |
|  `div > span.c` |       1.8K (16%) | 0.50 |
|    `div span.c` |       1.5K (17%) | 0.42 |
| `:nth-child(3)` |        1.0K (6%) | 0.29 |

## Case 14: Scaling check — cases 1 & 2 across fixture sizes (ops/s; ratio vs small)

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

## Key findings

All ratios use median ops/sec from the tables above.

1. **ID lookup**: `getElementById` wins but only by **1.18x** over `querySelector('#id')` in Blink — both hit the same id map and are **flat (O(1))** across 261 -> 20,097 nodes (5.80M vs 6.02M ops/s). `querySelectorAll('#id')` is **2.3x slower** (static-list allocation) but still O(1).
2. **Class lookup**: `getElementsByClassName` (live, tree-indexed) is O(1) regardless of DOM size (9.28M ops/s at 20K nodes). Single-hit `querySelector('.c-target')` is ~1.4x slower than `gEBCN[0]` and also roughly O(1) here (Blink class cache). `querySelectorAll('.c-target')` **degrades with size**: 1.61M -> 163.9K ops/s (**10x slowdown** small->large), ending ~57x slower than `getElementsByClassName` at 20K nodes.
3. **Tag lookup**: `getElementsByTagName('span')` is O(1) (~11M ops/s at all sizes) and beats `querySelectorAll('span')` by **38x (small), 273x (medium), 3292x (large)** — qSA pays a full tree scan + static-list build.
4. **Collection iteration** (full scan, nodeType read): cached-length live-HTMLCollection loop is fastest (1.1K ops/s @large) — ~1.23x faster than re-reading `.length` per iteration, ~1.37x faster than iterating the static NodeList (qSA construction included), and ~2.4x faster than `NodeList.forEach` (callback overhead).
5. **Repeated access (x100)**: caching the live collection once is **6.1x faster** than re-calling `getElementsByClassName` 100x and **13715x faster** than re-running `querySelectorAll` 100x at large size. (Live-collection caching wins even though the collection is "live" — construction, not liveness, is the cost.)
6. **Subtree scoping**: `document.querySelector` **beat** `scopeRoot.querySelector` (3.45M vs 2.69M ops/s at large, **1.28x**). The document-level class cache locates a rare class faster than walking a subtree, and the scoped variant did not degrade with document size either (flat medium vs large). Scoping only pays when document-level caches miss and the subtree is small.
7. **closest()**: native `closest('.ancestor-at-depth-50')` is **4.1x faster** than a hand-written parentNode loop with `classList.contains` and **3.7x faster** than a manual loop using `matches()` (match 50 levels above the leaf). Selector complexity mattered little: `closest('div.ancestor')` = 492.1K ops/s vs 788.1K for `closest('.ancestor[data-x="1"]')` (both resolve at the same depth-50 ancestor).
8. **Child access**: `firstElementChild` wins (15.74M ops/s) — **2.1x faster** than `children[0]` (HTMLCollection construction) and **3.7x faster** than `childNodes[0]` (which here also returns the _text_ node, not the first element). A manual firstChild/nextSibling polyfill (10.66M ops/s) also beats `children[0]`.
9. **Sibling walking** (200 element siblings, text nodes interleaved): `nextElementSibling` chain wins at 252.5K walks/s — **2.34x faster** than `nextSibling` + nodeType filtering and **~2.2x faster** than TreeWalker/NodeIterator (iterator allocation dominates at this range).
10. **matches() vs classList vs tagName**: `tagName === 'DIV'` fastest (23.97M ops/s); `classList.contains` at 0.63x of that; `matches('.cls')` at 0.44x — i.e. `matches()` is ~1.4x slower than `classList.contains` for a pure class guard, though all exceed 10M ops/s.
11. **Attribute selector**: `querySelectorAll('[data-x="1"]')` beats `getElementsByTagName('*')` + manual `getAttribute` filter by **19x (medium)** and **12x (large)** — both are O(n) scans, but the manual JS filter loses badly.
12. **XPath**: `document.evaluate('//*[@data-x="1"]')` is the slowest lookup measured — **26x slower than the equivalent querySelectorAll** and ~69702x slower than getElementsByClassName on an equivalent class at large size. Mirroring the attribute set with a class buys ~4-5 orders of magnitude (11.31M vs 162 ops/s at large).
13. **Named access**: `getElementById` (8.05M ops/s) beats `window['namedId']` named-property resolution by **2.8x** and `document.forms['name']` by **8.8x**.
14. **Scaling summary**: map-backed lookups (`getElementById`, `getElementsByClassName`, `getElementsByTagName`, single-hit `querySelector`) are flat within noise from 261 to 20,097 nodes; tree-scan APIs scale ~linearly downward — qSA('span') 83x slower, qSA('.c-target') 10x slower, XPath 10x slower from small/medium to large.
15. **Selector ladder** (querySelectorAll, 20K nodes, ops/s): `span` 3.6K > `.c` 3.2K > `[data-x]` 3.1K > `span.c` 1.9K > `div > span.c` 1.8K > `div span.c` 1.5K > `:nth-child(3)` 1.0K. Simplest-to-hardest spread is 3.5x; all are full tree scans, so constant factors dominate.

## Stability notes & caveats

- Two independent full suite runs agreed within ±10% on nearly all medians (worst ~13%). Reported numbers merge both runs (10 samples per measurement).
- A handful of cases show elevated CV (10-18%): case 15 complex selectors, case 6, case 2 medium — caused by occasional GC pauses inside 300ms samples; medians were nevertheless stable across runs. Min/max in results.json reflect those pauses.
- Case 8 `childNodes[0]` intentionally returns a text node (fixture has a leading text node); it is not semantically equivalent to the other variants.
- Case 6 result is fixture-dependent: the scoped root sat near the top of the document and the document-level class cache found the rare class quickly. With a common class or a deeper scope the outcome can differ.
- Nothing was dropped; all 15 cases ran. `document.all` was not benchmarked (only named access variants from case 13).
- Headless Chromium (new headless, `--disable-gpu`) on shared CI-like hardware; absolute numbers are machine-specific, ratios are the signal.
