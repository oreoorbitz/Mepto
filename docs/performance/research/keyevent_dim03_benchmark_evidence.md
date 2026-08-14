# Dimension 03 — Published Benchmark & Latency Evidence

### Event listener performance, deep focus on keyboard key detection

All sources accessed 2026-08-12. Every measurement is annotated with browser/platform/year where the source states it.

---

## 1. Micro-benchmarks of listener registration & dispatch (measurethat.net / jsperf / jsben.ch)

Published, reproducible suites with concrete numbers are surprisingly scarce. The best-documented ones:

| Comparison                                                             | Published numbers                                                                                                                                      | Browser / year                                                | Source |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------ |
| `addEventListener('click', …)` vs `el.onclick = …` (registration cost) | onclick: 2,649.77 exec/s; addEventListener: 2,611.08 exec/s (≈1.5% slower; effectively a wash)                                                         | Unspecified browser; MeasureThat suite #32515, run ~2023–2024 | [^1^]  |
| Vanilla JS click-handler dispatch vs jQuery `.click()` dispatch        | Vanilla: 3,232,016 ops/sec; jQuery: 1,283,495 ops/sec (≈2.5× slower through jQuery's wrapper)                                                          | Chrome 121, macOS 10.15.7, run ~2024                          | [^2^]  |
| CustomEvent dispatch vs plain function callback (1,000 dispatches)     | Suite exists ("Custom Event vs Callback", MeasureThat #20888); callback wins by orders of magnitude in typical runs, but archived numbers vary per run | Various; MeasureThat #20888                                   | [^3^]  |
| `onclick` vs `addEventListener`                                        | Suite exists on jsben.ch ("onclick vs addEventListener-0ngwz"); no archived aggregate numbers                                                          | n/a                                                           | [^4^]  |

**Negative results (documented gaps):**

- No maintained jsperf suite (jsperf.com is defunct/read-only) and no measurethat.net suite found with published numbers for: **capture vs bubble phase cost**, **delegation vs N direct listeners**, **passive:true vs passive:false dispatch cost**, or **`event.key` vs `event.keyCode` vs `event.which` read cost**. A jsben.ch suite titled "key access speed" exists but compares Map/object key lookup, not KeyboardEvent properties [^5^].
- jasonformat's delegation-vs-direct analysis (2020) explicitly states the trade-off "is hard to measure": delegation defers registration cost into per-event cost (`e.target.closest(...)` per event), while direct binding costs more at registration when bookkeeping (MutationObserver, per-node attach) is needed. Preact's approach — one proxy listener per event type with a handler-reference swap — avoids `addEventListener`/`removeEventListener` churn entirely [^6^].
- GreatFrontEnd's delegation guide (2021) asserts: on modern browsers attaching 100 vs 10,000 click listeners is "sub-millisecond" — listener _count_ is rarely a CPU bottleneck; the measurable win is **memory** (10,000 retained closures vs 1) [^7^]. No numbers cited; treat as practitioner claim, not a benchmark.

---

## 2. Keyboard input latency studies (the end-to-end budget)

### 2.1 Hardware + end-to-end measurements (Dan Luu, 2017)

Dan Luu's keyboard-latency study measured key-start-to-USB-packet latency for 20+ keyboards with a logic analyzer [^8^]:

| Keyboard                                                                         | Latency (ms, start-of-keypress → USB packet) |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| Apple Magic (USB FS)                                                             | 15                                           |
| HHKB Lite 2 / MS Natural 4000                                                    | 20                                           |
| Das 3                                                                            | 25                                           |
| Logitech K120 / Unicomp Model M / Pok3r / Filco / Dell OEM / Kinesis Freestyle 2 | 30                                           |
| Razer Ornata Chroma (gaming)                                                     | 35                                           |
| ErgoDox / Planck                                                                 | 40                                           |
| Kinesis Advantage                                                                | 50                                           |
| Logitech K360 (wireless)                                                         | 60                                           |

- Spread between fastest and slowest: **~45 ms**. Gaming keyboards were **not** faster than non-gaming ones [^8^].
- The _median_ keyboard alone had more latency than the **entire** keypress-to-photon pipeline of an Apple IIe (30 ms, 1983) [^8^][^9^].
- Luu's companion "Computer latency: 1977–2017" measured end-to-end keypress→screen: Apple IIe **30 ms**; Commodore PET 4016 **60 ms** (1977); MacBook Pro 2014 **100 ms**; Lenovo X1 Carbon Win **150 ms**; a 2017 4.2 GHz Windows box **170–200 ms** — "slower than a packet around the world (~190 ms)" [^9^].
- Human perception floor: for simple tasks, people perceive latencies **down to ~2 ms**; the often-cited Nielsen "100 ms feels instantaneous" claim is rebutted with terminal experiments (`sleep 0.1` vs `sleep 0` is plainly perceptible) [^9^].

### 2.2 Budget decomposition (Pavel Fatin, "Typing with pleasure", 2015)

Fatin's Typometer-based study decomposes typing latency into input / processing / output [^10^]:

**Typical keyboard (USB) budget:**

| Source            | Min      | Max       | Average   |
| ----------------- | -------- | --------- | --------- |
| Matrix scan       | 0 ms     | 1 ms      | 0.5 ms    |
| Debouncing        | 7 ms     | 12 ms     | 8.5 ms    |
| USB poll (125 Hz) | 0 ms     | 8 ms      | 4 ms      |
| USB transmission  | 1 ms     | 1 ms      | 1 ms      |
| **Total input**   | **8 ms** | **22 ms** | **14 ms** |

**Typical LCD monitor (60 Hz) budget:** screen refresh avg 8 ms (max 17 ms) + pixel response ~4 ms ≈ **12 ms average output**.

**Combined fixed I/O floor: ~26 ms average** before any application code runs. An "ideal" rig (low-latency keyboard + gaming monitor) gets to ~3 ms [^10^].

**Application (processing) latency — Windows 7, i5-3427U, classic theme, empty text file:**

| Editor                            | Min  | Max  | Average     | SD (jitter) |
| --------------------------------- | ---- | ---- | ----------- | ----------- |
| GVim                              | 0.2  | 1.2  | **0.9 ms**  | 0.2         |
| IntelliJ IDEA (zero-latency mode) | 0.1  | 21.2 | 2.9 ms      | 2.7         |
| Notepad++                         | 0.1  | 5.9  | 4.3 ms      | 0.8         |
| Emacs                             | 4.2  | 19.2 | 5.3 ms      | 1.1         |
| Sublime Text 3083                 | 6.2  | 35.2 | 8.2 ms      | 2.0         |
| Eclipse 4.5.1                     | 0.1  | 20.8 | 10.1 ms     | 1.6         |
| NetBeans 8.1                      | 7.3  | 31.6 | 11.8 ms     | 3.9         |
| IntelliJ IDEA 15 (default)        | 0.1  | 83.7 | 24.7 ms     | 12.0        |
| Atom 1.1 (Chromium runtime)       | 29.2 | 85.5 | **49.4 ms** | 7.2         |

Key points from Fatin: the **editor is the weakest link** and its delay is unbounded (observed 1–2 s lags); jitter (variance) is perceptually worse than constant delay because it defeats the motor system's internal model; a compositing window manager (Windows Aero) added a mandatory ≥16.7 ms frame + discretization vs ~0–2 ms on Classic; humans are affected by feedback delays **below conscious perception** because typing is a closed-loop motor skill [^10^].

### 2.3 Corroborating measurements

- Dan Luu, terminal latency (2017): median keypress→internal-screen-capture 5–6 ms (Terminal.app, emacs-eshell) up to 31–44 ms (alacritty, iterm2, hyper); 99.9th-percentile up to **111 ms** under load. Some terminals' keypress→GPU-memory trip exceeded a Boston–Seattle round trip (~70 ms) [^11^].
- Tristan Hume (2017): fixed his custom keyboard firmware main loop from 30 ms → **0.7 ms**; measured end-to-end typing latency in Sublime Text/Xcode ≈ **42 ms** (so the _old firmware was ~half of total latency_); MacBook built-in keyboard ≈ **67 ms** end-to-end [^12^].
- CHI 2019 paper "On the Latency of USB-Connected Input Devices" (Wimmer et al.) independently instrumented the USB pipeline, citing Luu [^13^].

### 2.4 Where JS handlers fit in the budget

End-to-end keyboard→screen budget on a modern machine is typically **50–200 ms** [^9^]; fixed hardware (keyboard ~14 ms avg + display ~12 ms avg) is ~26 ms [^10^]. Everything between — OS queue, browser input pipeline, **JS event handlers**, style/layout/paint — is software. Fatin's data shows application-layer software latency spans **0.9 ms (GVim) to 49.4 ms (Atom) and beyond**, i.e., software routinely exceeds the entire hardware budget. A JS `keydown` handler running even 5–10 ms is a _significant fraction_ of the achievable software budget; a handler causing a >50 ms long task can dominate the whole pipeline. Browser event dispatch itself (allocation + propagation + handler call) is in the tens-to-hundreds of nanoseconds per dispatch (see §6 sandbox notes), so **dispatch overhead is negligible; handler body duration and scheduling (input delay) are what matter**.

---

## 3. Passive listeners & the Chrome scroll interventions (keyboard events NOT included)

### 3.1 The original measurements (WICG explainer, Chrome for Android, 2015–2016)

> "In Chrome for Android, **80% of the touch events that block scrolling never actually prevent it. 10% of these events add more than 100 ms of delay** to the start of scrolling, and a **catastrophic delay of at least 500 ms occurs in 1% of scrolls**." [^14^]

This Chrome telemetry motivated `{passive: true}` (shipped **Chrome 51 / Firefox 49, 2016**) — promising not to call `preventDefault()` lets the compositor scroll without waiting for the JS handler. Even an _empty_ `touchstart` handler on `document` measurably degrades scroll performance because the browser must wait for it [^14^].

### 3.2 The default-passive interventions

| Intervention                                               | Version                                                 | Scope                             | Supporting stats                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document-level `touchstart`/`touchmove` default to passive | Chrome 54 behind flag; **Chrome 56 (Jan 2017)** default | listeners on window/document/body | 80%/10%/1% scroll-blocking stats above [^15^]                                                                                                                            |
| Document-level `wheel`/`mousewheel` default to passive     | **Chrome 73 (Mar 2019)**                                | listeners on window/document/body | Wheel = >90% of scrolling on Windows, >96% on Mac; **75%** of doc-level wheel listeners don't specify `passive`; **>98.5%** of them never call `preventDefault()` [^16^] |

DevTools surfaces "[Violation] Added non-passive event listener to a scroll-blocking … event" and warns about scroll-blocking listeners [^17^]. Lighthouse's `uses-passive-event-listeners` audit flagged offenders (audit removed in Lighthouse 13 as obsolete [^18^]).

### 3.3 Keyboard events were never part of this

Ivan Akulov's practical per-event analysis (**Chrome 62 Canary, Firefox 55 Developer Edition, 2017**) tested whether `{passive: true}` changes dispatch behavior per event type: wheel/touchstart/touchmove = yes (Chrome); **keydown = no benefit in either browser**; mousemove/resize/scroll = no [^19^]. The intervention class only targets events that can cancel compositor-driven scrolling; keyboard events are always dispatched to the main thread and remain cancelable — there is no "passive keydown" fast path. **Implication for library authors: adding `{passive: true}` to keyboard listeners is a no-op performance-wise.**

---

## 4. INP / Core Web Vitals — event handlers as interaction latency

### 4.1 What INP measures (web.dev, metric live as Core Web Vital March 12, 2024)

- INP = input delay + **processing time (event handler execution)** + presentation delay, measured for **clicks, taps, and key presses** (hover and scroll excluded; keyboard scrolling involves a keystroke that _is_ measured) [^20^].
- A keystroke interaction groups `keydown`, `keypress`, `keyup`; the **longest-duration event** in the interaction sets its latency [^20^].
- Thresholds (75th percentile, field data): **Good ≤ 200 ms; Needs Improvement 200–500 ms; Poor > 500 ms**; reported value ≈ 98th-percentile interaction [^20^][^21^].
- Practitioner's per-phase budget guidance (secondary, non-Google source): input delay < 50 ms, processing < 100 ms, presentation < 50 ms [^22^].
- One third-party breakdown claims processing ≈ 40%, presentation ≈ 42%, input delay ≈ 18% of total INP time — **unofficial, treat with caution** [^23^].

### 4.2 Field/RUM evidence that handlers and long tasks dominate

- **Chrome trace analysis of Android slow interactions (>200 ms)**, cited in the `scheduler.yield()` explainer: **18.76% had a JS-heavy (>100 ms) long task blocking input** (queuing time >100 ms); **~10% of slow interactions had inputs with >100 ms of JavaScript**; **8% had at least one JS handler >100 ms** [^24^]. This is the strongest published quantification of handler duration's contribution.
- SpeedCurve RUM (2018, WebPageTest property): median **FID 3 ms**, but **p95 = 30 ms** — the tail, not the median, is where main-thread contention shows [^25^]. (FID threshold: good ≤100 ms.)
- HTTP Archive data (2025, via secondary source): after the FID→INP switch, only **~65% of websites** achieve a good responsiveness score vs **93%+ under FID** — because INP now charges handler processing + presentation, not just first-input delay [^26^].
- `isInputPending()` origin (Facebook, 2019): Facebook contributed the API specifically so long JS jobs can yield when input (incl. `keydown`/`keyup`) is pending, eliminating the load-fast-vs-respond-fast trade-off [^27^].

### 4.3 Yield strategies after/inside handlers

- `scheduler.yield()` (Chrome 129+, 2024) posts the continuation as a _prioritized_ new task so the browser can run pending input and paint between chunks; recommended pattern is to do user-visible work, `await scheduler.yield()`, then non-visible work (analytics etc.) [^28^][^29^].
- Perf Planet 2024 measured the fallback gap: chunking a loop with `setTimeout(0)` took **>2 minutes** where `scheduler.yield()` took **~1 s** (nested-timeout 4 ms clamping), and recommends time-based batching (~50 ms batches) rather than per-iteration yields [^29^].
- Caveat documented: `await` inside `forEach`/`map`/`reduce` does **not** yield between iterations — a common bug; use `for…of` [^29^].

---

## 5. Guidance from authorities on event-handler cost

- web.dev / Chrome DevRel guidance consistently frames: keep handlers lean, defer non-visual work out of handlers (requestIdleCallback/setTimeout/yield), avoid forced synchronous layouts inside handlers, break >50 ms long tasks [^28^][^22^].
- WICG explainer's caveat that still applies: passive listeners "do nothing to address underlying issues — if your site has logic that runs for >100 ms at a time, it will still feel sluggish in response to taps/clicks" (RAIL 100 ms response budget) [^14^].
- The keyboard-specific exposure: since INP counts key presses and a keystroke's latency is the **max** of keydown/keypress/keyup durations, a slow keydown handler alone can push a page over the 200 ms "good" threshold [^20^].

---

## 6. Benchmark methodology pitfalls specific to events (catalog)

1. **Synthetic `dispatchEvent()` ≠ trusted input.** MDN: `dispatchEvent()` invokes handlers **synchronously** on a nested call stack; native events are queued on the event loop by the browser. So a microbenchmark loop over `dispatchEvent` measures _only_ dispatch+handler, excludes input pipeline, IPC, and scheduling, and its timing is not contaminated by other tasks the way real input is [^30^]. (Nuance: MDN's phrasing "invoke event handlers asynchronously via the event loop" is disputed — only the _dispatch_ is queued; handler invocation itself is still synchronous — MDN content issue #43519 [^31^].) Synthetic `KeyboardEvent` also never exercises the compositor/input-latency tracing paths.
2. **Handler-only vs dispatch-inclusive measurement.** A benchmark that times `el.dispatchEvent(new KeyboardEvent(...))` includes event-object allocation, path computation, and capture/bubble traversal; one that calls the handler function directly measures none of it. Published suite #32515 (§1) measures **registration** cost, not dispatch — a category error when cited for dispatch claims [^1^].
3. **Event object allocation effects.** Creating a fresh `new KeyboardEvent`/`CustomEvent` per iteration costs more than the dispatch itself in tight loops; reusing an event object changes GC pressure and numbers. MeasureThat #20888's custom-event case bundles allocation + dispatch + handler [^3^].
4. **JIT warmup of handlers.** Benchmark harnesses (jsben.ch runs each block for a fixed wall-clock window [^32^]) amortize JIT tier-up; real keydown handlers fire at human typing cadence (~150 ms between presses in Fatin's setup [^10^]) and may run in lower JIT tiers or hit deopt (e.g., when event shapes vary). Micro-benchmark results systematically overstate steady-state handler speed.
5. **`performance.now()` granularity.** Post-Spectre, browsers reduce timer resolution (Firefox ≥59 rounds to **2 ms**; Chrome ~100 µs with jitter unless cross-origin isolated). Sub-microsecond handler timing from a _single_ dispatch is meaningless; aggregate over many iterations [^33^].
6. **rAF-aligned input timing contamination.** Browsers align input dispatch and rendering to the frame clock; measurements that include "time until paint" quantize to 16.7 ms at 60 Hz (Fatin's Aero data shows exact 16.68 ms discretization [^10^]). Benchmarks measuring end-to-end input→paint must control refresh rate, V-Sync, and compositing — or they'll measure the frame clock, not the code.
7. **Listener-count benchmarks measure the wrong thing.** Attaching 10k listeners is sub-millisecond [^7^]; the real costs are memory (closures) and per-event propagation depth — a benchmark of "attach cost" doesn't capture dispatch scaling along a deep DOM path.

---

## 7. Shortcut-matching strategy benchmarks — confirmed gap

No published benchmark was found comparing shortcut-matching implementations (string key building `"ctrl+shift+k"` vs `keyCode` tables vs modifier-bitmask integer comparison). The closest literature:

- Mousetrap vs react-hotkeys comparisons discuss **features** (sequence support, auto-repeat, event types) only — zero performance data [^34^].
- Framework/library discussions (jasonformat, GreatFrontEnd) cover delegation vs direct binding but not match-strategy cost [^6^][^7^].

**Expected magnitude (inference, not published):** a `keydown` handler fires at most ~every 40–150 ms of human typing; even a naive string-concat match is ~100 ns — five orders of magnitude under the ~26 ms hardware floor (§2.2). Any measured difference between matching strategies will be **undetectable against the latency budget**; what matters is that the handler doesn't trigger layout, long tasks, or large framework re-renders. This gap is worth one sandbox verification, not a research program.

---

## 8. What our sandbox must verify

1. **Dispatch cost baseline:** `dispatchEvent(new KeyboardEvent('keydown', …))` per-dispatch cost in Chrome/Firefox/Safari current versions — pre-created event vs fresh allocation per dispatch; flat target vs deep DOM (capture+bubble over N ancestors).
2. **Registration cost at scale:** `addEventListener` vs `onclick` property assignment, 1 vs 10,000 listeners; memory delta per listener (closure retention).
3. **Delegation crossover:** 1 delegated listener + `closest()` per event vs N direct listeners, at N = 10/100/1,000/10,000, measuring _dispatch-time_ cost (not just attach cost) and memory.
4. **Property read cost:** `event.key` (string getter) vs `event.code` vs deprecated `event.keyCode`/`event.which` reads in a hot loop — expected sub-ns differences; verify rather than assume, since `key` involves string interning.
5. **Capture vs bubble:** same handler, `{capture:true}` vs bubble on a deep tree; measure whether phase choice changes per-dispatch cost (expected: no, only ordering).
6. **Passive flag on keydown:** confirm `{passive:true}` on `keydown` is a dispatch no-op (per Akulov 2017 [^19^]) in current Chrome/Firefox/Safari.
7. **Trusted vs synthetic latency delta:** real keypress (CDP `Input.dispatchKeyEvent` or hardware) keydown timestamp → handler execution vs synthetic dispatch — quantify the input-pipeline share that microbenchmarks miss.
8. **INP-style measurement:** keydown handler durations of 0/5/20/50/100 ms and the resulting interaction latency to next paint at 60 Hz and 120 Hz, verifying the keystroke = max(keydown,keypress,keyup) aggregation [^20^].
9. **Matching strategies:** string-built shortcut vs bitmask comparison at realistic key rates — confirm both are noise (<0.1% of budget) and document the measured numbers.
10. **Methodology controls:** warm-up iterations ≥ JIT tier-up, report median + p95 (not mean), verify `performance.now()` resolution per browser, avoid fresh-event allocation in the timed region unless that _is_ the variable, and pin refresh rate when measuring to-paint.

---

## Sources (all accessed 2026-08-12)

[^1^]: MeasureThat.net — "AddEventListener vs direct", suite 32515. https://www.measurethat.net/Benchmarks/Show/32515/1/addeventlistener-vs-direct

[^2^]: MeasureThat.net (benchmarklab mirror) — "Vanilla JS VS Jquery | Click Event Speed", run result 509037 (Chrome 121, macOS). https://benchmarklab.azurewebsites.net/Benchmarks/ShowResult/509037

[^3^]: BenchmarkLab (MeasureThat mirror) — "Custom Event vs Callback", suite 20888. https://benchmarklab.azurewebsites.net/Benchmarks/Show/20888/0/custom-event-vs-callback-with-console-log

[^4^]: jsben.ch — "onclick vs addEventListener". https://jsben.ch/onclick-vs-addeventlistener-0ngwz

[^5^]: jsben.ch — "Key access speed" (Map/object lookup, not KeyboardEvent). https://jsben.ch/key-access-speed-pn39c

[^6^]: Jason Miller — "Event Listeners: Delegation VS Direct Binding" (2020). https://jasonformat.com/event-delegation-vs-direct-binding/

[^7^]: GreatFrontEnd — "Explain event delegation in JavaScript" (2021). https://www.greatfrontend.com/questions/quiz/explain-event-delegation

[^8^]: Dan Luu — "Keyboard latency" (2017, updated 2022). https://danluu.com/keyboard-latency/

[^9^]: Dan Luu — "Computer latency: 1977–2017" (2017). https://danluu.com/input-lag/

[^10^]: Pavel Fatin — "Typing with pleasure" (2015). https://pavelfatin.com/typing-with-pleasure/

[^11^]: Dan Luu — "Terminal latency" (2017). https://danluu.com/term-latency/

[^12^]: Tristan Hume — "Fixing My Keyboard's Latency" (2017). https://thume.ca/2017/12/29/fixing-my-keyboards-latency/

[^13^]: Wimmer et al. — "On the Latency of USB-Connected Input Devices", CHI 2019. https://dl.acm.org/doi/10.1145/3290605.3300650

[^14^]: WICG — EventListenerOptions explainer (passive listeners; Chrome for Android scroll-blocking stats). https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md

[^15^]: Google Developers — "Making touch scrolling fast by default" / scrolling intervention (Chrome 56, Jan 2017). https://developers.google.com/web/updates/2017/01/scrolling-intervention (archived; content quoted via ChromeStatus feature 5093566007214080 and community mirrors)

[^16^]: WICG interventions issue #64 — "Default to passive:true on document level wheel/mousewheel event listeners" (Chrome 73; usage stats). https://github.com/WICG/interventions/issues/64

[^17^]: Babylon.js forum — DevTools "[Violation] Added non-passive event listener to a scroll-blocking 'wheel' event" (Chrome 87, 2021). https://forum.babylonjs.com/t/chrome-warning-about-non-passive-event-listener-for-wheel-event/17373

[^18^]: WP Rocket docs — passive-listeners audit removed in Lighthouse 13. https://docs.wp-rocket.me/article/1400-does-not-use-passive-listeners-to-improve-scrolling-performance

[^19^]: Ivan Akulov — "Analysis of passive: true" (Chrome 62 Canary, Firefox 55, 2017). https://gist.github.com/iamakulov/45803e89db2eb44a7a6be33a80ffcab7

[^20^]: web.dev — "Interaction to Next Paint (INP)" (source in GoogleChrome/web.dev repo). https://github.com/GoogleChrome/web.dev/blob/main/src/site/content/en/metrics/inp/index.md and https://web.dev/articles/inp

[^21^]: This Dot — "New Core Web Vitals and How They Work" (2024; keystroke = keydown/keypress/keyup, max duration). https://www.thisdot.co/blog/new-core-web-vitals-and-how-they-work

[^22^]: Addy Osmani web-quality-skills — Core Web Vitals per-phase INP budgets (secondary). https://mintlify.com/addyosmani/web-quality-skills/reference/core-web-vitals-metrics

[^23^]: corewebvitals.io — "INP Processing Time" (unofficial phase-share estimates). https://www.corewebvitals.io/core-web-vitals/interaction-to-next-paint/processing-time

[^24^]: WICG scheduling-apis — "yield-and-continuation" explainer (Chrome Android trace analysis of slow interactions). https://github.com/WICG/scheduling-apis/blob/main/explainers/yield-and-continuation.md

[^25^]: SpeedCurve — "First Input Delay" RUM data (2018; median 3 ms, p95 30 ms). https://www.speedcurve.com/blog/first-input-delay/

[^26^]: pagespeed-optimierung.de — "Core Web Vitals 2026" citing HTTP Archive 2025 (65% good INP vs 93% FID; secondary). https://www.pagespeed-optimierung.de/en/blog/core-web-vitals-2026/

[^27^]: Facebook Engineering — "isInputPending: Facebook's first browser API contribution" (2019). https://engineering.fb.com/2019/04/22/developer-tools/isinputpending-api/

[^28^]: DebugBear — "Getting Started With scheduler.yield" (Chrome 129+ support noted). https://www.debugbear.com/blog/scheduler-yield

[^29^]: Perf Planet Calendar 2024 — "Breaking Up with Long Tasks…" (scheduler.yield ~1 s vs setTimeout >2 min). https://calendar.perfplanet.com/2024/breaking-up-with-long-tasks-or-how-i-learned-to-group-loops-and-wield-the-yield/

[^30^]: MDN — "EventTarget.dispatchEvent()" (synchronous dispatch note). https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent

[^31^]: MDN content issue #43519 — misleading async-phrasing in dispatchEvent page. https://github.com/mdn/content/issues/43519

[^32^]: Stack Overflow — "How to read jsben.ch benchmark result" (harness internals: fixed-time window, performance.now loop). https://stackoverflow.com/questions/69189911/how-to-read-jsben-ch-benchmark-result

[^33^]: Stack Overflow — "How to get microsecond timings in JavaScript since Spectre and Meltdown" (quotes MDN; Firefox 59 rounds to 2 ms). https://stackoverflow.com/questions/50117537/how-to-get-microsecond-timings-in-javascript-since-spectre-and-meltdown

[^34^]: Subwaymatch (Medium) — "Comparing keyboard shortcut libraries in React — Mousetrap vs Hotkeys" (2019; features only). https://subwaymatch.medium.com/comparing-keyboard-shortcut-libraries-in-react-mousetrap-vs-hotkeys-634877b4af9e
