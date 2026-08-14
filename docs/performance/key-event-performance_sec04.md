## 4. Published Evidence & the Latency Budget

### 4.1 The published microbenchmark record is thin

Anyone searching the literature for hard numbers on event-listener cost discovers, first, how little there is. The classic jsperf.com corpus is defunct and read-only, and the surviving harnesses (measurethat.net, its benchmarklab mirror, jsben.ch) host suites that mostly measure registration, not dispatch, and clicks, not keys. What follows is, to our knowledge, the complete published record with concrete archived numbers — plus the gaps, which are the more instructive half.

#### 4.1.1 What exists, what it measured, and what nobody measured

| Comparison                                                              | Published numbers                                                                                          | Scope / platform / year                                                                        | Source |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| `addEventListener('click',…)` vs `el.onclick`                           | 2,611 vs 2,650 exec/s — aEL ≈1.5% slower, effectively a wash                                               | **Registration** cost only (not dispatch); browser unspecified; MeasureThat #32515, ~2023–2024 | [^1^]  |
| Vanilla click dispatch vs jQuery `.click()`                             | 3,232,016 vs 1,283,495 ops/s — jQuery wrapper ≈2.5× overhead                                               | Chrome 121, macOS 10.15.7, ~2024                                                               | [^2^]  |
| CustomEvent dispatch vs plain callback (1,000 dispatches)               | Callback wins by orders of magnitude; archived numbers vary per run                                        | MeasureThat #20888; bundles allocation + dispatch + handler                                    | [^3^]  |
| `onclick` vs `addEventListener`                                         | Suite exists, no archived aggregate numbers                                                                | jsben.ch                                                                                       | [^4^]  |
| **Capture vs bubble phase cost**                                        | _No published suite_                                                                                       | —                                                                                              | gap    |
| **Delegation vs N direct listeners (dispatch-time)**                    | _No published suite_; jasonformat (2020) calls the trade-off "hard to measure"                             | —                                                                                              | [^6^]  |
| **`passive:true` vs `passive:false` dispatch cost**                     | _No published suite_                                                                                       | —                                                                                              | gap    |
| **`event.key` vs `keyCode` vs `which` read cost**                       | _No published suite_; jsben.ch "key access speed" measures Map/object lookup, not KeyboardEvent properties | —                                                                                              | [^5^]  |
| **Shortcut-matching strategies** (string vs `keyCode` table vs bitmask) | _No published benchmark_; Mousetrap-vs-hotkeys comparisons cover features only                             | —                                                                                              | [^34^] |

Three cautions attach even to the numbers that exist. Suite #32515 measures **registration**, and citing it as evidence about dispatch cost is a category error [^1^]. The jQuery comparison is real but tells you about wrapper layers, not the DOM event path [^2^]. And every synthetic-dispatch microbenchmark measures only dispatch+handler on a nested call stack — synthetic `dispatchEvent()` invokes handlers synchronously, excluding the input pipeline, IPC, and scheduling entirely [^30^] (MDN's "asynchronously via the event loop" phrasing is itself disputed; only dispatch is queued [^31^]). Add post-Spectre timer coarsening — Firefox ≥59 rounds `performance.now()` to 2 ms [^33^] — and single-dispatch sub-microsecond claims from any of these harnesses are noise.

The delegation debate deserves one more note. GreatFrontEnd (2021) asserts attaching 100 vs 10,000 listeners is "sub-millisecond" and that the real cost is memory — 10,000 retained closures versus one [^7^]. That is a practitioner claim with no numbers behind it; treat it as a hypothesis. Our sandbox in Chapter 3 filled most of these gaps directly: capture vs bubble, delegation economics at N = 1,000 listeners on a 2,000-node tree, and property-read costs are measured rather than asserted. Passive-on-keydown remains unmeasured in the sandbox — the relevant evidence is Akulov's 2017 per-event analysis (§4.3.1).

### 4.2 The latency budget: why handler bodies dominate

The reason the thin microbenchmark record matters less than folklore assumes is that dispatch sits at the wrong end of the latency budget. Stack the published end-to-end numbers and the picture is unambiguous.

#### 4.2.1 Hardware and software floors

Dan Luu's 2017 logic-analyzer study measured keypress-start-to-USB-packet for 20+ keyboards: Apple Magic 15 ms; a large cluster (Logitech K120, Unicomp Model M, Filco) at 30 ms; Kinesis Advantage 50 ms; wireless Logitech K360 60 ms [^8^]. The spread between fastest and slowest is ~45 ms, and gaming keyboards were _not_ faster [^8^]. His companion study put end-to-end keypress→photon at 100–200 ms on modern machines — the Apple IIe did the whole trip in 30 ms in 1983, meaning a single median modern keyboard carries more latency than an entire 1983 pipeline [^9^]. Fatin's 2015 decomposition (Typometer) makes the budget explicit: input averages 14 ms (debouncing 8.5 ms is the largest single term), output averages 12 ms at 60 Hz — a fixed I/O floor of ~26 ms before any application code runs [^10^].

| Budget stage                                        | Typical cost                                                 | Source / year     |
| --------------------------------------------------- | ------------------------------------------------------------ | ----------------- |
| Keyboard matrix scan + debounce + USB poll/transfer | 8–22 ms, avg 14 ms                                           | Fatin 2015 [^10^] |
| Display (60 Hz refresh + pixel response)            | avg 12 ms (max 17 + ~4 ms)                                   | Fatin 2015 [^10^] |
| **Fixed I/O floor**                                 | **~26 ms average** (ideal rig ~3 ms)                         | Fatin 2015 [^10^] |
| Whole keyboard alone (median device)                | 15–60 ms                                                     | Luu 2017 [^8^]    |
| Application software (processing)                   | 0.9 ms (GVim) – 49.4 ms (Atom 1.1), observed spikes to 1–2 s | Fatin 2015 [^10^] |
| End-to-end keypress→screen, modern machine          | 100–200 ms (2014 MBP 100 ms; 2017 Windows box 170–200 ms)    | Luu 2017 [^9^]    |
| Engine-side dispatch + property reads + match       | nanoseconds-to-microseconds (Ch. 3; see §4.4)                | this work         |

Fatin's editor table is the money row: on identical hardware, application-layer latency spans 0.9 ms (GVim) to 49.4 ms (Atom — a Chromium runtime) [^10^]. Software routinely exceeds the _entire_ hardware budget. His other findings matter for keyboard work specifically: jitter is perceptually worse than constant delay; a compositing window manager imposes a mandatory ≥16.7 ms frame quantization [^10^]; and humans perceive latencies down to ~2 ms, so the "100 ms feels instantaneous" folk claim does not survive a terminal experiment [^9^].

#### 4.2.2 Nanoseconds vs microseconds vs milliseconds

Against a 15–60 ms keyboard floor [^8^] and a ~26 ms I/O floor [^10^], a JS `keydown` handler running 5–10 ms is a significant fraction of the achievable software budget, and a >50 ms long task can dominate the whole pipeline. Dispatch itself is single-digit microseconds per event in the engine (≈4 µs for a fresh keydown at depth 1, ≈1.3 µs with a reused event object — Chapter 3). The optimization frontier is therefore not registration API choice, not capture-vs-bubble, not `key` vs `keyCode` — it is **handler-body duration and main-thread scheduling**.

### 4.3 Passive interventions and INP

#### 4.3.1 The scroll interventions — and why keyboard was never in scope

The `{passive: true}` mechanism exists because of Chrome-for-Android telemetry: 80% of scroll-blocking touch listeners never call `preventDefault()`, 10% add >100 ms to scroll start, and 1% of scrolls suffer ≥500 ms delay [^14^]. That motivated passive listeners (Chrome 51, 2016), then default-passive document-level `touchstart`/`touchmove` (Chrome 56, 2017 [^15^]) and `wheel` (Chrome 73, 2019 — where >98.5% of document-level wheel listeners never cancel [^16^]). Akulov's per-event analysis (Chrome 62 Canary, Firefox 55, 2017) tested whether `passive` changes dispatch behavior per type: wheel/touch yes in Chrome; **keydown — no benefit in either browser** [^19^]. Keyboard events are always main-thread, always cancelable; there is no passive fast path. For library authors: `{passive: true}` on `keydown` is a performance no-op [^19^].

#### 4.3.2 INP: where handler cost becomes a ranking signal

INP (a Core Web Vital since March 2024) charges input delay + **processing (handler execution)** + presentation for clicks, taps, and key presses; a keystroke groups `keydown`/`keypress`/`keyup` and the **longest** event sets the latency [^20^][^21^]. Thresholds at p75: good ≤200 ms, poor >500 ms [^20^]. A single slow `keydown` handler can therefore push a page out of "good" on its own. The field data supports the mechanism: Chrome trace analysis of Android interactions >200 ms found 18.76% blocked behind a JS-heavy (>100 ms) long task, ~10% with >100 ms of JS on the input path, 8% with a single handler >100 ms [^24^]. SpeedCurve RUM showed the same tail structure for FID — median 3 ms, p95 30 ms [^25^] — and after the FID→INP switch only ~65% of sites score "good" versus 93%+ under FID, precisely because handler processing is now billed [^26^]. The remedies are scheduling, not listener plumbing: `scheduler.yield()` (Chrome 129+, 2024) posts continuations as prioritized tasks so input and paint interleave [^28^]; Perf Planet measured chunked work at ~1 s via `scheduler.yield()` vs >2 minutes via `setTimeout(0)` (4 ms clamping), recommending ~50 ms batches and warning that `await` inside `forEach` does not yield between iterations [^29^].

### 4.4 Reconciling our Chromium-150 numbers with the literature

Chapter 3 measured, on Chromium 150: full synthetic keydown dispatch ~4.0 µs at DOM depth 1, rising to ~32 µs at depth 500; `key`/`code`/`keyCode` reads within 1–6% of each other; bitmask shortcut matching at 16.5M ops/s (~60 ns). Reconciled against §4.2's floors:

- Dispatch at realistic depth: ~4 µs is **~10⁻⁴ of a 30 ms keyboard trip** — four orders of magnitude down. Even the pathological depth-500 case (32 µs) is three orders below the ~26 ms I/O floor [^10^].
- Property reads and matching (~60 ns) sit five orders of magnitude below the floor — below timer resolution, below relevance, consistent with the literature's documented gap (§7 of the evidence record: any match-strategy difference is "undetectable against the latency budget" [^34^]).
- The jQuery 2.5× dispatch overhead [^2^], even multiplied through, lands in microseconds — real, but dwarfed the moment any handler body runs single-digit milliseconds, which Fatin's 49.4 ms Atom figure shows is the norm for Chromium-based apps [^10^].

The literature and our measurements agree quantitatively: engine-side event machinery is nanoseconds-to-microseconds; hardware and display are tens of milliseconds; the actionable budget is handler-body duration and main-thread scheduling — exactly the territory INP meters [^20^][^24^].
