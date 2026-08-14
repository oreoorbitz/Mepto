# 1. The Mental Model: What a Keystroke Costs

A keystroke is not one event and not one cost: it is a pipeline of engine work that terminates — optionally — in your JavaScript. This chapter fixes the vocabulary: what registration buys you, what the dispatch algorithm does before user code runs, what a `KeyboardEvent` can and cannot tell you, and where focus and IME redirect the flow. Chapters 2 and 3 descend into engine internals and measurements; everything here is semantics — the contracts that make those measurements interpretable.

## 1.1 Listener registration surface

### 1.1.1 `addEventListener` options, dedup, removal matching; `on*` handlers; `handleEvent` objects

Registration is per-(target, type): each `EventTarget` owns an event listener list, and that list is only scanned when an event of the matching type dispatches through the node — an empty list costs nothing at dispatch.[^2^] The full option surface, with the semantics that matter for cost accounting:

| Option / mechanism                           | Semantics                                                                                                                                         | Cost-relevant fact                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture` (default `false`)                  | When `true`, the listener fires before any `EventTarget` beneath it in the tree;[^1^] at `AT_TARGET`, capture and bubble listeners both run.[^2^] | Capture listeners on `window`/`document` run _first_ for every matching event anywhere in the tree — the standard hot path for global shortcut managers. |
| `once` (default `false`)                     | "The listener will only be invoked once after which the event listener will be removed."[^2^]                                                     | Auto-removal happens at invoke time; add-time dedup still applies.                                                                                       |
| `passive` (default `false`, with exceptions) | The listener "will never call `preventDefault()`"; if it does, the canceled flag is not set and a console warning may be generated.[^1^][^3^]     | The scroll-unblocking contract: with `passive: true` the compositor may scroll without waiting for the main thread. Never applies to keyboard (§1.2.2).  |
| `signal` (`AbortSignal`)                     | "The event listener will be removed when signal is aborted."[^2^]                                                                                 | O(1)-ish teardown of an entire shortcut scope (e.g., a modal) via one `abort()`, without storing each callback reference.                                |
| `on*` IDL attribute                          | Acts as a _non-capture_ event listener;[^5^] exactly one handler per (object, type) slot — assignment overwrites, `null` clears.                  | No capture/passive/once/signal control; libraries must use `addEventListener` to coexist with other owners.[^1^]                                         |
| `handleEvent` object                         | Any object with a `handleEvent()` method is a valid listener; `this` inside it is the object itself.[^1^][^6^]                                    | No closure or `.bind()` allocation per registration; identity-based removal is robust. Works only with `addEventListener`, not `on*` properties.[^6^]    |

Two matching rules govern the list, and both are classic traps. Dedup: a listener "is **not appended if it has the same type, callback, and capture**"[^2^] — `passive`, `once`, and `signal` are _not_ part of the key, so re-adding with different values silently updates nothing. Symmetrically, `removeEventListener` matches on (type, callback, capture) only — "the only option `removeEventListener()` checks is the `capture`/`useCapture` flag."[^7^] The practical consequence:

```js
// TRAP: anonymous callbacks defeat both dedup and removal.
el.addEventListener('keydown', e => onKey(e)) // registered
el.addEventListener('keydown', e => onKey(e)) // registered AGAIN (no dedup)
el.removeEventListener('keydown', e => onKey(e)) // removes NOTHING
// FIX: keep a stable reference, or pass { signal } from an AbortController.
```

Invocation order across mechanisms is registration order of the _listener entries_: interleaving `addEventListener('click', a)`, `onclick = b`, `addEventListener('click', c)` fires a, b, c, because setting the IDL attribute moves or creates a single entry.[^5^]

### 1.1.2 The five cost layers of a keystroke

We frame the cost of one keystroke as five sequential layers; every claim in this book's measurements (Ch. 3) maps onto one of them:

1. **OS/input pipeline → renderer.** Key scanning, layout resolution, IME arbitration, cross-process delivery into the main thread. Invisible to JS — and excluded entirely by synthetic-event benchmarks (§1.3.3).
2. **EventPath construction.** Per dispatch, the engine computes "a static ordered list of all its ancestors in tree order," once, up front.[^3^] Cost is O(path length); deep trees pay more before any listener is consulted.
3. **Per-node listener lookup.** For each object on the path, the engine scans its listener list for type and capture match, plus once/removed/passive bookkeeping, before user code runs.[^3^][^13^] Long listener lists on hot nodes multiply fixed dispatch overhead.
4. **Per-listener C++→JS invocation.** Each matched listener crosses the engine boundary: arguments marshaled, `currentTarget` set, invoke-loop bookkeeping applied. This is where N leaf listeners lose to one delegated listener.[^1^]
5. **Handler body.** Your code — and keyboard events make it uniquely expensive: keyboard default actions run synchronously on the main thread after dispatch, so a slow `keydown` handler _directly_ delays text insertion, scrolling, and focus movement for that keystroke.

Layers 1–4 are fixed per dispatch; layer 5 is where optimization lives. The vocabulary of §1.2–§1.4 is the toolset for shaving layers 3–5.

## 1.2 Event flow semantics that cost money

### 1.2.1 Capture → target → bubble; one path, computed once; flag semantics

The dispatch algorithm (WHATWG DOM): set the dispatch flag; initialize `target`; compute the event path once as a static ordered list of ancestors; run `CAPTURING_PHASE` down the path; run `AT_TARGET` listeners; if `bubbles`, reverse the path and run `BUBBLING_PHASE`; then clear flags, reset `eventPhase` to `NONE` and `currentTarget` to `null`.[^3^][^9^] The path is _not_ recomputed if handlers mutate the DOM mid-dispatch — "once determined, the propagation path must not be changed… even if an element in the propagation path is moved within the DOM or removed from the DOM."[^10^] Mutating the tree inside a handler never saves dispatch work for the current event.

`composedPath()` returns that precomputed path (target → … → `window`), including shadow-tree nodes for open roots and omitting closed roots.[^11^][^12^] The path already exists internally, so the call is essentially a materialization — but it **allocates a fresh JS array on every call**. On a hot key path, prefer `event.target` (already retargeted).

Flow control is flag bookkeeping, and each method buys back a different slice of layers 3–4:

- `stopPropagation()` sets the stop propagation flag; remaining listeners _on the current node still run_, but nodes further along the path are skipped.[^3^]
- `stopImmediatePropagation()` sets both stop flags; even sibling listeners on the current node are skipped — the cheapest way to truncate dispatch.[^3^][^13^]
- `preventDefault()` sets the canceled flag iff `cancelable` is true _and_ the in-passive-listener flag is unset.[^3^] It does **not** stop propagation — and vice versa. Swallowing a key fully requires both.

### 1.2.2 Passive defaults, cancelability, retargeting and `composed`

Passive-by-default is a scroll intervention, not a keyboard one: in browsers other than Safari, `passive` defaults to `true` for `wheel`, `mousewheel`, `touchstart`, and `touchmove` listeners registered at the document/window level.[^1^][^4^] Keyboard events are **never** defaulted to passive anywhere — not an omission: keyboard default actions are not compositor-driven scrolls but run synchronously on the main thread after dispatch, so there is nothing for a passive contract to unblock. Your `keydown` handler is always on the critical path.

Cancelability is per-type: `keydown`, `keyup`, `keypress`, `beforeinput` (outside IME internals), and `compositionstart` are cancelable; `input`, `compositionupdate`, and `compositionend` are not, per spec — with Chrome/Safari deviating on the composition events.[^15^][^16^]

For shadow DOM, two facts suffice. Retargeting: as an event crosses a shadow boundary, each listener sees `event.target` rewritten to "an element in the same scope as the listening element"; `composedPath()[0]` recovers the original target.[^11^][^12^] `composed`: keyboard events are `composed: true` (as are `beforeinput`, `input`, the four focus events, and all composition events), while custom events default to `composed: false` — "a `bubbles`-only custom event silently dies at the shadow root."[^12^][^14^] Because `keydown` is both composed and bubbling, one `document`-level listener sees keys from inside every shadow tree; per-component key listeners inside components mean handling the _same_ event twice.

## 1.3 The KeyboardEvent surface

### 1.3.1 `key` vs `code` vs legacy; `location`; `repeat`; `isComposing`; modifiers; `getLayoutMap`; special values

| Property                                | Type               | Semantics                                                                                                                                                               | Perf-relevant note                                                                                                                        |
| --------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                                   | string             | Meaning after layout + modifiers: `"q"`/`"Q"`, `"Enter"`, `"Dead"`, `"Process"`, `"Unidentified"`; falls back to `"Unidentified"` when nothing can be determined.[^17^] | Requires engine layout resolution; layout-dependent (`Control+Q` → `"q"` on US).                                                          |
| `code`                                  | string             | Physical position, layout-independent: `"KeyA"` is "labelled `q` on an AZERTY keyboard."[^18^]                                                                          | The right key for positional shortcuts; stable interned-string compare.                                                                   |
| `keyCode` / `charCode` / `which`        | number             | **Deprecated**; "a system and implementation dependent numerical code… inconsistent across platforms";[^19^][^15^] `which` is the Netscape-legacy union.[^21^]          | Ubiquitous in legacy code; number compare is fast but layout-dependent. IME marker: **229**.[^20^]                                        |
| `location`                              | number             | `STANDARD`=0, `LEFT`=1, `RIGHT`=2, `NUMPAD`=3.[^15^][^22^]                                                                                                              | Cheap constant compare; `code` (`"ShiftLeft"`) often already encodes it.                                                                  |
| `repeat`                                | boolean            | `true` once the key triggers key repetition.[^15^]                                                                                                                      | First-line filter: `if (e.repeat) return;` — but see Firefox/X11 bugs.[^23^]                                                              |
| `isComposing`                           | boolean            | `true` while the event belongs to an IME composition session.[^15^]                                                                                                     | One boolean read; the standard IME guard.                                                                                                 |
| `altKey`/`ctrlKey`/`metaKey`/`shiftKey` | boolean            | The four classic modifiers.                                                                                                                                             | Cheapest possible reads; sufficient for most shortcut logic.                                                                              |
| `getModifierState(k)`                   | method             | Any modifier — `"AltGraph"`, `"CapsLock"`, `"Fn"`, `"OS"`, plus virtual `"Accel"` (Control on Windows, Meta on macOS).[^24^][^25^]                                      | The only way to read lock states; a call + string compare, so cache when scanning many events.                                            |
| `KeyboardEvent.getLayoutMap()`          | static → `Promise` | `code` → label map for the highest-priority ASCII-capable layout; secure-context, top-level-only, Permissions-Policy gated.[^26^]                                       | **Async** — unusable inside a handler for _that_ keystroke; cache at startup, listen for `layoutchange`. Chromium-only in practice.[^26^] |

The three special `key` values are correctness traps with cost consequences: `"Dead"` for dead keys, `"Process"` for keys consumed by IME processing, `"Unidentified"` when no value can be determined (virtual keyboards often report keyCode 229 + `"Unidentified"`).[^17^][^20^] Shortcut matchers that do not exclude these will treat IME input as commands. Note also the constructor asymmetry: `new KeyboardEvent(type, init)` accepts `key`, `code`, `location`, `repeat`, `isComposing`, and modifier inits — but **`keyCode`/`charCode`/`which` are not settable** and stay 0 on synthetic events.[^15^][^27^]

### 1.3.2 Ordering, keydown cancellation, auto-repeat, 229

One printable character produces, in shipping order (Chrome/Safari, effectively all modern engines): `keydown` → `keypress` → `beforeinput` → `input` → `keyup` — the draft spec orders `beforeinput` before `keypress`, a documented mismatch (uievents #220).[^28^] `keypress` is deprecated legacy, fired only for character-producing keys.[^15^] Cancellation is asymmetric in a way shortcut authors must internalize:

"Canceling the default action of a `keydown` event MUST NOT affect its respective `keyup` event, but it MUST prevent the respective `beforeinput` and `input` (and `keypress` if supported) events from being generated."[^15^]

So canceling `keydown` suppresses character insertion, arrow/Space/PageUp scrolling,[^29^] and Tab focus movement — the exact mechanism focus-trap libraries use for containment[^30^] — while modifier bookkeeping still occurs ("the keystroke MUST still be taken into account for the modifiers states").[^15^] Dead keys and IME sequences can be canceled only on `keydown`; "canceling a dead key on a `keyup` event has no effect."[^15^] Browser-chrome shortcuts (Ctrl+T et al.) are generally not cancelable from page JS at all.

Auto-repeat has a defined shape: a held key produces repeating `keydown` → `beforeinput` → `input` triples "at a rate determined by the system configuration," with `repeat: true` on the repeated keydowns;[^15^] `keyup` fires once on release (whether `keyup.repeat` may be true is an open question, uievents #396).[^31^] Divergence: Firefox under X11/XINPUT2 can emit repeated keydowns with `repeat: false`,[^23^] and on mobile long-press the first `repeat: true` event signals the long press itself.[^15^][^20^] During IME processing, legacy `keyCode` is conventionally 229 — the de-facto "this keystroke is not yours" marker.[^20^]

### 1.3.3 Trusted vs synthetic: the benchmarking trap

`el.dispatchEvent(new KeyboardEvent('keydown', {key:'a', code:'KeyA'}))` runs the _full_ dispatch algorithm — path construction, phases, listener invocation — so layers 2–4 of §1.1.2 are faithfully exercised. Everything else is absent: `isTrusted` is false ("true when the event was generated by a user action, and false when… dispatched via dispatchEvent"[^34^]); **no default actions occur** — no insertion, scrolling, focus move, or `beforeinput`/`input` cascade ("we can either dispatch the correct events OR emulate typing, not both"[^35^]); legacy `keyCode` reports 0;[^27^] and synthetic keydown does not chain into keypress/beforeinput/input automatically.

```js
// TRAP: this measures dispatch + listener cost ONLY —
// no layout mapping, no IME, no editor default actions, no paint.
const t0 = performance.now()
for (let i = 0; i < N; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
// For trusted-input numbers you need OS-level automation
// (WebDriver / CDP Input.dispatchKeyEvent), not dispatchEvent.
```

Every `dispatchEvent` microbenchmark in the wild undercounts the real cost of a keystroke by exactly layers 1 and 5's default-action tail.

## 1.4 Focus, targeting, and IME

### 1.4.1 The keyboard target rule; `focus`/`blur` vs `focusin`/`focusout`

Trusted key events originate at "the focused element processing the key event or if no element focused, then the body element if available, otherwise the root element."[^15^] When the focused element is removed, disabled, or hidden, the HTML focus fixup rule moves the focused area to the viewport, "reflected through the `activeElement` API as the body element."[^36^][^37^] The event then bubbles `element → … → body → html → document → window`: a `window` keydown listener is the last bubble stop; a `window` _capture_ listener is the first code to see the key. A document-level listener therefore needs no focus management to observe everything.

Focus transitions are observable through two pairs: `focus`/`blur` do **not** bubble; `focusin`/`focusout` do — and all four are `composed: true`.[^12^][^38^] Capture listeners on ancestors are the alternative channel for the non-bubbling pair. This matters because shortcut scope is almost always focus scope: _which_ pair you listen to determines whether one delegated handler suffices or per-element registration is required.

### 1.4.2 Composition sessions and cross-browser divergence

A composition session is exactly "one `compositionstart` event, one or more `compositionupdate` events, and one `compositionend` event."[^15^] Key events flow throughout: "during the composition session, `keydown` and `keyup` events MUST still be sent, and these events MUST have the `isComposing` attribute set to `true`."[^15^] The progression is precise: the initiating `keydown` has `isComposing: false`, everything inside the session has it `true`, and the committing `keydown` is followed by `compositionend`, then (per spec) `keyup`.[^15^] Input events inside a session run `beforeinput` → `compositionupdate` → DOM update → `input`; canceling `beforeinput` prevents the DOM update and the `input`; no `beforeinput`/`input` accompany `compositionend`.[^15^]

Interoperability diverges at the edges. The spec makes `compositionupdate`/`compositionend` non-cancelable; Chrome/Safari make them cancelable; Firefox makes even `compositionstart` non-cancelable, and Chrome/Safari additionally fire the legacy `textInput` between `beforeinput` and `input`.[^28^] Around session end, Firefox/Safari emit a `keyup` after `compositionend` while Chrome/Edge do not, and Safari emits an extra `keydown` with `which === 229`.[^32^] Engine bugs surface too — Chromium 147 fired a spurious `deleteContentBackward` before `compositionstart`.[^33^] The practical handler rule is also the cheap one: skip `keydown` handling while `e.isComposing` (or `e.keyCode === 229`), and treat the post-`compositionend` `keyup` as possibly swallowed, per-browser. One boolean read buys immunity to the entire divergence surface:

```js
function onKeydown(e) {
  if (e.repeat || e.isComposing || e.keyCode === 229) return // one-line IME/repeat guard
  // ... shortcut logic
}
```
