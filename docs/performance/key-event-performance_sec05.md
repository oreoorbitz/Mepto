# 5. Decision Matrix: Architecture by Scenario

Chapters 1–4 established the semantics, the machine, the measurements, and the budget; this chapter converts them into orders. Every prescription is justified in one breath: a measured anchor from this investigation's Chromium 150 sandbox, plus the engine reason that makes the number portable. One framing rule governs all of it: engine costs are ns–µs against a 15–60 ms hardware floor [^8^] and a ~26 ms I/O floor [^10^], so the matrix optimizes _library cleanliness and worst-case throughput_ — deep DOMs, high churn, thousands of matches per interaction — while what actually hits INP's 200 ms p75 threshold [^20^] is your handler body. Choose architecture by scenario; spend optimization effort inside the handler.

## 5.1 By application type

### 5.1.1 Key identification: `code` for physical, `key` for semantic, `keyCode` only for legacy tables

Pick the property by _meaning_, never by speed — every accessor, legacy or modern, lands within 1–6% of the no-read baseline in the sandbox, with `e.which` literally tying it. There is no performance argument among them.

- **Games and positional layouts (WASD): use `event.code`.** `"KeyA"` is the physical position — the key "labelled `q` on an AZERTY keyboard" [^18^] — so bindings survive layout switching for free. `code` also pre-encodes `location` (`"ShiftLeft"` vs `"ShiftRight"`).
- **Shortcut managers and text UIs: use `event.key` plus the four modifier booleans.** `key` is the layout-resolved meaning — `"q"`/`"Q"`, `"Enter"` [^17^] — which is what "Ctrl+Q" means to a user. Add `getModifierState("Accel")` when you need the platform-correct command modifier [^24^].
- **`keyCode`/`which`/`charCode`: only as lookup keys into pre-existing legacy tables.** They are deprecated, "system and implementation dependent… inconsistent across platforms" [^19^], and report 0 on synthetic events — but the number compare is fast and old tables are keyed on them. The one modern use is defensive: `keyCode === 229` as the IME "not yours" marker [^20^].
- **Hoist `e.key` into a local once per handler regardless.** Blink and WebKit cache the string eagerly at construction [^4^][^13^]; Gecko re-maps it through key-name tables _on every access_ [^23^]. Free in two engines, a real win in the third — a zero-cost portability move.

### 5.1.2 Listener topology: one root listener + internal dispatch; capture poisons SkipEventCapture

For any library, the default is **one listener at `document` plus an internal dispatch table**. Position is settled: leaf-vs-root measures 1.002 at depth 1 and 1.006 at depth 500 — statistically irrelevant, because Blink builds the O(D) EventPath once and walks it regardless [^6^][^7^]. What matters is _boundary crossings_: N listeners are N full C++→JS invocations with no batching possible (§2.4), so one fat listener switching on `e.code` in JS amortizes what many small native registrations cannot.

On phase: **register in the bubble phase unless you have a correctness reason not to.** Capture and bubble measure within 1.01 of each other — phase is free per dispatch — but any capture listener anywhere flips Blink's document-global `HasCaptureListener()` predicate and disables the default-on SkipEventCapture optimization _for every dispatch on the page_ [^6^][^19^]; WebKit's per-document `EventListenerCounts` behaves identically [^13^]. A shortcut library registering `addEventListener('keydown', fn, true)` "to run first" taxes every listener-free dispatch of every type for the whole page. If you genuinely need first-mover semantics, scope the capture listener to the smallest subtree, not `window`.

Depth rarely matters because you rarely control it — but know the cliff: dispatch rises from ~4.0 µs at depth 1 to ~32 µs at depth 500 (~8×). Since path cost is paid whether or not listeners exist, the mitigation is handler-side: `stopPropagation()` on a consumed shortcut measured **17% faster** than letting it propagate. Stacking is free, spreading is not: 1/10/100 listeners on one node sit within 2.2% of each other; 10 listeners across 10 ancestors run 2.74× slower. Dispatch is path-bound, not invocation-bound.

## 5.2 By event volume and registration churn

### 5.2.1 High-churn UIs: delegation always; static apps: direct listeners fine

Delegation's dispatch-time cost is a wash — one document listener doing `e.target.closest('[data-k]')` fires at 176k ops/s against 174k for 1000 direct listeners (1.2%, inside CV). The decision is made at _registration_: one add/remove pair costs ~0.75 µs (0.744 µs precisely); 1000 direct registrations cost 766.9 µs — on the order of 1000× the delegated single registration, perfectly linear, no batching discount in Blink's listener list management. So:

- **High-churn UIs** (virtualized lists, mount/unmount cycles, per-render re-registration): delegate, unconditionally. Delegated registration is O(1) in control count; direct is O(N) at ~0.77 µs per control, paid again on every teardown.
- **Static apps** with a bounded handful of controls: direct listeners are fine — registration is paid once, dispatch is at parity either way.
- The delegated selection predicate is a correctness choice, not a speed one: `closest`, `matches`, `tagName`, and `composedPath()[0]` all measured within 4.2%. Use `closest` for clarity; avoid `composedPath()` in loops only because it allocates a fresh array per call [^11^].

### 5.2.2 Teardown: `removeEventListener` for hot paths; `AbortSignal` for ergonomic bulk teardown

Removing 100 listeners explicitly costs 44.2 µs per full cycle; the AbortController route — 100 signal-bound registrations plus one `abort()` — costs 83.8 µs, **1.9× slower end-to-end**, because signal bookkeeping at registration outweighs single-call removal, and `abort()` still runs K individual removal algorithms with no batch fast path (§2.4). Verdict: `AbortSignal` is an ergonomics and leak-safety feature — one `abort()` retires an entire modal scope without storing callback references [^2^] — not a speed feature. Use it for scope teardown at human timescales (dialog close, route change); use explicit `removeEventListener` where teardown itself is hot. `once: true` sits between them: the full register+dispatch+auto-remove cycle runs only ~34% above the plain dispatch baseline — fine for fire-once shortcuts. Whichever you choose, keep stable function references: anonymous callbacks defeat both dedup and removal, since matching keys on (type, callback, capture) only [^7^].

## 5.3 The master decision table

Scenario → listener topology → key-identification strategy → matching structure → measured anchor → engine reason. All measurements from this investigation's Chromium 150 sandbox; spec-level claims cited to source. For the library-source-level internals behind rows 1–3 — how shipping shortcut engines implement the trie, the chord state machine, the scope stack — see Chapter 6.

| #   | Scenario                                  | Listener topology                                                          | Key ID strategy                                             | Matching structure                                         | Measured anchor                                                          | Engine reason                                                                                        |
| --- | ----------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Global shortcut library                   | One `document` bubble listener + internal dispatch                         | `e.key` + modifier booleans                                 | Bitmask int → `Map<number>`                                | 16.5M ops/s vs 5.4M string (3.1×)                                        | N listeners = N C++→JS crossings; string concat, not the hash, is the cost                           |
| 2   | Multi-stroke chords                       | Same root listener, JS state machine                                       | `e.code` for position, `e.key` for mnemonics                | Map-of-Maps trie                                           | 14.6M ops/s (0.88 of bitmask; tail-latency caveat)                       | Same amortization; trie depth costs one Map.get per stroke                                           |
| 3   | Command palette / per-keystroke filtering | Root listener + `input` observer                                           | `e.key`                                                     | Bitmask + Map, precomputed                                 | Scan of 50 bindings: 2.3M ops/s, 7.2× slower                             | Thousands of matches per interaction is the only regime where matching shows                         |
| 4   | Text editor / contenteditable             | Direct listener on editable root; `document` fallback                      | `e.key`; guard `isComposing` / `keyCode===229`              | Early-exit guards, then Map                                | Guards <0.5% (under noise floor)                                         | Keyboard default actions run synchronously after dispatch — a slow handler delays insertion directly |
| 5   | Game loop (WASD, held keys)               | `window` keydown+keyup pair, bubble; key-state Set                         | `e.code` (layout-independent [^18^])                        | `Map<code→action>` or bitmask; first-line `e.repeat` guard | Property reads within 1–6%; repeat guard <0.5%                           | Each auto-repeat tick is one full pipeline traversal — 30 dispatches/s, no engine throttling         |
| 6   | Form UI / dialogs / focus traps           | Delegated `document` listener; cancel `keydown` for Tab containment [^30^] | `e.key` (`"Tab"`, `"Escape"`, `"Enter"`)                    | `closest()` scope check + Map                              | Delegation dispatch parity (176k vs 174k)                                | Shortcut scope is focus scope; `keydown` cancellation blocks focus movement [^15^]                   |
| 7   | Global hotkeys ("run first")              | Smallest-subtree listener, bubble; capture only with justification         | `e.key` + `getModifierState("Accel")` [^24^]                | Bitmask + Map                                              | capture≈bubble 1.01 at depth 500                                         | Any capture listener disables SkipEventCapture page-wide [^6^][^19^]                                 |
| 8   | High-churn UI (mount/unmount per render)  | Delegation, always                                                         | Either                                                      | Either                                                     | Registration 0.74 µs/pair → 1000× for 1000 listeners                     | No batching discount; direct is O(N) at setup _and_ teardown                                         |
| 9   | Static app, few controls                  | Direct listeners on the controls                                           | Either                                                      | Either                                                     | 1/10/100 same-node listeners within 2.2%                                 | Path computed once; per-node invocation cheap; registration paid once                                |
| 10  | Deep DOM (>100 depth)                     | Single root listener (position irrelevant)                                 | Either                                                      | Either                                                     | 4.0 µs @depth1 → 32 µs @depth500 (~8×)                                   | O(D) EventPath built per dispatch, never cached; paid even with zero listeners                       |
| 11  | Anti-pattern: handlers spread up the tree | Consolidate onto one node                                                  | —                                                           | —                                                          | 10 listeners / 10 ancestors: 3× slower                                   | Each ancestor with listeners pays snapshot clone + boundary crossing                                 |
| 12  | Modal/route scope teardown                | Any + `AbortController({signal})`                                          | —                                                           | —                                                          | `abort()` route 1.9× slower than explicit removal for 100                | Per-listener abort algorithms, no batch fast path — pay for ergonomics knowingly                     |
| 13  | Teardown on a hot path                    | Explicit `removeEventListener`, stable references                          | —                                                           | —                                                          | 44 µs vs 84 µs per 100-listener cycle                                    | Plain map scan + vector erase; matching keys on (type, callback, capture) only [^7^]                 |
| 14  | Fire-once shortcut                        | Any + `once: true`                                                         | Either                                                      | Either                                                     | 183k ops/s full cycle, +34% over baseline                                | Auto-removal at invoke time is modest bookkeeping [^2^]                                              |
| 15  | Consuming a handled shortcut              | Any — call `stopPropagation()` + `preventDefault()`                        | —                                                           | —                                                          | stopPropagation 17% faster than propagating; preventDefault within noise | Skips remaining path walk; cancel bit suppresses `beforeinput`/`input` (200→0 trusted events) [^15^] |
| 16  | IME-heavy input (CJK)                     | Any; guards non-negotiable                                                 | Skip while `e.isComposing`; treat 229 as "not yours" [^20^] | Guard first, match second                                  | Guards <0.5%                                                             | `keydown` fires throughout composition with `isComposing: true` [^15^]; divergence is per-browser    |
| 17  | Synthetic event bus / test tooling        | Any — reuse one preconstructed event                                       | Constructor sets `key`/`code`; `keyCode` stays 0 [^27^]     | Either                                                     | Reuse: 776k vs 246k ops/s — 3.2×                                         | Construction is over half of construct+dispatch; only synthetic flows may pool events                |
| 18  | Legacy keymap integration                 | Any                                                                        | `keyCode`/`which` as legacy table keys only                 | Number-keyed Map                                           | `e.which` ties no-read baseline (1.000)                                  | Deprecated and platform-inconsistent [^19^] — but the number read itself is free                     |

Two patterns deserve code, because they are the ones libraries get wrong. The canonical hot handler — guard, hoist, mask, map:

```js
const bindings = new Map() // bitmask int -> command
function mask(e) {
  // 4 modifier bits + key index: one integer, no strings
  return ((e.shiftKey | (e.ctrlKey << 1) | (e.altKey << 2) | (e.metaKey << 3)) << 8) | keyIndex(e)
}
addEventListener('keydown', e => {
  // bubble: keep SkipEventCapture alive
  if (e.repeat || e.isComposing || e.keyCode === 229) return // free guards
  const cmd = bindings.get(mask(e)) // 16.5M ops/s vs 5.4M for string keys
  if (!cmd) return
  e.preventDefault()
  e.stopPropagation() // consumption is an optimization, not overhead
  cmd(e)
})
```

And the honest teardown split — ergonomics at scope boundaries, explicit removal where teardown is hot:

```js
// Scope teardown (dialog close): pay the 1.9x for leak-safety.
const scope = new AbortController()
el.addEventListener('keydown', onKey, { signal: scope.signal })
closeButton.onclick = () => scope.abort() // retires every listener in the scope

// Hot-path churn (per-render): explicit removal wins 44 µs vs 84 µs per 100.
function unmount() {
  el.removeEventListener('keydown', onKey)
} // stable reference required
```

Everything the matrix omits is deliberate. `passive` on `keydown` is a performance no-op — keyboard was never in the intervention's scope [^19^]. `on*` property handlers and `{handleEvent}` objects cost 8–10% over a plain function — acceptable for stateful or legacy-interop listeners, wrong for the hot global keymap. And no row moves the INP needle by itself: dispatch at realistic depth is ~10⁻⁴ of a 30 ms keyboard trip. The matrix buys a clean, worst-case-safe architecture in microseconds; the remaining milliseconds — handler-body duration, long tasks, scheduling with `scheduler.yield()` [^28^] — are yours to spend or save.
