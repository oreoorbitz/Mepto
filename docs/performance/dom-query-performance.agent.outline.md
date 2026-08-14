# The Definitive Reference: DOM Element Querying Performance in Frontend JavaScript

Audience: authors of high-performance JS libraries. Goal: raw throughput, not readability. Every
recommendation backed by engine-source evidence and/or measured data from the accompanying sandbox
(`/mnt/agents/output/dom-bench/`, Chrome 150 / Blink / V8) or published cross-browser numbers.

## 1. The Mental Model: Where the Time Actually Goes (~1500 words, 2 tables)

Sources: /mnt/agents/output/research/domquery_dim01_api_semantics.md

### 1.1 The complete API inventory (24 APIs)

#### 1.1.1 Full inventory table: API | return type | live/static | scope | shadow-aware | O-class

#### 1.1.2 The four cost layers of every DOM query: WebIDL binding crossing, string atomization/selector parse, tree traversal strategy, result allocation (wrapper/NodeList)

### 1.2 Live vs static collections — the single most consequential semantic

#### 1.2.1 getElementsByClassName/TagName/Name and childNodes are live; querySelectorAll is the only static NodeList; spec quotes

#### 1.2.2 Live collection economics: cheap creation, invalidation-on-mutation, re-read cost; the `for(i<live.length)` mutation traps (infinite loop, skipped elements)

#### 1.2.3 When live wins: [0]/length-only access, held references, repeated queries (engine-side cache)

### 1.3 Selector cost ladder and matching direction

#### 1.3.1 Right-to-left matching per Selectors 4; every descendant is a candidate; key compound filters

#### 1.3.2 Cost ladder: #id < .class ≈ tag < [attr] < substring attrs < structural pseudos < :has() < \*; combinators + < > < ~ < descendant

#### 1.3.3 `#a .b` is never faster than `.b` — ancestor verification without candidate reduction; only calling qSA on #a's element shrinks candidates

### 1.4 Traversal semantics: closest(), matches(), sibling/child accessors

#### 1.4.1 closest() self-inclusive upward walk, throws on invalid selectors, stops at shadow boundary

#### 1.4.2 children vs childNodes vs firstElementChild/nextElementSibling semantics; text-node pollution

#### 1.4.3 TreeWalker vs NodeIterator mutation semantics (pre-remove adjustment vs none)

### 1.5 Shadow DOM: the hard boundary

#### 1.5.1 No document-level query pierces shadow trees; getElementById on DocumentOrShadowRoot mixin; recursive shadowRoot walk cost

#### 1.5.2 Event retargeting, composedPath(), activeElement/elementFromPoint host retargeting

## 2. Engine Internals: Why the Winners Win (~1800 words, 2 tables, code excerpts)

Sources: /mnt/agents/output/research/domquery_dim02_engine_internals.md

### 2.1 Blink (Chrome/Edge): maps, caches, and the 2026 SelectorQuery rewrite

#### 2.1.1 getElementById = O(1): TreeOrderedMap hash map keyed by AtomicString, maintained incrementally

#### 2.1.2 getElementsByClassName/TagName: cached live collections in NodeListsNodeData; LiveNodeListRegistry invalidation bitmask

#### 2.1.3 SelectorQueryCache (256 parsed selectors) + 2026 rewritten SelectorQuery (CL 7900254): rightmost-first state machine, ID-accelerated search, TinyBloomFilter subtree skipping, NthIndexCache

### 2.2 WebKit (Safari): the selector JIT

#### 2.2.1 Hand-written fast paths for single .class/tag/[attr=x]/#id; ID fast path for any selector containing an ID

#### 2.2.2 SelectorCompiler JIT-compiles selectors to machine code; 512-entry cache; whole-selector fallback on unsupported pseudo

### 2.3 Gecko (Firefox): IdentifierMapEntry + right-to-left rationale (~70% rejected on rightmost compound)

### 2.4 V8 / WebIDL binding layer: the cost you can never inline away

#### 2.4.1 Anatomy of a JS→DOM call: binding callback, argument atomization, C++ work, wrapper + NodeList allocation

#### 2.4.2 Why cached JS references win: hidden-class inline cache = 1–2 instructions vs full boundary crossing

### 2.5 The machine-level mental model

#### 2.5.1 Hash probe ≈ 1–2 cache misses; tree walk = pointer-chasing, cache-miss-per-hop; bloom filters kill subtrees before walking

#### 2.5.2 Notable commits/bugs timeline (SelectorQueryCache, WebKit JIT 2014, Blink 2026 rewrite, unified querySelector cache 2026)

## 3. Measured Results: Chrome 150 Sandbox (~1800 words, 6 tables)

Sources: /mnt/agents/output/dom-bench/RESULTS.md, /mnt/agents/output/dom-bench/results.json (numbers MUST be copied exactly)

### 3.1 Single-hit lookups: ID, class, tag

#### 3.1.1 getElementById vs querySelector('#id') vs querySelectorAll('#id'): 1.18×/2.3× spread, O(1) flat across 261→20,097 nodes

#### 3.1.2 getElementsByClassName (O(1), 9.3M ops/s @20K) vs querySelectorAll('.c-target') (10× degradation, 57× slower @20K)

#### 3.1.3 getElementsByTagName vs querySelectorAll('span'): 38× / 273× / 3292× by size

### 3.2 Collection iteration and the caching multiplier

#### 3.2.1 Iteration: cached-length live loop fastest; 1.23× over uncached .length; 1.37× over static NodeList; 2.4× over NodeList.forEach

#### 3.2.2 ×100 re-query: cached live collection = 6.1× over fresh gEBCN, ~13,700× over fresh qSA at large size

### 3.3 Tree traversal: closest(), children, siblings

#### 3.3.1 closest() 4.1× over manual parentNode+classList loop, 3.7× over matches() loop; selector complexity irrelevant (0.99×)

#### 3.3.2 firstElementChild 2.1× over children[0], 3.7× over childNodes[0]; nextElementSibling 2.3× over nextSibling skip, ~2.2× over TreeWalker/NodeIterator

#### 3.3.3 Delegation guard: tagName === > classList.contains (0.63×) > matches() (0.44×)

### 3.4 Exotic paths: XPath, attribute selectors, named access

#### 3.4.1 XPath slowest: 26× over qSA, ~70,000× over class lookup @20K

#### 3.4.2 qSA('[data-x="1"]') 19×/12× over gEBTN('\*')+manual filter; getElementById 2.8× over window['id'], 8.8× over document.forms['name']

### 3.5 Selector complexity ladder and scaling behavior

#### 3.5.1 Ladder @20K: span 3.6K > .c 3.2K > [data-x] 3.1K > span.c 1.9K > div > span.c 1.8K > div span.c 1.5K > :nth-child(3) 1.0K ops/s

#### 3.5.2 Scaling law: map-backed APIs flat (0.99–1.06×); tree-scan APIs degrade ~linearly (qSA span 83×)

### 3.6 Counter-intuitive results: scoped querySelector slower than document-level (1.28×) — fixture-dependent class-cache effect

## 4. Historical & Cross-Browser Evidence (~1200 words, 2 tables)

Sources: /mnt/agents/output/research/domquery_dim03_benchmark_evidence.md

### 4.1 Published ratios over time

#### 4.1.1 getElementById vs qS('#id'): folklore 10–100× vs measured 1.1×–9×; Wesley Aptekar-Cassels 2021: FF 8.9×, Chromium 4.7×

#### 4.1.2 Class lookup gap collapse: 51× (Chrome 68, 2018) → 4.5× (Chrome 100) → 2–3× today; engines closed the gap

#### 4.1.3 Contradictory TreeWalker results (2.3× either way); NodeIterator JS-callback cliff (~32×)

### 4.2 Why numbers differ across eras and browsers

#### 4.2.1 Engine evolution (Blink caches, WebKit JIT) vs fixture sensitivity; the '.test'-with-dot bug behind a viral "~10×" claim

#### 4.2.2 Microbenchmark pitfalls catalog: DCE, loop hoisting, post-Spectre performance.now() precision (FF 2ms), layout thrashing contamination (1.5–2.3×)

### 4.3 Reconciling published numbers with our Chrome-150 measurements (gaps explained by 2026 Blink rewrite)

## 5. Decision Matrix: Which API for Which Situation (~1500 words, 1 master table)

Sources: outputs of chapters 1–4 (passed as context), dim01/dim02 briefs

### 5.1 By target knowledge: you know the ID / class / tag / structure / nothing

#### 5.1.1 Known ID → getElementById (document or shadow root); known class/tag at scale → getElementsBy\*

#### 5.1.2 Known structure → direct property walk (firstElementChild/nextElementSibling) beats any query

#### 5.1.3 Complex relational criteria → querySelector with simple key compound; attribute presence → qSA('[attr]') never '\*'+filter

### 5.2 By access pattern: one-shot vs repeated vs iteration

#### 5.2.1 One-shot single hit → qS over qSA[0]; repeated → cache reference or live collection (6.1×/13,700×)

#### 5.2.2 Iterate-then-mutate → snapshot live collection first; read-only hot loops → cached-length live loop

### 5.3 By DOM size and mutation rate

#### 5.3.1 Small DOM (<1K nodes): everything fast enough except XPath; large DOM: only map-backed APIs stay flat

#### 5.3.2 High mutation rate: live collections thrash invalidation — prefer static qSA or cached arrays

### 5.4 The master decision table (situation → API → measured ratio → engine reason)

## 6. The Library-Author Playbook (~1800 words, 2 tables, code snippets)

Sources: /mnt/agents/output/research/domquery_dim04_library_practices.md + chapter 3/5 outputs

### 6.1 Rule zero: the fastest query is the one never run

#### 6.1.1 Framework pattern: hold references from construction (React stateNode, Vue setRef, Svelte/Solid closure vars); Lit @query cache:true and its #2725 bug

#### 6.1.2 Caching pattern catalog: WeakMap<Element,State>, expandos, id-maps (Turbo/idiomorph qSA('[id]') → getElementById), populate-once ref maps (Alpine \_x_refs, LWC — measured O(1), ~2.5× over qS)

### 6.2 When you must query: route like Sizzle

#### 6.2.1 rquickExpr fast paths: '#id'→gEBI, 'tag'→gEBTN, '.class'→gEBCN, then qSA; rightmost-token seeding; bounded LRU for compiled selectors

#### 6.2.2 Scoping tricks: Andrew Dupont id-prefix/:scope hack for element-rooted qSA; subtree root narrowing (when it helps vs 3.6 caveat)

### 6.3 Event delegation: matches() vs closest() vs manual loop

#### 6.3.1 jQuery delegate model: walk target up with matchesSelector per level + memoized matchedSelectors; measured guard ladder (tagName > classList > matches)

#### 6.3.2 htmx closest()/matches() with manual-loop fallback; Stimulus MutationObserver Multimap (zero per-event matching)

### 6.4 Live-collection discipline and mutation-time patterns

#### 6.4.1 Snapshot-before-mutate; cached-length loops; avoid gEBCN inside mutation callbacks

#### 6.4.2 The 12-bullet distilled playbook (from dim04) re-anchored to measured numbers

## 7. Appendix: Benchmark Methodology, Sandbox, and Caveats (~800 words, 1 table)

Sources: /mnt/agents/output/dom-bench/RESULTS.md, bench.html, run.js

### 7.1 Harness design: warmup, batching, median-of-N, DCE sink guards, --expose-gc, read/write isolation

### 7.2 Fixtures: 261 / ~2K / 20,097 nodes, depth ~8, 500-deep chain; Chromium 150 headless flags

### 7.3 Stability and limitations: two runs ±10%, worst CV 18%, single-engine scope, jsdom non-transferability

### 7.4 How to reproduce and extend (file inventory table)

# References

## Research briefs

- **Type**: markdown research briefs (4)
- **Path**: /mnt/agents/output/research/domquery*dim01..04*\*.md

## Benchmark sandbox

- **Type**: HTML suite + puppeteer runner + JSON results
- **Path**: /mnt/agents/output/dom-bench/
