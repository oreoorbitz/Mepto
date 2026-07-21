# V8 Optimization Rules for Refactoring a DOM-Utility Library (Zepto/jQuery-style fork)

**Scope & method:** Guidance synthesized from primary V8-team sources (v8.dev blog posts, Mathias Bynens & Benedikt Meurer, Vyacheslav "mrale" Egorov, the Bluebird "Optimization killers" wiki by Petka "Esailija" Antonov, web.dev, Paul Irish's forced-layout gist, MDN). Target: a ~2,200-line TypeScript DOM library, i.e. *library code that runs hot inside other people's apps* — so rules favor "predictable for the JIT" over cleverness.

**Rule 0 (meta, before anything else):** V8's pipeline (Ignition → Sparkplug → Maglev → TurboFan) optimizes *observed* behavior and deopts when assumptions break; only hot functions matter, so profile first (`node --prof`, Chrome DevTools Performance, `--trace-deopt`, `%GetOptimizationStatus` with `--allow-natives-syntax`) and keep code idiomatic. V8's own engineers end their polymorphism post with: *"Write idiomatic JavaScript, let the engine take care of the performance, optimize only when necessary and after careful profiling."*
Sources: https://v8.dev/blog/launching-ignition-and-turbofan · https://benediktmeurer.de/2018/03/23/impact-of-polymorphism-on-component-based-frameworks-like-react/ · https://v8.dev/docs/profile

---

## A. Object shapes / hidden classes

**1. Initialize every property an object will ever have inside the constructor, in the same order, every time (use `null`/`undefined` placeholders).**
*Why:* objects with the same properties in the same order share one hidden class, giving ICs a single map to check; late/conditional property addition creates transition trees and new maps.
Source: https://mathiasbynens.be/notes/shapes-ics · https://v8.dev/blog/fast-properties

**2. Never add properties to an object conditionally on a hot path (`if (x) obj.feature = ...`).**
*Why:* one conditional property introduces a brand-new shape into an otherwise stable hot object, polluting inline caches and forcing deopt.
Source: https://www.thenodebook.com/node-arch/v8-engine-intro

**3. Don't `delete` object properties; for deletable entries use a `Map` (or assign `undefined` if the "key still exists" semantics are acceptable).**
*Why:* `delete` drops the object into dictionary/slow-property mode and inline caches stop working on it.
Source: https://v8.dev/blog/fast-properties

**4. For string-keyed caches with churn (e.g. `Record<string, RegExp>`), prefer `Map`; use a plain object only for small, fixed, write-once key sets.**
*Why:* `Map` is a purpose-built hash table with no hidden-class bookkeeping, no prototype-chain hazards, and performs better "in scenarios involving frequent additions and removals of key-value pairs".
Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#objects_vs._maps · https://github.com/isaacs/node-lru-cache/issues/54

**5. Don't mix "struct" usage and "dictionary" usage on the same object.**
*Why:* fast-property mode and dictionary mode are different representations; an object that gets many dynamic keys normalizes to dictionary mode, permanently slowing every *named* access on it too.
Source: https://v8.dev/blog/fast-properties

**6. `this[i] = ...` in a constructor builds an *elements* store, not properties — but a hand-rolled array-like is still a second-class citizen; `Array.prototype` methods are "highly optimized in V8" for real arrays and "won't be fully optimized" on array-likes.**
Source: https://v8.dev/blog/elements-kinds ("Prefer arrays over array-like objects")

**7. Keep hot functions monomorphic: one object shape (and one elements kind) per call site; ≤4 shapes is tolerable ("polymorphic"), more is "megamorphic".**
*Why:* monomorphic ICs compile to a map check + direct load and can be inlined; megamorphic sites fall back to a fixed-size global stub cache with collision contention (V8 demo: 100→900 shapes goes from 43 ms to 2,428 ms).
Source: https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html · https://benediktmeurer.de/2018/03/23/impact-of-polymorphism-on-component-based-frameworks-like-react/

**8. When you must iterate heterogeneous objects, hoist the method out of the loop instead of a megamorphic `obj.method()` inside the loop.**
Source: https://benediktmeurer.de/2018/03/23/impact-of-polymorphism-on-component-based-frameworks-like-react/

**9. Membership tests on caches: prefer `Map.has`; on plain objects use `key in obj` only on null-prototype objects, and never `obj.hasOwnProperty(key)` in a hot loop.**
Source: https://v8.dev/blog/fast-properties · MDN Objects vs. Maps

**10. `Object.create(null)` is the right *object* choice for string-keyed dictionaries (no `__proto__` pollution), but not a performance silver bullet — for high-churn caches `Map` still wins.**
Source: MDN Objects vs. Maps · https://github.com/isaacs/node-lru-cache/issues/54

## B. `arguments` and arity dispatch

**11. Never let `arguments` escape its function: don't return it, pass it to another function, store it, or `[].slice.call(arguments)` it.**
Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#3-managing-arguments

**12. If you use `arguments` at all, restrict yourself to the documented safe subset: `arguments.length`, `arguments[i]` (in bounds), and `fn.apply(thisArg, arguments)`.**
Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#what-is-safe-arguments-usage

**13. Prefer rest parameters `(...args)` over `arguments` for new code — they are real packed arrays, optimizable.**
Source: https://v8.dev/blog/elements-kinds

**14. For arity-based dispatch use `arguments.length` (safe) — but avoid `0 in arguments`-style existence checks, and prefer default parameters over `if (arguments.length < 2) a = 5`.**
Source: Bluebird wiki · https://benediktmeurer.de/2016/11/25/v8-behind-the-scenes-november-edition

## C. try/catch

**15. `try/catch` is no longer an optimization killer — a `try { JSON.parse(x) } catch { … }` fallback is acceptable even in warm code.**
*Why:* Crankshaft (pre-2017) refused to optimize functions containing try/catch; TurboFan optimizes the whole language (since V8 5.3/5.6, Chrome 56+/Node 7+).
Source: Bluebird wiki ("All this is wrong in TurboFan (Node 8+)") · https://v8.dev/blog/v8-release-56

**16. Still: don't use exceptions as routine control flow in hot loops — throwing (stack-trace capture) is the expensive part, not the `try` block itself.**
Source: https://www.thenodebook.com/node-arch/v8-engine-intro · https://v8.dev/blog/v8-release-56

## D. Iteration & arrays

**17. Never loop past the end of an array (`for (let i = 0; (item = items[i]) != null; i++)`) — the V8 team's #1 performance tip, explicitly calling out that "jQuery uses this pattern in a few places".**
*Why:* one out-of-bounds read permanently taints that load site; fixing `i <= length` to `i < length` gave a **6×** speedup in V8's example.
Source: https://v8.dev/blog/elements-kinds

**18. `for...of` and `forEach` are now on par with the classic indexed `for` loop — choose the most readable form.**
Source: https://v8.dev/blog/elements-kinds

**19. Don't repeatedly run array generics on array-likes (`Array.prototype.filter.call(nodeList, fn)`); convert once (`[...nodeList]`, `Array.from`) if you operate on it more than once, or use `for...of` directly on iterables.**
Source: https://v8.dev/blog/elements-kinds

**20. Default to `Object.keys(obj)` + indexed loop for object enumeration; use `for...in` only on objects you control — and never on arrays.**
Source: https://v8.dev/blog/fast-for-in · Bluebird wiki

**21. Keep arrays' elements kinds stable and packed: build with literals or `push`, don't mix numbers/strings/objects in one hot array.**
Source: https://v8.dev/blog/elements-kinds

**22. Route hot iteration over many differently-kinded arrays through built-ins rather than your own `each()` utility.**
Source: https://v8.dev/blog/elements-kinds

## E. RegExp & strings

**23. Define regexes once at module scope; never add own properties to a regex instance or monkey-patch `RegExp.prototype`.**
Source: https://v8.dev/blog/speeding-up-regular-expressions

**24. Never call `.test()`/`.exec()` on a *shared* regex that has the `/g` (or `/y`) flag — drop the flag for boolean tests or reset `lastIndex`.**
Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/lastIndex

**25. Collapse `.replace()` chains into a single pass where practical — k chained replaces allocate k intermediate strings.**
Source: MDN String/replace · https://v8.dev/blog/trash-talk

**26. Building strings with `+=` is fine in modern V8 (ropes + constant folding) — don't contort code into push+join; but less churn = less GC.**
Source: V8-dev SO answer · https://v8.dev/blog/trash-talk

## F. Allocation & closures in hot code

**27. Hoist loop-invariant allocations — compiled regexes, `Set`s for membership, callbacks, cached lookups — out of hot functions/loops.**
Source: https://v8.dev/blog/trash-talk

**28. Don't allocate closures per iteration in hot paths; define stable callbacks once.**
Source: https://v8.dev/blog/trash-talk · https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html

## G. DOM-specific

**29. Use `classList.add/remove/toggle/contains` instead of `className` string surgery; reserve `className = "..."` for wholesale replacement.**
Source: https://developer.mozilla.org/en-US/docs/Web/API/Element/classList · https://gist.github.com/paulirish/5d52fb081b3570c81e3a

**30. Strictly separate DOM read phases from write phases — read all geometry first, then apply all mutations; never `write → read → write` in a loop (layout thrashing).**
Source: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing · Paul Irish gist

**31. Treat `getComputedStyle()` as expensive: call once and cache, never per-element in loops.**
Source: Paul Irish gist

**32. Call `getBoundingClientRect()`/offset*/client* only at frame start when values still match the last layout, and cache within the frame.**
Source: Paul Irish gist · web.dev

**33. Use native `el.closest(selector)`, `node.contains(other)`, and `el.matches(selector)` instead of hand-rolled `parentNode`/`while` climbs.**
Source: https://developer.mozilla.org/en-US/docs/Web/API/Element/closest · MDN Node/contains

---

## Still true in modern V8 (2024+) vs. outdated myths

| Claim | Verdict (2024+, V8 12.x) | Evidence |
|---|---|---|
| Hidden classes / inline caches / monomorphism matter | **Still true** — core of Maglev/TurboFan speculation | mathiasbynens.be/notes/shapes-ics; mrale.ph |
| `delete` ruins the object | **Still true** — dictionary mode, ICs disabled; use `Map` | v8.dev/blog/fast-properties |
| Initialize all fields in constructor, same order | **Still true** | shapes-ics |
| Elements-kind transitions are one-way; holes are forever | **Still true** | v8.dev/blog/elements-kinds |
| Reading past array length poisons the load site | **Still true** (6× example; jQuery called out) | v8.dev/blog/elements-kinds |
| Escaping `arguments` is toxic; rest params preferred | **Still true** | Bluebird wiki; elements-kinds |
| `Map` beats object for churn-heavy caches | **Still true** | MDN; node-lru-cache #54 |
| Layout thrashing / forced sync layout is the main DOM cost | **Still true** (browser, not V8) | web.dev; Paul Irish gist |
| `/g` regex `lastIndex` statefulness | **Still true** (spec semantics) | MDN RegExp/lastIndex |
| "try/catch prevents optimization" | **Outdated myth** — fixed in V8 5.3/5.6 (2016–17). Only *throwing* is costly. | Bluebird wiki; v8.dev/blog/v8-release-56 |
| "Merely mentioning `arguments` allocates it / kills the function" | **Outdated (was always FUD)** — safe subset is fine | Bluebird wiki |
| "`for...in` is always slow" | **Outdated** — EnumCache fast path since 2017 for clean fast-mode objects | v8.dev/blog/fast-for-in |
| "Manual `for` beats `forEach`/`for...of`" | **Outdated** — "on par" per V8 team | v8.dev/blog/elements-kinds |
| "String `+=` in loops is slow; use array.join" | **Mostly outdated** — ropes + constant folding | V8-dev SO answer |
| "Manually cache `array.length` before loops" | **Outdated** — engines hoist this | v8.dev/blog/elements-kinds |
| "Avoid all closures/allocations in loops" | **Overstated** — young-gen garbage is cheap; only hoist in *proven-hot* code | v8.dev/blog/trash-talk |
| The Bluebird "Optimization killers" list as a whole | **Mostly historical** — the wiki itself warns: "All this is wrong in TurboFan (Node 8+)" | Bluebird wiki |

### Verification toolkit
- `node --trace-opt --trace-deopt app.js`, and `%GetOptimizationStatus(fn)` / `%HaveSameMap(a,b)` / `%HasFastProperties(obj)` under `--allow-natives-syntax`.
- Chrome DevTools → Performance panel: watch for purple "Layout"/"Recalculate Style" blocks flagged *forced reflow* after library calls.
