## 1. The Mental Model: Where the Time Actually Goes

Every unit of time a DOM query costs is spent in one of four places: crossing from JavaScript into the engine's DOM implementation, turning a string into a parsed selector, walking (or not walking) the tree, and allocating the objects handed back to script. This chapter builds that cost model from specification semantics — what each API is _required_ to do; engine internals (Chapter 2) and measured numbers (Chapter 3) fill in the constants.

### 1.1 The complete API inventory (24 APIs)

#### 1.1.1 Full inventory table: API | return type | live/static | scope | shadow-aware | O-class

The platform exposes 24 distinct lookup/traversal surfaces, each differing in return type, liveness, scope, or shadow behavior.

| API                                                                                                                                | Returns                                    | Live / static                                     | Scope                                | Shadow-aware                         | O-class                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------ | ------------------------------------ | ----------------------------------------------- |
| `document.getElementById(id)`                                                                                                      | `Element \| null`                          | n/a (single ref)                                  | Whole document tree                  | Per-tree only (also on `ShadowRoot`) | ~O(1) hash lookup                               |
| `getElementsByClassName(names)`                                                                                                    | `HTMLCollection`                           | **Live**                                          | Descendants of receiver              | No boundary crossing                 | Lazy view; indexed re-query per access          |
| `getElementsByTagName(name)` / `…TagNameNS(ns, name)`                                                                              | `HTMLCollection`                           | **Live**                                          | Descendants of receiver              | No                                   | Lazy view; tag-indexed                          |
| `document.getElementsByName(name)`                                                                                                 | `NodeList`                                 | **Live**                                          | Document only                        | No                                   | Lazy view; same-object caching permitted        |
| `ParentNode.querySelector(sel)`                                                                                                    | `Element \| null`                          | Static result                                     | Descendants of receiver's root       | Inside a shadow root, never across   | O(candidates), early-exit on first match        |
| `ParentNode.querySelectorAll(sel)`                                                                                                 | `NodeList`                                 | **Static**                                        | Descendants of receiver's root       | Same                                 | O(candidates × selector cost) + full allocation |
| `Element.matches(sel)`                                                                                                             | `boolean`                                  | n/a                                               | The element itself, against its root | Works inside shadow trees            | O(selector) single-element match                |
| `Element.closest(sel)`                                                                                                             | `Element \| null`                          | n/a                                               | Self-inclusive ancestor walk         | Stops at shadow boundary             | O(depth × selector)                             |
| `Node.childNodes`                                                                                                                  | `NodeList`                                 | **Live**                                          | Direct children (incl. text)         | Light DOM only                       | O(1) view; per-access validation                |
| `ParentNode.children`                                                                                                              | `HTMLCollection`                           | **Live**                                          | Direct element children              | Light DOM only                       | O(1) view; per-access validation                |
| `firstElementChild` / `lastElementChild` / `nextElementSibling` / `previousElementSibling` / `parentElement` / `childElementCount` | `Element?` / number                        | Live properties, per access                       | Local navigation                     | No boundary crossing                 | O(1)–O(siblings skipped) per access             |
| Legacy collections (`document.forms/images/links/anchors/scripts`, `form.elements`, `select.options`, `table.rows`, `row.cells` …) | `HTMLCollection`                           | **Live**                                          | Document or owning element           | No                                   | Lazy views                                      |
| `document.all`                                                                                                                     | `HTMLAllCollection`                        | Live (legacy quirk)                               | Whole document                       | No                                   | Lazy view; avoid                                |
| `window[name]` (named access)                                                                                                      | `Element \| WindowProxy \| HTMLCollection` | Implicit query per access                         | Matching `id` / named elements       | No                                   | Hidden search on every property read            |
| `document.createTreeWalker(…)`                                                                                                     | `TreeWalker` cursor                        | Position pointer, **not** mutation-adjusted       | One subtree                          | Cannot enter shadow roots            | O(1) amortized per step; no result allocation   |
| `document.createNodeIterator(…)`                                                                                                   | `NodeIterator`                             | **Mutation-adjusted** (pre-remove steps)          | One subtree                          | Cannot enter shadow roots            | O(1) amortized per step                         |
| `document.evaluate(…)` (XPath 1.0)                                                                                                 | `XPathResult`                              | Snapshot static; iterator invalidated by mutation | Context-node subtree                 | No                                   | O(subtree) + result allocation                  |
| `document.elementFromPoint(x, y)` / `elementsFromPoint(x, y)`                                                                      | `Element?` / `Element[]`                   | n/a (hit test at call time)                       | Viewport hit test                    | Retargeted to host                   | O(hit test), layout-dependent                   |
| `document.caretPositionFromPoint(x, y, {shadowRoots})`                                                                             | `CaretPosition?`                           | n/a                                               | Document; opt-in shadow piercing     | Only via explicit `{shadowRoots}`    | O(hit test)                                     |
| `DocumentOrShadowRoot.activeElement`                                                                                               | `Element?`                                 | n/a (live property)                               | Focused element                      | Host-retargeted                      | O(shadow depth) retarget                        |
| `Node.getRootNode({composed})`                                                                                                     | `Node`                                     | n/a                                               | Which tree the node lives in         | `composed:true` pierces upward       | O(shadow depth)                                 |
| `Event.composedPath()`                                                                                                             | `EventTarget[]`                            | n/a                                               | Full propagation path                | Open shadow trees only               | O(path length) + array allocation               |
| `Event.target`                                                                                                                     | `EventTarget?`                             | n/a                                               | Dispatch target                      | Retargeted outside originating tree  | O(1) per retarget step                          |

(Counting `…TagNameNS` and the `*FromPoint` families separately yields 24.) The mixins predict shadow behavior: `DocumentOrShadowRoot` carries ID lookup and `activeElement`; `ParentNode` — implemented by `Document`, `DocumentFragment`, `Element`, `ShadowRoot` — carries `querySelector(All)`, `children`, and the element-child accessors, which is why `shadowRoot.querySelectorAll(...)` works but no document-level call reaches _into_ a shadow tree.[^21^]

#### 1.1.2 The four cost layers of every DOM query

Every query pays some subset of four costs; separating them predicts the winner before benchmarking.

**Layer 1 — WebIDL binding crossing.** Each property read or method call crosses from the JS heap into the engine's C++ DOM through generated WebIDL bindings: argument conversion, this-value checks, a round trip per getter. Hence `for (i = 0; i < list.length; i++)` is never free even with cached data — `list.length` is a binding call, not a field read. Implicit lookups like `window[name]` are doubly bad: binding crossing _plus_ an unrequested query, which the HTML Standard deprecates in favor of explicit `getElementById`/`querySelector`.[^23^]

**Layer 2 — String atomization and selector parse.** Selector-based APIs must _parse a selector_ before matching; scope-match throws `SyntaxError` `DOMException` on failure.[^21^] Parse is pure overhead for one-off calls and the entire differential between `querySelector('#a')` and `getElementById('a')` for a known ID — the latter takes a raw string, never parses, never throws, needs no `CSS.escape()`.[^5^][^29^][^3^] `qS`/`qSA`/`matches`/`closest` all share the throwing parse; validate once, outside hot paths.[^3^]

**Layer 3 — Tree traversal strategy.** The dominant term, spec-pinned: Selectors 4's _match a selector against a tree_ starts from "a list of _candidate elements_, which are the root elements and all of their descendant elements" and tests each one[^24^] — `querySelectorAll` is O(subtree size) at minimum, by specification. Against that baseline, `getElementById` is first-in-tree-order by ID[^21^] (engines: hash map), the `getElementsBy*` family exploits class/tag indexes, and cursor APIs (`TreeWalker`, `NodeIterator`, sibling accessors) make traversal O(1) amortized per visited node. Every API choice is a choice among indexed lookup, filtered subtree scan, and incremental walk.

**Layer 4 — Result allocation.** A static `NodeList` is built eagerly — per Zakas' reading of the WebKit sources, "a loop is used to get every result and build up a NodeList," while a live collection is "created by registering its existence in a cache."[^30^] Every returned `Element` also needs a JS-side wrapper: a 5,000-match `qSA` materializes 5,000 wrappers plus the list; `getElementsByClassName('x')[0]` allocates a view and one wrapper. `TreeWalker` is the extreme — bulk enumeration with no result list at all.[^11^]

### 1.2 Live vs static collections — the single most consequential semantic

#### 1.2.1 What is live, what is static

The DOM Standard's default: "A collection can be either _live_ or _static_. **Unless otherwise stated, a collection must be live.** If a collection is live, then the attributes and methods on that object must operate on the actual underlying data, not a snapshot of the data." A live collection is a _filter_ plus a _root_ — a view, not data.[^21^] Live: all `getElementsBy*`, `Node.childNodes`, `ParentNode.children`, all legacy `HTMLCollection`s, `NamedNodeMap`.[^1^][^2^][^22^] MDN states the exception flatly: "**The ubiquitous `document.querySelectorAll()` method is the only API that returns a static `NodeList`.**"[^1^]

#### 1.2.2 Live collection economics

Creation is nearly free; cost is deferred to access: every read of `length`, `[i]`, or `item(i)` re-runs the filter or re-validates a cache that any relevant DOM mutation has dirtied.[^21^][^30^] A static `NodeList` inverts the curve — full walk plus allocation once, then iteration touches plain memory.

|                           | Live (`getElementsBy*`, `childNodes`)                                  | Static (`querySelectorAll`)                     |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Creation                  | ~O(1) — register filter + root[^30^]                                   | O(subtree) — walk + `NodeList` + wrappers[^30^] |
| Per-access                | Re-query or cache re-validation                                        | O(1) memory read                                |
| Mutation during iteration | Invalidates cache; `length` moves under you                            | No effect — snapshot                            |
| `for (i < list.length)`   | Re-validates per iteration; mutation → infinite loop or skips[^30^]    | Safe; fixed `length`                            |
| Wins when                 | `[0]`/`length`-only access, held references, repeated same-query reads | Iteration, mutation-adjacent code, snapshots    |

Both canonical traps follow from re-evaluating `length` in the loop condition. Growing while iterating never terminates:

```js
const lis = ul.getElementsByTagName('li') // live
for (let i = 0; i < lis.length; i++) {
  ul.appendChild(document.createElement('li')) // lis.length grows → infinite loop
}
```

The identical code with `querySelectorAll("li")` terminates — the static list never grows.[^30^] Removing while iterating forward silently skips elements: deleting `live[i]` shifts every later element down one index, so the next read lands past the successor. Fixes: iterate backwards, snapshot once (`Array.from(live)` — MDN's own advice[^2^]), or remove index `0` until empty. Even without mutation, an uncached `live.length` condition re-validates per iteration; hoist `const n = live.length` or convert once.

#### 1.2.3 When live wins

Live is faster when you exploit the laziness. Single-shot lookups needing only `[0]` or `length` skip result-set construction entirely — `getElementsByClassName('x')[0]` short-circuits relative to building a complete static list, which is why community micro-benchmarks consistently rank it ahead of `querySelectorAll('.x')` here (indicative, engine-dependent: ~5 ms vs ~55 ms over 100k nodes in one reproduced test).[^29^][^31^] Held references amortize Layers 1 and 4: keep one live object instead of re-calling `querySelectorAll` per render; the engine's resolved-set cache serves reads between mutations — the HTML Standard even permits returning the _same object_ for repeated `getElementsByName` calls.[^22^] The trade is symmetric: mutate-heavy code pays invalidation on every change, so static snapshots win whenever the DOM churns during the loop.

### 1.3 Selector cost ladder and matching direction

#### 1.3.1 Right-to-left matching: every descendant is a candidate

Per-candidate matching is recursive and **right-to-left**: "process it compound selector at a time, in right-to-left order … If any simple selectors in the rightmost compound selector does not match the element, return failure. … Otherwise, consider all possible elements that could be related to this element by the rightmost combinator."[^24^] The rightmost compound — the _key selector_ — filters every candidate; combinators to its left trigger ancestor/sibling walks only for survivors. The key must be your most selective, indexable term; everything left of it is per-survivor verification cost, not candidate reduction.

#### 1.3.2 The cost ladder

**Key selector:** `#id` (hash lookup) < `.class` ≈ `tag` (class/tag maps) < `[attr]` existence < `[attr=v]` equality < substring operators (`[^=]`, `[$=]`, `[*=]`, `[~=]`, `[|=]` — per-candidate string work, no index) < structural pseudo-classes < `:has()` < `*` (test everything, no index).[^24^][^26^][^20^] Structural pseudos split: forward-looking (`:nth-child`, `:first-child`) need sibling position; backward-looking (`:nth-last-child`, `:nth-last-of-type`, `:only-of-type`) must know what comes _after_ the candidate — the browser "must first know everything about all the other elements," far costlier than "matching a selector to an element on the sole basis of its class name."[^26^] `:has()` extends that lookahead to descendants and siblings; MDN keeps a dedicated optimization note.[^20^]

**Combinators:** `+` (single sibling step) < `>` (single parent step) < `~` (walk preceding siblings) < descendant (ancestor walk per survivor — worst-case O(n·depth)). Compound chains multiply the per-candidate test: `div.card` costs a type check _and_ a class check on every candidate — MDN's over-specificity point.[^20^] The cascade-side worst case, elements × selector work, "because the browser needs to check each element at least once against every style to see if it matches," bounds one qSA call as well.[^26^]

#### 1.3.3 `#a .b` is never faster than `.b`

Both selectors face the same candidate set — every descendant of the context. `#a .b` does not shrink it; it _adds_, per `.b`-matching survivor, an ancestor walk hunting `#a`: equal or slower, never faster. Engines prune by `#a` more readily for stylesheet matching than for arbitrary qSA calls — do not rely on it. The only lever the spec's algorithm gives you is shrinking the root: resolve `getElementById('a')` once (hash lookup, no parse) and call `.querySelectorAll('.b')` **on that element**, reducing the candidate set itself. Related trap: `Element.querySelectorAll` matches against the whole tree and filters to descendants, so the left side may match _outside_ the receiver — prefix `:scope`.[^10^][^31^][^24^]

### 1.4 Traversal semantics: `closest()`, `matches()`, sibling/child accessors

#### 1.4.1 `closest()` — self-inclusive upward walk

The DOM Standard defines it exactly: parse the selector (throwing `SyntaxError` on failure), take "this's **inclusive ancestors** that are elements, **in reverse tree order**," return the first match, else `null`.[^21^] Self-inclusive, nearest-match-wins, O(depth × selector). A manual loop is equivalent for simple selectors and preferable in ultra-hot paths — it never throws (validate once outside the loop) and allows per-level early exit:

```js
let el = start
while (el && !el.matches(sel)) el = el.parentElement
```

`matches()` tests the element against its root; complex selectors with combinators are legal.[^21^] Both stop at the shadow boundary: a shadow-tree node's ancestors terminate at its shadow root, so `closest()` cannot match the host from inside; crossing upward requires an explicit `el.getRootNode().host` hop.[^21^][^16^]

#### 1.4.2 `children` vs `childNodes` vs element-sibling accessors

`childNodes` is a live `NodeList` of _all_ children — elements, text, comments; `children` is a live `HTMLCollection` of elements only.[^1^][^2^] Text-node pollution (every whitespace run is a node) is why `firstElementChild` / `nextElementSibling` exist: they skip non-elements per access. Cost asymmetry: `children[i]` is an indexed access on a live view; a `firstElementChild` + `nextElementSibling` chain is a cursor walk — O(1)-ish per step, no collection object, no `length` re-validation — cheapest for visiting a few known siblings. None of these accessors crosses a shadow boundary; a host's `children` sees only light DOM, slotted content included.[^21^][^35^]

#### 1.4.3 `TreeWalker` vs `NodeIterator`: mutation semantics

Both come from `document.createTreeWalker/createNodeIterator(root, whatToShow, filter)` and traverse exactly one tree — they cannot descend into shadow roots (WHATWG/dom issue #1189 remains open).[^21^] The decisive difference is mutation behavior. `NodeIterator` keeps a reference node that the DOM Standard's _pre-remove steps_ adjust on removal — it stays correct across concurrent mutation.[^21^][^12^] `TreeWalker` merely "represents the nodes of a document subtree and a position within them"; its `currentNode` gets **no** such adjustment, so removing the current node mid-walk strands the cursor on a detached node.[^12^][^11^] Use `TreeWalker` for read-only bulk enumeration (no result allocation, cheapest per step), `NodeIterator` when the walk mutates. XPath's `Document.evaluate` exposes the same duality: iterator result types are _invalidated_ by modification, snapshot types static-but-stale.[^13^]

### 1.5 Shadow DOM: the hard boundary

#### 1.5.1 No document-level query pierces a shadow tree

Shadow DOM exists to "have the internals of this tree hidden from JavaScript and CSS running in the page."[^19^] The mechanism is tree scoping: the DOM Standard scopes IDs, collections, and selector matching to a node's _root_, and each shadow tree is a separate tree with its own root — so _none_ of `getElementById`, `getElementsBy*`, `querySelector(All)`, XPath, `TreeWalker`, or `NodeIterator` crosses the boundary.[^21^] `getElementById` lives on the `DocumentOrShadowRoot` mixin: `shadowRoot.getElementById(...)` works, IDs need only be unique _per tree_, and the document's ID map cannot contain shadow content.[^21^] For any "find element anywhere" helper, correctness therefore requires degenerating from one indexed lookup into a full recursive walk with a `shadowRoot` check per element; the proposal for a `shadowRoots` option on `querySelector` (WHATWG/dom #1422) exists precisely because today's userland workaround — "literally walk every single element" — is "nontrivial, not to mention very inefficient."[^28^] Design APIs to accept a root and query inside it (`host.shadowRoot.querySelector(sel)`, open roots only); use `getRootNode({composed:true})` to pierce upward.[^16^]

#### 1.5.2 Retargeting: events, focus, and hit tests

Where queries may not cross, observation APIs cross _by retargeting to the host_. `event.target` seen outside the shadow tree is the host, not the true origin — the DOM Standard applies a `retarget` algorithm at each shadow-root crossing; `event.composedPath()` returns the full path but omits nodes of `closed` roots.[^17^][^18^][^21^] `document.activeElement` is shadow-aware by design: focus inside a shadow tree yields "the root element of that tree" — the host.[^15^] `elementFromPoint`/`elementsFromPoint` are retargeted per CSSWG resolution ("look for the highest shadow host of the element and return that instead"); `caretPositionFromPoint(x, y, {shadowRoots:[…]})` is the single API with an explicit opt-in to pierce named roots.[^34^][^25^] Library rules: in delegated handlers, `event.target.closest(sel)` starts from the host — use `event.composedPath()[0]` when the true origin matters and the tree is open; and never assume `document.querySelectorAll('*')` means "all elements" on a page that uses shadow DOM.[^35^]
