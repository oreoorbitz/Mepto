# Event Listener & KeyboardEvent API Semantics — Definitive Reference (Facet: Complete API Surface)

Focus: every performance-relevant semantic of DOM event-listener registration, event flow, and the
KeyboardEvent interface, with verbatim spec quotes where they pin behavior. Access date for all
sources: 2026-08-12.

---

## 1. Listener registration semantics

### 1.1 `addEventListener(type, listener, options)` — full options table

| Option     | Type / default                                   | Semantics (spec-pinned)                                                                                                                                                                                                                                                                                                                                                                                                                                              | Perf-relevant notes                                                                                                                                                       |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | case-sensitive string                            | Event type to listen for                                                                                                                                                                                                                                                                                                                                                                                                                                             | Registration is per-(target, type); the listener _list_ is only scanned when an event of that type dispatches through the node — an empty list costs nothing at dispatch. |
| `listener` | function, object with `handleEvent()`, or `null` | "This must be `null`, an object with a `handleEvent()` method, or a JavaScript function."[^1^]                                                                                                                                                                                                                                                                                                                                                                       | `handleEvent`-object listeners preserve `this` (no `.bind()` allocation per registration); removing is trivially possible because the object identity is stable.          |
| `capture`  | boolean, default `false`                         | When `true`, "events of this type will be dispatched to the registered `listener` before being dispatched to any `EventTarget` beneath it in the DOM tree."[^1^] Listener fires in capture phase instead of bubble; at `AT_TARGET` both fire (spec: capture=true "prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE… Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET"[^2^]) | Capture listeners on `window`/`document` run _first_ for every event of that type anywhere in the tree — the standard hot-path for global shortcut managers.              |
| `once`     | boolean, default `false`                         | "the listener will only be invoked once after which the event listener will be removed."[^2^]                                                                                                                                                                                                                                                                                                                                                                        | Auto-removal happens at invoke time; identical (type, callback, capture) tuple dedup still applies at add time.                                                           |
| `passive`  | boolean, default `false` **with exceptions**     | "if `true`, indicates that the function specified by `listener` will never call `preventDefault()`. If a passive listener calls `preventDefault()`, nothing will happen and a console warning may be generated." DOM spec: `preventDefault()` "must set the canceled flag if the `cancelable` attribute value is true **and the in passive listener flag is unset**."[^3^]                                                                                           | This is the scroll-unblocking contract: with `passive: true` the compositor may scroll without waiting for the main thread.                                               |
| `signal`   | `AbortSignal`, optional                          | "If an AbortSignal is passed for options's signal, then the event listener will be removed when signal is aborted."[^2^]                                                                                                                                                                                                                                                                                                                                             | O(1)-ish teardown of many listeners via one `AbortController`; avoids storing/removing each callback reference.                                                           |

Dedup rule (verbatim, DOM spec via MDN/TS lib): "The event listener is appended to target's event listener list and is **not appended if it has the same type, callback, and capture**."[^2^] Note `passive`/`once`/`signal` are _not_ part of the dedup key — re-adding the same (type, callback, capture) with different other options updates nothing.

### 1.2 Passive defaults (scroll intervention)

- MDN: `passive` "defaults to `false` – **except that in browsers other than Safari, it defaults to `true` for `wheel`, `mousewheel`, `touchstart` and `touchmove` events**" — only when the listener is registered at the document/window level (the "document-level default passive" intervention, Chrome 56+ for touch, 73+ for wheel).[^1^][^4^]
- Keyboard events (`keydown`/`keyup`/`keypress`) are **never** defaulted to passive anywhere — but they are also not scroll-blocking in the compositor sense; their default actions run synchronously on the main thread after dispatch.
- `preventDefault()` inside a passive listener: canceled flag is not set; console warning may be logged.[^1^][^3^]

### 1.3 `on*` IDL attribute handlers vs `addEventListener`

- HTML spec: "Many objects can have event handlers specified. These act as **non-capture event listeners** for the object on which they are specified."[^5^]
- Exactly one handler per (object, event type) slot: assignment overwrites; `null` clears. No capture, no passive, no once, no signal. Multiple listeners per type require `addEventListener`.
- Invocation order is registration order across both mechanisms interleaved — the HTML spec example shows `addEventListener('click',…)` → `onclick = …` → `addEventListener('click',…)` firing in the order the _listener entries_ were created (setting the IDL attribute moves/creates one entry).[^5^]
- `body`/`frameset` on\* handlers for window events (`onkeydown` is element-level though; `onload` etc. retarget to `Window`).[^5^]
- Perf note: an `onkeydown = fn` property handler is fine for a single owner; libraries must use `addEventListener` to coexist (MDN: addEventListener "allows adding more than one handler for an event… In contrast to using an `onXYZ` property, it gives you finer-grained control of the phase").[^1^]

### 1.4 `handleEvent`-object listeners

The `EventListener` callback interface: any object with a `handleEvent` method is a valid listener; `this` inside `handleEvent` is the object itself.[^1^][^6^] Works only with `addEventListener`, not `on*` properties.[^6^] Perf: no closure/`.bind` allocation; identity-based removal is robust.

### 1.5 `removeEventListener` matching

- Matching key is **(type, callback, capture) only** — `passive`/`once` are ignored. Verbatim (MDN): "the only option `removeEventListener()` checks is the `capture`/`useCapture` flag."[^7^]
- Some engines (happy-dom, older Deno) have had bugs ignoring `capture` in removal; spec is unambiguous (dom.spec.whatwg.org #dom-eventtarget-removeeventlistener).[^7^][^8^]

### 1.6 Target surface: element vs document vs window vs DocumentFragment

- Any `EventTarget` works: `Element`, `Document`, `Window`, `DocumentFragment`, `XMLHttpRequest`, etc.[^1^]
- Key events targeted at an element **bubble through `document` to `window`** (window is the last item of the composed path for document-tree events). A `keydown` listener on `window` and one on `document` therefore both see the same event; `document` listeners see it one step earlier (bubble) or later (capture, window first).
- `DocumentFragment`: listeners on a fragment only see events while the fragment is on the event path (i.e., its contents are not yet, or are, inserted). A detached fragment is still a valid target for synthetic dispatch.
- Shadow roots are also `EventTarget`s and appear in the composed path between the shadow-tree target and the host.

---

## 2. Event flow & control-cost semantics

### 2.1 The dispatch algorithm (DOM Standard)

Verbatim skeleton of the dispatch algorithm (DOM 4.1 / WHATWG DOM):[^3^][^9^]

1. "Set event's **dispatch flag**." (prevents re-dispatch of the same event object while in flight)
2. "Initialize event's `target` attribute to target."
3. "If event's `target` attribute value is participating in a tree, let **event path be a static ordered list of all its ancestors in tree order**…" — the path is computed **once, up front**, and is not recomputed if handlers mutate the DOM. Older DOM3 text: "Once determined, the propagation path must not be changed… even if an element in the propagation path is moved within the DOM or removed from the DOM."[^10^]
4. `CAPTURING_PHASE`: "For each object in event path, invoke its event listeners with event, as long as event's stop propagation flag is unset."
5. `AT_TARGET`: invoke target's listeners.
6. If `bubbles`: reverse path, `BUBBLING_PHASE`, invoke again per object.
7. Unset dispatch/stop flags; `eventPhase` → `NONE`; `currentTarget` → `null`.
8. If `cancelable` and canceled flag set → `dispatchEvent` returns `false`; default action (e.g., activation behavior) runs only if not canceled.[^9^]

**Conceptual cost model**: per dispatch, work is O(path length) for path construction plus, per node on the path, a scan/filter of that node's listener list (type match + capture match + once/removed/passive bookkeeping) before any user code runs. Deep trees and long listener lists both multiply fixed dispatch overhead.

### 2.2 `composedPath()`

- Returns the precomputed path (target → … → `window`) as a fresh array, including shadow-tree nodes for **open** roots; closed roots are omitted.[^11^][^12^]
- Because the path already exists internally, `composedPath()` is essentially an array materialization/copy — but it **does allocate** a new JS array on every call; calling it per event on a hot key path is avoidable if `event.target` (already retargeted) suffices.

### 2.3 Flow control

| Method                            | Sets                                                    | Effect                                                                                                                                                                                                     | Perf note                                                                                                              |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `stopPropagation()`               | stop propagation flag                                   | "The `stopPropagation()` method, when invoked, must set the context object's stop propagation flag."[^3^] Remaining listeners **on the current node still run**; nodes further along the path are skipped. | Saves the remaining per-node invoke work for the rest of the path.                                                     |
| `stopImmediatePropagation()`      | stop propagation + stop immediate propagation flags     | "must set both the stop propagation flag and stop immediate propagation flag."[^3^] Even sibling listeners on the current node are skipped (invoke loop terminates).[^13^]                                 | Cheapest way to truncate dispatch; also used to assert handler priority.                                               |
| `preventDefault()`                | canceled flag, iff `cancelable && !in passive listener` | "The `preventDefault()` method, when invoked, must set the canceled flag if the `cancelable` attribute value is true and the in passive listener flag is unset."[^3^]                                      | Does **not** stop propagation. For `keydown`, gates text insertion, scrolling, Tab focus moves, activation (see §4.3). |
| `cancelBubble` (legacy)           | alias for stop propagation flag                         | getter/setter map directly to the stop propagation flag.[^3^]                                                                                                                                              | —                                                                                                                      |
| `returnValue = false` (legacy IE) | alias for preventDefault                                | legacy alias                                                                                                                                                                                               | —                                                                                                                      |

### 2.4 Shadow DOM: retargeting & `composed`

- **Retargeting**: as an event crosses a shadow boundary, each listener sees `event.target` rewritten to "an element in the same scope as the listening element" — outside listeners see the host, inside listeners see the real node. `composedPath()[0]` recovers the original target.[^11^][^12^]
- **`composed` flag**: whether the event crosses shadow boundaries at all. `keydown`, `keyup`, `beforeinput`, `input`, `focusin`, `focusout`, `blur`, `focus`, clicks, `wheel`, and all composition events are `composed: true`; `mouseenter`/`mouseleave`, `load`, `scroll`, `select`, `slotchange` are not. Custom events default to `composed: false` — "a `bubbles`-only custom event silently dies at the shadow root."[^12^][^14^]
- Perf/correctness note: because `keydown` is composed and bubbling, a `document`-level shortcut listener sees keys from inside shadow trees (retargeted) — no per-component listeners needed; conversely the _same_ event reaches both a shadow-root listener and a document listener (fire-once discipline required).

### 2.5 `cancelable` per event type (keyboard-relevant)

`keydown`, `keyup`, `keypress` (legacy), `beforeinput` (except IME-internal), `compositionstart`: **cancelable: Yes**. `input`, `compositionupdate`, `compositionend`: **cancelable: No** (per spec; Chrome/Safari deviate on composition events — see §5).[^15^][^16^]

---

## 3. KeyboardEvent property surface

| Property                                                                                    | Type                                         | Semantics                                                                                                                                                                                                                                                                                                                                                                                                     | Spec                              | Perf-relevant notes                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                                                                                       | string                                       | Meaning of the key after layout + modifiers: `"q"`/`"Q"`, `"é"`, `"Enter"`, `"Dead"`, `"Unidentified"`, `"Process"`. Selection algorithm: named key value → valid key string → "the key string that would have been generated by this event if it had been typed with all modifier keys removed except for glyph modifier keys" → `"Unidentified"`.[^17^]                                                     | UI Events / uievents-key          | Full value tables exist in uievents-key (normative). Requires layout resolution by the engine; value differs per layout — `Control+Q` still yields `"q"` on US layout.                                                                                                                                |
| `code`                                                                                      | string                                       | Physical key position, layout-independent: `"KeyA"`, `"Digit0"`, `"Backquote"`, `"IntlBackslash"`, etc. Normative tables in uievents-code ("`KeyA`… Labelled `q` on an AZERTY keyboard").[^18^]                                                                                                                                                                                                               | UI Events / uievents-code         | The right key for game-style/shortcut-position matching: no layout dependence, stable string compare.                                                                                                                                                                                                 |
| `keyCode`                                                                                   | number (unsigned long)                       | **Deprecated.** "a system and implementation dependent numerical code identifying the unmodified value of the pressed key… If the key can't be identified, this value is 0."[^19^] Spec: "In practice, keyCode and charCode are inconsistent across platforms and even the same implementation on different operating systems or using different localizations."[^15^]                                        | UI Events § Legacy key attributes | Ubiquitous in legacy code; MDN maintains a full lookup table of values per browser. IME events on mobile/virtual keyboards conventionally use **keyCode 229**.[^20^]                                                                                                                                  |
| `charCode`                                                                                  | number                                       | **Deprecated.** Unicode code point of the character; only meaningful on `keypress`.[^19^]                                                                                                                                                                                                                                                                                                                     | UI Events § Legacy                | Avoid; use `key`/`beforeinput.data`.                                                                                                                                                                                                                                                                  |
| `which`                                                                                     | number                                       | **Deprecated.** Netscape-legacy union of keyCode/charCode.[^19^][^21^]                                                                                                                                                                                                                                                                                                                                        | UI Events § Legacy                | Present on `keypress` context in spec's legacy tables.[^15^]                                                                                                                                                                                                                                          |
| `location`                                                                                  | number                                       | `DOM_KEY_LOCATION_STANDARD`=0, `LEFT`=1, `RIGHT`=2, `NUMPAD`=3 — disambiguates e.g. left vs right Shift, numpad vs main digits.[^15^][^22^]                                                                                                                                                                                                                                                                   | UI Events                         | Cheap constant compare; combine with `code` ("ShiftLeft"/"ShiftRight" already encode it).                                                                                                                                                                                                             |
| `repeat`                                                                                    | boolean                                      | "`true` if a key has been depressed long enough to trigger key repetition… Holding down a key MUST result in the repeating the events `keydown`, `beforeinput`, `input` in this order, at a rate determined by the system configuration."[^15^]                                                                                                                                                               | UI Events                         | First-line filter for shortcut handlers: `if (e.repeat) return;`. Caveats: macOS historically sends repeated keydowns without intervening repeats in some paths; Firefox/X11 had bugs where repeat was always false.[^20^][^23^]                                                                      |
| `isComposing`                                                                               | boolean                                      | `true` while the key event belongs to an IME composition session. Spec: "During the composition session, `keydown` and `keyup` events MUST still be sent, and these events MUST have the `isComposing` attribute set to `true`."[^15^]                                                                                                                                                                        | UI Events                         | Standard IME guard for keydown handlers (alternative: keyCode===229 / `key==='Process'`).                                                                                                                                                                                                             |
| `altKey` / `ctrlKey` / `metaKey` / `shiftKey`                                               | boolean                                      | Convenience modifier attributes.                                                                                                                                                                                                                                                                                                                                                                              | UI Events                         | Fast boolean reads; cover only the four classic modifiers.                                                                                                                                                                                                                                            |
| `getModifierState(key)`                                                                     | method → boolean                             | Queries any modifier: `"Alt"`, `"AltGraph"`, `"CapsLock"`, `"Control"`, `"Fn"`, `"FnLock"`, `"Hyper"`, `"Meta"`, `"NumLock"`, `"OS"`, `"ScrollLock"`, `"Shift"`, `"Symbol"`, plus virtual `"Accel"` (maps to Control on Windows, Meta on macOS).[^24^][^25^]                                                                                                                                                  | UI Events § EventModifierInit     | Only way to read lock states (CapsLock/NumLock/ScrollLock) and AltGraph. Platform quirks: Windows AltGraph ≡ Alt+Ctrl in Firefox's table; CapsLock unsupported on Linux GTK.[^24^] A method call + string compare — marginally costlier than the boolean attributes; cache when scanning many events. |
| `KeyboardEvent.getLayoutMap()`                                                              | static method → `Promise<KeyboardLayoutMap>` | Resolves a map of `code` → key label for the **highest-priority ASCII-capable layout**. "this specification requires that the API is only available from secure contexts and can only be called from the currently active top-level browsing context" (Permissions-Policy feature `keyboard-map`, default allowlist `"self"`); unavailable in subframes without delegation; typically absent on mobile.[^26^] | WICG Keyboard Map                 | **Async** — cannot be used inside a keydown handler for that keystroke; must be cached ahead. Chromium-only in practice. Companion `layoutchange` event on `navigator.keyboard`.[^26^]                                                                                                                |
| `key` special values                                                                        | —                                            | `"Dead"` for dead keys (specific combining char available via the `compositionupdate` event's `data`); `"Process"` for keys consumed by IME processing; `"Unidentified"` when no value can be determined (virtual keyboards may report keyCode 229 + `"Unidentified"`).[^17^][^20^]                                                                                                                           | uievents-key                      | Shortcut matchers must explicitly exclude these or IME input will trigger shortcuts.                                                                                                                                                                                                                  |
| (inherited) `view`, `detail`, `isTrusted`, `timeStamp`, `bubbles`, `cancelable`, `composed` | —                                            | `view` = `Window`, `detail` = 0 for key events; `isTrusted` see §6.                                                                                                                                                                                                                                                                                                                                           | UI Events                         | —                                                                                                                                                                                                                                                                                                     |

Constructor: `new KeyboardEvent(type, KeyboardEventInit)` with `key`, `code`, `location`, `repeat`, `isComposing`, modifier booleans, and `modifierAltGraph`/`modifierCapsLock`/… inits.[^15^] **Legacy `keyCode`/`charCode`/`which` are not settable via the constructor** (readonly, not in `KeyboardEventInit`) — synthetic events report 0 unless monkey-patched via `Object.defineProperty`.[^27^]

---

## 4. Keyboard event types, ordering & cancelability

### 4.1 Types

| Type          | Bubbles | Cancelable                                                                                                                                                            | Composed | Trusted target | Status                                                                                                                                                                                                   |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keydown`     | Yes     | Yes                                                                                                                                                                   | Yes      | `Element`      | Current. Default action: "Varies: `beforeinput` and `input` events; launch text composition system; `blur` and `focus` events; `keypress` event (if supported); activation behavior; other event."[^15^] |
| `keyup`       | Yes     | Yes                                                                                                                                                                   | Yes      | `Element`      | Current. Fires once per physical release (no repeat).                                                                                                                                                    |
| `keypress`    | Yes     | Yes                                                                                                                                                                   | Yes      | `Element`      | **Deprecated / legacy** (UI Events §8.3 "Legacy KeyboardEvent events"). Only fired for character-producing keys, after `keydown`, before `beforeinput` in shipping Chrome/Safari order.[^15^][^28^]      |
| `beforeinput` | Yes     | Yes (except IME-internal `insertCompositionText` — Level 2: "all beforeinput events apart from those being emitted within an IME composition process are cancelable") | Yes      | editing host   | Input Events L2. Carries `inputType`, `data`, `getTargetRanges()`.[^16^]                                                                                                                                 |
| `input`       | Yes     | **No**                                                                                                                                                                | Yes      | editing host   | Fires after the DOM update; cannot be canceled.[^16^]                                                                                                                                                    |
| `textInput`   | Yes     | Yes                                                                                                                                                                   | —        | —              | Chrome/Safari legacy (DOM3 Events); canceling it prevents `input`.[^28^]                                                                                                                                 |

### 4.2 Ordering

Canonical typing sequence (one printable character):

- **Spec order (UI Events draft)**: `keydown` → `beforeinput` → `keypress` → `input` → `keyup`.
- **Shipping order (Chrome & Safari, and effectively all modern engines)**: `keydown` → `keypress` → `beforeinput` → `input` → `keyup`.[^28^] (uievents issue #220 documents the mismatch; Firefox implements editor operations as default actions of `keypress`.)
- During composition, order inserts `compositionstart/update/end` — see §5.

### 4.3 What `preventDefault()` on `keydown` suppresses

Verbatim, UI Events §4.3.4: "**Canceling the default action of a `keydown` event MUST NOT affect its respective `keyup` event, but it MUST prevent the respective `beforeinput` and `input` (and `keypress` if supported) events from being generated.**"[^15^]

Consequences pinned by spec/practice:

- Character insertion suppressed (no `beforeinput`/`input`, no DOM update).[^15^]
- Dead-key / IME sequences: "If the key is part of a sequence of several keystrokes, whether it is a dead key or it is contributing to an Input Method Editor sequence, the keystroke MUST be ignored… only if the default action is canceled on the `keydown` event. Canceling a dead key on a `keyup` event has no effect."[^15^]
- Scrolling keys (arrows/Space/PageUp/PageDown/Home/End): keydown cancelation prevents scroll.[^29^]
- Tab focus navigation: canceling Tab's `keydown` prevents the browser's focus move (this is exactly how focus-trap libraries implement containment).[^30^]
- Modifier state still recorded: "If the key is a modifier key, the keystroke MUST still be taken into account for the modifiers states."[^15^]
- Browser/chrome shortcuts (Ctrl+T etc.) are generally _not_ cancelable from page JS — many are handled above the content process.

### 4.4 Auto-repeat

- Spec: held key ⇒ repeated `keydown` → `beforeinput` → `input` triples "at a rate determined by the system configuration"; the delay before repetition starts is "configuration-dependent." Repeat `keydown`s carry `repeat: true`.[^15^]
- `keyup` fires once on release. Whether `keyup.repeat` can be true is an open spec question (uievents #396).[^31^]
- OS-level differences: Windows/Gecko send repeated keydowns; macOS native repeat model historically differs; mobile long-press: "the first key event with a `repeat` attribute value of `true` MUST serve as an indication of a long-key-press."[^15^][^20^]
- Known engine bugs: Firefox under X11/XINPUT2 can emit repeated keydowns with `repeat: false`.[^23^]

---

## 5. IME / composition

- Session shape: "a composition session consists of one `compositionstart` event, one or more `compositionupdate` events, and one `compositionend` event."[^15^]
- Key events still flow during composition: the initiating `keydown` has `isComposing: false`, everything inside the session has `isComposing: true`, and the final `keydown` (the one that commits) is followed by `compositionend` then `keyup` (spec table, UI Events §3.6.5).[^15^]
- Input events during composition: `beforeinput` → `compositionupdate` → DOM update → `input`. Canceling `beforeinput` prevents the DOM update and the `input` event. No `beforeinput`/`input` accompany `compositionend`.[^15^]
- Cancelability interop gap (uievents #361): spec says `compositionupdate`/`compositionend` are not cancelable; Chrome/Safari make them cancelable; Firefox also makes `compositionstart` non-cancelable. Chrome/Safari additionally fire `textInput` between `beforeinput` and `input`.[^28^]
- IME key identification: during composition, `key` is frequently `"Process"` and legacy `keyCode` is **229** (the de-facto IME marker).[^17^][^20^]
- Browser divergence: Firefox/Safari emit a `keyup` after `compositionend`, Chrome/Edge do not; Safari emits an extra `keydown` with `which === 229`. Engine bugs exist (e.g., Chromium 147 fired a spurious `deleteContentBackward` before `compositionstart`).[^32^][^33^]
- Practical handler rule: skip keydown handling while `e.isComposing` (or keyCode 229), and treat the `keyup` following `compositionend` as swallowed per-browser.

---

## 6. Trusted vs synthetic events

- `new KeyboardEvent('keydown', {key:'a', code:'KeyA'})` + `el.dispatchEvent(ev)` runs the full dispatch algorithm (capture/target/bubble, listener invocation) but:
  - `isTrusted` is **false** — "true when the event was generated by a user action, and false when the event was created or modified by a script or dispatched via dispatchEvent."[^34^]
  - **No default actions occur**: no character insertion, no scrolling, no focus movement, no `beforeinput`/`input` cascade. "The browser is being smart enough to not let scripts insert values into input boxes… we can either dispatch the correct events OR emulate typing, not both."[^35^]
  - Legacy `keyCode`/`charCode`/`which` cannot be initialized via the constructor (stay 0).[^27^]
  - Synthetic keydown does **not** chain into keypress/beforeinput/input automatically — each must be dispatched separately if simulation is desired.
- Benchmarking implication: `dispatchEvent` microbenchmarks measure **listener + dispatch-algorithm cost only**, not the full trusted-input pipeline (layout mapping, IME, editor default actions, rendering). To measure real keystrokes you need OS-level automation (WebDriver/CDP `Input.dispatchKeyEvent` produces trusted events).

---

## 7. Focus & target rules

- Trusted key-event target (verbatim, UI Events keydown context): "`Event.target`: **focused element processing the key event or if no element focused, then the body element if available, otherwise the root element**."[^15^]
- `document.activeElement` returns the focused element, falling back to `<body>` (or `null`); per the HTML "focus fixup rule," removing/disabling/hiding the focused element moves the focused area to the viewport, "reflected through the `activeElement` API as the body element."[^36^][^37^]
- Events therefore _originate_ at the deepest focused element and bubble `element → … → body → html → document → window`. A `window` keydown listener is the last bubble stop; a `window` capture listener is the first code to see the key.
- `focus`/`blur` **do not bubble**; `focusin`/`focusout` do. All four are `composed: true`. Capture listeners on ancestors are the alternative way to observe non-bubbling focus events.[^12^][^38^]
- Keys delivered while nothing focusable exists target `document.body`; a document-level listener thus needs no focus management to catch everything.

---

## 8. Performance implications (checklist for library authors)

- **One delegated listener beats N leaf listeners** for dispatch cost: per dispatch, the engine walks the precomputed path and each node's listener list regardless; fewer registered entries = less invoke-loop work. Conversely, a `window` capture `keydown` runs for _every_ key anywhere — keep it O(1) (early `repeat`/`isComposing` bailouts).
- **Guard order in hot key handlers**: `if (e.repeat || e.isComposing || e.keyCode === 229) return;` before any string work.
- **Prefer `code` for positional shortcuts** (`"KeyW"`), `key` for semantic ones (`"Enter"`); both are interned strings — comparison is cheap, but building lookup objects per event is not. Never parse `key` with regex per keystroke.
- **`keyCode` still works everywhere** (compat table in MDN) and is a number — the fastest compare — but is layout-dependent and deprecated; treat as legacy fallback only.[^19^]
- **`getModifierState('Accel')`** gives cross-platform "primary shortcut modifier" in one call; the four boolean attributes are cheaper when sufficient.
- **Passive listeners don't apply to keyboard** — keyboard default actions are main-thread-synchronous; your keydown handler _directly_ delays insertion/scroll/focus for that keystroke. Keep keydown handlers sub-millisecond; defer heavy work (`requestIdleCallback`/`queueMicrotask`).
- **`stopImmediatePropagation()` on a capture listener** is the cheapest way to fully swallow a key before other handlers; `preventDefault()` alone still lets other listeners run (and vice versa).
- **`once`/`signal` reduce teardown cost and leak risk**; `AbortSignal` lets you detach a whole shortcut scope (e.g., a modal) with one `abort()`.
- **Dedup is on (type, callback, capture)** — anonymous arrows added twice are _not_ deduped (MDN warning: identical anonymous functions are added repeatedly, a classic leak).[^1^]
- **`composedPath()` allocates an array** per call; on key hot paths prefer `e.target` (remember retargeting: it may be a shadow host).
- **Keyboard events are composed** — document-level handlers see keys from shadow DOM; don't also register inside components or you handle keys twice.
- **`getLayoutMap()` is async and Chromium-gated** — cache the map at startup (listen for `layoutchange`), never call it in a keystroke path; feature-detect `navigator.keyboard?.getLayoutMap`.[^26^]
- **Synthetic-event benchmarks undercount real cost** — they exclude layout mapping, IME, default actions, and paint; and can't reproduce trusted behavior at all (no `beforeinput` chain, no insertion).
- **Repeat floods**: holding a key generates keydown at the OS repeat rate (up to ~30+/s); throttle or drop `repeat` events in benchmarks and in production handlers.
- **IME correctness is perf-adjacent**: handling `"Process"`/229 keys as shortcuts causes double-processing; `isComposing` guard is one boolean read.

---

## Sources (accessed 2026-08-12)

1. MDN — `EventTarget.addEventListener()` (incl. options semantics, passive defaults, dedup warning). https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener (source: https://github.com/mdn/content/blob/main/files/en-us/web/api/eventtarget/addeventlistener/index.md)
2. TypeScript `lib.dom.d.ts` / DOM spec text of addEventListener ("same type, callback, and capture"; capture/passive/once/signal semantics). https://github.com/Steve-xmh/applemusic-like-lyrics/blob/main/packages/core/docs/classes/LyricPlayer.md
3. W3C DOM 4.1 WD — Event flags, stopPropagation/stopImmediatePropagation/preventDefault algorithms. https://www.w3.org/TR/2017/WD-dom41-20171207/
4. greadme — "What Are Passive Event Listeners?" (Chrome document-level passive defaults table). https://www.greadme.com/blog/best-practices/improve-scrolling-with-passive-event-listeners-complete-guide
5. WHATWG HTML Standard — §8.1.8 Events / event handlers (IDL attributes act as non-capture listeners; ordering example; GlobalEventHandlers IDL). https://html.spec.whatwg.org/multipage/webappapis.html
6. Stefan Judis — "addEventListener accepts functions and objects" (handleEvent object listeners; `this` semantics; not usable via on\*). https://www.stefanjudis.com/today-i-learned/addeventlistener-accepts-functions-and-objects/
7. MDN (mirror) — `EventTarget.removeEventListener()` matching rules ("only the capture setting matters"). https://udn.realityripple.com/docs/Web/API/EventTarget/removeEventListener
8. Deno issue #25787 / happy-dom issue #2089 — removeEventListener capture-matching spec reference. https://github.com/denoland/deno/issues/25787 ; https://github.com/capricorn86/happy-dom/issues/2089
9. W3C DOM 4.1 WD (2017-10) — §3.8 Dispatching events algorithm. https://www.w3.org/TR/2017/WD-dom41-20171021/
10. W3C DOM Level 3 Events — propagation path is fixed once determined (quoted). https://www.w3.org/TR/DOM-Level-3-Events/ (via https://www.cnblogs.com/Ox9A82/p/6227765.html)
11. Polymer — Shadow DOM concepts: event retargeting & composedPath. https://polymer-library.polymer-project.org/2.0/docs/devguide/shadow-dom
12. javascript.info — "Shadow DOM and events" (composedPath contents, open/closed roots, composed true/false event lists). https://javascript.info/shadow-dom-events
13. W3C DOM Core WD — invoke event listeners algorithm (stop immediate propagation termination; capture filtering). https://www.w3.org/TR/2011/WD-domcore-20110531/
14. whatwg/webcomponents issue #513 — list of events with `composed: true`. https://github.com/w3c/webcomponents/issues/513
15. W3C UI Events — KeyboardEvent event types (keydown/keyup/keypress tables), §3.6.5/3.6.6 composition ordering, §4.3.4 cancelable keydown quote, repeat quote, legacy key attributes. https://www.w3.org/TR/uievents/ (editor's draft: https://w3c.github.io/uievents/)
16. W3C Input Events Level 2 — beforeinput/input, cancelability requirements, IME inputTypes. https://www.w3.org/TR/input-events-2/
17. W3C UI Events KeyboardEvent key Values — key selection algorithm; `"Dead"`, `"Process"`, `"Unidentified"`; IME/composition key table. https://www.w3.org/TR/uievents-key/
18. W3C UI Events KeyboardEvent code Values — code tables (KeyA "Labelled q on an AZERTY keyboard", IntlBackslash, etc.). https://www.w3.org/TR/uievents-code/
19. MDN — `KeyboardEvent.keyCode` (deprecated; "system and implementation dependent numerical code…"). https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
20. javascript.info — "Keyboard: keydown and keyup" (auto-repeat; mobile keyboards keyCode 229 / key "Unidentified"). https://javascript.info/keyboard-events
21. inexorabletash — KeyboardEvent polyfill docs (legacy keyCode/charCode/which semantics; IE/Windows VK-code heritage). http://inexorabletash.github.io/polyfill/keyboard.html
22. TypeScript KeyboardEvent interface listing (DOM*KEY_LOCATION*\* constants, location, isComposing, getModifierState). https://docs.chartbreaker.com/interfaces/bundle._internal_.KeyboardEvent.html
23. Mozilla bug 1594003 — `KeyboardEvent.repeat` always false on X11/XINPUT2. https://bugzilla.mozilla.org/show_bug.cgi?id=1594003
24. MDN (mirror) — `KeyboardEvent.getModifierState()` modifier tables per platform (AltGraph, CapsLock, OS…). https://web.nodejs.cn/en-us/docs/web/api/keyboardevent/getmodifierstate/
25. W3C DOM Level 3 KeyboardEvent key Values (2014 WD) — `'Accel'` virtual modifier definition. https://www.w3.org/TR/2014/WD-DOM-Level-3-Events-key-20140612/
26. WICG Keyboard Map — getLayoutMap, privacy mitigations ("secure contexts… top-level browsing context"), Permissions-Policy `keyboard-map`, layoutchange event. https://wicg.github.io/keyboard-map/ ; subframe unavailability: https://github.com/WICG/keyboard-map/issues/38
27. Stack Overflow — "How to create KeyboardEvent with specific keyCode" (keyCode not in KeyboardEventInit; defineProperty workaround). https://stackoverflow.com/questions/40533292/
28. w3c/uievents issues #220 and #361 — shipping vs spec ordering of keypress/beforeinput; cancelability interop of composition events; textInput. https://github.com/w3c/uievents/issues/220 ; https://github.com/w3c/uievents/issues/361
29. Stack Overflow — preventing arrow-key scrolling via keydown preventDefault. https://stackoverflow.com/questions/20794691
30. focus-trap issue #1165 — keydown preventDefault to stop Tab focus navigation (and passive-listener conflict). https://github.com/focus-trap/focus-trap/issues/1165
31. w3c/uievents issue #396 — can `repeat` be true on keyup? (open). https://github.com/w3c/uievents/issues/396
32. Stuart Memo — "Handling IME events in JavaScript" (browser divergence around compositionend/keyup; Safari 229). https://www.stum.de/2016/06/24/handling-ime-events-in-javascript/
33. microsoft/vscode issue #307646 — Chromium 147 spurious deleteContentBackward before compositionstart; `key: 'Process'` traces. https://github.com/microsoft/vscode/issues/307646
34. MDN — `Event.isTrusted` ("true when the event was generated by a user action… false when… dispatched via dispatchEvent"). https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted
35. Words by Vernacchia — "Simulating JS Events" (synthetic keyboard events don't insert text / trigger default actions). https://words.byvernacchia.com/blog/2023/04/simulating-js-events/
36. MDN (mirror) — `Document.activeElement` (returns focused element, `<body>` or null). https://docs.w3cub.com/dom/document/activeelement.html
37. WHATWG HTML Standard — focus fixup rule (quoted via allyjs tutorial). https://html.spec.whatwg.org/multipage/interaction.html#focus-fixup-rule (via https://kicksky.tistory.com/85)
38. MDN — focus/blur don't bubble; focusin/focusout bubble (reference summary). https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event (via https://www.goodsunlc.com/archives/101.html)
