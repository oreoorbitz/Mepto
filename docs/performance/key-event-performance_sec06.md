## 6. The Library-Author Playbook

Chapters 3–5 measured what engines charge; this chapter reverse-engineers what the fastest shipping shortcut engines actually build. The surveyed codebases — VS Code, CodeMirror 6, ProseMirror, Mousetrap, hotkeys-js, tinykeys, kbar, xterm.js, react-hotkeys-hook, and React itself — converge on a small set of architecture patterns, and the sandbox numbers from Chapter 3 explain why. Where they diverge, the divergence is measurable.

**Table 6-1. Per-library architecture at a glance** (source-level facts; citations per row)

| Library            | Attachment                                                      | Key ID                                                                                   | Encoding                                               | Matching                                                        | Chords                                                      |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| VS Code workbench  | One root `keydown` → `KeybindingService._dispatch` [^16^]       | `KeyCode` enum via quirk-table normalization; scan-code dispatch by default [^17^][^18^] | Bitmask integer (`_computeKeybinding`) [^17^]          | `_map: Map<firstChord, items[]>` + backward `when` scan [^15^]  | Multi-chord, 5 s timeout, IME disabled in chord mode [^16^] |
| CodeMirror 6       | One `keydown` on contentDOM via `domEventHandlers` [^21^][^22^] | `w3c-keyname` `keyName(event)` + keyCode fallback [^21^]                                 | Normalized string, `Alt-Ctrl-Meta-Shift-` order [^21^] | Plain-object map, **WeakMap-cached** per facet value [^21^]     | Multi-stroke, 4000 ms prefix timeout [^21^]                 |
| ProseMirror        | Plugin prop `handleKeyDown` on view DOM [^24^]                  | `w3c-keyname` + guarded keyCode fallback [^24^]                                          | Same normalized-string convention [^24^]               | Plain-object map, direct lookup [^24^]                          | None                                                        |
| xterm.js           | `keydown` on hidden textarea [^26^]                             | Legacy keyCode `switch` + surgical `key`/`code` fallbacks [^26^]                         | 4-bit modifier mask for CSI sequences [^26^]           | Jump-table switch [^26^]                                        | None                                                        |
| hotkeys-js         | `keydown`+`keyup` per element (`elementEventMap`) [^5^][^6^]    | Numeric keyCode; layout-independent hybrid since v4.3 [^8^]                              | Numeric keyCodes; modifiers as `[91,17,16]` [^7^]      | keyCode bucket + array scan + `compareArray` [^9^]              | None (simultaneous only) [^5^]                              |
| Mousetrap          | 3 listeners (`keypress`/`keydown`/`keyup`) per instance [^3^]   | `e.which`/`e.keyCode` → char; US-assumption `_SHIFT_MAP` [^3^]                           | Char-keyed object `_callbacks` [^3^]                   | Bucket + linear scan, `sort().join(',')` modifier compare [^3^] | Sequences, 1000 ms reset [^3^]                              |
| tinykeys           | Exactly one listener per target [^1^]                           | `event.key` **and** `event.code`; `getModifierState` [^1^]                               | Parsed AST: `KeybindingPress` tuple [^1^]              | Linear scan of all parsed bindings [^1^]                        | `pending` map, 1000 ms timeout [^1^]                        |
| kbar               | Vendors tinykeys; two window-level listeners total [^13^][^38^] | Inherits tinykeys [^13^]                                                                 | Space-joined sequences [^13^]                          | Inherits tinykeys scan; actions pre-sorted by length [^13^]     | Yes, 400 ms timeout [^13^]                                  |
| react-hotkeys-hook | One listener pair **per hook call** [^11^]                      | `event.code` default since v5; `useKey` opt-out [^10^]                                   | Parsed `Hotkey` object [^11^]                          | `forEach` over parsed keys [^11^]                               | `possibleMatches` map, 1000 ms [^11^]                       |
| React 17+          | Root-container delegation for all event types [^28^][^30^]      | `getEventKey` legacy normalization; `code` since #18287 [^40^][^30^]                     | n/a (synthetic events)                                 | Fiber-tree walk per dispatch [^29^]                             | n/a                                                         |

### 6.1 Attach once, dispatch internally

#### 6.1.1 The single-listener registry

The dominant pattern is one native listener plus a library-owned registry. VS Code attaches a single `keydown` at the workbench root and routes every keystroke through `KeybindingService._dispatch` [^16^]. tinykeys attaches exactly one listener on the caller's target [^1^]; kbar, which vendors tinykeys, runs an entire command palette — toggle plus every action shortcut — on two window-level listeners [^13^][^38^]. React generalizes the same idea to all event types: PR #18195 moved delegation from `document` to the root container, and PR #19659 attaches all known listeners when the root mounts, so zero application listeners ever touch native DOM nodes directly [^28^][^30^].

```js
// Delegation root listener — the only native registration a shortcut engine needs
const registry = new Map() // chordKey -> handler
root.addEventListener('keydown', e => {
  if (e.isComposing || e.repeat) return // guards cost <0.5% (Ch 3, Table 3-8)
  const h = registry.get(encode(e)) // one Map lookup, no re-parse
  if (h && h(e) !== false) {
    e.preventDefault()
    e.stopPropagation()
  }
})
```

The economics are measured, not aesthetic. In this investigation's sandbox (Chromium 150), one root listener doing internal matching dispatched at 176.1k ops/s against 174.0k for 1000 direct per-target listeners — parity within CV — while registration cost 0.75 µs for the delegated architecture versus 766.9 µs for the direct one, a ~1000× setup gap that is perfectly linear in listener count (Tables 3-4, 3-5). Per-listener registration is O(N); the registry is O(1). A library that mounts N hotkey-bearing components therefore has exactly one viable topology.

Delegation also buys control the native dispatch order cannot: the library decides precedence (VS Code's backward scan lets user rules shadow defaults [^15^]; CM6's facet order resolves competing keymaps [^21^]), and it decides teardown granularity. Note, though, that bulk teardown via `AbortController.abort()` measured 1.9× slower than explicit `removeEventListener` loops in the sandbox (83.8 µs vs 44.2 µs per 100-listener cycle, Table 3-13) — engine removal scans per aborted registration — so with a one-listener registry the question is usually moot: you remove one listener and drop the Map.

#### 6.1.2 Outlier anti-pattern: react-hotkeys-hook per-hook listeners

react-hotkeys-hook attaches `keydown`/`keyup` on `ref.current || options.document || document` inside each `useHotkeys` call — N native listener pairs for N hotkeys, no central registry [^11^]. The API ergonomics are real, but the architecture pays O(N) registration and, worse, invites churn: hooks that re-bind on render multiply the 0.74 µs-per-pair registration tax (Table 3-5 shows add and remove are symmetric). The same library's own evolution — v5 switching to `event.code` matching "to get rid of all the confusion between different keyboard layouts, multiple accidental triggers" [^10^] — shows its maintainers optimizing the match layer while the attachment layer remains the outlier. The fix, demonstrated by kbar over tinykeys, is a module-level manager that registers hooks into one map and owns the single listener [^13^].

### 6.2 Parse at registration, match at dispatch

#### 6.2.1 Three encoding families

Every serious library converts shortcut strings to a dispatch-time-efficient form once, at `bind()` time. The surveyed codebases cluster into three families.

**Bitmask integers.** VS Code's `_computeKeybinding()` ORs `KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyMod.WinCtrl | keyCode` into one integer, making `equals()` a single `===` [^17^]. xterm.js uses the canonical 4-bit variant `(shift?1:0)|(alt?2:0)|(ctrl?4:0)|(meta?8:0)` — which doubles as the CSI modifier protocol parameter [^26^].

```js
// Bitmask encode + Map<number>: 16.5M ops/s in the sandbox (Table 3-7)
const CTRL = 1 << 28,
  ALT = 1 << 29,
  SHIFT = 1 << 30,
  META = 1 << 27
function encode(e) {
  return (
    (e.ctrlKey ? CTRL : 0) |
    (e.altKey ? ALT : 0) |
    (e.shiftKey ? SHIFT : 0) |
    (e.metaKey ? META : 0) |
    e.keyCode
  )
}
registry.set(CTRL | 75, handler) // dispatch: registry.get(encode(e))
```

**Normalized strings.** CM6 and ProseMirror build `"Alt-Ctrl-Meta-Shift-<key>"` names with canonical modifier order, platform-resolved `Mod-`, and `Space`→`" "` [^21^][^24^]:

```js
// Normalized-string builder — readability-first; 3.1× slower than bitmask (Table 3-7)
function keyName(e) {
  let n = ''
  if (e.altKey) n += 'Alt-'
  if (e.ctrlKey) n += 'Ctrl-'
  if (e.metaKey) n += 'Meta-'
  if (e.shiftKey) n += 'Shift-'
  return n + (e.key === ' ' ? 'Space' : e.key) // then map[n] — string build is the cost
}
```

**Registration-time ASTs.** tinykeys parses each binding once into `KeybindingPress = [requiredModifiers[], optionalModifiers[], key | RegExp]` — no string is ever built at dispatch; matching is field comparison plus `getModifierState` [^1^]:

```js
// Registration-time parse: dispatch never touches the raw binding string
function parse(binding) {
  // "$mod+Shift+K" -> [["Meta","Shift"], [], "K"]
  const parts = binding.split(/\+/),
    key = parts.pop()
  return [parts.map(p => (p === '$mod' ? (isMac ? 'Meta' : 'Control') : p)), [], key]
}
```

**Table 6-2. Encoding families compared** (ops/s from this investigation's sandbox, Chromium 150, handler-only, Table 3-7)

| Family                        | Exemplars                     | Dispatch op         | Measured                               |                                                    Trade |
| ----------------------------- | ----------------------------- | ------------------- | -------------------------------------- | -------------------------------------------------------: |
| Bitmask int + `Map<number>`   | VS Code [^17^], xterm [^26^]  | int compare         | 16.5 M ops/s (60 ns)                   | Fastest; exact-equality by construction; opaque to debug |
| Map-of-Maps trie              | (sequence engines)            | chained gets        | 14.6 M ops/s; tail latency (CV 18.6%)  |                          Natural for chords; deopt-prone |
| Normalized string + `Map.get` | CM6, ProseMirror [^21^][^24^] | string build + hash | 5.4 M ops/s (3.1× slower than bitmask) |        Human-readable bindings; allocation per keystroke |
| AST scan (no string built)    | tinykeys [^1^]                | field compares × N  | ~2.3 M ops/s at N=50 (7.2× slower)     |                      Zero-grammar; fine while N is small |

The sandbox validates VS Code's choice quantitatively: string construction, not the hash lookup, is what costs 3.1×. But the proportionality check matters — inside a real 4 µs dispatch even the 438 ns scan is swamped, so these families differentiate only at thousands of matches per interaction (chord sequencers, per-keystroke palette filtering).

#### 6.2.2 Matching structures

The pattern is _index by the cheapest discriminant, then scan a tiny candidate set_. VS Code buckets every keybinding by its first chord into `_map: Map<firstChord, ResolvedKeybindingItem[]>`, so per-keystroke work is one Map get plus a backward scan evaluating `when` expressions — and even that scan was optimized after issue #129625 showed a complex `when` clause adding ~10 s to startup; the resolver now substitutes constants before bucketing (#174218) [^15^][^20^]. hotkeys-js buckets by keyCode in `_handlers` and scans the bucket array with `compareArray` for modifiers [^9^]. Mousetrap buckets by character in `_callbacks` and compares sorted-joined modifier strings [^3^]. CM6 goes furthest on caching: `buildKeymap`'s flattened scope map is stored in a `WeakMap` keyed by the facet's value array, so facet recomputation — not per-keystroke work — pays for the build [^21^]. tinykeys is the deliberate exception: a full linear scan per keystroke, viable only because typical N is in the tens — the measured 2.3M ops/s floor for a 50-binding scan is exactly the ceiling that decision accepts [^1^].

### 6.3 Chords, IME, and the traps

#### 6.3.1 Timeout-based chords

Every chord engine is a state machine plus a timer; the disagreements are only in timeout and prefix handling. tinykeys and Mousetrap reset pending sequences after 1000 ms [^1^][^3^]; kbar tightens to 400 ms [^13^]; CM6's `PrefixTimeout` is 4000 ms [^21^]; VS Code allows 5 s of idle on a 500 ms `IntervalTimer` tick and additionally exits chord mode on focus loss [^16^]. Two subtleties separate the careful implementations. First, **prefix keystrokes must be swallowed**: CM6 registers synthetic prefix bindings that always `preventDefault`, and VS Code's `MoreChordsNeeded` resolution sets `shouldPreventDefault = true` — otherwise `ctrl+k z` types `z` when the chord dead-ends [^21^][^16^]. Second, **ambiguity must not double-fire**: tinykeys warns and refuses rather than firing both a short binding and a pending longer one [^1^]; kbar pre-sorts actions by descending shortcut length and wraps handlers in a `WeakSet` dedupe (its workaround for tinykeys issue #37) [^13^]. VS Code additionally **disables the IME on entering chord mode** and re-enables it on exit, so a composing IME cannot swallow the second chord [^16^].

#### 6.3.2 IME guards and platform traps

IME handling is where shortcut engines earn correctness. VS Code normalizes _every_ composing keystroke — not just `keyCode === 229` — to the sentinel `KeyCode.KEY_IN_COMPOSITION`, because "some platform/IME combinations report the real key code for keys the IME owns — notably the Enter that commits a composition, but also Space, Escape and the arrows"; all three dispatch entry points bail on it [^17^][^16^]. tinykeys' default filter ignores `event.isComposing` and `event.repeat` [^1^]. xterm.js routes composition through a separate `CompositionHelper` and never converts composing keydowns to escape sequences [^26^].

```js
// IME guard — hoist reads once per handler; guards measure <0.5% (Table 3-8)
function onKeydown(e) {
  const { key, code, isComposing, repeat } = e // Blink caches eagerly, but Gecko
  if (isComposing || key === 'Process') return // re-maps per access — read once
  if (repeat) return
  if (isAltGraph(e)) return // Windows: ctrlKey && altKey === AltGr (CM6/ProseMirror guard)
  // ...match
}
```

The platform traps are codified in source, and a library that doesn't copy them ships their bugs: **AltGraph on Windows reports ctrl+alt**, so CM6/ProseMirror skip the keyCode fallback when `windows && ctrlKey && altKey` (ProseMirror issues #668/#1060/#1529), tinykeys exempts Control+Alt from its unexpected-modifier check, and VS Code ships no default `Ctrl+Alt+[char]` bindings on Windows at all [^21^][^24^][^1^][^18^]. **macOS Option** produces dead keys and alternate characters; xterm.js detects `key === 'Dead'` and recovers the letter from `event.code` (issue #3725) [^26^]. Strict modifier equality (tinykeys fails the match on any extra held modifier [^1^]) prevents `Ctrl+D` firing on `Ctrl+Shift+D`. One engine caveat from the sandbox: `e.key`/`e.code` reads are within 1–6% of baseline in Blink (eager-cached getters, Table 3-6), but Gecko re-maps per access — hoist the reads once per handler as above, which also matches what `StandardKeyboardEvent`'s normalization constructor does architecturally [^17^].

### 6.4 preventDefault discipline and the 12-point playbook

Claiming the event is the last hot-path decision, and the libraries split into three disciplines: return-value conventions (Mousetrap/hotkeys-js: callback returning `false` ⇒ preventDefault + stopPropagation [^3^][^9^]; ProseMirror/CM6: first handler returning `true` claims the event [^24^][^22^]), resolver-driven claiming (VS Code sets `shouldPreventDefault` on match, on pending chords, and on chord dead-ends [^16^]), and explicit per-binding flags (CM6's `preventDefault: true` claims the key even when the command returns false [^22^]). The sandbox adds two non-obvious facts: `preventDefault()` itself is within noise on synthetic dispatch (Table 3-10), but on the trusted path it fully suppresses `beforeinput`/`input` and _raises_ throughput to 635 presses/s (Table 3-14) — claiming early is cheap and downstream work disappears. `stopPropagation()` measured 17% faster than letting the event propagate, because it skips the remaining path walk (Table 3-10): precise suppression is a genuine optimization, not just hygiene. And since handler bodies dominate the ~26 ms I/O floor and INP budget that Chapter 5 budgets, the hot path stays side-effect-free — VS Code skips telemetry for `cursor|delete|undo|redo|tab|clipboard` commands for exactly this reason [^16^].

**The 12-point playbook:**

1. **Attach once, dispatch internally.** Root listener + registry at dispatch parity with 1000 direct listeners (176k vs 174k ops/s), ~1000× cheaper registration (0.74 µs/pair) [^16^][^1^].
2. **Never per-component listeners.** Per-hook attachment (react-hotkeys-hook) is O(N) registration with symmetric churn cost [^11^].
3. **Parse at registration, match at dispatch.** CM6 even WeakMap-caches the built map against the facet value; per-keystroke re-parsing is a design bug [^21^][^1^].
4. **Bitmask + `Map<number>` when the hot path matters.** 16.5M ops/s, 60 ns/lookup — VS Code's choice, quantitatively validated; strings are 3.1× slower [^17^].
5. **Normalized strings when readability matters.** Canonical `Alt-Ctrl-Meta-Shift-` order, platform `Mod-`; accept the 5.4M ops/s ceiling [^21^][^24^].
6. **Linear scans only below small N.** 50-binding scan = 2.3M ops/s, 7.2× off bitmask; tinykeys accepts this by design [^1^].
7. **Choose `code` vs `key` deliberately and document it.** `code` for physical bindings (react-hotkeys-hook v5 [^10^], games), `key` for produced characters (tinykeys [^1^]), hybrid fallback (hotkeys-js [^8^]).
8. **Strict modifier equality.** Extra held modifiers must fail the match (tinykeys [^1^]); bitmask encode gives exactness by construction.
9. **Guard IME and repeat always.** `isComposing`/`repeat` guards measure <0.5% (Table 3-8) — no excuse; chord mode additionally disables the IME (VS Code [^16^]).
10. **Codify AltGraph/Option/quirk tables.** Windows AltGraph = ctrl+alt guards [^21^][^24^]; macOS dead-key recovery via `code` [^26^]; one browser quirk table, not scattered fixes [^17^].
11. **preventDefault precisely, never blanket.** Resolver/per-binding flags [^16^][^22^]; `stopPropagation` on claim is 17% _faster_ than propagating (Table 3-10); check `event.defaultPrevented` at global toggles (kbar [^13^]).
12. **Keep the handler body side-effect-free.** Hoist `e.key`/`e.code` reads once (Gecko re-maps per access); defer telemetry/logging (VS Code `HIGH_FREQ_COMMANDS` [^16^]); handler bodies, not dispatch, dominate the INP budget.
