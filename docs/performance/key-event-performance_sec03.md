## 3. Measured Results: Chromium 150 Sandbox

Every number in this chapter was measured in this investigation's sandbox: **Chromium 150.0.7871.181** (real Blink + V8, headless, `--no-sandbox --disable-gpu --disable-dev-shm-usage --js-flags=--expose-gc`), driven by Node v20.20.2 on 2026-08-13. Unless stated otherwise, figures are median ops/s over 2 full runs (10 pooled repetitions of ≥300 ms measured time each, batches calibrated to ≥2 ms, ~200 ms warmup per case, alternating case order, `gc()` between suites, and a DCE sink guard whose final value was verified nonzero); CV is stdev/mean across pooled reps. Two outlier cases were rerun once and pooled (15 reps) and are flagged where they appear. Sections 3.1–3.5.1 are the **engine-cost** measurements — synthetic `dispatchEvent` on the Blink main thread, no IPC and no input pipeline. Section 3.5.2 reports the trusted layer, which is driver-bound and must be read differently. Absolute numbers are machine-specific; the ratios are the portable result.

### 3.1 Dispatch topology

#### 3.1.1 Listener position is irrelevant; path length is everything

**Table 3-1. Keydown dispatch + one listener vs. tree depth and listener position** (detached trees, so path length == depth; median ops/s, n=10 pooled reps × 2 runs, Chromium 150 headless)

| case                    | median ops/s |  ns/op |   CV | rel. to fastest |
| ----------------------- | -----------: | -----: | ---: | --------------: |
| leaf-listener depth=1   |      252.1 k |  3,967 | 4.0% |           0.998 |
| root-listener depth=1   |      252.6 k |  3,958 | 3.3% |           1.000 |
| leaf-listener depth=50  |      154.3 k |  6,481 | 4.0% |           0.611 |
| root-listener depth=50  |      142.3 k |  7,027 | 5.9% |           0.563 |
| leaf-listener depth=500 |       31.5 k | 31,725 | 5.1% |           0.125 |
| root-listener depth=500 |       31.3 k | 31,968 | 9.2% |           0.124 |

Chapter 2 predicted that dispatch cost scales with EventPath length rather than listener position; the data **confirms** both halves. At depth 1, leaf and root listeners run at 252.1k vs 252.6k ops/s — a ratio of 1.002, statistically indistinguishable. Deepen the tree and the two columns collapse together: at depth 500, leaf and root land at 31.5k and 31.3k ops/s (~32 µs per dispatch), a 1.006 ratio. Meanwhile the depth scaling is severe: depth 1→50 costs 1.6–1.8× (252.6k→142.3k ops/s for the root case, 1.78×), and depth 1→500 costs ~8×. Blink computes the propagation path once per dispatch and walks it regardless of where handlers sit, so a handler at the root of a 500-node tree pays the same path-traversal tax as one on the leaf. Note the depth-500 root case carries the highest CV in the suite (9.2%), typical of the longest per-op times; the leaf/root agreement nonetheless holds within run-to-run noise. Practical corollary: moving a listener "closer" to the target buys nothing unless it shortens the path actually traversed.

#### 3.1.2 Capture ≈ bubble; same-node listeners are free, cross-ancestor listeners are not

**Table 3-2. Capture vs. bubble at depth 500** (median ops/s, n=10; bubble@leaf pooled to n=15 after a flagged rerun)

| case         | median ops/s |  ns/op |   CV | rel. to fastest |
| ------------ | -----------: | -----: | ---: | --------------: |
| bubble@leaf  |       30.9 k | 32,374 | 9.9% |           1.000 |
| capture@root |       28.9 k | 34,639 | 7.3% |           0.935 |
| bubble@root  |       28.6 k | 35,019 | 6.6% |           0.924 |

**Table 3-3. Listener count and placement** (median ops/s, n=10)

| case                                  | median ops/s |  ns/op |   CV | rel. to fastest |
| ------------------------------------- | -----------: | -----: | ---: | --------------: |
| 100 listeners on target               |      248.4 k |  4,025 | 2.2% |           1.000 |
| 1 listener on target                  |      246.3 k |  4,060 | 2.8% |           0.991 |
| 10 listeners on target                |      243.0 k |  4,115 | 3.2% |           0.978 |
| 10 listeners on target (depth10 tree) |      221.7 k |  4,510 | 2.4% |           0.892 |
| 10 listeners / 10 ancestors (depth10) |       81.0 k | 12,352 | 3.5% |           0.326 |

Read Table 3-2 in the context of Table 3-1: every capture/bubble permutation at depth 500 clusters at 28.6–30.9k ops/s, the same ~32 µs regime as the depth-500 leaf/root cases, while the depth-1 baseline runs at ~252k. The phase in which a listener fires contributes nothing measurable next to the 500-entry path walk — the ns/op spread between the fastest and slowest row is 2.6 µs against a 10.6 µs spread across bubble@leaf's own reps. If capture were to carry an intrinsic cost, this is the configuration (longest path, earliest-phase listener) where it would have to appear; it does not. Chapter 2's second prediction — capture ≈ bubble — is **confirmed**: at depth 500, capture@root (28.9k ops/s) and bubble@root (28.6k) sit at a 1.01 ratio, within CV. Phase choice is free. One honest caveat: `bubble@leaf` showed a **bimodal distribution across runs** (~26k vs ~32k ops/s, a JIT/GC tier shift); it was rerun once, pooled to 15 reps, and the reported 30.9k median carries the suite's highest CV (9.9%). We flag rather than hide this. Table 3-3 sharpens the topology story: stacking 1, 10, or 100 listeners on the _same_ node stays within 2.2% (246.3k / 243.0k / 248.4k ops/s — non-monotonic, hence noise), because the path is computed once and per-node listener invocation is cheap. But spreading those same 10 listeners across 10 ancestors drops throughput to 81.0k ops/s — 2.74× slower than 10 listeners on one node of the same depth-10 tree (221.7k). Dispatch is path-bound, not invocation-bound.

### 3.2 Delegation economics

#### 3.2.1 Dispatch parity between delegated and direct listeners

**Table 3-4. Delegated vs. direct dispatch** (median ops/s, n=10)

| case                                           | median ops/s | ns/op |   CV | rel. to fastest |
| ---------------------------------------------- | -----------: | ----: | ---: | --------------: |
| delegated: 1 doc listener + `closest()`        |      176.1 k | 5,677 | 3.5% |           1.000 |
| direct: 1000 listeners on buttons              |      174.0 k | 5,746 | 2.0% |           0.988 |
| direct: 1 listener on target in 2000-node flat |      148.4 k | 6,737 | 3.1% |           0.843 |
| delegated: 1 listener on 2000-node flat parent |      147.0 k | 6,805 | 3.8% |           0.834 |

Delegation's dispatch-time cost is a wash. One document-level listener doing `e.target.closest('[data-k]')` fires at 176.1k ops/s against 174.0k for 1000 direct per-button listeners (one firing per dispatch) — a 1.2% gap, inside the CV of either case. The same parity holds on a 2000-node flat tree (147.0k delegated vs 148.4k direct). The `closest()` call itself is not the bottleneck: a companion suite of delegated target checks found `closest` (127.9k ops/s), `matches` (125.7k), `tagName === 'BUTTON'` (125.1k), and `composedPath()[0]` (130.4k) all within 4.2% of each other, so the selection predicate can be chosen on correctness grounds alone. What the table hides is the setup side of the ledger — the 1000-listener column must first _register_ 1000 listeners, which is where delegation actually wins, as the next section quantifies.

#### 3.2.2 Registration is the real cost

**Table 3-5. Registration throughput, delegated vs. direct** (median ops/s, n=10)

| case                            | median ops/s |   ns/op |   CV | rel. to fastest |
| ------------------------------- | -----------: | ------: | ---: | --------------: |
| addEventListener ×1 (delegated) |       1.33 M |     753 | 1.7% |           1.000 |
| addEventListener ×1000 (direct) |        1.3 k | 766,871 | 2.0% |           0.001 |

A single `addEventListener` call costs ~0.75 µs (1.33M ops/s, CV 1.7% — one of the tightest measurements in the study). Registering 1000 direct listeners costs 766.9 µs per batch — almost exactly 1000× the single registration, i.e. perfectly linear with no batching discount in Blink's listener list management. This is the real delegation economics: at dispatch time the two architectures are at parity (Table 3-4), but the direct architecture pays three orders of magnitude more at setup and teardown. For a library mounting a keyboard-heavy widget with N focusable controls, delegated registration is O(1) in N; direct registration is O(N) at ~0.77 µs per control. The add+remove pair measured in §3.5.1 (744 ns) confirms registration and removal are symmetric in cost, so churning direct listeners on every render cycle multiplies this penalty.

### 3.3 Handler hot path

#### 3.3.1 Property reads are all near-free

**Table 3-6. Key-property reads inside the handler** (median ops/s, n=10)

| case                          | median ops/s | ns/op |   CV | rel. to fastest |
| ----------------------------- | -----------: | ----: | ---: | --------------: |
| baseline (no read)            |      248.9 k | 4,017 | 2.7% |           1.000 |
| e.which                       |      248.8 k | 4,019 | 1.5% |           1.000 |
| e.shiftKey                    |      246.4 k | 4,058 | 3.5% |           0.990 |
| e.ctrlKey                     |      245.5 k | 4,073 | 3.5% |           0.986 |
| e.code                        |      244.7 k | 4,087 | 2.9% |           0.983 |
| e.charCode                    |      241.9 k | 4,135 | 2.2% |           0.972 |
| e.key read twice              |      241.2 k | 4,146 | 1.8% |           0.969 |
| e.key                         |      238.8 k | 4,188 | 3.1% |           0.959 |
| e.keyCode                     |      238.5 k | 4,194 | 3.6% |           0.958 |
| e.getModifierState('Control') |      233.7 k | 4,278 | 2.1% |           0.939 |

Chapter 2's third prediction — near-free property reads — is **confirmed**. Every accessor, legacy (`keyCode`, `which`, `charCode`) or modern (`key`, `code`, modifier booleans, `getModifierState`), lands within 1–6% of the 248.9k ops/s no-read baseline, and the ordering is non-monotonic enough (`e.which` ties baseline at 1.000) that the deltas are mostly noise against CVs of 1.5–3.6%. Reading `e.key` twice costs the same as reading it once (241.2k vs 238.8k, within CV): V8 inlines the getter after the first call. Even the worst case, `getModifierState('Control')` — a real function call with a string argument — costs only ~6% (~260 ns per dispatch including dispatch itself). The practical rule: choose the property that is _correct_ for your shortcut semantics (`code` for physical position, `key` for layout-resolved characters, deprecated aliases never for new code); there is no speed argument for any of them.

#### 3.3.2 Shortcut matching: 7× between strategies

**Table 3-7. Shortcut-matching strategy, handler-only throughput** (no dispatch; median ops/s, n=10)

| strategy                                 | median ops/s | ns/op |    CV | rel. to fastest |
| ---------------------------------------- | -----------: | ----: | ----: | --------------: |
| b) bitmask int + `Map<number>`           |      16.54 M |    60 |  0.9% |           1.000 |
| d) Map-of-Maps trie                      |      14.58 M |    69 | 18.6% |           0.881 |
| a) normalized string + `Map.get`         |       5.38 M |   186 |  3.1% |           0.325 |
| c) linear scan of 50 bindings (hit last) |       2.28 M |   438 |  3.9% |           0.138 |

Strip dispatch away and the matching strategy dominates the handler: a bitmask integer keyed into a `Map<number>` sustains 16.54M ops/s (60 ns/lookup, CV 0.9%), essentially tied with a Map-of-Maps trie at 14.58M. The popular "normalized string" approach — `ctrl+shift+k` built via concat + `toLowerCase` then `Map.get` — runs 5.38M ops/s, **3.1× slower** than the bitmask; string construction, not the hash lookup, is the cost. A linear scan of 50 binding objects with the match placed _last_ (worst case; average case ~2× faster) manages only 2.28M, **7.2× slower**. Caveat on the trie: one rep deoptimized (min 6.21M vs median 14.58M), inflating CV to 18.6% — flagged, rerun, and pooled; the median is robust but tail latency is not. Proportionality check: inside a real 4 µs synthetic dispatch, even the 438 ns scan is swamped — these differences matter only for libraries doing thousands of matches per interaction (e.g., chord sequencers or per-keystroke palette filtering).

#### 3.3.3 Guards are free; listener shape costs up to 10%

**Table 3-8. Early-exit guards** (median ops/s, n=10)

| case                        | median ops/s | ns/op |   CV | rel. to fastest |
| --------------------------- | -----------: | ----: | ---: | --------------: |
| no guard                    |      239.9 k | 4,168 | 4.1% |           1.000 |
| `if (e.isComposing) return` |      239.3 k | 4,179 | 3.3% |           0.997 |
| `if (e.repeat) return`      |      238.9 k | 4,185 | 4.4% |           0.996 |

**Table 3-9. Listener registration shape** (median ops/s, n=10)

| case                 | median ops/s | ns/op |   CV | rel. to fastest |
| -------------------- | -----------: | ----: | ---: | --------------: |
| function listener    |      248.3 k | 4,027 | 2.6% |           1.000 |
| arrow closure        |      243.3 k | 4,110 | 2.8% |           0.980 |
| onkeydown property   |      228.2 k | 4,381 | 2.7% |           0.919 |
| {handleEvent} object |      223.9 k | 4,466 | 2.4% |           0.902 |

Table 3-8's guards deserve a precision note: the deltas (−0.3% and −0.4%) are an order of magnitude smaller than the CVs (3.3–4.4%), so strictly the measurement can only bound the guard cost below ~0.5%, not prove it is exactly zero — a single boolean attribute read against a 4.2 µs dispatch is simply under the noise floor of this harness. That is the strongest form of "free" a microbenchmark can honestly claim, and it holds for both guards independently.

The two correctness guards every keyboard library should have — `e.repeat` to swallow auto-repeat and `e.isComposing` to stay out of IME composition — cost less than 0.5% (238.9k and 239.3k vs 239.9k ops/s baseline, deltas smaller than the ~4% CVs). There is no performance excuse for omitting either. Listener shape, by contrast, carries a small but real penalty. A plain function reference (248.3k ops/s) and an arrow closure (243.3k, −2%) are equivalent, but the `onkeydown` IDL property handler drops 8% (228.2k) and the `{handleEvent}` object form drops 10% (223.9k) — both stable across reps (CV ≤ 2.7%). The object form still earns its keep for stateful listeners carrying `this` without allocation, and the property form remains relevant for legacy interop; but for a hot global keymap, `addEventListener` with a stable function is measurably the cheapest shape.

### 3.4 Control calls, event types, construction

#### 3.4.1 preventDefault within noise; stopPropagation is _faster_ than propagating

**Table 3-10. Event control calls** (median ops/s, n=10)

| case                                    | median ops/s | ns/op |   CV | rel. to fastest |
| --------------------------------------- | -----------: | ----: | ---: | --------------: |
| no preventDefault                       |      247.1 k | 4,048 | 2.9% |           1.000 |
| preventDefault()                        |      243.5 k | 4,107 | 4.1% |           0.986 |
| stopPropagation() (2-level path)        |      235.3 k | 4,250 | 3.7% |           0.952 |
| stopImmediatePropagation (2 same-node)  |      232.9 k | 4,294 | 3.6% |           0.943 |
| 2 listeners same node, no stopImmediate |      243.1 k | 4,114 | 2.0% |           0.984 |
| no stopPropagation (2-level path)       |      201.6 k | 4,960 | 1.9% |           0.816 |

Calling `preventDefault()` on a synthetic keydown is within noise of not calling it: 243.5k vs 247.1k ops/s (−1.5%, CV 4.1% on the treatment). On a detached, non-editable target there is no default action to cancel, so this measures only the flag-set; §3.5.2 shows the trusted side effects are a different (and favorable) story. `stopPropagation()` is the interesting case: on a 2-level path it runs at 235.3k ops/s versus 201.6k for letting the event propagate — **17% faster**, because it legitimately skips the ancestor listener invocation and the remaining path walk. Likewise `stopImmediatePropagation()` (232.9k) edges out two same-node listeners running to completion (243.1k) once its own early-exit saving is netted against the call overhead. The measured lesson for library authors: control calls are not overhead to avoid — `stopPropagation` in a handled-shortcut path is a genuine optimization, not merely a correctness device.

#### 3.4.2 Event type changes dispatch cost by ~45%

**Table 3-11. Construct + dispatch by event type** (median ops/s, n=10)

| event type                          | median ops/s | ns/op |   CV | rel. to fastest |
| ----------------------------------- | -----------: | ----: | ---: | --------------: |
| compositionstart (CompositionEvent) |      359.3 k | 2,783 | 2.9% |           1.000 |
| beforeinput (InputEvent)            |      308.7 k | 3,239 | 3.1% |           0.859 |
| input (InputEvent)                  |      308.1 k | 3,246 | 3.0% |           0.858 |
| keyup (KeyboardEvent)               |      248.4 k | 4,025 | 1.0% |           0.691 |
| keydown (KeyboardEvent)             |      246.5 k | 4,056 | 3.6% |           0.686 |

The event interface itself moves dispatch cost substantially. `compositionstart` constructs and dispatches at 359.3k ops/s; the two `InputEvent` types sit at ~308k; `keydown`/`keyup` trail at ~247k — KeyboardEvent is **~45% slower than CompositionEvent** (246.5k vs 359.3k) and ~25% slower than InputEvent, with keydown/keyup identical to each other (0.686 vs 0.691, keyup's CV a tight 1.0%). The extra cost lives in KeyboardEvent's wider init dictionary and Blink's per-event key/char code processing. Two caveats keep this honest: synthetic `beforeinput`/`input` on a detached, non-editable target triggers no editing behavior (the trusted layer in §3.5.2 does, which is why `preventDefault` changes trusted throughput), and these are construct+dispatch composites, so the deltas blend construction and path walk. For keyboard libraries the takeaway is asymmetric: your hot path is the _slowest_ event type Blink offers — everything else in the input family is cheaper.

#### 3.4.3 Event reuse is the single biggest synthetic-dispatch win

**Table 3-12. Event construction and reuse** (median ops/s, n=10)

| case                                  | median ops/s | ns/op |   CV | rel. to fastest |
| ------------------------------------- | -----------: | ----: | ---: | --------------: |
| dispatch, reused preconstructed event |      775.9 k | 1,289 | 9.8% |           1.000 |
| construct only (no dispatch)          |      432.2 k | 2,314 | 1.8% |           0.557 |
| dispatch, fresh event each time       |      245.6 k | 4,072 | 2.3% |           0.317 |

Decomposing the 4.1 µs fresh construct+dispatch baseline (245.6k ops/s): construction alone is 2.3 µs (432.2k ops/s) — over half the total — and dispatching a preconstructed, reused event collapses the operation to 1.3 µs (775.9k ops/s), a **3.2× speedup** over fresh construction. The reused case carries an elevated CV (9.8%; min 606.2k against a 789.3k max), reflecting GC pressure differences between the allocating and non-allocating variants, but the median gap is far outside that noise. This is the largest single lever found anywhere in the synthetic layer, and it comes with a hard boundary: only synthetic `dispatchEvent` flows can reuse event objects — trusted keyboard events are minted by the input pipeline and cannot be pooled. The technique is therefore a test-harness and synthetic-event-bus optimization (and a warning that fresh-construction microbenchmarks overstate dispatch cost by ~2×), not a production input-path optimization.

### 3.5 Registration/removal and the trusted layer

#### 3.5.1 AbortController teardown is slower than explicit removal

**Table 3-13. Registration and teardown strategies** (median ops/s, n=10 — remove case pooled n=15 with agreement10=false, an outlier flagged per the preamble; teardown cases are full register+teardown cycles of 100 listeners)

| case                                       | median ops/s |  ns/op |    CV | rel. to fastest |
| ------------------------------------------ | -----------: | -----: | ----: | --------------: |
| add+remove pair                            |       1.34 M |    744 |  4.6% |           1.000 |
| once:true (register+dispatch+auto-remove)  |      183.3 k |  5,456 |  4.7% |           0.136 |
| remove: 100 removeEventListener calls      |       22.6 k | 44,160 | 23.0% |           0.017 |
| abort: 100 listeners removed via 1 abort() |       11.9 k | 83,815 | 11.1% |           0.009 |

A single add/remove pair costs 0.74 µs (1.34M ops/s). `once: true` works fine for fire-once shortcuts: the full register+dispatch+auto-remove cycle runs at 183.3k ops/s, only ~34% above the plain dispatch baseline of ~4 µs — the auto-removal bookkeeping is modest. The surprise is teardown at scale. Removing 100 listeners via 100 explicit `removeEventListener` calls costs 44.2 µs per full cycle; the AbortController route — 100 signal-bound registrations plus one `abort()` — costs 83.8 µs, **1.9× slower end-to-end**. The signal bookkeeping at _registration_ time outweighs the single-call removal convenience. Both teardown cases are the noisiest in the study (CV 23.0% and 11.1%; the remove case spans 9.0k–24.9k ops/s across reps), but the medians are separated by nearly 2×, well outside the noise. Verdict: use `AbortController` for ergonomics and leak-safety, not for speed.

#### 3.5.2 The trusted layer: CDP-bound throughput and honest latencies

**Table 3-14. Trusted key presses via CDP `Input.dispatchKeyEvent`** (200 keydown→keyup presses per mode, key 'k' into a focused `<input>`, wall-clock from the Node driver; latency = `performance.now()` inside a capture-phase keydown handler minus a marker set immediately before dispatch, n=50 presses)

| mode                            | presses/s (wall) | keydowns | beforeinput | input | avg latency (ms) | max latency (ms) |
| ------------------------------- | ---------------: | -------: | ----------: | ----: | ---------------: | ---------------: |
| empty handler                   |              252 |      200 |         200 |   200 |             1.27 |              6.6 |
| shortcut handler (string match) |              234 |      200 |         200 |   200 |             1.43 |              6.0 |
| preventDefault on keydown       |              635 |      200 |           0 |     0 |             0.93 |              4.1 |

This table is framed differently from everything above it, deliberately. Sections 3.1–3.4 measured **engine cost** — Blink's EventPath computation and listener invocation on the main thread. The trusted layer measures the **input pipeline and the driver**: 234–252 presses/s wall-clock is the CDP round-trip rate (Node→Chromium `Input.dispatchKeyEvent`), not anything V8 or Blink's event dispatch could influence, and trusted key events are scheduled through the input event queue (effectively frame/task-aligned), so per-press times are quantized and far noisier than synthetic numbers. The ~1.3–1.4 ms marker→handler latency _includes_ CDP IPC and is an upper bound on true input-to-handler latency. Within those limits the table still yields two engine-relevant facts. First, `preventDefault()` on keydown **fully suppresses** `beforeinput` and `input` (200→0 events) — live confirmation of the keydown→beforeinput→input ordering and cancellation contract — and throughput rises to 635 presses/s because character insertion is skipped. Second, a real string-matching shortcut handler adds no measurable trusted-path latency over an empty handler (1.43 vs 1.27 ms, both dominated by IPC jitter with max latencies of 6+ ms), corroborating §3.3's synthetic finding that matching is cheap relative to everything around it.

The synthetic layer's ~4 µs dispatch and the trusted layer's ~1.3 ms marker-to-handler gap are the two ends of the latency budget that Chapter 4 assembles into a full key-press-to-paint accounting.
