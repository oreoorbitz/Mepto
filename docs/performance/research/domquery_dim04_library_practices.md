# Optimal DOM Element Querying — Dimension 04: How High-Performance Libraries Actually Do Element Lookup

_Research facet: battle-tested element-lookup patterns distilled from jQuery/Sizzle, modern frameworks (Vue, React, Solid, Preact, Svelte, Lit, Alpine), and HTML-driven libraries (htmx, Stimulus, Turbo). All sources accessed 2026-08-12._

---

## 1. Executive summary

Two decades of library engineering converge on one meta-principle: **the fastest element query is the one you never run.** Selector engines (jQuery/Sizzle, Zepto) invest thousands of lines in routing each query to the fastest _native_ path; frameworks (React, Vue, Svelte, Solid, Preact) eliminate runtime queries entirely by keeping direct element references from their render/patch pipeline; HTML-driven libraries (htmx, Stimulus, Turbo) accept querying as their model but amortize it via `closest()`/`matches()`-based event delegation, MutationObserver-maintained match sets, and id-keyed lookups. Caching (references, WeakMaps, per-element expando stores, LRU selector caches) is the universal bridge between the two camps.

---

## 2. Per-library lookup strategy summary table

| Library              | Primary lookup mechanism                                                                                                                                          | Fast paths / shortcuts                                                                                                                                    | Event delegation approach                                                                                                                                                                           | Reference caching                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **jQuery/Sizzle**    | `Sizzle(selector, context)`                                                                                                                                       | `rquickExpr` → `getElementById` / `getElementsByTagName` / `getElementsByClassName`; then qSA; else compiled matcher with rightmost-token seed [^1^][^2^] | `.on(events, selector, fn)` — one listener per element; handler walks `event.target` up calling `matchesSelector` with per-event memoization [^4^]                                                  | `dataPriv`/`dataUser` expando cache (element→uid→object); Sizzle LRU caches for tokenized/compiled selectors [^1^][^4^]          |
| **Zepto**            | `zepto.qsa(element, selector)`                                                                                                                                    | Same 3-way shortcut (id/class/tag regex → native method) then `querySelectorAll` — ~15 lines vs Sizzle's ~2000 [^3^]                                      | jQuery-compatible `on/off` with selector filter                                                                                                                                                     | None (minimalist)                                                                                                                |
| **Vue 3**            | **None at runtime** — vnodes hold `el`; template refs assigned directly during patch (`setRef`) [^13^]                                                            | N/A (no querying)                                                                                                                                         | Direct listeners via patched props; no selector delegation needed                                                                                                                                   | Template refs (`ref="x"`, `useTemplateRef`) populated at mount; docs/reviewers forbid `document.querySelector` [^13^][^14^]      |
| **React / Preact**   | **None at runtime** — refs assigned during commit phase from fiber/vnode `stateNode`                                                                              | N/A                                                                                                                                                       | React 17+: synthetic listeners at root container, dispatch via fiber tree (no DOM selector matching); Preact: direct listeners                                                                      | `useRef` / callback refs store the node itself [^15^]                                                                            |
| **Svelte**           | **None** — compiler emits closure variables (`let h1, t0, t1…`) holding each created node; updates mutate them directly [^17^]                                    | N/A                                                                                                                                                       | `listen_dev(el, ...)` direct binding per node at mount                                                                                                                                              | Compiled-in references; community guidance: avoid `querySelector`, use `bind:this` [^17^][^18^]                                  |
| **Solid**            | **None** — JSX compiles to `document.createElement`/template-clone with direct variable references; fine-grained updates address exact nodes [^19^]               | N/A                                                                                                                                                       | Delegated for a few events, otherwise direct listeners                                                                                                                                              | `ref={el => …}` callback refs [^19^]                                                                                             |
| **Lit**              | Scoped `this.renderRoot.querySelector(selector)` inside shadow root via `@query`/`@queryAll` getters [^10^]                                                       | Always scoped to `renderRoot` (never `document`)                                                                                                          | Standard `addEventListener`; `@event` bindings in templates                                                                                                                                         | `@query(sel, /*cache*/ true)` memoizes result on the instance; `@queryAsync` defers until `updateComplete` [^10^][^11^][^12^]    |
| **Alpine**           | Tree walk at init (`initTree`) registers directives; `$refs` collected once per component                                                                         | x-ref registration during single walk — no re-querying                                                                                                    | `x-on` attaches _direct_ listeners; modifiers implement filtering (`.self`: `e.target === el`; `.outside`: document listener + `el.contains(e.target)`) [^8^]                                       | `el._x_refs` object on component root; `$refs` magic memoizes merged proxy (`_x_refs_proxy`) [^9^]                               |
| **htmx**             | `qSA`/`qS` wrappers (`find`/`findAll`) + `querySelectorAllExt` supporting `closest <sel>` / `find <sel>` pseudo-prefixes                                          | `handlePreservedElements` uses `getElementById`; `closest()` wraps native `Element.closest` with manual parent-loop fallback [^5^]                        | Core is closest/matches-driven: `getClosestMatch` walks ancestors with a predicate; trigger `target:` filter via `matches(evt.target, sel)`; one listener per hx element (not root-delegated) [^5^] | `htmx-internal-data` expando object per element (listeners, trigger specs) [^5^]                                                 |
| **Stimulus**         | `SelectorObserver`: initial `tree.querySelectorAll(selector)` + `element.matches(selector)` for the root, then MutationObserver-driven incremental matching [^7^] | Attribute observer uses `hasAttribute` + qSA of `[attr]` only [^6^]                                                                                       | Actions (`data-action="click->ctrl#m"`) bind directly; matching is observer-driven, not per-event selector matching                                                                                 | `Multimap matchesByElement` caches current matches; updated on mutation instead of re-querying [^7^]                             |
| **Turbo**            | Streams: `targetElementsById` → `ownerDocument.getElementById(target)`; `targetElementsByQuery` → qSA; frames/visits resolved by `getElementById` [^20^]          | Idiomorph morphing builds an **idMap** from `querySelectorAll("[id]")` walks to match nodes by id [^20^]                                                  | Global `LinkClickObserver`/`FormSubmitObserver` on document/window with `matches("a[href]…")` / `closest`-style filtering [^20^]                                                                    | `SnapshotCache` (LRU of page snapshots); `permanentElementMap` id→[old,new] pairs [^20^]                                         |
| **LWC (Salesforce)** | `this.template.querySelector` (scoped) — discouraged                                                                                                              | N/A                                                                                                                                                       | Direct listeners                                                                                                                                                                                    | `lwc:ref` template refs — O(1) map; measured ~2.5× faster than scoped `querySelector` and constant regardless of DOM size [^16^] |

---

## 3. Sizzle/jQuery: the canonical selector-engine optimization stack

### 3.1 The famous fast paths

Sizzle's entry function short-circuits before any parsing when the selector matches `rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/` (a bare `#id`, `tag`, or `.class`):

```js
// github.com/jquery/sizzle — src/sizzle.js, function Sizzle()
if (nodeType !== 11 && (match = rquickExpr.exec(selector))) {
  // Speed-up: Sizzle("#ID")
  if ((m = match[1])) {
    if (nodeType === 9) {
      if ((elem = context.getElementById(m))) {
        if (elem.id === m) {
          results.push(elem)
          return results
        } // name-vs-id guard
      } else {
        return results
      }
    } else {
      /* element context: ownerDocument.getElementById + contains() check */
    }
    // Speed-up: Sizzle("TAG")
  } else if (match[2]) {
    push.apply(results, context.getElementsByTagName(selector))
    return results
    // Speed-up: Sizzle(".CLASS")
  } else if ((m = match[3]) && support.getElementsByClassName && context.getElementsByClassName) {
    push.apply(results, context.getElementsByClassName(m))
    return results
  }
}
```

Key details visible in source [^1^]:

- The ID shortcut **validates `elem.id === m`** because old IE/Opera/WebKit matched `getElementById` by _name_ as well; and checks `elem.parentNode` for Blackberry 4.6 detached-node quirks. Fast paths are wrapped in correctness guards, not blind trust.
- `.class` only shortcuts when `support.getElementsByClassName` (a native-ness feature test, `rnative.test`) passes.
- If no shortcut hits, Sizzle delegates to **`querySelectorAll` whenever `support.qsa` and the selector isn't in `rbuggyQSA`** (a regex of browser-specific qSA bugs assembled at load time). Known qSA failures are also memoized per-selector in `nonnativeSelectorCache` so a throwing selector is never retried natively [^1^].
- **The element-rooted qSA scoping hack** (Andrew Dupont's technique): `el.querySelectorAll("div span")` wrongly considers elements outside `el`. Sizzle prefixes each selector group with the context's id (`#sizzle-xxx div span`) — or `:scope` where supported — temporarily `setAttribute("id", expando)` and removing it in a `finally` block [^1^].

### 3.2 Right-to-left seed selection & compilation

When qSA can't be used, `select()` tokenizes and then **seeds from the rightmost findable token**: it walks tokens right-to-left until it finds one with an `Expr.find` implementation (ID > CLASS > TAG), calls the native method for that token only, then filters the (much smaller) seed set with a compiled matcher [^1^]. A leading ID additionally _narrows context_ before seeding ("Reduce context if the leading compound selector is an ID"). The 2012 rewrite compiled each selector into a single composed function so "the possible set of elements need only be checked once," with an LRU `compilerCache` (default `Expr.cacheLength = 50`) so hot selectors aren't recompiled [^2^][^1^]. `createCache()` is a tiny bounded LRU keyed by `key + " "` (space suffix avoids prototype collisions — Sizzle issue #157) [^1^].

### 3.3 Why jQuery wraps `find` with these shortcuts — the Twitter incident

jQuery 1.4.3 switched contextual queries (`.find(".class")`) to native qSA. Twitter's scroll performance collapsed; reverting to jQuery 1.4.2 fixed it. John Resig's post-mortem: `getElementsByClassName`/`getElementsByTagName` are still ~0.5–2× faster than qSA for the simple cases, so jQuery backported shortcuts into Sizzle — `Sizzle("div")`, `Sizzle(".foo")`, `Sizzle("#id")` skip qSA entirely [^21^]. Lesson institutionalized in the engine ever since: **always try the cheapest native primitive first; qSA is the general fallback, not the default.**

### 3.4 jQuery event delegation internals

`jQuery.event.add` stores handler queues per element in `dataPriv`; delegated handlers are spliced to the front (`handlers.delegateCount++`). On dispatch, `jQuery.event.handlers()` [^4^]:

```js
for ( ; cur !== this; cur = cur.parentNode || this ) {
    if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
        matchedHandlers = []; matchedSelectors = {};
        for ( i = 0; i < delegateCount; i++ ) {
            handleObj = handlers[ i ];
            sel = handleObj.selector + " ";
            if ( matchedSelectors[ sel ] === undefined ) {
                matchedSelectors[ sel ] = handleObj.needsContext ?
                    jQuery( sel, this ).index( cur ) > -1 :
                    jQuery.find( sel, this, null, [ cur ] ).length; // matchesSelector under the hood
            }
            if ( matchedSelectors[ sel ] ) matchedHandlers.push( handleObj );
        }
        …
    }
}
```

Notable: (a) it's a **manual ancestor walk calling `matchesSelector` per level**, not `event.target.closest(selector)` — chosen for legacy-browser semantics (stops at the delegation target, handles disabled elements, document-level delegation edge cases); (b) results are **memoized per dispatch** (`matchedSelectors[sel]`) so duplicate selectors across handlers cost one match each; (c) selector validity is checked at _bind time_ (`jQuery.find.matchesSelector(documentElement, selector)`), failing fast instead of at event time [^4^].

---

## 4. Modern frameworks: query avoidance by construction

- **Vue 3** — The renderer patches elements it created and stores them on `vnode.el`; template refs are resolved by `setRef` in `packages/runtime-core/src/rendererTemplateRef.ts`, which assigns the already-known element/component instance into the ref — zero DOM searching [^13^]. Community lint rules treat `document.querySelector` in a component as a defect ("breaks component encapsulation") [^14^].
- **React** — Refs are fulfilled during the commit phase from the fiber's `stateNode`; React docs frame refs as "accessing DOM elements **without using any selector methods**" [^15^]. Event handling is a root listener + fiber-tree dispatch, so no selector matching occurs per event either.
- **Svelte** — The compiler emits one closure variable per node (`let h1, t0, t1 …`); `create_fragment`'s `c()` creates them and `p()` writes to them directly [^17^]. Idiomatic guidance: "avoid `querySelector`… first try `bind:this` or an action" [^18^].
- **Solid** — JSX compiles to direct DOM operations; "when state changes, only the exact DOM nodes that depend on that state update." Refs are plain variables/callbacks [^19^].
- **Lit** — The exception that proves the rule: Lit _does_ query, but (a) always scoped to `this.renderRoot` (shadow root), never `document`; (b) exposed as getters so the query site is declarative; (c) offers `cache: true` to memoize, explicitly documented "as a performance optimization … when the node being queried will not change" [^10^][^12^]. The cache flag was added in lit-element 2.4.0 (PR #1013) [^12^].

---

## 5. Event delegation: `closest()` vs `matches()` vs manual loop — what the big libs use

| Approach                                                               | Used by                                                                                                                                                                                                                                  | Trade-off                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Root listener + **manual ancestor walk + `matchesSelector` per level** | **jQuery** `.on(sel)` [^4^]; **htmx** `getClosestMatch` (recursive predicate walk) and `closest()` fallback loop [^5^]                                                                                                                   | Full control: stop conditions, per-level handler accumulation, works when `closest()` is unavailable/insufficient; more code |
| Root/stable-parent listener + **`event.target.closest(sel)`**          | Idiomatic htmx/vanilla patterns [^5^][^26^]; Turbo's `q(e, selector)` helper recurses `closest()` across shadow boundaries [^20^]                                                                                                        | Concise, native, fast for "find nearest ancestor"; only answers the nearest match                                            |
| **Per-event `matches()` filter**                                       | htmx `target:` trigger modifier (`matches(evt.target, triggerSpec.target)`), `shouldCancel`, form detection [^5^]; Turbo link interception (`t.matches("a[href]…")`) [^20^]; Stimulus `matchElement` (`element.matches(selector)`) [^7^] | Cheapest single-node check; ideal when the target itself must match                                                          |
| **Direct listeners + equality test**                                   | Alpine: `.self` → `e.target === el`; `.outside` → document listener + `el.contains(e.target)` [^8^]                                                                                                                                      | No selector engine involvement at all                                                                                        |
| **Observer-driven matching (no per-event selector work)**              | Stimulus: MutationObserver + one-time `matchElementsInTree` (qSA + `matches`); match state cached in `Multimap` [^6^][^7^]                                                                                                               | Amortizes matching to mutation time; events bind directly to already-known elements                                          |

Practical synthesis: `closest()` is the default choice for click delegation (one native call, engine-optimized); `matches()` when filtering the exact target; the manual loop only when you need per-level semantics jQuery-style (multiple handlers matched along the bubble path).

---

## 6. Caching pattern catalog (with snippets)

**C1. Reference capture at construction / render time (the dominant pattern).**
Svelte's compiled output is the purest form [^17^]:

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

Vue/React refs and `this.el`/`this.root` in component classes are the same idea at runtime [^13^][^15^].

**C2. Component-scoped root + scoped queries.** Lit queries `this.renderRoot`, not `document` [^10^]; Stimulus scopes everything to the controller element; LWC scopes to `this.template` and explicitly forbids `document` querying [^16^]. Scoping both shrinks the search space and prevents cross-component collisions.

**C3. Lazy getter with memoization.** Lit `@query(sel, true)` [^10^]:

```js
descriptor.get = function () {
  if (this[key] === undefined) {
    this[key] = this.renderRoot?.querySelector(selector) ?? null
  }
  return this[key]
}
```

Caveat discovered in production: the cache key checks `undefined`, so a pre-render `null` got permanently cached (lit issues #2725, #4237) — fixed by only caching when `hasUpdated` / coalescing `null` [^11^]. **Lesson: memoize query results only after the queried DOM can exist.**

**C4. Populate-once name→element maps.** Alpine registers every `x-ref` into `el._x_refs` during the single init walk; the `$refs` magic then returns a memoized merged proxy [^9^]:

```js
magic('refs', el => {
  if (el._x_refs_proxy) return el._x_refs_proxy
  el._x_refs_proxy = mergeProxies(getArrayOfRefObject(el))
  return el._x_refs_proxy
})
```

LWC's `lwc:ref`/`this.refs` is the same pattern framework-provided: O(1) vs querySelector's O(n), ~22ms vs ~55ms over 100k accesses, and querySelector degrades further (75ms) as the DOM grows [^16^].

**C5. MutationObserver-maintained caches.** Stimulus never re-queries the whole tree: `ElementObserver` fires `matchElementsInTree` only on added subtrees, and removals/attribute changes update `matchesByElement` incrementally [^6^][^7^]. The cache _is_ the subscription result.

**C6. WeakMap<Element, State>.** The idiomatic element-metadata store when explicit teardown is hard: keys are weakly held, so removed elements' state is GC'd with no leak. Canonical form [^22^]:

```js
const stateByRoot = new WeakMap()
export function getState(el) {
  let s = stateByRoot.get(el)
  if (!s) {
    s = createState()
    stateByRoot.set(el, s)
  }
  return s
}
```

Used for observer singletons keyed by root element [^22^] and pervasively in framework internals (e.g., Vue's reactivity `reactiveMap: WeakMap<Target, …>`). Caveats: no iteration/`size`/`clear`; leaks if the _value_ strongly references the key; don't cache `null`-like sentinels [^22^][^23^].

**C7. Expando property stores.** htmx keeps per-element state on the element itself (`elt['htmx-internal-data']`) [^5^]; jQuery historically avoided expandos via a uid→cache-object map (`dataPriv`) to dodge IE circular-reference leaks while still giving O(1) element→data lookup [^4^].

**C8. Bounded LRU selector caches.** Sizzle's `createCache()` (token/compile/class/nonnative caches, default length 50) — caches are _bounded_ precisely "so you don't get out-of-memory errors when using a lot of different selectors" [^1^][^2^].

**C9. Id-keyed maps for morphing.** Turbo/idiomorph builds `idMap` from `querySelectorAll("[id]")` over both trees once per morph, then all node matching is `map.get(id)` — turning O(n·m) pairwise comparison into O(n) id lookups [^20^]. Turbo Streams prefer `getElementById` (`target`) over qSA (`targets`) [^20^]; htmx's `hx-preserve` and `oobSwap` similarly resolve by id first [^5^].

**C10. Dataset attributes vs classes as lookup keys.** Stimulus/Stimulus-style observers key on `[data-controller]`, `[data-action]`, `data-*-target` attributes [^6^]; htmx keys on `hx-*`/`data-hx-*` [^5^]. Attributes are chosen over classes because they're self-documenting, enumerable by observers (`attributeFilter`), and don't collide with styling; engines match `[attr]` quickly. Guidance from library authors: prefer narrow attribute selectors and `data-*` markers over broad class queries [^25^].

---

## 7. Real-world performance incidents & PRs

1. **Twitter × jQuery 1.4.3 (2011)** — switching `.find(".class")` to qSA regressed scroll perf sitewide; Sizzle gained the class/tag/id shortcuts that bypass qSA. John Resig's write-up is the definitive case that native-simple-methods beat qSA for simple selectors [^21^].
2. **jQuery 1.8 "New Sizzle" (2012)** — compiled selector functions + bounded compiler cache; explicit statement that ID/TAG/CLASS shortcuts "are still the fastest selectors" and unchanged [^2^].
3. **Sizzle PR #225** — `sortInput = null` after `uniqueSort` to release retained node arrays (memory hygiene in caches) [^1^].
4. **lit-element PR #1013 (2.4.0, 2020)** — added `cache: boolean` to `@query` "as a performance optimization for properties whose queried element is not expected to change" [^12^].
5. **lit issue #2725 / #4237** — memoized-query foot-gun: cached `null` before first render never revalidated; led to guarding cache on `hasUpdated` [^11^].
6. **The element-rooted qSA scoping bug & Andrew Dupont's id-prefix workaround**, adopted by jQuery 2.1.1/Sizzle (and still present, now with `:scope` preference) — a correctness fix that also defines how all element-scoped qSA calls should be made [^1^][^24^].
7. **Live-collection loop traps** — repeated documentation/issue evidence that iterating `getElementsByClassName` results while reading `.length` each turn re-runs the document query per access; the fix (cache `length`, or convert to static list) is standard library-author folklore, and qSA's _static_ NodeList is chosen precisely when mutation during iteration is possible [^27^].
8. **LWC refs vs querySelector measurements** — Salesforce shipping `lwc:ref` (Spring '23) specifically to replace runtime `querySelector` with an O(1) map, with community benchmarks ~2.5–3.5× faster [^16^].

---

## 8. Guidance from performance authorities

- **web.dev / Chrome DevRel, "Avoid large, complex layouts and layout thrashing"** — batch DOM reads before writes; reading geometry after a style mutation forces synchronous layout; recommends FastDOM-style scheduling [^28^].
- **Wilson Page, "Preventing layout thrashing"** — the original write-up; rAF-batched reads/writes made his demo ~96% faster; birthed FastDOM (`fastdom.read`/`fastdom.write`) [^29^].
- **Paul Irish, "What forces layout/reflow"** — canonical list of query/measurement APIs (`offsetWidth`, `getBoundingClientRect`, …) that force layout; library authors audit hot paths against it [^30^].
- **Firefox front-end perf best practices** — geometry queries are only expensive _after writes_; concentrate writes in rAF so reads stay cheap [^31^].
- **jQuery blog best practices (post-Twitter)** — cache jQuery objects, prefer id selectors, scope queries under a known parent [^21^]; community cheat-sheets ("You Don't Need jQuery": "querySelector/querySelectorAll are quite SLOW, thus try getElementById/getElementsByClassName first") [^32^].
- Modern nuance: per-call differences are sub-microsecond on typical pages; **the real waste is re-querying in hot paths (event handlers, per-frame loops) and forced synchronous layout**, not the method choice itself [^33^].

---

## 9. Distilled playbook for library authors

1. **Don't query — keep references.** If your library created the node, store it (closure var, `this.el`, vnode/fiber `.el`, ref callback). This is why React/Vue/Svelte/Solid never call qS/qSA internally.
2. **If you must query, route by selector shape:** `#id` → `getElementById`; single class/tag → `getElementsByClassName`/`getElementsByTagName`; everything else → qSA. Guard fast paths with correctness checks (Sizzle's `elem.id === m`).
3. **Scope every query** to a component root (`this.root.querySelector`, shadow `renderRoot`), never `document`, unless global by design.
4. **Memoize lazily, invalidate carefully** — cache only after the DOM exists (Lit #2725), bound your caches (Sizzle LRU=50), and prefer `WeakMap<Element, State>` for element-keyed metadata so teardown is automatic.
5. **Delegate events at a stable ancestor**; use `event.target.closest(sel)` for ancestor matching, `matches()` for target filtering, per-dispatch memoization if matching multiple selectors (jQuery's `matchedSelectors`).
6. **Let observers pay query costs once.** For dynamic DOM, a MutationObserver (or IntersectionObserver) maintaining a live match-set beats repeated qSA (Stimulus `SelectorObserver`).
7. **Use ids as internal lookup keys.** Id → element maps (getElementById, idiomorph idMap, Turbo `target=`) are O(1) engine lookups; qSA is the fallback for `targets=`-style multi-match.
8. **Prefer `data-*` attributes over classes for machine targeting** — enumerable via `attributeFilter`, collision-free, self-describing.
9. **Never `qSA('*')` seed when a narrower seed exists**; Sizzle's right-to-left seeding exists precisely to minimize the candidate set.
10. **Separate layout reads from writes**; treat `offsetWidth`/`getBoundingClientRect` in a query-adjacent hot path as a forced-layout bug (web.dev, Wilson Page, Paul Irish list).
11. **Choose static vs live collections deliberately**: static NodeList (qSA) when mutating during iteration; live HTMLCollection only when you genuinely want auto-updates — and hoist `.length` out of loops.
12. **Measure on real DOM sizes**; per-call selector cost is usually trivial — the failure mode is N queries × per-frame/per-event frequency.

---

## Sources (all accessed 2026-08-12)

1. jQuery/Sizzle source — `Sizzle()` entry, `rquickExpr` shortcuts, qSA delegation, `:scope`/id-prefix hack, `select()` right-to-left seeding, `createCache()`, PR #225 note: https://github.com/jquery/sizzle/blob/main/src/sizzle.js
2. "The New Sizzle" (jQuery blog, 2012) — compiled selector functions, cache, shortcut policy: https://blog.jquery.com/2012/07/04/the-new-sizzle/
3. Zepto `zepto.qsa` fast-path implementation (id/class/tag regex routing), quoted and analyzed: https://www.cnblogs.com/aaronjs/p/3847964.html and https://github.com/madrobby/zepto
4. jQuery event system source — `jQuery.event.add/handlers/dispatch`, delegation walk + `matchedSelectors` memoization, `dataPriv`: https://github.com/jquery/jquery/blob/main/src/event.js
5. htmx 1.x source — `matches()`, `closest()` + fallback loop, `getClosestMatch`, `querySelectorAllExt`, `findElementsToProcess`, `getInternalData`, `handlePreservedElements`/`oobSwap` id lookups: https://github.com/bigskysoftware/htmx (src/htmx.js; v1.7.0 source mirrored at https://nest.pijul.com/christophersw/MemoryLane/changes/PJDTNLZMD5A5CDNA73435G72AJLAATL3OIFWZFCYLDSICZ4HGL7AC)
6. Stimulus `AttributeObserver` — `hasAttribute` matching + scoped qSA: https://github.com/hotwired/stimulus/blob/main/src/mutation-observers/attribute_observer.ts
7. Stimulus `SelectorObserver` — `element.matches`, `matchElementsInTree` qSA, `Multimap matchesByElement`: https://github.com/hotwired/stimulus/blob/main/src/mutation-observers/selector_observer.ts
8. Alpine `on` utility — direct listeners, `.self`/`.outside` modifiers: https://github.com/alpinejs/alpine/blob/main/packages/alpinejs/src/utils/on.js
9. Alpine `$refs` magic — `_x_refs` / `_x_refs_proxy` memoization: https://github.com/alpinejs/alpine/blob/main/packages/alpinejs/src/magics/$refs.js
10. Lit `@query` decorator source — `renderRoot.querySelector` getter + cache flag: https://github.com/lit/lit/blob/main/packages/reactive-element/src/decorators/query.ts
11. lit issue #2725 — cached `null` bug in `@query(cache)`: https://github.com/lit/lit/issues/2725 ; related: https://github.com/lit/lit/issues/4237
12. lit-element CHANGELOG 2.4.0 — `cache` argument added to `@query` (PR #1013): https://github.com/lit/lit/blob/main/packages/lit-element/CHANGELOG.md ; API docs: https://lit.dev/docs/api/decorators/
13. Vue 3 `rendererTemplateRef.ts` (`setRef` — direct assignment, no querying): https://github.com/vuejs/core/blob/main/packages/runtime-core/src/rendererTemplateRef.ts
14. Vue review guidance — raw `document.querySelector` flagged as high-priority defect: https://github.com/affaan-m/everything-claude-code/blob/main/agents/vue-reviewer.md ; Vue refs explainer: https://blog.logrocket.com/understanding-vue-refs/
15. React refs overview — DOM access without selector methods: https://www.memberstack.com/blog/react-refs
16. Salesforce LWC Template Refs — "without the need to use any querySelector": https://developer.salesforce.com/blogs/2023/01/lwc-enhancements-for-developers-learn-moar-spring-23 ; refs vs querySelector benchmark (O(1) vs O(n), 22ms vs 55–75ms): https://beyondthecloud.dev/blog/refs-vs-query-selector-in-lwc
17. Svelte compiled output walkthrough (direct node variables): https://lihautan.com/compile-svelte-in-your-head-part-1
18. Svelte component guidance — avoid querySelector, prefer `bind:this`/actions: https://geoffrich.net/posts/clean-component-tips/
19. Solid.js fine-grained reactivity — compiled direct DOM references, refs: https://skarif.dev/blog/2024/solidjs-fine-grained-reactivity-without-virtual-dom
20. Turbo source — `StreamActions`, `targetElementsById` (`getElementById`) vs `targetElementsByQuery` (qSA), idiomorph `idMap` from `querySelectorAll("[id]")`: https://github.com/hotwired/turbo (src/core/streams/stream_actions.js; src/elements/turbo_stream_element.js; diff evidence: https://my.diffend.io/gems/turbo-rails/prev/0.5.12)
21. John Resig, "Learning from Twitter" — jQuery 1.4.3 qSA regression, Sizzle shortcut backport: https://johnresig.com/blog/learning-from-twitter/
22. WeakMap observer-singleton + element-metadata caching patterns: https://yceffort.kr/en/2026/01/intersection-observer-singleton-weakmap
23. WeakMap usage/leak caveats: https://buglyst.com/learn/guides/javascript-weakmap-memory-leak-debug
24. Element-rooted qSA scoping bug & id-prefix workaround (Andrew Dupont technique): https://www.cnblogs.com/dolphinX/p/3354318.html
25. htmx v4 docs/migration notes — narrow selectors, `data-*` markers: https://vibetuner.alltuner.com/htmx-migration/
26. Event-delegation idiom (`closest` + `matches`) in htmx-style architectures: https://dataos.software/book.html
27. Live HTMLCollection vs static NodeList loop-cost analysis: https://zhuanlan.zhihu.com/p/156011481
28. web.dev — "Avoid large, complex layouts and layout thrashing": https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
29. Wilson Page — "Preventing 'layout thrashing'" (FastDOM origin): https://wilsonpage.uk/preventing-layout-thrashing/
30. Paul Irish — "What forces layout/reflow": https://gist.github.com/paulirish/5d52fb081b3570c81e3a
31. Firefox front-end performance best practices — cheap vs expensive geometry queries: https://firefox-source-docs.mozilla.org/performance/bestpractices.html
32. You Don't Need jQuery — native-method-first querying guidance: https://github.com/camsong/You-Dont-Need-jQuery
33. querySelector vs getElementById — modern perspective (cache references; hot loops only): https://www.greatfrontend.com/questions/quiz/explain-the-difference-between-documentqueryselector-and-documentgetelementbyid
