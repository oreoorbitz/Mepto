## 2. Engine Internals: Why the Winners Win

Chapter 1 decomposed every DOM query into four cost layers: binding crossing, selector parse, traversal strategy, and result allocation. This chapter shows how each engine implements each layer — and why the winning APIs win for _structural_ reasons, not tuning luck. The short version: every engine keeps an incrementally updated, interned-string-keyed hash map for IDs; every engine caches parsed selectors; every engine matches right-to-left; and no engine can optimize away the JS→C++ boundary.

### 2.1 Blink (Chrome/Edge): maps, caches, and the 2026 SelectorQuery rewrite

#### 2.1.1 getElementById = O(1): TreeOrderedMap hash map keyed by AtomicString, maintained incrementally

`document.getElementById(id)` lands in `ContainerNode::getElementById` (`third_party/blink/renderer/core/dom/container_node.cc`), which consults the tree-scope map and only falls back to traversal for detached subtrees:[^3^]

```cpp
Element* ContainerNode::getElementById(const AtomicString& id) const {
  if (id.empty()) { return nullptr; }
  if (IsInTreeScope()) {
    Element* element = GetTreeScope().getElementById(id);
    ...
  }
  // Fall back to traversing our subtree.
  for (Element& element : ElementTraversal::DescendantsOf(*this)) { ... }
}
```

The map is `TreeOrderedMap` (`core/dom/tree_ordered_map.cc`): a `HeapHashMap<AtomicString, Member<MapEntry>>` keyed by the **interned** id string. Each `MapEntry` caches the first matching element pointer plus a count, and materializes a lazily built `ordered_list` only when duplicate ids exist:[^2^]

```cpp
void TreeOrderedMap::Add(const AtomicString& key, Element& element) {
  Map::AddResult add_result = map_.insert(key, MakeGarbageCollected<MapEntry>(element));
  if (add_result.is_new_entry) return;
  entry->element = nullptr;
  entry->count++;
  entry->ordered_list.clear();
}
```

Two properties make this path nearly free at steady state. `AtomicString` stores its hash **inside the string object** and interned strings compare by pointer, so a hot `getElementById("foo")` loop never touches character data after the one-time atomization. And the map is maintained incrementally — elements register/unregister on insertion, removal, and `id` mutation — so the query path performs zero tree traversal.[^2^] Steady-state cost: one precomputed hash fetch, one or two bucket probes, one pointer dereference.

#### 2.1.2 getElementsByClassName/TagName: cached live collections in NodeListsNodeData; LiveNodeListRegistry invalidation bitmask

`ContainerNode::getElementsByClassName` does not rescan the tree per call. It returns a cached collection object keyed by `(CollectionType, AtomicString)`:[^3^]

```cpp
HTMLCollection* ContainerNode::getElementsByClassName(const AtomicString& class_names) {
  return EnsureCachedCollection<ClassCollection>(kClassCollectionType, class_names);
}
```

The cache lives in `NodeListsNodeData`, a rare-data side table so nodes with no live lists pay nothing; `AddCache` returns the existing `LiveNodeListBase` on a hit.[^4^] Liveness is achieved by **invalidation**, not re-querying: `ContainerNode::InvalidateNodeListCachesInAncestors` walks ancestors on child or attribute changes, gated by `Document::ShouldInvalidateNodeListCaches(attr_name)`. A global `LiveNodeListRegistry` holds a bitmask of which invalidation types exist _anywhere_, so attribute mutations are free when no live list cares:[^5^]

```cpp
bool ContainsInvalidationType(NodeListInvalidationType type) const {
  return mask_ & MaskForInvalidationType(type);
}
```

Consequences: repeated `getElementsByClassName("x")` calls return the _same C++ object_; the rescan happens only after a relevant mutation. But every `.length` or indexed access on a dirtied list can trigger a fresh traversal, and mutating `class` while iterating a class-based list invalidates the very list under your feet.[^5^]

#### 2.1.3 SelectorQueryCache (256 parsed selectors) + 2026 rewritten SelectorQuery (CL 7900254): rightmost-first state machine, ID-accelerated search, TinyBloomFilter subtree skipping, NthIndexCache

The entry point shows the layering:[^3^]

```cpp
Element* ContainerNode::QuerySelector(const AtomicString& selectors, ExceptionState& es) {
  SelectorQuery* selector_query = GetDocument().GetSelectorQueryCache().Add(
      selectors, GetDocument(), es);
  if (!selector_query) return nullptr;
  return selector_query->QueryFirst(*this);
}
```

`SelectorQueryCache` (`core/css/selector_query.cc`) is a per-Document cache of **fully parsed selectors keyed by selector string**, capped at 256 entries with FIFO eviction — repeat an identical string and parsing is skipped entirely.[^1^]

The 2026 rewrite by Steinar H. Gunderson (reapplied as CL 7900254 after one revert) replaced per-element interpretation with a compiled form: `SelectorQuery::BuildCompounds` decomposes the selector into `Compound`s (id / tag / class / exact-attribute / `:nth-child` facts each, `std::reverse`d so the **rightmost/subject compound matches first**), and `Execute` runs a small state machine over the DOM.[^1^][^20^] Two accelerations matter most:

1. **ID-accelerated search.** If any remaining compound contains an ID selector, Blink reuses _the same TreeOrderedMap as getElementById_ to jump straight to the candidate subtree — `#form .field` starts at the `#form` element, not at the document root:[^1^]

```cpp
// Now go and see if any of the remaining compounds contain an ID selector.
// The DOM maintains special structures to locate IDs quickly, so this is
// our preferred acceleration if available;
...
} else {
  match(scope.getElementById(id));
  return;
}
```

2. **Bloom-filter subtree skipping.** Each compound carries an `Element::TinyBloomFilter` of identifier hashes (the same `SelectorFilter` technology as style resolution); whole subtrees that provably cannot match are rejected with one AND+compare:[^1^]

```cpp
if (IsA<Document>(root_node) && !To<Document>(root_node).CouldMatchFilter(selector_filter)) {
  // Neither this nor its children could match this query, so we can exit early.
  return false;
}
```

Anything the compound fast path cannot prove (namespaces, most pseudo-classes, combinator precision) sets `need_full_check_` and is re-verified with the general `SelectorChecker`; `:nth-child(an+b)` and `:first-child` _are_ fast-pathed via a per-query `NthIndexCache`. `QueryFirst` bails at the first hit (`kShouldOnlyMatchFirstElement`) — structurally, `querySelector` is cheaper than `querySelectorAll(...)[0]`.[^1^]

### 2.2 WebKit (Safari): the selector JIT

#### 2.2.1 Hand-written fast paths for single .class/tag/[attr=x]/#id; ID fast path for any selector containing an ID

WebKit's `SelectorDataList` (`Source/WebCore/dom/SelectorQuery.cpp`) classifies the query once at construction and dispatches to a specialized loop:[^6^]

```cpp
if (m_selectors.size() == 1) {
  const CSSSelector& selector = m_selectors.first().selector;
  if (!selector.precedingInComplexSelector()) {
    switch (selector.match()) {
      case CSSSelector::Match::Tag:   m_matchType = TagNameMatch; break;
      case CSSSelector::Match::Class: m_matchType = ClassNameMatch; break;
      case CSSSelector::Match::Exact:
        if (canBeUsedForIdFastPath(selector))
          m_matchType = RightMostWithIdMatch; // [id="name"] pattern goes here.
```

Single `.class` / `tag` / `[attr=x]` / `#id` selectors get hand-written tight loops over `descendantsOfType<Element>` with no general selector machinery at all. Any selector containing an ID _anywhere_ uses `executeFastPathForIdSelector` (rightmost id) or `filterRootById` (an id in an ancestor compound narrows the search root), backed by `TreeScopeOrderedMap` — the same hash-map design as Blink's, given shared ancestry.[^6^][^7^] The `[id="foo"]` case was folded into the ID path in 2016 (r203439, bug 159960) because YUI hammered `querySelector("[id=...]")`, citing Chromium issue 627242.[^11^][^12^]

#### 2.2.2 SelectorCompiler JIT-compiles selectors to machine code; 512-entry cache; whole-selector fallback on unsupported pseudo

Everything escaping the hand-written paths is **JIT-compiled to machine code** under `ENABLE(CSS_SELECTOR_JIT)` — `SelectorCompiler::compileSelector` emits a binary blob per selector; the per-element match is a direct call into generated code:[^6^]

```cpp
for (Ref element : descendantsOfType<Element>(const_cast<ContainerNode&>(searchRootNode))) {
  selectorData.compiledSelector.wasUsed();
  if (selectorChecker(element.ptr())) {   // <-- call into generated machine code
    appendOutputForElement(output, element);
```

Per WebKit's official write-up (Benjamin Poulain, 2014): "A JIT compiler takes the selector, does all the complicated computations when compiling, and generates a tiny binary blob corresponding to the input selector... When it is time to find if an element that matches the selector, WebKit can just invoke the compiled selector."[^9^] The compiler is deliberately simple — built on JavaScriptCore's macro-assembler, compilation costs "within one order of magnitude of a single execution of SelectorChecker," amortized over dozens of selectors and hundreds of elements; the measured result was ~2× on common selectors (1100 ms → under 500 ms).[^9^] Compiled results are cached inside the `SelectorQuery` (`CompilableSingle → CompiledSingle`), and WebKit's `SelectorQueryCache` is a global singleton holding up to **512** entries keyed by `(selector string, parser context, security origin)` with random eviction.[^6^]

The catch is all-or-nothing: "If any part of a selector is not handle by the CSS JIT, the whole selector is dropped to slow path" (bugs.webkit.org #140818).[^19^] One unsupported pseudo-class demotes the entire selector to the interpreted `SelectorChecker`.

### 2.3 Gecko (Firefox): IdentifierMapEntry + right-to-left rationale (~70% rejected on rightmost compound)

Gecko's ID index follows the same architecture: `mozilla::dom::Document`/ShadowRoot keeps `mIdentifierMap`, a `PLDHashTable` of `IdentifierMapEntry` keyed by atom/string hash. `GetIdElement()` is literally `mIdContentList->SafeElementAt(0)` — a hash probe plus an array read — with a `TreeOrderedArray<Element*>` for duplicate IDs and change callbacks (`dom/base/IdentifierMapEntry.h`).[^8^]

Gecko also supplies the canonical articulation of why every engine matches right-to-left. Boris Zbarsky: matching from the right "gives an obvious starting point and lets you get rid of most of the candidate selectors very quickly" — for Gmail, ~70% of (rule, element) pairs were rejected after examining only the rightmost compound's tag/class/id, and Gecko pre-filters rules with a **hashtable lookup on the element's ID** before attempting any match.[^13^] You start from one concrete candidate and walk ancestors/siblings, instead of expanding a combinatorial frontier from the left. Modern Gecko (Stylo) buckets style rules by id/class/tag and shares its selector-matching core with `querySelector`.[^13^]

| Concern                     | Blink                                                                                                    | WebKit                                                                               | Gecko                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ID lookup structure         | `TreeOrderedMap` (HeapHashMap, AtomicString key)[^2^]                                                    | `TreeScopeOrderedMap` (AtomString key)[^7^]                                          | `mIdentifierMap` PLDHashTable of `IdentifierMapEntry`[^8^]                                 |
| Class/tag live collections  | Cached per `(type, name)` in `NodeListsNodeData`; registry bitmask gates invalidation[^4^][^5^]          | Live `HTMLCollection` (bug 147980); bindings inline-cache `length`[^10^][^18^]       | Shared live-list machinery                                                                 |
| Parsed selector cache       | 256 entries per Document, FIFO[^1^]                                                                      | 512 entries global, random eviction[^6^]                                             | n/a (style-rule bucketing dominates)                                                       |
| Matcher strategy            | Compound state machine + `TinyBloomFilter` subtree skip + ID-rooted search (2026, CL 7900254)[^1^][^20^] | JIT-compiled machine code per selector; whole-selector slow-path fallback[^6^][^19^] | Right-to-left ancestor walk; id-hashtable pre-filter; ~70% die on rightmost compound[^13^] |
| `[id=x]` attribute selector | ID fast path in compound machine[^1^]                                                                    | Folded into ID fast path, r203439[^11^][^12^]                                        | id-bucket pre-filter[^13^]                                                                 |

### 2.4 V8 / WebIDL binding layer: the cost you can never inline away

#### 2.4.1 Anatomy of a JS→DOM call: binding callback, argument atomization, C++ work, wrapper + NodeList allocation

Every `document.querySelectorAll(".x")` from JavaScript pays four fixed costs in sequence, before and after any traversal:

1. **Binding dispatch.** Blink's WebIDL compiler auto-generates the glue from IDL files. Per "How Blink works": "When JavaScript calls `node.firstChild`, V8 calls `V8Node::firstChildAttributeGetterCallback()` in v8_node.h, then it calls `Node::firstChild()`."[^14^][^15^]
2. **Argument conversion.** The JS string is converted and **atomized** to an `AtomicString` — interned, hash cached — before any cache can be probed. Cheap per call, never free; string keys dominate the constant factors.[^14^]
3. **C++ traversal/matching** — everything in §2.1–§2.3.
4. **Result wrapping.** Each returned C++ `Node` needs a V8 wrapper JSObject ("one V8 wrapper per world").[^14^] `querySelectorAll` additionally allocates the `StaticElementList` snapshot (`Vector` adopted via `StaticElementList::Adopt`) plus its wrapper. Wrappers are cached per node, but a query returning N fresh elements can allocate N wrappers — GC pressure your JS never sees directly.[^14^]

#### 2.4.2 Why cached JS references win: hidden-class inline cache = 1–2 instructions vs full boundary crossing

On the JS side, V8 optimizes property access via hidden classes (Maps) plus inline caches: the optimizing compiler "can directly inline property accesses if it can ensure a compatible object's structure through the HiddenClass"; the IC machine code is effectively "compare hidden class pointer... access the property at a hard-coded offset."[^16^][^17^] A field load on your own cached object is ~1–2 machine instructions. A DOM method call can never be fully inlined across the C++ boundary — the dispatch, conversions, and allocations remain on every invocation.

Net effect: a `querySelectorAll` loop is dominated by steps (1), (2), (4) plus the C++ traversal; the JavaScript around it is nearly irrelevant. Caching an element reference in JS eliminates all four steps on subsequent uses. WebKit's engineers reached the same conclusion in their Speedometer post-mortem: "We removed redundant layers of abstraction and made more properties and member functions on DOM objects inline cacheable... We also optimized node lists returned by getElementsByTagName as well as inline caching the length property."[^10^]

### 2.5 The machine-level mental model

#### 2.5.1 Hash probe ≈ 1–2 cache misses; tree walk = pointer-chasing, cache-miss-per-hop; bloom filters kill subtrees before walking

**Hash lookup (getElementById, any engine).** One pointer-chase into a hash bucket; the key's hash is precomputed in the interned string; comparison is pointer equality on a hit. Roughly 1–2 cache misses, no branch count that scales with DOM size. Effectively O(1) with a tiny constant.[^2^][^7^][^8^]

**JIT-compiled selector match (WebKit).** For `div.foo` the generated code is conceptually:

```asm
load   r1, [element + localName_offset]
cmp    r1, divAtom
jne    fail
load   r2, [element + classList_offset]
call   classList_contains(fooAtom)   ; often itself inlined compares
test   ...
jne    fail
```

A load, an immediate compare, a well-predicted branch — no interpreter dispatch, no virtual calls. That is the entire per-element cost once compiled and cached.[^9^]

**Tree walk (tag/class/qSA without id).** Pointer chasing through `firstChild`/`nextSibling` links. DOM nodes are scattered across the heap by allocation history, so each hop risks an L2/L3 miss (~tens to ~100 cycles), times N nodes. Hence the universal investment in _skip_ mechanisms: Blink's per-compound `TinyBloomFilter` rejects a subtree with one AND+compare before descending;[^1^] WebKit/Gecko pre-filter candidates by id/class buckets so most (element, selector) pairs die on the rightmost compound (~70% on real pages).[^13^]

**Branch prediction.** Compound matching is a chain of dependent compares (id? tag? class? attr?). Engines order checks to fail fast on the most selective fact — Blink checks `id_needed` first, then tag, then class, then attribute[^1^] — because a mispredicted branch (~15–20 cycles) costs as much as several compares. Pseudo-classes break the pattern: they force the general `SelectorChecker` or a whole-selector JIT bailout,[^19^] and `:nth-child` adds sibling-index bookkeeping (mitigated in Blink by the per-query `NthIndexCache`).[^1^]

**Why "simple" selectors win:** they stay on the paths above — pointer compares and bloom bits. Every layer of the four-cost model is either eliminated (parse: string-keyed caches; traversal: hash maps and filters) or reduced to a handful of predicted branches (matching: JIT code, fail-fast compound order). The binding crossing alone is irreducible.

#### 2.5.2 Notable commits/bugs timeline (SelectorQueryCache, WebKit JIT 2014, Blink 2026 rewrite, unified querySelector cache 2026)

| Date           | Engine | Change                                                                                                                                                                                                                                                                                     | Evidence                                                      |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 2013           | Blink  | Fork inherits WebKit's `SelectorQuery`/`SelectorQueryCache` architecture                                                                                                                                                                                                                   | selector_query.cc Apple copyright header [^1^]                |
| 2014-03        | WebKit | **CSS Selector JIT** lands; ~2× on common selectors; qS/qSA benefit                                                                                                                                                                                                                        | webkit.org blog 3271 [^9^]                                    |
| 2015           | WebKit | Speedometer work: bindings de-abstracted; NodeList + `length` inline-cached; "CSS JIT... made querySelector and querySelectorAll much faster"                                                                                                                                              | webkit.org blog 3395 [^10^]                                   |
| 2015-02        | WebKit | CSS JIT `:lang()` support; "the whole selector is dropped to slow path" on unsupported parts                                                                                                                                                                                               | bugs.webkit.org 140818 [^19^]                                 |
| 2015-08        | WebKit | `getElementsByClassName` returns live `HTMLCollection` (spec alignment)                                                                                                                                                                                                                    | bugs.webkit.org 147980 [^18^]                                 |
| 2016-07-19     | WebKit | r203439: `[id=x]` reuses the getElementById fast path; motivated by YUI (crbug 627242)                                                                                                                                                                                                     | trac r203439, bug 159960 [^11^][^12^]                         |
| 2026-06        | Blink  | **Selector query fast-path rewrite** (Steinar H. Gunderson): compound state machine, bloom-filter subtree skipping, ID-rooted search, `matches()`/`closest()` fast paths; reverted once for uninitialized `needs_synchronize_attribute`, reapplied as CL 7900254 (`FillMissingData` split) | Chromium changelog 2026-06-04; chromium-review 7900254 [^20^] |
| 2026 (ongoing) | Both   | Unified parsed-selector caches at steady state: `SelectorQueryCache` 256 entries/Document (Blink, FIFO); 512 entries global (WebKit, random eviction)                                                                                                                                      | [^1^][^6^]                                                    |

**Testable predictions for Chapter 3.** The architecture above commits Chapter 3's benchmarks to specific outcomes:

- **Map-backed APIs are flat vs DOM size.** `getElementById`, and any `querySelector` containing an `#id`, should show near-constant latency from 10² to 10⁵ nodes in all three engines.[^2^][^7^][^8^]
- **Scan APIs degrade linearly.** Id-less `querySelectorAll` should scale ~linearly with descendant count, slope set by cache-miss-per-hop cost; scoping to a subtree cuts the constant proportionally.[^1^][^13^]
- **Warm beats cold by cache design.** A second identical `querySelector("...")` should be measurably cheaper than the first; dynamically generated selector strings should thrash the 256/512-entry caches and re-pay parse cost.[^1^][^6^]
- **The 2026 Blink rewrite narrows the gap.** Blink's `querySelector('#id')` should converge toward `getElementById` (same TreeOrderedMap, one extra compound check); bloom-filter skipping should make id-less queries sub-linear on sparse-match DOMs — measurable as fewer nodes visited per query, not just lower wall time.[^1^][^20^]
- **Cached JS references dominate everything.** A cached element reference should sit at the ~1–2-instruction floor regardless of engine or DOM size, beating every re-query path by at least the binding-crossing cost.[^16^][^17^]
