# Verification Report: DOM Query Performance Reference Document

**Verifier:** independent adversarial check
**Ground truth:** `/mnt/agents/output/dom-bench/results.json` (raw medians/CVs), `RESULTS.md` (derived), research briefs dim02/dim03
**Method:** every quantitative claim in sec03 recomputed from `results.json` medians (Python); sec05/sec06 measured references checked identically; sec02 claims cross-checked against dim02; sec04 published numbers against dim03; cross-chapter consistency scan; run1-vs-run2 stability claim recomputed from `results_run1.json`/`results_run2.json`; fixture claims checked against `bench.html`.
**Tolerance:** flag any numeric discrepancy >5% relative, or any rounding that changes meaning.

## Verdicts per chapter

| Chapter                  | Verdict                                 | Notes                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sec02 (engine internals) | **PASS**                                | All spot-checked claims (256-entry FIFO cache, WebKit 512 random-eviction, CL 7900254, revert reason, TinyBloomFilter, NthIndexCache, r203439/bug 159960, ~70% Zbarsky, JIT ~2× 1100→<500 ms, quotes) match dim02 verbatim. Timeline table identical to dim02 §6. |
| sec03 (measured results) | **FAIL (1 numeric error + 1 rounding)** | ~120 numbers checked; all table values, CVs, rel columns, and ratios verified within tolerance EXCEPT the two items below.                                                                                                                                        |
| sec04 (historical)       | **FAIL (2 attribution errors)**         | All 14 table rows and prose figures (1.08×, 1.7×/2.7×, 8.9×/4.7×, 1.9×, 1.4×, 1.8×, 6.4/4.3/2.1×, 29×, 51×, 4.5×, 3.9×, 2.3×, 32/13/20×, 1.04× parity, 5.4×, 1.5–2.3×, ~4× 15.3M→3.85M, '.test' bug) match dim03. Two framing errors below.                       |
| sec05 (decision matrix)  | **FAIL (inherits sec03 rounding)**      | All ratios match sec03/raw data; repeats the "~2.2× NodeIterator" figure (2.39× actual).                                                                                                                                                                          |
| sec06 (playbook)         | **PASS**                                | All measured references (13,700×, 6.1×, 38/273/3292×, 57×, 1.18×, 1.28×, 4.1×, 0.63/0.44, 23.97M, 12–19×, ≤3.5×, 1.23×, 2.1×/2.3×, 26×, ~70,000×, 3,292×) match raw data. External claims (LWC ~2.5×, Sizzle LRU=50, lit #2725) are cited, not measurable here.   |

## Checked-claim table (sec03, recomputed from results.json)

| Claim                                                                                                    | Found (recomputed)                                                       | Verdict                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| gEBI 5.80M/5.85M/6.02M ops/s, CV 2/4/2%                                                                  | 5,800,667 / 5,845,833 / 6,018,167; CV .021/.043/.023                     | PASS                                       |
| gEBI vs qS('#id') 1.18× @large; rels 0.83/0.86/0.85                                                      | 1.183; .830/.856/.846                                                    | PASS                                       |
| qSA('#id') "2.3× slower at every size"; rels 0.45/0.45/0.44                                              | 2.24/2.21/2.28 (within 5%); .446/.452/.438                               | PASS (borderline: small/med round to 2.2×) |
| gEBI large/small 1.04×                                                                                   | 1.037                                                                    | PASS                                       |
| gEBCN 9.39M/9.39M/9.28M, CV 2/17/5%; 0.99× vs small; 9.3M @20K                                           | 9,390,333/9,386,500/9,284,583; .024/.166/.054; 0.989                     | PASS                                       |
| gEBCN[0] 0.51/0.52/0.52                                                                                  | .511/.523/.520                                                           | PASS                                       |
| qS('.c-target') ~1.4× slower than gEBCN[0]; 0.88× large/small                                            | 1.37× @large; 0.884                                                      | PASS                                       |
| qSA('.c-target') 1.61M→163.9K, 10× degradation, 57× slower @20K                                          | 9.80×; 56.7×                                                             | PASS                                       |
| gEBTN vs qSA('span') 38×/273×/3292×; ~11M flat, 1.03×                                                    | 38.17/272.9/3292.2; 1.033                                                | PASS                                       |
| Iteration: 1.23×/1.37×/2.4×; table ops/s & rels                                                          | large: 1.225/1.370/2.444; medium: 1.252/1.415/2.342; rels & values exact | PASS                                       |
| ×100 re-query: 6.1× over gEBCN; 13,715×/~13,700× over qSA @large; flat gEBCN rows                        | 6.10; 13,714.8; 68.2K→68.9K, 415.6K→420.6K                               | PASS                                       |
| closest() 4.1× (classList) / 3.7× (matches); rels 1.00/0.99/0.62/0.27/0.24                               | 4.106/3.747; .993/.620/.267/.244                                         | PASS                                       |
| firstElementChild 2.1× over children[0], 3.7× over childNodes[0]; 15.74M/10.66M/7.33M/4.26M              | 2.147/3.691; values exact                                                | PASS                                       |
| nextElementSibling 2.34× over nextSibling-skip                                                           | 2.336                                                                    | PASS                                       |
| "~2.2× over both TreeWalker and NodeIterator"                                                            | TreeWalker 2.17× OK; **NodeIterator 2.39× (8.6% off)**                   | **FAIL (rounding changes value)**          |
| Guard ladder 23.97M/15.17M/10.46M; 0.63/0.44; ~1.4×; spread 2.3×                                         | .633/.437; 1.45; 2.29                                                    | PASS                                       |
| XPath 26× under qSA; 69,702×/~70,000× under gEBCN; 1.6K/162                                              | 26.18; 69,702.4 (exact); 1,595/162                                       | PASS                                       |
| §3.4.1 "Both scan-based rows also degrade ~10× medium→large"                                             | XPath 9.83× OK; **qSA('[data-x]') 17.6× (74,688→4,247)**                 | **FAIL**                                   |
| qSA('[data-x="1"]') 19×/12× over gEBTN('\*')+filter                                                      | 19.34/11.96                                                              | PASS                                       |
| gEBI 2.8× over window['id'], 8.8× over document.forms; 8.05M/2.89M/912.2K                                | 2.784/8.824; values exact                                                | PASS                                       |
| Ladder: 3.6K/3.2K/3.1K/1.9K/1.8K/1.5K/1.0K; rels .88/.85/.52/.50/.42/.29; spread 3.5×; combinators 4–19% | all exact; 3.488; 4.0%/19.0%                                             | PASS                                       |
| Scaling: map-backed 0.99–1.06×; qSA('span') 83×; 77× growth                                              | range 0.989–1.057; 83.5; 77.0                                            | PASS                                       |
| Scoped qS: document 1.28× faster @large; rels 0.75/0.78; flat                                            | 1.283; .748/.779                                                         | PASS                                       |
| "Two runs agreed ±10%, worst ~13%"                                                                       | worst 12.4% (2/60 cells >10%)                                            | PASS                                       |
| Fixture facts (261/2,061/20,097 nodes, ~1% ids, 10% data-x, ~8 levels, 500-chain, match 50 up)           | match meta + bench.html                                                  | PASS                                       |

## sec04 attribution checks (vs dim03)

| Claim                                            | Verdict                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| All ratio table rows (§4.1) and prose figures    | PASS — match dim03 items #1–#29 exactly, ratios re-derived from cited ops/s pairs (29.16, 51.05, 4.45, 3.75, 2.27, 32.01, 5.36)              |
| §4.3 "made Chrome 68–100 show 29–51× on classes" | **FAIL** — the 29× figure is ~2016 jsperf-era (pre-Chrome 68); Chrome 100 showed 4.5×. Era misattributed.                                    |
| §4.1.2 heading "51× → 4.5× → 2–3×"               | **FAIL** — no 2–3× class-gap figure exists in dim03 (modern figures are 4.5× [2022] and dim03's "~4–6× on Chrome 146+"); unsupported number. |

## Cross-chapter consistency

- 1.28× scoped-qS, 1.18× gEBI-vs-qS, 57×, 3,292×/3292×, 13,700×/13,715×, 6.1×, 19×/12×, 26×, ~70,000×, 4.1×/3.7×, 2.1×/3.7×, 0.63/0.44, 3.5×, 83×, 0.99–1.06×: **consistent everywhere**. ✓
- sec05 §5.1.1 "the 4–9× of the 2021–2026 published record" is cherry-picked (the 2021–2026 record also contains 1.4×/1.8×/1.9×/2.1×) but matches its two footnotes ([^11^]=8.9/4.7, [^2^]=6.4). Acceptable; noted.
- Wording: sec03 ¶1 and sec06 §6.2.1 say "2026 Blink **id-map** rewrite"; the rewrite (CL 7900254) was to **SelectorQuery**, not the id map (TreeOrderedMap unchanged). sec04 correctly says "SelectorQuery rewrite". Terminology fix recommended.

## REQUIRED FIXES

1. **sec03.md §3.4.1** — wrong string: `Both scan-based rows also degrade ~10× medium→large` → correct: `The XPath row degrades ~10× medium→large (the qSA row ~18×)`. (qSA: 74,688→4,247 ops/s = 17.6×.)
2. **sec03.md §3.3.2** (also sec05.md §5.1.2 and master-table row 5) — wrong string: `~2.2× over both TreeWalker (116.5K) and NodeIterator (105.7K)` → correct: `~2.2× over TreeWalker and ~2.4× over NodeIterator` (252,499/116,461 = 2.17; 252,499/105,697 = 2.39).
3. **sec04.md §4.3** — wrong string: `made Chrome 68–100 show 29–51× on classes` → correct: `made 2016–2018 Chrome show 29–51× on classes` (29× is ~2016 jsperf; Chrome 100 showed 4.5×).
4. **sec04.md §4.1.2 heading** — wrong string: `51× → 4.5× → 2–3×` → correct: `51× → 4.5×` (no published 2–3× class figure in the research corpus).
5. **(minor, recommended)** sec03.md ¶1 & sec06.md §6.2.1: `2026 Blink id-map rewrite` → `2026 Blink SelectorQuery rewrite`.

## Unverified scope

- Footnote targets/URLs (footnote definitions live outside the chapter files); external library claims in sec06 (LWC ~2.5×, Sizzle cacheLength=50, lit #2725) verified only as attributed citations, not against library sources.
- Absolute ops/s reproducibility (machine-specific by design); verification was ratio/table-internal against results.json.
