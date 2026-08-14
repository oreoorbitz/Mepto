## 6. The Library-Author Playbook

Chapter 5 answers _which call to write_; this chapter answers the prior question — _how to structure a library so the call rarely happens at all_. Twenty years of shipping code converge on one meta-principle: **the fastest element query is the one never run.** The rest is elaboration: eliminate queries by construction, route survivors to the cheapest native primitive, amortize matching through delegation or observers, discipline the collections you keep.

| Library            | Lookup mechanism                                                                                                                | Event matching                                                                                | Reference caching                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **jQuery/Sizzle**  | `rquickExpr` routing: `#id`→gEBI, `tag`→gEBTN, `.class`→gEBCN, else qSA; rightmost-token seeding + compiled matchers [^1^][^2^] | Manual ancestor walk, `matchesSelector` per level, per-dispatch `matchedSelectors` memo [^4^] | `dataPriv` uid→object store; bounded LRU selector caches (`cacheLength = 50`) [^1^][^4^] |
| **Zepto**          | Same 3-way regex routing, ~15 lines vs Sizzle's ~2000 [^3^]                                                                     | jQuery-compatible selector filter                                                             | None (minimalist)                                                                        |
| **React / Preact** | None — refs fulfilled in commit from fiber `stateNode` [^15^]                                                                   | Root listener + fiber-tree dispatch; no selector matching                                     | `useRef` / callback refs hold the node [^15^]                                            |
| **Vue 3**          | None — `vnode.el` + `setRef` assigns the known element [^13^]                                                                   | Patched direct listeners                                                                      | Template refs at mount; raw `document.querySelector` flagged as defect [^13^][^14^]      |
| **Svelte / Solid** | None — compiler emits per-node closure vars [^17^][^19^]                                                                        | Direct listeners (Solid delegates a few)                                                      | Compiled-in references; `bind:this` / `ref={el=>…}` [^17^][^18^][^19^]                   |
| **Lit**            | Scoped `renderRoot.querySelector` via `@query` getters [^10^]                                                                   | Standard `addEventListener`                                                                   | `@query(sel, true)` memoizes on instance (#2725 caveat) [^10^][^11^][^12^]               |
| **Alpine**         | One init walk registers directives + `x-ref`s                                                                                   | Direct listeners; `.self`→`e.target === el`, `.outside`→`el.contains(e.target)` [^8^]         | `el._x_refs` + memoized `_x_refs_proxy` [^9^]                                            |
| **htmx**           | qSA wrappers; id-first for preserve/OOB swaps [^5^]                                                                             | `closest()` + manual-loop fallback; `matches()` target filters [^5^]                          | `htmx-internal-data` expando [^5^]                                                       |
| **Stimulus**       | One scoped qSA + `matches()`, then MutationObserver-maintained sets [^6^][^7^]                                                  | Observer-driven — zero per-event matching                                                     | `Multimap matchesByElement` updated on mutation [^7^]                                    |
| **Turbo**          | Streams: gEBI(`target`) preferred, qSA for `targets`; idiomorph `idMap` from one `qSA('[id]')` [^20^]                           | Document observers + `matches("a[href]…")` filters [^20^]                                     | `SnapshotCache` LRU; `permanentElementMap` [^20^]                                        |
| **LWC**            | `lwc:ref` / `this.refs` O(1) map; scoped qS discouraged [^16^]                                                                  | Direct listeners                                                                              | Ref map measured ~2.5× over scoped qS, flat vs DOM size [^16^]                           |

### 6.1 Rule zero: the fastest query is the one never run

#### 6.1.1 Framework pattern: hold references from construction

The dominant pattern is reference capture at birth: if your library created the node, it already knows where the node is — storing that knowledge costs one assignment, rediscovering it costs a query forever. Svelte's compiled output is the purest form: one closure variable per node, created in `c()`, mutated in `p()`, never re-found [^17^]:

```js
function create_fragment(ctx) {
  let h1, t0, t1 // references born with the nodes
  return {
    c() {
      h1 = element('h1')
      t0 = text('Hello ')
      t1 = text(ctx[0])
    },
    p(ctx, dirty) {
      if (dirty & 1) set_data(t1, ctx[0])
    },
  } // no re-query, ever
}
```

The same idea appears at runtime in Vue's `setRef` (assigns the element the patcher already holds [^13^]) and React's commit-phase ref fulfillment from the fiber's `stateNode` — DOM access "without using any selector methods" [^15^]. The measured stakes: a held reference is ~13,700× cheaper than re-running qSA at 20K nodes, and 6.1× cheaper than even re-calling the O(1) `getElementsByClassName`, 100 reads deep (measured in this investigation's sandbox, Chrome 150).

Lit is the exception that proves the rule: it _does_ query, but scopes to `renderRoot` and offers `@query(selector, /*cache*/ true)`, added in lit-element 2.4.0 "as a performance optimization … when the node being queried will not change" [^10^][^12^]. The cache shipped a foot-gun — lit issue #2725: the memoized getter keyed on `undefined`, so a query issued before first render permanently cached `null`; the fix caches only once `hasUpdated` [^11^]. Generalized: **memoize query results only after the queried DOM can exist**.

#### 6.1.2 Caching pattern catalog

When references can't be born with their nodes, these are the stores libraries actually use:

| #   | Pattern                               | Canonical user                                                        | Cost profile / justification                                                                                                |
| --- | ------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| C1  | Reference capture at construction     | Svelte, Vue, React, Solid [^13^][^15^][^17^][^19^]                    | One assignment at birth; ~13,700× over repeated qSA @20K (this investigation's sandbox, Chrome 150)                         |
| C2  | Component-scoped root                 | Lit `renderRoot`, LWC `template`, Stimulus controller el [^10^][^16^] | Shrinks search space; prevents cross-component collisions                                                                   |
| C3  | Lazy getter + memoization             | Lit `@query(sel, true)` [^10^][^12^]                                  | One query per instance lifetime; guard on DOM existence (#2725) [^11^]                                                      |
| C4  | Populate-once name→element map        | Alpine `_x_refs`, LWC `this.refs` [^9^][^16^]                         | O(1) reads; LWC measured ~2.5× over scoped qS, flat vs DOM growth [^16^]                                                    |
| C5  | MutationObserver-maintained match set | Stimulus `SelectorObserver` [^6^][^7^]                                | Query cost paid once per _mutation_, zero per event                                                                         |
| C6  | WeakMap&lt;Element, State&gt;         | Framework internals, observer singletons [^22^]                       | O(1) + GC teardown; no iteration/`clear`; values must not strongly reference keys [^22^][^23^]                              |
| C7  | Expando / uid store                   | htmx `htmx-internal-data`, jQuery `dataPriv` [^4^][^5^]               | O(1); uid indirection dodges legacy circular-reference leaks [^4^]                                                          |
| C8  | Bounded LRU selector cache            | Sizzle `createCache()`, `cacheLength = 50` [^1^][^2^]                 | Hot selectors compiled once; bounded so selector churn can't OOM (`key + " "` dodges prototype collisions, #157) [^1^][^2^] |
| C9  | Id-keyed map                          | Turbo/idiomorph `idMap`, `target=` [^20^]                             | One `qSA('[id]')` walk turns O(n·m) morph matching into O(n) gEBI-class lookups [^20^]                                      |
| C10 | `data-*` attributes as lookup keys    | Stimulus, htmx [^5^][^6^][^25^]                                       | Enumerable via `attributeFilter`, collision-free with styling, self-describing                                              |

The generic WeakMap store (C6), for per-element metadata whose teardown you don't control [^22^]:

```js
const stateByRoot = new WeakMap()
export function getState(el) {
  let s = stateByRoot.get(el)
  if (!s) {
    s = createState()
    stateByRoot.set(el, s)
  }
  return s // element GC'd ⇒ state GC'd; no remove() bookkeeping
}
```

And the populate-once ref map (C4) — Alpine collects every `x-ref` during the _single_ init walk, then memoizes the merged proxy so `$refs` never re-walks [^9^]:

```js
magic('refs', el => {
  if (el._x_refs_proxy) return el._x_refs_proxy
  el._x_refs_proxy = mergeProxies(getArrayOfRefObject(el))
  return el._x_refs_proxy
})
```

### 6.2 When you must query: route like Sizzle

#### 6.2.1 rquickExpr fast paths, rightmost-token seeding, bounded LRU

Sizzle's entry function is a routing table. Before any parsing, a bare `#id`, `tag`, or `.class` selector short-circuits to the corresponding native primitive [^1^]:

```js
if (nodeType !== 11 && (match = rquickExpr.exec(selector))) {
  if ((m = match[1])) {
    // Sizzle("#ID")
    if (nodeType === 9) {
      if ((elem = context.getElementById(m))) {
        if (elem.id === m) {
          results.push(elem)
          return results
        } // name-vs-id guard
      } else {
        return results
      }
    }
  } else if (match[2]) {
    // Sizzle("TAG")
    push.apply(results, context.getElementsByTagName(selector))
    return results
  } else if ((m = match[3]) && support.getElementsByClassName) {
    // Sizzle(".CLASS")
    push.apply(results, context.getElementsByClassName(m))
    return results
  }
}
// no shortcut → qSA (if support.qsa && !rbuggyQSA.test(selector)); else compiled matcher
```

Two details matter as much as the routing. Fast paths are **guarded**: the id shortcut validates `elem.id === m` (legacy engines matched gEBI by name); the class shortcut is gated on a native-ness feature test [^1^]. When qSA fails, `select()` **seeds from the rightmost findable token** (ID > CLASS > TAG), filters that small seed set with a compiled matcher, and parks compiled matchers in a bounded LRU (`Expr.cacheLength = 50`) [^1^][^2^]. The measured case for routing: gEBTN holds ~11M ops/s flat while qSA('span') collapses 38×/273×/3292× by fixture size; gEBCN beats qSA('.cls') 57× @20K (this investigation's sandbox, Chrome 150). Even the id path — gap narrowed to 1.18× by the 2026 Blink SelectorQuery rewrite — skips selector parsing entirely.

The cautionary tale: jQuery 1.4.3 (2011) routed `.find(".class")` through qSA and collapsed Twitter's scroll performance; Resig's post-mortem re-established that simple native methods beat qSA for simple selectors, and the shortcuts were backported into Sizzle [^21^]. **qSA is the general fallback, never the default.**

#### 6.2.2 Scoping tricks

Element-rooted qSA has a correctness trap: `el.querySelectorAll("div span")` considers elements outside `el`. Sizzle's fix is Andrew Dupont's id-prefix hack — temporarily stamp the context with an expando id, rewrite each selector group as `#sizzle-xxx div span` (or `:scope` where supported), restore in a `finally` [^1^][^24^]:

```js
if (context.nodeType === 1 && selector.indexOf('>') !== 0 /* not :scope-safe */) {
  newContext = context.getAttribute('id')
  newSelector = selector.replace(/^/, '#' + (newContext || expando) + ' ')
  if (!newContext) context.setAttribute('id', expando) // restore in finally
}
```

Subtree narrowing as a _performance_ move carries a measured caveat: `document.querySelector('.rare-class')` beat `scopeRoot.querySelector` by 1.28× in this investigation's sandbox (Chrome 150) — element-level qS cannot use the document-level class cache. Scoping pays when document caches miss _and_ the subtree is small; it is an encapsulation tool (Lit scopes for isolation [^10^]) and a cache-miss optimization, not a universal speedup.

### 6.3 Event delegation: matches() vs closest() vs manual loop

#### 6.3.1 jQuery delegate model and the measured guard ladder

jQuery's delegated dispatch walks `event.target` up to the delegation target, calling `matchesSelector` per level, with results memoized per dispatch in `matchedSelectors[sel]` so duplicate selectors match once; selector validity is checked at bind time, failing fast instead of at event time [^4^]. The per-level test is where the measured guard ladder applies: `tagName === 'DIV'` at 23.97M ops/s, `classList.contains` at 0.63×, `matches('.cls')` at 0.44× (this investigation's sandbox, Chrome 150) — cheap guards precede selector evaluation:

```js
root.addEventListener('click', e => {
  for (let cur = e.target; cur !== root; cur = cur.parentNode) {
    if (cur.tagName !== 'DIV') continue // 1.00× — string identity, no machinery
    if (!cur.classList.contains('item')) continue // 0.63× — token-set lookup
    if (selMemo.get(sel) ?? cur.matches(sel)) {
      // 0.44× — selector engine, memoized per dispatch
      return handler.call(cur, e)
    }
  }
})
```

Honest caveat: all three exceed 10M ops/s, so the ladder matters only in genuinely hot dispatch loops — but a library's dispatch loop is by definition hot.

#### 6.3.2 htmx closest()/matches() with manual-loop fallback; Stimulus MutationObserver Multimap

htmx exposes both idioms: native `closest()` for ancestor matching with a manual parent-loop fallback for ancient engines, `matches()` for target filters (`target:` specs), and a recursive `getClosestMatch` predicate walk where per-level semantics are needed [^5^]. The measured verdict collapses the choice: native `closest()` is 4.1× faster than a manual `parentNode`+`classList` loop on a 50-level walk, and selector complexity is nearly irrelevant (0.99×) — the engine walks in C++ with no per-level JS↔C++ crossing (this investigation's sandbox, Chrome 150). **Delete hand-rolled ancestor loops** unless you need jQuery-style per-level accumulation or target engines without `closest`.

Stimulus removes per-event matching entirely: `SelectorObserver` performs one scoped qSA + `matches()` pass, then a MutationObserver maintains `matchesByElement` incrementally [^6^][^7^]. Matching is amortized to _mutation time_; events bind directly to already-known elements, so the per-event selector budget is zero. The cache _is_ the subscription result.

### 6.4 Live-collection discipline and mutation-time patterns

#### 6.4.1 Snapshot-before-mutate, cached-length loops, no gEBCN in mutation callbacks

A live HTMLCollection re-validates on access: reading `.length` per iteration costs 1.23× even in read-only loops, and mutating while iterating a live collection is a correctness bug [^27^]. The measured rules (Chrome 150 sandbox): cache the collection _and_ its length; choose qSA's static NodeList precisely when mutation during iteration is possible; never issue gEBCN inside an unbounded mutation callback; and navigate with `firstElementChild`/`nextElementSibling` (2.1×/2.3× over collection indexing) instead of building a collection to read one entry:

```js
// Mutate-safe: snapshot first, hoist length, iterate the static list
const list = root.querySelectorAll('.stale') // static NodeList — safe to mutate under it
for (let i = 0, n = list.length; i < n; i++) list[i].remove()

// Hot read loop over a live collection: hoist both collection and length
const items = root.getElementsByClassName('row')
for (let i = 0, n = items.length; i < n; i++) read(items[i])
```

#### 6.4.2 The twelve-bullet playbook

Distilled from two decades of library source and re-anchored to this investigation's Chrome-150 measurements:

1. **Don't query — hold references.** Closure vars, `vnode.el`, fiber `stateNode`, ref callbacks [^13^][^15^][^17^]. Held reference ≈ 13,700× over repeated qSA @20K (measured).
2. **Route by selector shape:** `#id`→gEBI, `tag`→gEBTN, `.class`→gEBCN, else qSA [^1^]. gEBTN beats qSA('span') 3,292× @20K; gEBCN beats qSA('.cls') 57× (measured).
3. **Guard fast paths for correctness** — Sizzle validates `elem.id === m`, feature-tests gEBCN [^1^]. Cheap routing is worthless if it lies on edge engines.
4. **Scope for encapsulation, not assumed speed** [^10^]. Scoped qS measured 1.28× _slower_ than document-level when the class cache hits; scope on cache misses + small subtrees only (measured, fixture-dependent).
5. **Memoize lazily, invalidate carefully.** Cache only after the DOM exists (Lit #2725's cached `null` [^11^]); bound selector caches (Sizzle LRU = 50 [^2^]).
6. **Key element metadata by WeakMap or expando** — O(1) with automatic GC teardown [^22^]. Holding any reference is the 6.1×-over-repeated-gEBCN win (measured).
7. **Use ids as internal lookup keys** — Turbo `target=`→gEBI, idiomorph idMap [^20^]. gEBI is O(1)-flat, skips selector parsing, 1.18× over qS('#id') (measured).
8. **Prefer `data-*` markers over classes for machine targeting** [^6^][^25^]. Enumerable via `attributeFilter`; qSA('[data-x]') beats gEBTN('\*')+manual filter 12–19× (measured).
9. **Seed narrow, never `qSA('*')`** — Sizzle's rightmost-token seeding minimizes candidates [^1^]. Selector complexity costs ≤3.5× constant factor; seed _size_ is the lever (measured).
10. **Delegate at a stable ancestor; call native `closest()`.** 4.1× over manual parentNode loops; guard ladder tagName (1.00×) → classList (0.63×) → matches (0.44×); memoize per dispatch (jQuery `matchedSelectors` [^4^]) (measured).
11. **Let observers pay query costs once.** Stimulus's MutationObserver-maintained Multimap does zero per-event matching [^7^]; mutations are rare relative to events.
12. **Snapshot before mutate; hoist `.length`; navigate with element accessors.** Cached-length loop 1.23× over uncached; `firstElementChild`/`nextElementSibling` 2.1×/2.3× over indexing; never XPath — 26× under qSA, ~70,000× under class lookup @20K (measured).
