# DOM Element Querying — API Semantics & Live/Static Behavior (Research Brief, Dimension 01)

Facet: **API semantics of every native element-lookup surface** — what each API returns, whether the
result is live or static, what scope it searches, whether it is shadow-aware, and what the
specs say about cost-relevant behavior (selector matching order, collection liveness, traversal
mutation semantics). Research date: 2026-08-12.

---

## 1. API inventory

| API                                                                                                                                                                                | Return type                                            | Live / static                                                                                                  | Scope                                                                                                         | Shadow-aware?                                                                                                                                    | Spec URL                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `document.getElementById(id)`                                                                                                                                                      | `Element \| null`                                      | n/a (single element reference)                                                                                 | Whole document tree                                                                                           | **Scoped to its own tree** — also exists on `ShadowRoot` (it is defined on the `DocumentOrShadowRoot` mixin); IDs are per-tree                   | https://dom.spec.whatwg.org/#dom-document-getelementbyid                                           |
| `Document/Element.getElementsByClassName(names)`                                                                                                                                   | `HTMLCollection`                                       | **Live**                                                                                                       | Descendants of context object                                                                                 | No boundary crossing; each shadow tree is a separate root                                                                                        | https://dom.spec.whatwg.org/#dom-document-getelementsbyclassname                                   |
| `Document/Element.getElementsByTagName(name)` / `...TagNameNS(ns, name)`                                                                                                           | `HTMLCollection`                                       | **Live**                                                                                                       | Descendants of context object (`"*"` = all elements)                                                          | No boundary crossing                                                                                                                             | https://dom.spec.whatwg.org/#dom-document-getelementsbytagname                                     |
| `document.getElementsByName(name)`                                                                                                                                                 | `NodeList`                                             | **Live**                                                                                                       | Whole document (Document only)                                                                                | No boundary crossing                                                                                                                             | https://html.spec.whatwg.org/multipage/dom.html#dom-document-getelementsbyname                     |
| `ParentNode.querySelector(selectors)`                                                                                                                                              | `Element \| null` (first match, depth-first pre-order) | static result                                                                                                  | Descendants of context object (Document / DocumentFragment / Element / ShadowRoot all implement `ParentNode`) | Runs against the receiver's root — usable _inside_ a shadow root, never across one                                                               | https://dom.spec.whatwg.org/#dom-parentnode-queryselector                                          |
| `ParentNode.querySelectorAll(selectors)`                                                                                                                                           | `NodeList`                                             | **Static**                                                                                                     | Same as above                                                                                                 | Same as above                                                                                                                                    | https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall                                       |
| `Element.matches(selectors)`                                                                                                                                                       | `boolean`                                              | n/a                                                                                                            | Tests the element itself against the selector (matched against element's root)                                | Works on any element incl. inside shadow trees                                                                                                   | https://dom.spec.whatwg.org/#dom-element-matches                                                   |
| `Element.closest(selectors)`                                                                                                                                                       | `Element \| null`                                      | n/a                                                                                                            | Self-inclusive ancestor walk toward the tree root                                                             | Does **not** cross the shadow boundary upward (ancestors of a shadow-tree node end at its shadow root — see §5)                                  | https://dom.spec.whatwg.org/#dom-element-closest                                                   |
| `Node.childNodes`                                                                                                                                                                  | `NodeList`                                             | **Live**                                                                                                       | Direct children of the node                                                                                   | Does not include a shadow tree (host's `childNodes` = light DOM only)                                                                            | https://dom.spec.whatwg.org/#dom-node-childnodes                                                   |
| `ParentNode.children`                                                                                                                                                              | `HTMLCollection`                                       | **Live**                                                                                                       | Direct element children                                                                                       | Light DOM only (slotted content stays in light DOM)                                                                                              | https://dom.spec.whatwg.org/#dom-parentnode-children                                               |
| `firstElementChild` / `lastElementChild` / `childElementCount`; `nextElementSibling` / `previousElementSibling`; `parentElement`                                                   | `Element?` / number                                    | n/a (live properties, computed per access)                                                                     | Local navigation                                                                                              | Do not traverse shadow boundaries (use `getRootNode()`, `assignedSlot` instead)                                                                  | https://dom.spec.whatwg.org/#interface-parentnode                                                  |
| Legacy document collections: `document.forms`, `.images`, `.links`, `.anchors`, `.scripts`; `form.elements`, `select.options`, `table.rows` / `.tBodies`, `row.cells`, `map.areas` | `HTMLCollection`                                       | **Live**                                                                                                       | Document (or owning element)                                                                                  | No                                                                                                                                               | https://html.spec.whatwg.org/multipage/dom.html#dom-document-forms                                 |
| `document.all` (`HTMLAllCollection`)                                                                                                                                               | `HTMLAllCollection`                                    | Live (legacy quirk object)                                                                                     | Whole document                                                                                                | No                                                                                                                                               | https://html.spec.whatwg.org/multipage/obsolete.html#dom-document-all                              |
| `window[name]` (named access on the `Window` object)                                                                                                                               | `Element \| WindowProxy \| HTMLCollection`             | Implicit query each access                                                                                     | Elements with matching `id` (and named `embed`/`form`/`img`/`object`, plus named child navigables)            | No                                                                                                                                               | https://html.spec.whatwg.org/multipage/nav-history-apis.html#named-access-on-the-window-object     |
| `Document.createTreeWalker(root, whatToShow, filter)` → `TreeWalker`                                                                                                               | Traversal object with `currentNode` pointer            | Position pointer; **not** auto-adjusted on DOM mutation                                                        | Subtree rooted at `root`                                                                                      | Cannot enter shadow roots (WHATWG issue #1189 open)                                                                                              | https://dom.spec.whatwg.org/#interface-treewalker                                                  |
| `Document.createNodeIterator(root, whatToShow, filter)` → `NodeIterator`                                                                                                           | Iterator anchored at a reference node                  | **Mutation-adjusted**: spec "pre-remove steps" move the reference when nodes are removed                       | Subtree rooted at `root`                                                                                      | Cannot enter shadow roots                                                                                                                        | https://dom.spec.whatwg.org/#interface-nodeiterator                                                |
| `Document.evaluate(xpath, context, resolver, resultType, result)` (XPath 1.0)                                                                                                      | `XPathResult`                                          | Result-type dependent: **snapshot** types are static lists; **iterator** types are invalidated by DOM mutation | Context node subtree                                                                                          | XPath does not cross the shadow boundary                                                                                                         | https://dom.spec.whatwg.org/#interface-document (§ XPath)                                          |
| `Document.elementFromPoint(x, y)` / `elementsFromPoint(x, y)`                                                                                                                      | `Element?` / `Element[]`                               | n/a (hit test at call time)                                                                                    | Viewport hit test of the document                                                                             | **Retargeted**: must not leak shadow-tree internals — returns host per CSSWG resolution; `caretPositionFromPoint` accepts `{shadowRoots}` opt-in | https://drafts.csswg.org/cssom-view/#dom-document-elementfrompoint                                 |
| `Document.caretPositionFromPoint(x, y, {shadowRoots})`                                                                                                                             | `CaretPosition?`                                       | n/a                                                                                                            | Document; opt-in list of shadow roots to pierce                                                               | Shadow-aware only when roots passed explicitly                                                                                                   | https://drafts.csswg.org/cssom-view/#dom-document-caretpositionfrompoint                           |
| `DocumentOrShadowRoot.activeElement`                                                                                                                                               | `Element?`                                             | n/a (live property)                                                                                            | Focused element                                                                                               | **Shadow-retargeted by design**: if focus is inside a shadow tree, returns the host (or the tree root element)                                   | https://html.spec.whatwg.org/multipage/interaction.html#dom-documentorshadowroot-activeelement-dev |
| `Node.getRootNode({composed})`                                                                                                                                                     | `Node` (Document or ShadowRoot)                        | n/a                                                                                                            | Which tree a node lives in                                                                                    | `composed:true` pierces shadow roots to reach the document                                                                                       | https://dom.spec.whatwg.org/#dom-node-getrootnode                                                  |
| `Event.composedPath()`                                                                                                                                                             | `EventTarget[]`                                        | n/a                                                                                                            | Full propagation path                                                                                         | Includes shadow-tree nodes **unless** the root is `closed`                                                                                       | https://dom.spec.whatwg.org/#dom-event-composedpath                                                |
| `Event.target`                                                                                                                                                                     | `EventTarget?`                                         | n/a                                                                                                            | Dispatch target                                                                                               | **Retargeted** outside the originating shadow tree (appears as the host)                                                                         | https://dom.spec.whatwg.org/#dom-event-target                                                      |

Key structural facts from the WHATWG DOM Standard:

- `getElementById` is specified as: _"return the first element, in tree order, within node's
  descendants, whose ID is elementId; otherwise … null"_ — defined on the **`DocumentOrShadowRoot`
  mixin**, which is why `shadowRoot.getElementById(...)` works and why document-level ID lookup can
  never see inside a shadow tree.[^21^]
- `querySelector` / `querySelectorAll` are defined on the **`ParentNode` mixin** (implemented by
  `Document`, `DocumentFragment`, `Element`): _"The `querySelector(selectors)` method steps are to
  return the first result of running scope-match a selectors string selectors against this, if the
  result is not an empty list; otherwise null. The `querySelectorAll(selectors)` method steps are to
  return the **static** result of running scope-match a selectors string selectors against this."_[^21^]
- Scope-match is: _"Let selector be the result of parse a selector selectors. If selector is failure,
  then throw a '`SyntaxError`' `DOMException`."_[^21^] — **invalid selectors always throw**; they never
  return an empty list or `null`.

---

## 2. Live vs. static collections — deep dive

### 2.1 What the specs say (verbatim)

WHATWG DOM Standard, § "Collections":

> "A collection can be either _live_ or _static_. **Unless otherwise stated, a collection must be
> live.** If a collection is live, then the attributes and methods on that object must operate on the
> actual underlying data, not a snapshot of the data. When a collection is created, a _filter_ and a
> _root_ are associated with it. The collection then _represents_ a view of the subtree rooted at the
> collection's root, containing only nodes that match the given filter."[^21^]

MDN, `NodeList`:

> "In most cases, the `NodeList` is _live_, which means that changes in the DOM automatically update
> the collection. … In other cases, the `NodeList` is _static_, where any changes in the DOM do not
> affect the content of the collection. **The ubiquitous `document.querySelectorAll()` method is the
> only API that returns a static `NodeList`.** It's good to keep this distinction in mind when you
> choose how to iterate over the items in the `NodeList`, and whether you should cache the list's
> `length`."[^1^]

MDN, `HTMLCollection`:

> "An `HTMLCollection` in the HTML DOM is live; it is automatically updated when the underlying
> document is changed. For this reason it is a good idea to make a copy (e.g., using `Array.from`) to
> iterate over if adding, moving, or removing nodes."[^2^]

MDN, `Document.getElementsByClassName()`:

> "**Warning: This is a live `HTMLCollection`. Changes in the DOM will reflect in the array as the
> changes occur. If an element selected by this array no longer qualifies for the selector, it will
> automatically be removed. Be aware of this for iteration purposes.**"[^6^]

HTML Standard on `getElementsByName` (note the permitted engine-side caching):

> "The `getElementsByName(elementName)` method steps are to return a live NodeList containing all the
> HTML elements in that document that have a name attribute whose value is identical to the
> elementName argument, in tree order. **When the method is invoked on a Document object again with
> the same argument, the user agent may return the same as the object returned by the earlier call.
> In other cases, a new NodeList object must be returned.**"[^22^]

### 2.2 The exact invalidation/re-evaluation model

Because a live collection is only a _filter + root view_ (per the spec text above), engines implement
it as a lazily-evaluated object: creating the collection is cheap, and the DOM is (re-)searched when
`length` / indexed access / `item()` is used, subject to engine caches that must be **invalidated on
every relevant DOM mutation**. Nicholas Zakas' classic explanation, based on the WebKit sources
(`DynamicNodeList.cpp` vs `StaticNodeList.cpp`):

> "Live NodeList objects can be created and returned faster by the browser because they don't have to
> have all of the information up front while static NodeLists need to have all of their data from the
> start. … The DynamicNodeList object is created by registering its existence in a cache. … Whenever
> the DynamicNodeList is accessed, it must query the document for changes, as evidenced by the length
> property and the item() method. … If you take a look at the WebKit source code that actually creates
> the return value for `querySelectorAll()`, you'll see that a loop is used to get every result and
> build up a NodeList that is eventually returned."[^30^]

Consequences:

- **Static (`querySelectorAll`)**: full tree walk + allocation happens once, up front. Iterating the
  result afterwards touches plain memory — the _first_ call is the expensive one; iteration is
  O(n) cheap reads. Ideal for loops and for capturing a snapshot you will mutate the DOM around.
- **Live (`getElementsBy*`)**: near-zero creation cost, but _every access_ may re-run the filter or
  at minimum re-validate a cache that DOM mutations have dirtied. `for (i = 0; i < list.length; i++)`
  re-reads `list.length` every iteration — each read is a potential re-query.

### 2.3 The famous anti-patterns

1. **Growing while iterating** — appending matching nodes inside a `for (i=0; i<live.length; i++)`
   loop re-reads a growing `length` and can loop **forever**:
   ```js
   const lis = ul.getElementsByTagName('li') // live
   for (let i = 0; i < lis.length; i++) {
     ul.appendChild(document.createElement('li')) // lis.length grows → infinite loop
   }
   ```
   The same code with `ul.querySelectorAll("li")` terminates, because the static list never grows.[^30^]
2. **Removing while iterating forward** — deleting `live[i]` shifts every subsequent element down one
   index, so the _next_ element is silently skipped. Fixes: iterate backwards, iterate a static copy
   (`Array.from(live)` / `[...live]`), or always remove index `0` until `length === 0`.
3. **Uncached length**: `for (i = 0; i < live.length; i++)` on a large live collection pays a
   re-validation per iteration even when _not_ mutating; cache it (`const n = live.length`) or
   convert to an array once.

### 2.4 When live is actually the faster choice

- **Single-shot lookups where you only need `[0]` or `length`**: a live collection avoids the full
  result-set construction; `getElementsByClassName('x')[0]` short-circuits relative to building a
  complete static `NodeList`. Community micro-benchmarks consistently show `getElementsByClassName`
  returning faster than `querySelectorAll('.x')` for this reason (e.g. ~5 ms vs ~55 ms over 100k
  nodes in one widely reproduced test; ~1.1M ops/s vs ~39K ops/s in a jsPerf-derived test on
  Stack Overflow).[^29^][^31^]
- **Repeated access to the same query**: hold the live object once instead of re-calling
  `querySelectorAll` repeatedly; engines cache the resolved node set between mutations (the HTML
  Standard explicitly permits returning the _same object_ for repeated `getElementsByName` calls).[^22^]
- The trade is symmetric: **mutate-heavy** code pays invalidation on every change, so static lists
  (or plain arrays) win when the DOM churns during the loop.

### 2.5 Related liveness corners

- `Node.childNodes` is a **live** `NodeList`; `ParentNode.children` a **live** `HTMLCollection`
  (elements only).[^1^][^2^]
- **NodeIterator** keeps a _reference node_ and is explicitly kept consistent across removals — the
  DOM Standard defines _"NodeIterator pre-remove steps"_ that adjust the iterator's reference and
  candidate reference when a node is removed, so a NodeIterator is safe to keep walking while the DOM
  is being mutated.[^21^] **TreeWalker**, by contrast, is just _"the nodes of a document subtree and a
  position within them"_ — its `currentNode` pointer is not adjusted by those pre-remove steps.[^12^]
- **XPath** results expose both models explicitly: `UNORDERED/ORDERED_NODE_ITERATOR_TYPE` results
  _"contain references to nodes in the document. Modifying a node will invalidate the iterator.
  After modifying a node, attempting to iterate through the results will result in an error"_;
  `UNORDERED/ORDERED_NODE_SNAPSHOT_TYPE` results _"are snapshots … Modifying the document doesn't
  invalidate the snapshot; however, if the document is changed, the snapshot may not correspond to
  the current state of the document."_[^13^]
- `NamedNodeMap` (`element.attributes`) is also live.

---

## 3. Selector cost ladder for `querySelector(All)`

### 3.1 What the specs mandate about evaluation order

CSS Selectors Level 4, "Match a Selector Against a Tree" (the algorithm behind `querySelectorAll`):

> "Start with a list of _candidate elements_, which are the root elements and all of their descendant
> elements, sorted in shadow-including tree order … For each element in the set of candidate
> elements: If the result of _match a selector against an element_ for element and selector is
> success, add element to the selector match list."[^24^]

i.e. `querySelectorAll` is **at minimum O(number of descendant candidates)** — every element in the
subtree gets tested. And "Match a Complex Selector against an Element":

> "To match a complex selector against an element, process it **compound selector at a time, in
> right-to-left order**. This process is defined recursively as follows: If any simple selectors in
> the rightmost compound selector does not match the element, return failure. … Otherwise, consider
> all possible elements that could be related to this element by the rightmost combinator …"[^24^]

So the **rightmost compound selector (the "key selector")** is the filter applied to every candidate;
combinators to its left trigger ancestor/sibling walks _per surviving candidate_. The Selectors spec
also defines the _subject_ of a selector as _"any element that selector is defined to be about; that
is, any element matching that selector"_ — the rightmost compound determines the subject set.[^24^]

### 3.2 The practical cost ladder (cheapest → most expensive)

Engines keep dedicated indexes for the three classic lookup shapes, which is why Sizzle-era fast
paths still matter:

1. **ID `#id`** — hash lookup (the `getElementById` fast path; O(1)-ish even inside qSA when the
   whole selector is a bare `#id`).
2. **Class `.cls` / type `div`** — engine-side class/tag maps; near the `getElementsBy*` fast path.
   A single class selector is the reference point web.dev uses: _"The simplest selectors reference an
   element in CSS with just a class name."_[^26^]
3. **Attribute selectors** — `[attr]` existence is cheap; equality `[attr=v]` moderate; substring
   operators (`[^=]`, `[$=]`, `[*=]`, `[~=]`, `[|=]`) require per-candidate string work and cannot
   use indexes.
4. **Pseudo-classes** — user-action pseudos (`:hover`, `:focus`) are cheap; **structural** pseudos
   (`:nth-child()`, `:nth-of-type()`, `:first-child` …) require knowing sibling position; the
   "backward-looking" ones (`:nth-last-child`, `:nth-last-of-type`, `:only-of-type`) require knowing
   what comes _after_ the candidate. web.dev's canonical example:
   > "`.box:nth-last-child(-n+1) .title` … for the browser to know an element is the last of its
   > type, it must first know everything about all the other elements to determine whether any
   > elements that come after it … This can be a lot more computationally expensive than matching a
   > selector to an element on the sole basis of its class name."[^26^]
   > `:has()` extends this to descendant/sibling lookahead and is the most expensive general-purpose
   > pseudo-class (MDN has a dedicated "Optimizing :has() selectors" note).[^20^]
5. **Universal `*`** as the key selector = test _every_ element in scope with no index help.

### 3.3 Combinators and compound chains

Per the normative right-to-left algorithm, each combinator multiplies the per-candidate walk:

- `A B` (descendant): for each candidate matching `B`, walk **ancestors up to the tree root** looking
  for `A` — worst-case depth-proportional, potentially O(n·depth) overall.
- `A > B` (child): single parent step — strictly cheaper than descendant.
- `A + B` (adjacent sibling): single sibling step — cheapest combinator.
- `A ~ B` (general sibling): walk preceding siblings.
- **More compound selectors in the key position cost more**: `div.card` requires both a type check and
  a class check on every candidate — MDN Learn's CSS performance guide makes the same point about
  over-specific selectors (`body div#main-content article.post h2.headline` vs `.headline`).[^20^]

### 3.4 Why `#a .b` costs differently from `.b`

In a `querySelectorAll` context both queries must test the same candidate set (all descendants of the
context). `#a .b` does **not** reduce the candidate set — it adds, for every `.b`-matching candidate,
an ancestor walk to find `#a`. So:

- `.b` → class-index candidates, no ancestor walk. Cheaper.
- `#a .b` → same candidates **plus** per-candidate ancestor verification. _Equal or slower_, never
  faster, unless the engine uses `#a` to prune the subtree first (an optimization engines apply for
  the _stylesheet_ cascade more readily than for an arbitrary qSA call — do not rely on it).
- The genuinely faster formulation when you know the scoping element: resolve `#a` once
  (`getElementById('a')`) and run `querySelectorAll('.b')` **on that element** — this shrinks the
  candidate set itself, which is the only lever the spec's algorithm gives you.

### 3.5 Scoping nuance that bites library authors

`Element.querySelectorAll` matches the selector against the **whole tree**, then filters to
descendants — the rest of the selector may match elements _outside_ the receiver. MDN:

> "The selectors are applied to the entire document, not just the particular element on which
> `querySelectorAll()` is called. To restrict the selector to the element on which
> `querySelectorAll()` is called, include the `:scope` pseudo-class at the start of the selector."[^10^]

Canonical surprise: on `<div class="outer"><div class="select"><div class="inner">`,
`select.querySelectorAll('.outer .inner')` returns 1 element (the `.outer` matched _outside_
`select`); `select.querySelectorAll(':scope .outer .inner')` returns 0.[^31^] `:scope` is defined in
Selectors 4 §8.4 as representing the scoping root _"such as when calling the querySelector()
method in [DOM]"_.[^24^]

### 3.6 Errors

`querySelector`/`querySelectorAll`/`matches`/`closest` all run _parse a selector_ and throw a
`SyntaxError` `DOMException` on invalid input (DOM Standard §1.3; MDN querySelectorAll
"Exceptions" section).[^21^][^3^] Two library-relevant corollaries:

- IDs/classes that aren't valid CSS identifiers (start with a digit, contain `:` or `.`) must be
  escaped with `CSS.escape()` before interpolation into a selector — or use `getElementById` /
  `getElementsByClassName`, which take raw strings and never throw.[^3^][^29^]
- Pseudo-elements in the selector make `querySelectorAll` return an **empty** list rather than
  throwing.[^3^]

Also worth noting for cost framing: web.dev reports that in Blink _"roughly half of the time used …
to calculate the computed style for an element is used to match selectors"_ (Rune Lillesveen, "Style
Invalidation in Blink"), and that _"the worst case cost of calculating the computed elements style is
the number of elements multiplied by the selector count, because the browser needs to check each
element at least once against every style to see if it matches"_[^26^] — the same O(elements ×
selectors) model applies to one `querySelectorAll` call with the selector count = 1..k.

---

## 4. `closest()`, `matches()`, and traversal semantics

### 4.1 `closest()` — spec semantics

DOM Standard, `Element.closest()`:

> "The `closest(selectors)` method steps are: Let _selector_ be the result of parse a selector from
> _selectors_. If _selector_ is failure, then throw a '`SyntaxError`' `DOMException`. Let _elements_
> be this's **inclusive ancestors** that are elements, **in reverse tree order**. For each _element_
> of _elements_: if _match a selector against an element_, using _selector_, _element_, and **scoping
> root this**, returns success, return _element_. Return null."[^21^]

MDN (matches the spec): _"The `closest()` method … traverses the element and its parents (heading
toward the document root) until it finds a node that matches the specified CSS selector."_ Return
value: _"The closest ancestor `Element` **or itself**, which matches the selectors."_[^8^]

So: **self-inclusive**, walks toward the tree root, first (nearest) match wins, throws on invalid
selectors, and (per the spec algorithm) evaluates each ancestor with the _scoping root_ set to the
receiver — relative selectors like `closest(':scope > li')`-style constructs are not meaningful
here; keep the selector simple.

### 4.2 `closest()` vs a manual `parentElement` loop

```js
// equivalent for simple selectors
let el = start
while (el && !el.matches(sel)) el = el.parentElement
```

- Semantics are identical when the loop starts at `start` itself (both are self-inclusive) and the
  selector is valid. The manual loop (a) never throws — you can pre-validate the selector once
  outside a hot loop; (b) avoids re-parsing the selector string per call (engines cache parsed
  selectors, but the parse/lookup boundary is still crossed); (c) lets you bail or transform at each
  level (e.g., stop at a boundary element, count depth).
- `matches()` is defined as: _"Returns true if matching selectors against element's root yields
  element; otherwise false."_[^21^] — i.e. the element is tested against its whole root tree, and a
  complex selector with combinators is legal in `matches()`.
- **Shadow boundary**: `closest()` walks _inclusive ancestors within the node's tree_. A shadow
  tree's node list of ancestors terminates at the shadow root — the **host element is not an
  ancestor** in that tree — so `closest()` called inside a shadow tree cannot match the host or
  anything above it (likewise `parentElement` returns `null` at the shadow-root boundary). To cross
  upward you must jump explicitly: `el.getRootNode().host` (open roots) and continue. (Confidence:
  high — follows from the DOM spec's tree-scoped definition of ancestors; see §5.)[^21^][^16^]

### 4.3 TreeWalker / NodeIterator / XPath traversal semantics

- `TreeWalker`: _"represents the nodes of a document subtree and a position within them"_;
  `nextNode()/previousNode()/parentNode()/firstChild()…` move a cursor; `whatToShow` bitmask +
  optional `filter` (`NodeFilter` callback) skip/reject nodes (skipped nodes are descended into;
  rejected subtrees are pruned).[^11^]
- `NodeIterator`: flat document-order iterator; exposes `referenceNode` and
  `pointerBeforeReferenceNode`; per the DOM Standard its reference is _adjusted_ by pre-remove steps
  when nodes are removed, so it is the traversal object that is safe across concurrent DOM
  mutation.[^12^][^21^]
- Both are created by `document.createTreeWalker/createNodeIterator(root, whatToShow, filter)` and
  traverse **one** tree — they cannot descend into shadow roots (WHATWG/dom issue #1189 remains
  open).[^21^]
- `Document.evaluate()` (XPath 1.0): powerful path language (`//a[@href][1]`, axes like
  `following-sibling::`), results via `iterateNext()` or `snapshotItem(i)` depending on result type
  (see §2.5 for the mutation semantics). Works on HTML and XML documents, takes any context
  node.[^13^] Community micro-benchmarks generally rank `TreeWalker` ≥ `NodeIterator` > `qSA('*')` >
  XPath for bulk enumeration, but all are linear in subtree size; the differences are constant
  factors and engine-dependent (results vary by browser and year — treat any single benchmark as
  indicative only).[^32^][^33^]

---

## 5. Shadow DOM implications for library authors

### 5.1 The boundary is absolute for queries

MDN, "Using shadow DOM":

> "Shadow DOM enables you to attach a DOM tree to an element, and **have the internals of this tree
> hidden from JavaScript and CSS running in the page**."[^19^]

Lit documentation (equivalent statement):

> "**DOM scoping. DOM APIs like `document.querySelector` won't find elements in the component's
> shadow DOM**, so it's harder for global scripts to accidentally break your component."[^27^]

Concretely, _none_ of the document-level lookup APIs — `getElementById`, `getElementsByClassName`,
`getElementsByTagName`, `getElementsByName`, `querySelector`, `querySelectorAll` — can see into a
shadow tree, because each shadow tree is a separate tree with its own root (the DOM Standard scopes
IDs, collections, and selector matching to a node's _root_).[^21^] An open proposal to add a
`shadowRoots` option to `querySelector` exists (WHATWG/dom #1422) precisely because today's only
workaround is _"to walk the DOM and check its `shadowRoot` … literally walk every single element"_ —
the issue includes a full userland implementation and calls it _"nontrivial, not to mention very
inefficient"_.[^28^]

### 5.2 What still works, and how

- **Query inside a known root**: `host.shadowRoot.querySelector(sel)` (open roots only; `shadowRoot`
  is `null` for `mode:'closed'`). `ShadowRoot` implements `ParentNode` (so `qS`/`qSA` work) **and**
  `DocumentOrShadowRoot` (so `shadowRoot.getElementById(...)` also works — IDs only need to be unique
  _per tree_).[^21^]
- **Find out which tree you're in**: `node.getRootNode()` returns the `ShadowRoot` or `Document`;
  `getRootNode({composed:true})` pierces upward to the document.[^16^]
- **Cross upward**: `shadowRoot.host` (from inside), `element.assignedSlot` / `slot.assignedElements()`
  (slotting is light-DOM ownership: slotted nodes remain queryable from the document — they are
  _projected_, not moved).
- **Focus**: `document.activeElement` is deliberately shadow-aware — MDN: _"The deepest Element which
  currently has focus. If the focused element is within a shadow tree within the current document …
  then this will be the root element of that tree"_ (i.e. the host).[^15^]
- **Hit testing**: `elementFromPoint`/`elementsFromPoint` are retargeted so they do not leak
  shadow-tree internals (CSSWG issue #556: _"should not return an element inside a shadow tree …
  look for the highest shadow host of the element and return that instead … retarget the element we
  found against the context object"_); `caretPositionFromPoint(x, y, {shadowRoots:[…]})` is the one
  API with an explicit opt-in to pierce named shadow roots.[^34^][^25^]
- **Events**: `event.target` is _retargeted_ — listeners outside the shadow tree see the host, not
  the true originating node (DOM Standard defines a `retarget` algorithm applied when crossing a
  shadow root). `event.composedPath()` returns the full path but _"does not include nodes in shadow
  trees if the shadow root was created with its `ShadowRoot.mode` closed"_.[^17^][^18^][^21^]

### 5.3 Performance consequences for library authors

- Any "find element anywhere on the page" helper that must be shadow-correct degenerates from one
  indexed lookup into a **full recursive walk** with a `shadowRoot` check per element — the single
  biggest shadow-DOM performance trap (see #1422's userland code).[^28^]
- `document.querySelectorAll('*')` no longer means "all elements" — libraries that rely on global
  scans (autofill, overlays, a11y tooling) silently miss shadow content. Nolan Lawson: _"Other
  classic DOM APIs, such as `element.children` and `element.parentElement`, are similarly unable to
  traverse shadow boundaries. Instead, you have to use more esoteric APIs like `element.shadowRoot`
  and `getRootNode()`."_[^35^]
- Event-retargeting means `event.target.closest(...)` in a delegated handler at `document` level
  starts from the **host**, not the real inner target — use `event.composedPath()[0]` when the true
  origin matters and the tree is open.
- Web Components _style_ scoping also bounds style-recalc cost per component tree: web.dev notes
  _"styles don't cross the Shadow DOM boundary by default, and are scoped to individual components
  rather than the tree as a whole … smaller trees with simpler rules are processed more
  efficiently."_[^26^]

---

## 6. Implications for performance (summary bullets)

- **`getElementById` ≫ everything for single known-ID lookups** — spec-mandated first-in-tree-order
  hit via the engine's ID map; `querySelector('#id')` adds selector parsing and candidate matching on
  top. If the ID isn't a valid CSS identifier, `getElementById` is also the _safe_ choice (no
  escaping, no `SyntaxError`).[^5^][^29^]
- **`querySelectorAll` is O(subtree size) minimum, by spec** — every descendant is a candidate and is
  matched right-to-left. Shrinking the _root_ (call on a nearer ancestor element) is the only true
  way to shrink the query; adding `#id` to the left of the selector does not shrink candidates.[^24^]
- **Selector cost ladder**: `#id` (indexed) < `.class` ≈ `tag` (indexed) < `[attr]` existence <
  attribute equality < substring attribute ops < structural pseudo-classes (`:nth-last-child`,
  `:only-of-type`) < `:has()` < `*` as key selector. Combinator cost: `+` < `>` < `~` < descendant
  (ancestor walk per candidate). Keep the rightmost compound selective and indexed; keep chains
  ≤ ~3 compounds.[^24^][^26^][^20^]
- **Live collections are lazy views, static NodeLists are eager snapshots** (spec: "Unless otherwise
  stated, a collection must be live"). Live wins for cheap creation and `[0]`/`length`-only access;
  static wins for iteration, mutation-adjacent code, and repeated traversal. Never read
  `liveCollection.length` in a loop condition while mutating — infinite-loop and skip-element bugs
  are the canonical failure modes; snapshot with `Array.from()` first (MDN's own advice).[^21^][^1^][^2^]
- **Mutation-heavy loops**: prefer static snapshots, `NodeIterator` (spec-adjusted across removals),
  or backwards iteration over live lists. **Read-only bulk enumeration**: `TreeWalker` avoids
  allocating a result list at all; XPath `snapshot` types give static results with a path language.[^21^][^12^][^13^]
- **Delegate instead of querying**: one `addEventListener` at a root + `event.target.closest(sel)`
  replaces per-element lookups/listeners; `closest()` is self-inclusive and walks toward the tree
  root, and throws on bad selectors — validate once. Manual `parentElement` loops avoid repeated
  selector parsing in ultra-hot paths and allow early-exit logic.[^21^][^8^]
- **Avoid implicit lookups**: `window['someId']` named access runs a hidden search over IDs/named
  elements and is explicitly discouraged by the HTML Standard: _"As a general rule, relying on this
  will lead to brittle code … Instead of this, use `document.getElementById()` or
  `document.querySelector()`."_[^23^]
- **Cache handles, not queries**: high-perf libraries hold direct element references (or one live
  collection) instead of re-querying per render; re-running `querySelectorAll` per event/render is
  the most common self-inflicted cost.
- **Escape once, reuse**: interpolated selectors need `CSS.escape()`; invalid selectors throw
  `SyntaxError` from `qS/qSA/matches/closest` — precompile/validate outside hot paths.[^3^]
- **Shadow DOM changes the rules**: no document-level API crosses the boundary (including XPath and
  TreeWalker); "query the whole page" becomes a recursive per-element `shadowRoot` walk (explicitly
  called "very inefficient" in the standards discussion). Design APIs to accept a root, and use
  `getRootNode({composed:true})`, `composedPath()`, slot-assignment APIs, and host-retargeted
  `activeElement`/`elementFromPoint` instead of boundary-crossing queries.[^21^][^28^][^34^]
- **`:scope` is required for correct scoped qSA** — otherwise the left side of your selector may
  match _outside_ the receiver element, yielding wrong (and broader-than-expected) matches.[^10^]

---

## Sources

1. MDN — NodeList. https://developer.mozilla.org/en-US/docs/Web/API/NodeList (accessed 2026-08-12)
2. MDN — HTMLCollection. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCollection (accessed 2026-08-12)
3. MDN — Document.querySelectorAll(). https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll (accessed 2026-08-12)
4. MDN — Document.querySelector(). https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector (accessed 2026-08-12)
5. MDN — Document.getElementById(). https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementById (accessed 2026-08-12)
6. MDN — Document.getElementsByClassName(). https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName (accessed 2026-08-12)
7. MDN — Document.getElementsByName(). https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByName (accessed 2026-08-12)
8. MDN — Element.closest(). https://developer.mozilla.org/en-US/docs/Web/API/Element/closest (accessed 2026-08-12)
9. MDN — Element.matches(). https://developer.mozilla.org/en-US/docs/Web/API/Element/matches (accessed 2026-08-12)
10. MDN — Element.querySelectorAll(). https://developer.mozilla.org/en-US/docs/Web/API/Element/querySelectorAll (accessed 2026-08-12)
11. MDN — TreeWalker. https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker (accessed 2026-08-12)
12. MDN — NodeIterator. https://developer.mozilla.org/en-US/docs/Web/API/NodeIterator (accessed 2026-08-12)
13. MDN — Document.evaluate() (XPath / XPathResult types). https://developer.mozilla.org/en-US/docs/Web/API/Document/evaluate (accessed 2026-08-12)
14. MDN — Document.elementFromPoint(). https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint (accessed 2026-08-12)
15. MDN — Document.activeElement. https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement (accessed 2026-08-12)
16. MDN — Node.getRootNode(). https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode (accessed 2026-08-12)
17. MDN — Event.composedPath(). https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath (accessed 2026-08-12)
18. MDN — Event.target. https://developer.mozilla.org/en-US/docs/Web/API/Event/target (accessed 2026-08-12)
19. MDN — Using shadow DOM. https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM (accessed 2026-08-12)
20. MDN — CSS performance optimization (Learn web development). https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS (accessed 2026-08-12)
21. WHATWG — DOM Standard (Living Standard): collections; DocumentOrShadowRoot/ParentNode mixins; Element.closest/matches; NodeIterator pre-remove steps; retarget algorithm. https://dom.spec.whatwg.org/ (accessed 2026-08-12)
22. WHATWG — HTML Standard, "DOM" chapter (getElementsByName; document collections). https://html.spec.whatwg.org/multipage/dom.html (accessed 2026-08-12)
23. WHATWG — HTML Standard, "Named access on the Window object". https://html.spec.whatwg.org/multipage/nav-history-apis.html#named-access-on-the-window-object (accessed 2026-08-12)
24. W3C/CSSWG — CSS Selectors Level 4 (:scope; subject of a selector; "match a selector against a tree / an element" — right-to-left evaluation). https://drafts.csswg.org/selectors-4/ (accessed 2026-08-12)
25. CSSWG — CSSOM View Module (elementFromPoint/elementsFromPoint; caretPositionFromPoint with shadowRoots option). https://drafts.csswg.org/cssom-view/ (accessed 2026-08-12)
26. web.dev (Jeremy Wagner, Paul Lewis) — "Reduce the scope and complexity of style calculations" (incl. Rune Lillesveen quote on selector-matching share of style calc; `.box:nth-last-child(-n+1) .title` example; elements × selectors worst case). https://web.dev/articles/reduce-the-scope-and-complexity-of-style-calculations (accessed 2026-08-12)
27. Lit documentation — "Working with Shadow DOM" ("DOM APIs like document.querySelector won't find elements in the component's shadow DOM"). https://lit.dev/docs/components/shadow-dom/ (accessed 2026-08-12)
28. WHATWG/dom issue #1422 — "Option to allow querySelector to query shadow roots" (userland recursive-walk implementation, called "nontrivial … very inefficient"; links to TreeWalker issue #1189). https://github.com/whatwg/dom/issues/1422 (accessed 2026-08-12)
29. Stack Overflow — "querySelector and querySelectorAll vs getElementsByClassName and getElementById" (O(n) vs O(1) framing; live vs static; CSS.escape for IDs with colons; community benchmark table). https://stackoverflow.com/questions/14377590/queryselector-and-queryselectorall-vs-getelementsbyclassname-and-getelementbyid (accessed 2026-08-12)
30. Nicholas C. Zakas — "Why is getElementsByTagName() faster than querySelectorAll()?" (DynamicNodeList vs StaticNodeList; infinite-loop demo with live lists), as reproduced in richardmyu/blog issue #1. https://github.com/richardmyu/blog/issues/1 (original: https://www.nczonline.net/blog/2010/09/28/why-is-getelementsbytagname-faster-that-queryselectorall/) (accessed 2026-08-12)
31. Zhihu — "getElementsByClassName 和 querySelectorAll 的正确对比" (the `.outer .inner` vs `:scope` scoped-qSA demonstration; cached-length benchmark discussion). https://zhuanlan.zhihu.com/p/156011481 (accessed 2026-08-12)
32. Stack Overflow — "querySelectorAll vs NodeIterator vs TreeWalker — fastest pure JS flat DOM iterator" (TreeWalker fastest in Chrome tests). https://stackoverflow.com/questions/64551229/queryselectorall-vs-nodeiterator-vs-treewalker-fastest-pure-js-flat-dom-iterat (accessed 2026-08-12)
33. Sindre Sorhus gist — "TreeWalker performance" (Chrome 17 / Safari 5 / Firefox 10 numbers; engine-dependent results). https://gist.github.com/sindresorhus/1989724 (accessed 2026-08-12)
34. CSSWG issue #556 — "[cssom-view] elementFromPoint, elementsFromPoint, and caretPositionFromPoint should not return an element inside a shadow tree" (retargeting resolution). https://github.com/w3c/csswg-drafts/issues/556 (accessed 2026-08-12)
35. Nolan Lawson — "Managing focus in the shadow DOM" (children/parentElement cannot cross shadow boundaries; getRootNode/shadowRoot needed). https://nolanlawson.com/2021/02/13/managing-focus-in-the-shadow-dom/ (accessed 2026-08-12)
36. Go Make Things — "Live vs. static NodeLists and HTMLCollections in vanilla JS" (behavioral demos). https://gomakethings.com/articles/live-vs.-static-nodelists-and-htmlcollections-in-vanilla-js/ (accessed 2026-08-12)

_Methodology note: ≥15 distinct web searches executed (2026-08-12); primary normative text extracted
verbatim from WHATWG DOM, WHATWG HTML, CSS Selectors 4, and CSSOM View specification documents;
MDN pages used for developer-facing semantics; benchmarks cited are community micro-benchmarks and
are labeled as indicative rather than authoritative._
