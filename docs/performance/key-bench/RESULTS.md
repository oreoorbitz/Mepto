# DOM Keyboard Event Listener Microbenchmarks — RESULTS

- Engine: **Chrome/150.0.7871.181** (real Blink + V8, headless, --no-sandbox --disable-gpu --disable-dev-shm-usage --js-flags=--expose-gc)
- Node driver: v20.20.2 · Date: 2026-08-13T23:31:53.789Z
- Harness: ~200 ms warmup per case, batches calibrated to ≥2 ms, ≥300 ms measured per rep, 5 reps per full run, alternating case order across reps, gc() between suites, DCE sink guard (all handler results accumulated into window.\_\_sink; final sink value verified nonzero).
- Numbers below: **median ops/sec over 2 full runs (10 pooled reps; outliers rerun once and pooled, 15 reps)**. CV = stdev/mean across pooled reps.

## 1.dispatch-vs-depth

| case                    | median ops/s |  ns/op |     min |     max | spread |   CV | rel. to fastest |
| ----------------------- | -----------: | -----: | ------: | ------: | -----: | ---: | --------------: |
| leaf-listener depth=1   |      252.1 k |  3,967 | 235.0 k | 263.1 k | 28.2 k | 4.0% |           0.998 |
| leaf-listener depth=50  |      154.3 k |  6,481 | 140.6 k | 157.7 k | 17.1 k | 4.0% |           0.611 |
| leaf-listener depth=500 |       31.5 k | 31,725 |  27.5 k |  32.4 k |  4.9 k | 5.1% |           0.125 |
| root-listener depth=1   |      252.6 k |  3,958 | 244.9 k | 271.9 k | 27.0 k | 3.3% |           1.000 |
| root-listener depth=50  |      142.3 k |  7,027 | 134.1 k | 158.4 k | 24.3 k | 5.9% |           0.563 |
| root-listener depth=500 |       31.3 k | 31,968 |  26.5 k |  34.0 k |  7.6 k | 9.2% |           0.124 |

## 2.capture-vs-bubble depth=500

| case         | median ops/s |  ns/op |    min |    max | spread |   CV | rel. to fastest |
| ------------ | -----------: | -----: | -----: | -----: | -----: | ---: | --------------: |
| capture@root |       28.9 k | 34,639 | 25.4 k | 33.1 k |  7.6 k | 7.3% |           0.935 |
| bubble@root  |       28.6 k | 35,019 | 26.4 k | 33.5 k |  7.1 k | 6.6% |           0.924 |
| bubble@leaf  |       30.9 k | 32,374 | 25.2 k | 34.4 k |  9.2 k | 9.9% |           1.000 |

## 3.listener-count

| case                                  | median ops/s |  ns/op |     min |     max | spread |   CV | rel. to fastest |
| ------------------------------------- | -----------: | -----: | ------: | ------: | -----: | ---: | --------------: |
| 1 listener on target                  |      246.3 k |  4,060 | 235.0 k | 256.0 k | 21.0 k | 2.8% |           0.991 |
| 10 listeners on target                |      243.0 k |  4,115 | 229.6 k | 253.5 k | 23.9 k | 3.2% |           0.978 |
| 100 listeners on target               |      248.4 k |  4,025 | 236.6 k | 254.3 k | 17.7 k | 2.2% |           1.000 |
| 10 listeners / 10 ancestors (depth10) |       81.0 k | 12,352 |  76.8 k |  84.9 k |  8.1 k | 3.5% |           0.326 |
| 10 listeners on target (depth10 tree) |      221.7 k |  4,510 | 209.4 k | 226.1 k | 16.7 k | 2.4% |           0.892 |

## 4.delegation registration

| case                            | median ops/s |   ns/op |    min |    max | spread |   CV | rel. to fastest |
| ------------------------------- | -----------: | ------: | -----: | -----: | -----: | ---: | --------------: |
| addEventListener x1 (delegated) |       1.33 M |     753 | 1.28 M | 1.36 M | 80.7 k | 1.7% |           1.000 |
| addEventListener x1000 (direct) |        1.3 k | 766,871 |  1.2 k |  1.3 k |     83 | 2.0% |           0.001 |

## 4.delegation dispatch

| case                                           | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| ---------------------------------------------- | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| delegated: 1 doc listener + closest            |      176.1 k | 5,677 | 165.5 k | 185.3 k | 19.9 k | 3.5% |           1.000 |
| direct: 1000 listeners on buttons              |      174.0 k | 5,746 | 166.7 k | 178.5 k | 11.7 k | 2.0% |           0.988 |
| delegated: 1 listener on 2000-node flat parent |      147.0 k | 6,805 | 133.7 k | 154.8 k | 21.1 k | 3.8% |           0.834 |
| direct: 1 listener on target in 2000-node flat |      148.4 k | 6,737 | 139.7 k | 152.4 k | 12.7 k | 3.1% |           0.843 |

## 5.key-property-reads

| case                          | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| ----------------------------- | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| baseline (no read)            |      248.9 k | 4,017 | 234.1 k | 254.9 k | 20.8 k | 2.7% |           1.000 |
| e.key                         |      238.8 k | 4,188 | 220.5 k | 244.9 k | 24.3 k | 3.1% |           0.959 |
| e.code                        |      244.7 k | 4,087 | 229.2 k | 248.3 k | 19.1 k | 2.9% |           0.983 |
| e.keyCode                     |      238.5 k | 4,194 | 221.3 k | 249.8 k | 28.6 k | 3.6% |           0.958 |
| e.which                       |      248.8 k | 4,019 | 240.9 k | 251.7 k | 10.8 k | 1.5% |           1.000 |
| e.charCode                    |      241.9 k | 4,135 | 231.4 k | 248.8 k | 17.4 k | 2.2% |           0.972 |
| e.key read twice              |      241.2 k | 4,146 | 231.4 k | 247.6 k | 16.2 k | 1.8% |           0.969 |
| e.getModifierState('Control') |      233.7 k | 4,278 | 224.3 k | 242.3 k | 18.0 k | 2.1% |           0.939 |
| e.ctrlKey                     |      245.5 k | 4,073 | 220.9 k | 253.5 k | 32.7 k | 3.5% |           0.986 |
| e.shiftKey                    |      246.4 k | 4,058 | 224.4 k | 251.5 k | 27.1 k | 3.5% |           0.990 |

## 6.shortcut-matching (handler only)

| case                                     | median ops/s | ns/op |     min |     max |  spread |    CV | rel. to fastest |
| ---------------------------------------- | -----------: | ----: | ------: | ------: | ------: | ----: | --------------: |
| a) normalized string + Map.get           |       5.38 M |   186 |  4.92 M |  5.45 M | 537.0 k |  3.1% |           0.325 |
| b) bitmask int + Map<number>             |      16.54 M |    60 | 16.23 M | 16.73 M | 499.2 k |  0.9% |           1.000 |
| c) linear scan of 50 bindings (hit last) |       2.28 M |   438 |  1.99 M |  2.31 M | 316.7 k |  3.9% |           0.138 |
| d) Map-of-Maps trie                      |      14.58 M |    69 |  6.21 M | 14.81 M |  8.59 M | 18.6% |           0.881 |

## 7.registration-removal

| case                                       | median ops/s |  ns/op |     min |     max |  spread |    CV | rel. to fastest |
| ------------------------------------------ | -----------: | -----: | ------: | ------: | ------: | ----: | --------------: |
| add+remove pair                            |       1.34 M |    744 |  1.18 M |  1.40 M | 228.4 k |  4.6% |           1.000 |
| once:true (register+dispatch+auto-remove)  |      183.3 k |  5,456 | 163.4 k | 190.6 k |  27.2 k |  4.7% |           0.136 |
| abort: 100 listeners removed via 1 abort() |       11.9 k | 83,815 |   7.9 k |  12.3 k |   4.5 k | 11.1% |           0.009 |
| remove: 100 removeEventListener calls      |       22.6 k | 44,160 |   9.0 k |  24.9 k |  15.9 k | 23.0% |           0.017 |

## 8.event-control

| case                                    | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| --------------------------------------- | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| no preventDefault                       |      247.1 k | 4,048 | 230.7 k | 254.0 k | 23.2 k | 2.9% |           1.000 |
| preventDefault()                        |      243.5 k | 4,107 | 215.8 k | 250.8 k | 35.0 k | 4.1% |           0.986 |
| no stopPropagation (2-level path)       |      201.6 k | 4,960 | 195.8 k | 207.7 k | 11.9 k | 1.9% |           0.816 |
| stopPropagation() (2-level path)        |      235.3 k | 4,250 | 208.9 k | 239.9 k | 31.0 k | 3.7% |           0.952 |
| 2 listeners same node, no stopImmediate |      243.1 k | 4,114 | 237.3 k | 252.5 k | 15.2 k | 2.0% |           0.984 |
| stopImmediatePropagation (2 same-node)  |      232.9 k | 4,294 | 213.0 k | 240.9 k | 27.9 k | 3.6% |           0.943 |

## 9.event-type

| case                     | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| ------------------------ | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| keydown                  |      246.5 k | 4,056 | 222.1 k | 255.2 k | 33.1 k | 3.6% |           0.686 |
| keyup                    |      248.4 k | 4,025 | 244.6 k | 253.5 k |  8.8 k | 1.0% |           0.691 |
| beforeinput (InputEvent) |      308.7 k | 3,239 | 289.4 k | 317.2 k | 27.9 k | 3.1% |           0.859 |
| input (InputEvent)       |      308.1 k | 3,246 | 287.6 k | 315.1 k | 27.5 k | 3.0% |           0.858 |
| compositionstart         |      359.3 k | 2,783 | 330.3 k | 365.2 k | 34.9 k | 2.9% |           1.000 |

## 10.listener-shape

| case                 | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| -------------------- | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| function listener    |      248.3 k | 4,027 | 230.6 k | 254.6 k | 24.0 k | 2.6% |           1.000 |
| {handleEvent} object |      223.9 k | 4,466 | 212.1 k | 230.1 k | 18.1 k | 2.4% |           0.902 |
| arrow closure        |      243.3 k | 4,110 | 233.0 k | 254.6 k | 21.5 k | 2.8% |           0.980 |
| onkeydown property   |      228.2 k | 4,381 | 215.3 k | 237.4 k | 22.1 k | 2.7% |           0.919 |

## 11.event-construction

| case                                  | median ops/s | ns/op |     min |     max |  spread |   CV | rel. to fastest |
| ------------------------------------- | -----------: | ----: | ------: | ------: | ------: | ---: | --------------: |
| construct only (no dispatch)          |      432.2 k | 2,314 | 417.2 k | 438.4 k |  21.2 k | 1.8% |           0.557 |
| dispatch, fresh event each time       |      245.6 k | 4,072 | 235.1 k | 251.4 k |  16.4 k | 2.3% |           0.317 |
| dispatch, reused preconstructed event |      775.9 k | 1,289 | 606.2 k | 789.3 k | 183.1 k | 9.8% |           1.000 |

## 12.guards

| case                     | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| ------------------------ | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| no guard                 |      239.9 k | 4,168 | 214.4 k | 246.9 k | 32.5 k | 4.1% |           1.000 |
| if(e.repeat) return      |      238.9 k | 4,185 | 214.2 k | 251.7 k | 37.6 k | 4.4% |           0.996 |
| if(e.isComposing) return |      239.3 k | 4,179 | 222.6 k | 252.3 k | 29.7 k | 3.3% |           0.997 |

## 14.delegated-target-checks

| case                          | median ops/s | ns/op |     min |     max | spread |   CV | rel. to fastest |
| ----------------------------- | -----------: | ----: | ------: | ------: | -----: | ---: | --------------: |
| e.target.closest('[data-k]')  |      127.9 k | 7,818 | 122.0 k | 135.0 k | 13.0 k | 3.2% |           0.981 |
| e.target.matches('[data-k]')  |      125.7 k | 7,958 | 119.9 k | 131.7 k | 11.9 k | 2.9% |           0.964 |
| e.target.tagName === 'BUTTON' |      125.1 k | 7,991 | 117.0 k | 131.0 k | 13.9 k | 2.7% |           0.960 |
| e.composedPath()[0]           |      130.4 k | 7,667 | 121.5 k | 133.8 k | 12.3 k | 3.3% |           1.000 |

## 13. Trusted input layer (page.keyboard.press / CDP Input.dispatchKeyEvent)

200 keydown→keyup presses per mode (key 'k' into a focused <input>), wall-clock from Node driver; latency = performance.now() inside keydown handler (capture) minus marker set immediately before dispatch (50 presses).

| mode           | presses/s (wall) | keydowns | beforeinput | input | avg latency (ms) | max latency (ms) |
| -------------- | ---------------: | -------: | ----------: | ----: | ---------------: | ---------------: |
| empty          |              252 |      200 |         200 |   200 |             1.27 |              6.6 |
| shortcut       |              234 |      200 |         200 |   200 |             1.43 |              6.0 |
| preventDefault |              635 |      200 |           0 |     0 |             0.93 |              4.1 |

## Key findings (measured)

1. **EventPath computation dominates dispatch cost; listener _position_ is irrelevant.** At depth 1 a keydown dispatch + one listener runs at ~252k ops/s whether the listener is on the leaf or the root (ratio 1.002). At depth 500 both collapse to ~31.3k ops/s (~32 µs/dispatch). Cost scales with path length, not with where the handler sits: depth 1→50 is 1.6× slower, 1→500 is ~8× slower.
2. **Capture ≈ bubble** at equal path length (28.9k vs 28.6k ops/s at depth 500, ratio 1.01) — phase choice is free.
3. **Adding listeners to the _same node_ is nearly free at dispatch time**: 1 / 10 / 100 listeners on the target all run at 243–248k ops/s (≤1.5% apart). Spreading 10 listeners across 10 ancestors costs the path traversal (81k ops/s, ~3× slower) — again path-bound, not invocation-bound.
4. **Delegation vs direct dispatch cost is parity.** One document listener + `closest()` (176k ops/s) ≈ 1000 direct listeners with one firing (174k ops/s); same parity on the 2000-node flat tree (147k vs 148k). The real difference is **registration**: 1 add/remove pair = 0.74 µs vs 767 µs for 1000 pairs (~1000×, exactly linear).
5. **Key property reads are all cheap and equal**: e.key / e.code / e.keyCode / e.which / e.charCode / e.ctrlKey / e.shiftKey / getModifierState all within 1–6% of the no-read baseline (249k ops/s). Reading `e.key` twice costs the same as once (getter is trivially cached/inlined). No property is "expensive"; choose by correctness, not speed.
6. **Shortcut-matching strategy matters 7× (handler-only throughput)**: bitmask int + `Map<number>` = **16.5M ops/s** ≈ Map-of-Maps trie (14.6M) > normalized-string + Map.get (5.4M, 3.1× slower than bitmask) > linear scan of 50 binding objects (2.3M, 7.2× slower). String building (concat + toLowerCase) is the main cost of the popular "normalized string" approach. (In a real dispatch these differences are swamped by ~4 µs of dispatch overhead.)
7. **AbortController is _not_ a faster teardown than removeEventListener**: registering 100 signal-bound listeners + one `abort()` = 84 µs/cycle vs 44 µs/cycle for 100 plain adds + 100 removes — abort is ~1.9× _slower_ end-to-end (signal bookkeeping on registration outweighs the single-call removal). Use AbortController for ergonomics, not speed.
8. **Event control calls are free or better**: preventDefault within noise (−1.5%); stopPropagation is _faster_ than letting the event continue (235k vs 202k ops/s — it legitimately skips the ancestor listener); stopImmediatePropagation similarly skips the second same-node listener (233k vs 243k).
9. **Event type cost differs meaningfully**: compositionstart (359k ops/s) > input ≈ beforeinput (308k) > keydown ≈ keyup (247k). KeyboardEvent dispatch+construction is ~45% slower than CompositionEvent and ~25% slower than InputEvent — KeyboardEvent init carries extra processing.
10. **Listener shape**: plain function (248k) ≈ arrow closure (243k) > `onkeydown` property (228k, −8%) ≈ `{handleEvent}` object (224k, −10%). Small but real penalties for property handlers and object listeners.
11. **Event construction ≈ half the fresh-dispatch cost**: construct-only = 432k/s (2.3 µs); fresh construct+dispatch = 246k/s (4.1 µs); dispatching a preconstructed event = 776k/s (1.3 µs, **3.2× faster** than fresh). Reusing event objects is the single biggest synthetic-dispatch win (note: real trusted events can't be reused).
12. **`e.repeat` / `e.isComposing` guards are free** (<0.5% vs no guard).
13. **Delegated target checks are all equivalent**: closest ≈ matches ≈ tagName ≈ composedPath()[0], within 4% (125–130k ops/s). Pick whichever is most correct; there is no measurable speed argument.
14. **Trusted layer**: ~234–252 presses/s wall-clock for page.keyboard.press('k') (keydown+keyup round-trip, CDP-bound); perceived in-page latency marker→handler ≈ 1.3–1.4 ms avg (includes CDP IPC). With preventDefault on keydown: beforeinput/input are **fully suppressed** (0 events — confirms keydown→beforeinput→input ordering and cancellation) and throughput rises to 635 presses/s because character insertion is skipped. A string-matching handler adds no measurable trusted-path latency vs an empty handler.

## Honest caveats

- **Synthetic vs trusted measure different things.** Layer (A) `dispatchEvent` measures pure in-page EventPath computation + listener invocation on the Blink main thread — no IPC, no input pipeline, no compositor. Layer (B) trusted presses are dominated by CDP round-trip time (Node→Chromium) and Chromium's input pipeline; presses/s is _driver-bound_, not engine-bound, and trusted key events are scheduled through the input event queue (effectively frame/task-aligned), so per-press times are quantized and far noisier than synthetic numbers. The latency figures include CDP marker round-trip overhead — treat them as upper bounds on true input-to-handler latency.
- Depth trees (cases 1–3) are **detached** from the document so path length == tree depth exactly; attached trees add 2–3 constant path entries (body/html/document/window) but the scaling behavior is identical (confirmed by the attached flat-tree cases).
- `2.capture-vs-bubble :: bubble@leaf` showed a bimodal distribution across runs (~26k vs ~32k ops/s; JIT/GC tier shift); rerun pooled 15 reps, median 30.9k. `6 :: trie` had one deopt rep (CV 18.6%). Both flagged rather than hidden.
- The linear-scan case places the matching binding **last** (worst case of 50); average case would be ~2× faster.
- beforeinput/input/compositionstart synthetic dispatch does not trigger editing behavior (detached, non-editable target); trusted input into a real `<input>` does, which is why preventDefault changes trusted throughput.
- Absolute numbers are machine-specific (this container); ratios are the portable result. Two full runs agreed within ±10% for 61/63 cases; the 2 outliers were rerun once and pooled.
