# Optimal DOM Element Querying — Dimension 2: Browser Engine Internals

_Source-level evidence for **why** some DOM queries are faster than others. Covers Blink, WebKit, Gecko, the JS↔C++ binding layer, and a machine-level cost model. All sources accessed 2026-08-12._

---

## 1. Blink (Chrome / Edge) internals

### 1.1 `getElementById`: a per-TreeScope hash map, not a tree walk

`document.getElementById(id)` lands in `ContainerNode::getElementById` (`third_party/blink/renderer/core/dom/container_node.cc`), which first tries the tree-scope map and only falls back to traversal for detached subtrees:

```cpp
Element* ContainerNode::getElementById(const AtomicString& id) const {
  if (id.empty()) { return nullptr; }
  if (IsInTreeScope()) {
    // Fast path if we are in a tree scope: call getElementById() on tree scope
    // and check if the matching element is in our subtree.
    Element* element = GetTreeScope().getElementById(id);
    ...
  }
  // Fall back to traversing our subtree.
  for (Element& element : ElementTraversal::DescendantsOf(*this)) {
    if (element.GetIdAttribute() == id) return &element;
  }
  return nullptr;
}
```

[^3^]

The map itself is `TreeOrderedMap` (`core/dom/tree_ordered_map.cc`): a `HeapHashMap<AtomicString, Member<MapEntry>>` keyed by the **interned** id string. Each entry caches the first matching element pointer plus a count and a lazily built `ordered_list` for duplicate ids:

```cpp
void TreeOrderedMap::Add(const AtomicString& key, Element& element) {
  Map::AddResult add_result = map_.insert(key, MakeGarbageCollected<MapEntry>(element));
  if (add_result.is_new_entry) return;
  Member<MapEntry>& entry = add_result.stored_value->value;
  entry->element = nullptr;
  entry->count++;
  entry->ordered_list.clear();
}
...
Element* TreeOrderedMap::GetElementById(const AtomicString& key, const TreeScope& scope) const {
  return Get(key, scope);
}
```

[^2^]

So the steady-state cost of `getElementById` is one hash of an `AtomicString` (the hash is **precomputed and stored inside the string**, and interned strings compare by pointer) + one or two hash-table probes + a pointer dereference. The map is maintained incrementally: elements register/unregister on insertion, removal, and `id` attribute mutation. Because `AtomicString` keys are interned, `document.getElementById("foo")` in a hot loop never re-hashes character data after atomization.

### 1.2 `getElementsByClassName` / `getElementsByTagName`: cached live collections

`ContainerNode::getElementsByClassName` does **not** re-scan the tree on every call. It returns a cached collection object keyed by `(CollectionType, AtomicString)`:

```cpp
HTMLCollection* ContainerNode::getElementsByClassName(const AtomicString& class_names) {
  return EnsureCachedCollection<ClassCollection>(kClassCollectionType, class_names);
}
```

[^3^]

The cache lives in `NodeListsNodeData` (a rare-data field so elements without lists pay nothing):

```cpp
typedef HeapHashMap<NamedNodeListKey, Member<LiveNodeListBase>,
                    NodeListAtomicCacheMapEntryHashTraits> NodeListAtomicNameCacheMap;
...
template <typename T>
T* AddCache(ContainerNode& node, CollectionType collection_type, const AtomicString& name) {
  NodeListAtomicNameCacheMap::AddResult result = atomic_name_caches_.insert(
      std::make_pair(collection_type, name), nullptr);
  if (!result.is_new_entry) { return static_cast<T*>(result.stored_value->value.Get()); }
  auto* list = MakeGarbageCollected<T>(node, collection_type, name);
  result.stored_value->value = list;
  return list;
}
```

[^4^]

Liveness is achieved by **invalidation**, not by re-querying on each access: `ContainerNode::InvalidateNodeListCachesInAncestors` walks up ancestors invalidating `NodeListsNodeData` caches whenever children change or an attribute (e.g. `class`) changes, gated by `Document::ShouldInvalidateNodeListCaches(attr_name)`. A global `LiveNodeListRegistry` keeps a bitmask of which invalidation types exist anywhere, so attribute changes are free when no live lists care:

```cpp
bool ContainsInvalidationType(NodeListInvalidationType type) const {
  return mask_ & MaskForInvalidationType(type);
}
bool NeedsInvalidateOnAttributeChange() const { ... }
```

[^5^]

**Consequence:** repeated `getElementsByClassName("x")` calls return the _same_ C++ object; the expensive full-tree re-scan only happens after a relevant mutation. But every `.length` / indexed access on a dirtied list can trigger a fresh traversal — this is the classic "live HTMLCollection in a loop" trap, and mutating `class` while iterating invalidates the very list you're iterating.

### 1.3 `querySelector` / `querySelectorAll`: parse-once cache + compiled matcher + ID acceleration

Entry point (`container_node.cc`):

```cpp
Element* ContainerNode::QuerySelector(const AtomicString& selectors, ExceptionState& exception_state) {
  SelectorQuery* selector_query = GetDocument().GetSelectorQueryCache().Add(
      selectors, GetDocument(), exception_state);
  if (!selector_query) return nullptr;
  return selector_query->QueryFirst(*this);
}
```

[^3^]

`SelectorQueryCache` (`core/css/selector_query.cc`) is a **per-Document cache of fully parsed selectors keyed by the selector string**, capped at 256 entries with FIFO eviction — repeated identical selector strings skip tokenizing/parsing entirely:

```cpp
SelectorQuery* SelectorQueryCache::Add(const AtomicString& selectors, ...) {
  ...
  auto it = entries_.find(selectors);
  if (it != entries_.end()) { return it->value.Get(); }
  HeapVector<CSSSelector> arena;
  base::span<CSSSelector> selector_vector = CSSParser::ParseSelector(...);
  ...
  const unsigned kMaximumSelectorQueryCacheSize = 256;
  if (entries_.size() == kMaximumSelectorQueryCacheSize) {
    entries_.erase(entries_.begin());
  }
  return entries_.insert(selectors, MakeGarbageCollected<SelectorQuery>(selector_list))...
}
```

[^1^]

Since a 2026 rewrite by Steinar H. Gunderson (sesse), matching no longer interprets the selector per element. `SelectorQuery::BuildCompounds` decomposes the selector into an array of `Compound`s (id / tag / class / exact-attribute / `:nth-child` facts each, `std::reverse`d so the **rightmost/subject compound is matched first**), and `Execute` runs a small state machine over the DOM. Two crucial accelerations:

1. **ID fast path** — if any remaining compound contains an ID selector, Blink uses the _same TreeOrderedMap as getElementById_ to jump straight to the candidate subtree instead of scanning everything:

```cpp
// Now go and see if any of the remaining compounds contain an ID selector.
// The DOM maintains special structures to locate IDs quickly, so this is
// our preferred acceleration if available; ...
...
} else {
  match(scope.getElementById(id));
  return;
}
```

[^1^]

2. **Bloom-filter subtree skipping** — each compound carries an `Element::TinyBloomFilter` of identifier hashes (same `SelectorFilter` tech used by style resolution), so whole subtrees that provably cannot match are skipped with one AND+compare instead of a recursive descent:

```cpp
if (IsA<Document>(root_node) && !To<Document>(root_node).CouldMatchFilter(selector_filter)) {
  // Neither this nor its children could match this query, so we can exit early.
  QUERY_STATS_INCREMENT(skipped_subtree);
  return false;
}
```

[^1^]

Anything the compound fast path can't prove (namespaces, most pseudo-classes, `>`/`+` precision) sets `need_full_check_`, and candidates are re-verified with the general `SelectorChecker`. `:nth-child(aN+b)` and `:first-child` _are_ fast-pathed via a per-query `NthIndexCache`. `matches()` and `closest()` get their own single-compound fast paths that avoid building a full `SelectorChecker` run. `QueryFirst` bails at the first hit (`kShouldOnlyMatchFirstElement`), which is why `querySelector` is cheaper than `querySelectorAll` + `[0]`.

**Right-to-left matching:** Blink evaluates from the subject (rightmost) compound leftwards, both here and in `SelectorChecker` — you start from a concrete candidate element and walk ancestors/siblings, instead of expanding from the left side of the selector. This is the standard engine strategy (see §3 Gecko notes for the classic rationale and data).

---

## 2. WebKit (Safari) internals

### 2.1 `SelectorQuery.cpp`: special-cased match types + a **JIT compiler for selectors**

WebKit's `SelectorDataList` classifies the query once at construction and dispatches to a specialized loop (`Source/WebCore/dom/SelectorQuery.cpp`):

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
        ...
```

[^6^]

- Single `.class` / `tag` / `[attr=x]` / `#id` selectors get hand-written tight loops over `descendantsOfType<Element>` — no general selector machinery at all.
- Any selector containing an ID anywhere uses `executeFastPathForIdSelector` (rightmost id) or `filterRootById` (id in an ancestor compound narrows the search root) — again backed by the tree-scope ID map. `[id="foo"]` was deliberately folded into this path in 2016 because YUI hammered `querySelector("[id=...]")` (WebKit bug 159960, changeset r203439, citing Chromium issue 627242) [^11^][^12^].
- Everything else is **JIT-compiled to machine code** when `ENABLE(CSS_SELECTOR_JIT)`:

```cpp
bool SelectorDataList::compileSelector(const SelectorData& selectorData) {
  auto& compiledSelector = selectorData.compiledSelector;
  if (compiledSelector.status == SelectorCompilationStatus::NotCompiled)
    SelectorCompiler::compileSelector(compiledSelector, selectorData.selector,
                                      SelectorCompiler::SelectorContext::QuerySelector);
  return compiledSelector.status != SelectorCompilationStatus::CannotCompile;
}
...
for (Ref element : descendantsOfType<Element>(const_cast<ContainerNode&>(searchRootNode))) {
  selectorData.compiledSelector.wasUsed();
  if (selectorChecker(element.ptr())) {   // <-- call into generated machine code
    appendOutputForElement(output, element);
```

[^6^]

The compiled result is cached _inside the SelectorQuery_ (`m_matchType` transitions `CompilableSingle → CompiledSingle`), and WebKit's `SelectorQueryCache` is a global singleton holding up to **512** entries keyed by `(selector string, parser context, security origin)` with random eviction [^6^].

### 2.2 What the CSS JIT generates (WebKit blog, Benjamin Poulain, 2014)

WebKit's official post describes the architecture: the old path was a generic interpreter (`SelectorChecker`) handling every combinational case; the JIT splits matching into _compile once, then invoke a tiny generated binary per element_ [^9^]:

> "A JIT compiler takes the selector, does all the complicated computations when compiling, and generates a tiny binary blob corresponding to the input selector: a compiled selector. When it is time to find if an element that matches the selector, WebKit can just invoke the compiled selector."

Key engineering facts from the same post [^9^]:

- The compiler is deliberately simple and built on JavaScriptCore's macro-assembler, so "the compilation phase is within one order of magnitude of a single execution of SelectorChecker" — amortized over "dozens of selectors and hundreds of elements," it wins.
- Measured ~2x on common selectors (1100 ms → <500 ms on their microbenchmark).
- `querySelector()`/`querySelectorAll()` "share a large part of infrastructure with style resolution... both functions will also enjoy the CSS JIT Compiler."
- Partial support = whole-selector fallback: "If any part of a selector is not handle by the CSS JIT, the whole selector is dropped to slow path" (bugs.webkit.org #140818) [^19^].

This is why `querySelector` is _particularly_ fast in WebKit: per-element matching is literally a handful of machine instructions (load the element's local-name pointer, compare, conditional jump), and the parse+compile cost is amortized by the 512-entry cache.

### 2.3 `getElementById` in WebKit

`TreeScope::getElementById` → `TreeScopeOrderedMap` (`Source/WebCore/dom/TreeScopeOrderedMap.cpp`): same design as Blink's (they share ancestry) — hash map keyed by `AtomString`, cached first-element pointer, lazily materialized ordered list only when duplicate IDs exist [^7^].

### 2.4 Bindings were the other half of the story

WebKit's Speedometer post-mortem attributes a large chunk of DOM-call cost to the JS↔C++ bindings, and lists the fixes [^10^]:

> "We removed redundant layers of abstraction and made more properties and member functions on DOM objects inline cacheable... We also optimized node lists returned by getElementsByTagName as well as inline caching the length property... The CSS JIT... reduced time spent in style resolution and made querySelector and querySelectorAll much faster."

---

## 3. Gecko (Firefox) notes

- **ID map:** `mozilla::dom::Document`/ShadowRoot keeps `mIdentifierMap`, a `PLDHashTable` of `IdentifierMapEntry` keyed by atom/string hash. `GetIdElement()` is literally `mIdContentList->SafeElementAt(0)` — a hash probe plus array read; the entry maintains a `TreeOrderedArray<Element*>` for duplicate IDs and change callbacks (`dom/base/IdentifierMapEntry.h`) [^8^]. Same "index table" architecture as the other two engines.
- **Right-to-left matching:** the canonical explanation is by Gecko layout engineer Boris Zbarsky: matching from the right "gives an obvious starting point and lets you get rid of most of the candidate selectors very quickly" — for Gmail ~70% of (rule, element) pairs were rejected after examining only the rightmost compound's tag/class/id, and Gecko pre-filters rules with a **hashtable lookup on the element's ID** before attempting any match [^13^].
- **Servo/Stylo:** modern Gecko buckets style rules by id/class/tag and walks ancestor chains right-to-left; `querySelector` uses the same selector-matching core (this facet is documented more briefly — the other engines' sources above cover the shared algorithm).

---

## 4. V8 / JS-engine layer: what a DOM call from JS actually costs

Every `document.querySelectorAll(".x")` from JavaScript pays, in order:

1. **Binding dispatch.** Blink's WebIDL compiler generates the glue (`out/.../gen/third_party/blink/renderer/bindings/core/v8/v8_*.h`). Per "How Blink works" (haraken@): "When JavaScript calls `node.firstChild`, V8 calls `V8Node::firstChildAttributeGetterCallback()` in v8_node.h, then it calls `Node::firstChild()`" [^14^]. Web IDL is "a language that defines how Blink interfaces are bound to V8... the IDL files are parsed, and the code to bind Blink implementations to V8 interfaces [is] automatically generated" [^15^].
2. **Argument conversion.** The JS string must be converted and **atomized** to an `AtomicString` (interned, hash cached) before the selector cache can be probed — cheap per call, but not free, and it's why string keys dominate constant-factor costs.
3. **C++ traversal/matching** (everything in §1–§3).
4. **Result wrapping.** Each C++ `Node` needs a V8 wrapper JSObject (one per world: "one V8 wrapper per world" [^14^]). `querySelectorAll` additionally allocates the `StaticElementList` (snapshot `Vector` adopted via `StaticElementList::Adopt`) plus its wrapper. Wrappers are cached per node, but a query returning N fresh elements can allocate N wrappers — GC pressure your JS never sees directly.
5. **Inline-cache behavior on the JS side.** V8 optimizes property access via hidden classes (Maps) + inline caches: the optimizing compiler "can directly inline property accesses if it can ensure a compatible object's structure through the HiddenClass" [^16^]; IC machine code is effectively "compare hidden class pointer... access the property at a hard-coded offset" [^17^]. This makes _your own_ cached object fields ~1–2 instructions, whereas a DOM method call can never be fully inlined across the C++ boundary — the call itself, the conversions, and the allocation remain.

**Net effect:** a loop of `querySelectorAll` is dominated by (1)+(2)+(4) plus C++ traversal — the JavaScript around it is nearly irrelevant. Caching an element reference in JS eliminates _all five_ steps on subsequent uses; caching a `querySelectorAll` result array (or using the cached live collection object) eliminates repeated allocation and repeated traversal. WebKit's own engineers reached the same conclusion: they made NodeList `length` inline-cacheable and "optimized node lists returned by getElementsByTagName" because those accesses were the hot spot [^10^].

---

## 5. The machine-level mental model

- **Hash lookup (getElementById, any engine):** one pointer-chase into a hash bucket; the key's hash is precomputed in the interned string; comparison is pointer equality in the hit case. Roughly: 1–2 cache misses, no branches proportional to DOM size. Effectively O(1) with a tiny constant.
- **JIT-compiled selector match (WebKit):** for `div.foo` the generated code is conceptually `if (el->localName != divAtom) goto fail; if (!el->classList->contains(fooAtom)) goto fail;` — a load, an immediate compare, a well-predicted branch. No interpreter dispatch, no virtual calls.
- **Tree walk (tag/class/qSA without id):** pointer chasing through `firstChild`/`nextSibling` links — DOM nodes are scattered across the heap, so each hop risks an L2/L3 miss (~tens to ~100 cycles), times N nodes. This is why every engine adds _skip_ mechanisms: Blink's per-compound `TinyBloomFilter` (`CouldMatchFilter`) rejects a subtree with one AND+compare [^1^]; WebKit/Gecko pre-filter candidates by id/class buckets so most (element, selector) pairs die after the rightmost compound check (~70% on real pages) [^13^].
- **Branch prediction:** compound matching is a chain of dependent compares (id? tag? class? attr?) — engines order the checks to fail fast on the most selective fact (Blink checks `id_needed` first, then tag, then class, then attribute [^1^]).
- **Why "simple" selectors win:** they keep matching on the paths above — pointer compares and bloom bits. Pseudos like `:nth-child` force sibling-index bookkeeping; many pseudo-classes force the general `SelectorChecker` or a JIT bailout ("the whole selector is dropped to slow path" [^19^]).

---

## 6. Notable commits / bugs timeline

| Date       | Engine | Change                                                                                                                                                                                                                                                                                                    | Evidence                                                      |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 2013       | Blink  | Fork inherits WebKit's `SelectorQuery`/`SelectorQueryCache` architecture                                                                                                                                                                                                                                  | selector_query.cc Apple copyright header [^1^]                |
| 2014-03    | WebKit | **CSS Selector JIT** lands; ~2x on common selectors; qS/qSA benefit                                                                                                                                                                                                                                       | webkit.org blog 3271 [^9^]                                    |
| 2015       | WebKit | Speedometer work: bindings de-abstracted, NodeList + `length` inline-cached; "CSS JIT... made querySelector and querySelectorAll much faster"                                                                                                                                                             | webkit.org blog 3395 [^10^]                                   |
| 2015-02    | WebKit | CSS JIT `:lang()` support; "if any part of a selector is not handled by the CSS JIT, the whole selector is dropped to slow path"                                                                                                                                                                          | bugs.webkit.org 140818 [^19^]                                 |
| 2015-08    | WebKit | `getElementsByClassName` returns live `HTMLCollection` (spec alignment)                                                                                                                                                                                                                                   | bugs.webkit.org 147980 [^18^]                                 |
| 2016-07-19 | WebKit | r203439: `[id=x]` attribute selectors reuse the getElementById fast path; motivated by YUI's heavy `querySelector("[id=]")` (crbug 627242)                                                                                                                                                                | trac.webkit.org r203439, bug 159960 [^11^][^12^]              |
| 2026-06    | Blink  | **Selector query fast-path rewrite** (Steinar H. Gunderson): compound state machine, bloom-filter subtree skipping, ID-rooted search, `matches()`/`closest()` fast paths; reverted once for uninitialized `needs_synchronize_attribute` in `matches()`, reapplied as CL 7900254 (`FillMissingData` split) | Chromium changelog 2026-06-04; chromium-review 7900254 [^20^] |
| ongoing    | Blink  | `SelectorQueryCache` at 256 parsed-selector entries/Document; WebKit `SelectorQueryCache` at 512 entries, random eviction                                                                                                                                                                                 | [^1^][^6^]                                                    |

---

## 7. Actionable implications for library authors

1. **IDs are O(1) everywhere.** All three engines keep an incrementally maintained, AtomicString-keyed hash map per tree scope. `getElementById` — and any `querySelector` containing `#id` — bypasses tree traversal almost entirely [^1^][^2^][^6^][^8^]. Design hot lookup paths around ids.
2. **Put the id anywhere in the selector.** Blink searches from the id compound (not just the rightmost), and WebKit filters the root by ids in ancestor compounds; `#form .field` starts from the `#form` subtree instead of scanning the document [^1^][^6^].
3. **Reuse exact selector strings.** Parsed selectors are cached by string (256/Document in Blink, 512 global in WebKit). Dynamically generated selector strings in a hot loop thrash the cache and re-pay parse/compile cost [^1^][^6^].
4. **Keep selectors simple in hot paths.** Single `.class`/`tag`/`[attr=x]` selectors hit hand-specialized loops (WebKit) or the compound fast path (Blink); exotic pseudo-classes fall back to the general checker or disable the selector JIT entirely [^1^][^6^][^19^].
5. **Prefer `querySelector` over `querySelectorAll(...)[0]`.** Both engines short-circuit at the first match (`kShouldOnlyMatchFirstElement`); `querySelectorAll` pays a full traversal plus a snapshot Vector + list allocation [^1^][^6^].
6. **Cache element references in JS.** A cached reference costs one inline-cached field load (~1–2 machine instructions) versus a full binding round-trip: IDL dispatch → string atomization → C++ traversal → wrapper allocation. No engine can optimize the boundary crossing away [^14^][^16^][^17^].
7. **Treat live HTMLCollections as queries, not arrays.** The collection _object_ is cached, but any class/DOM mutation invalidates its contents; cache `.length` in loops, snapshot with `Array.from` before mutating, and never mutate `class` while iterating a class-based live list [^3^][^4^][^5^].
8. **Scope queries to subtrees.** `root.querySelectorAll(x)` traverses only `root`'s descendants in every engine; combined with an id-scoped root this approaches the getElementById fast path for batched lookups [^1^][^3^].
9. **Don't fear repeated identical queries on a static DOM** — but don't trust it either: Blink/WebKit caches mean the _second_ identical call is far cheaper than the first; benchmarks that only measure warm repeats overstate real-world cost [^1^][^6^].

---

## Sources (all accessed 2026-08-12)

1. Blink `selector_query.cc` (SelectorQuery, SelectorQueryCache, compound fast path) — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/css/selector_query.cc (canonical: source.chromium.org → third_party/blink/renderer/core/css/selector_query.cc)
2. Blink `tree_ordered_map.cc` — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/tree_ordered_map.cc
3. Blink `container_node.cc` (QuerySelector/getElementsByClassName/getElementById/InvalidateNodeListCachesInAncestors) — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/container_node.cc
4. Blink `node_lists_node_data.h` (live collection caching) — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/node_lists_node_data.h
5. Blink `live_node_list_registry.h` — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/live_node_list_registry.h
6. WebKit `SelectorQuery.cpp` — https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/dom/SelectorQuery.cpp
7. WebKit `TreeScopeOrderedMap.cpp` — https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/dom/TreeScopeOrderedMap.cpp
8. Gecko `IdentifierMapEntry.h` — https://raw.githubusercontent.com/mozilla/gecko-dev/master/dom/base/IdentifierMapEntry.h
9. "Overview of WebKit's CSS JIT Compiler" (Benjamin Poulain, webkit.org) — https://webkit.org/blog/3271/webkit-css-selector-jit-compiler/
10. "Speedometer: Benchmark for Web App Responsiveness" (webkit.org) — https://webkit.org/blog/3395/speedometer-benchmark-for-web-app-responsiveness/
11. WebKit trac timeline, changeset r203439 "[id=x] uses getElementById" — https://trac.webkit.org/timeline?from=2016-07-20&daysback=4&authors=
12. WebKit bug 159960 / Chromium issue 627242 (YUI `[id=]` querySelector) — https://bugs.webkit.org/show_bug.cgi?id=159960 , https://bugs.chromium.org/p/chromium/issues/detail?id=627242
13. "Why do browsers match CSS selectors from right to left?" (Boris Zbarsky, Mozilla) — https://stackoverflow.com/questions/5797014/why-do-browsers-match-css-selectors-from-right-to-left
14. "How Blink works" (haraken@chromium.org; WebIDL bindings, V8 wrappers) — https://www.chromium.org/blink/ (mirror: https://www.cnblogs.com/huangguanyuan/p/9673772.html)
15. "Web IDL in Blink" — https://www.chromium.org/blink/webidl/
16. "Fast properties in V8" (v8.dev) — https://v8.dev/blog/fast-properties
17. "JavaScript engine fundamentals: Shapes and Inline Caches" (Mathias Bynens) — https://mathiasbynens.be/notes/shapes-ics
18. WebKit bug 147980 (getElementsByClassName → HTMLCollection) — https://bugs.webkit.org/show_bug.cgi?id=147980
19. WebKit bug 140818 (CSS JIT :lang(); whole-selector slow-path fallback) — https://bugs.webkit.org/show_bug.cgi?id=140818
20. Chromium changelog 2026-06-04, "Reapplied selector query fast-path rewrites", CL 7900254 — https://static.januschka.com/changelog/chromium/2026-06-04.html ; https://chromium-review.googlesource.com/c/chromium/src/+/7900254
21. WebKit source walkthrough of querySelector internals (joyeecheung) — https://www.cnblogs.com/joyeecheung/p/4122959.html
