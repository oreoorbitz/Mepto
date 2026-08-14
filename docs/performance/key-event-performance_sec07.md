## 7. Appendix: Methodology, Sandbox, Caveats

All numbers in Chapters 3–4 come from a single sandbox: headless **Chrome/150.0.7871.181** (real Blink + V8), driven by Node v20.20.2 via puppeteer-core, in a Linux container. The full harness ships with this chapter; everything below is reproducible from the file inventory in §7.4.

### 7.1 Two measurement layers

The sandbox measures two deliberately separated layers. Conflating them is the most common category error in published event benchmarks [^30^][^32^].

**Layer A — synthetic `dispatchEvent()` (in-page).** Each case loop dispatches a constructed `KeyboardEvent` on the Blink main thread:

```js
// fixtures: KINIT = {key:'k', code:'KeyK', keyCode:75, which:75, bubbles:true, cancelable:true}
t.leaf.addEventListener('keydown', H);
fn(){ t.leaf.dispatchEvent(kev()); }   // timed op: construct + EventPath + invoke
```

`dispatchEvent` invokes handlers **synchronously** on a nested call stack; real input is queued on the event loop by the browser [^30^]. So Layer A measures pure in-page cost — event construction, EventPath computation, capture/bubble traversal, listener invocation — with no IPC, no input pipeline, no compositor, and no task-scheduling contamination [^30^][^31^]. What it _can_ prove: relative costs of path depth, listener count/placement, phases, registration, property reads, matching strategies. What it _cannot_ prove: anything about real keypress latency, default actions, or the input pipeline. Synthetic keydown quirks matter here: `isTrusted === false`, `keyCode`/`which` are **0 unless explicitly set** in the init dict (we set them), and no default actions fire — synthetic `beforeinput`/`input` on a detached, non-editable target triggers no editing behavior.

**Layer B — trusted input (`page.keyboard.press` → CDP `Input.dispatchKeyEvent`).** The Node driver sends 200 keydown→keyup presses of `'k'` into a focused `<input>`, wall-clock timed driver-side; a second pass (50 presses) sets an in-page `performance.now()` marker immediately before each dispatch and the capture-phase keydown handler computes the delta. Trusted events traverse Chromium's real input pipeline and are scheduled through the input event queue, so per-press times are task/frame-quantized and far noisier than Layer A [^30^]. Measured throughput — **234–252 presses/s** — is **driver/pipeline-bound** (CDP round-trip Node→Chromium plus pipeline scheduling), **not engine-bound**: it cannot saturate the JS dispatch path, which Layer A shows runs at ~250k ops/s. The 1.3–1.4 ms avg latency figures include CDP marker round-trip overhead; treat them as upper bounds on true input-to-handler latency. Layer B exists to verify behavioral facts (keydown→beforeinput→input ordering; `preventDefault()` on keydown fully suppresses both and raises throughput to 635 presses/s by skipping character insertion), not to benchmark handler speed.

### 7.2 Harness mechanics and fixtures

Timing follows the fixed-window style of jsben.ch-class harnesses [^32^], with explicit calibration. Per case: ~200 ms warmup to tier the JIT past baseline, then 5 measured reps of ≥300 ms each; batch size doubles until a batch takes ≥2 ms (keeping timer overhead and `performance.now()` granularity — reduced post-Spectre [^33^] — negligible against batch duration):

```js
function measureOnce(fn, ms) {
  let batch = 1
  for (;;) {
    const t0 = now()
    for (let i = 0; i < batch; i++) fn(i)
    if (now() - t0 >= 2 || batch >= 1 << 26) break
    batch *= 2
  }
  let ops = 0
  const tStart = now()
  do {
    for (let i = 0; i < batch; i++) fn(i)
    ops += batch
  } while (now() - tStart < ms)
  return ops / ((now() - tStart) / 1000)
}
```

Anti-bias controls, all in `bench.html::runSuites`: **alternating case order** across reps (rep 0 forward, rep 1 reversed, …) to cancel ordering/drift effects; **`gc()` between suites** via `--js-flags=--expose-gc`; **`setTimeout(0)` yields** between suites and reps so the event loop breathes; and a **DCE sink guard** — every handler accumulates into `window.__sink` (`const H = () => { sink(1); }`), and the driver verifies the final sink is nonzero, so no handler body can be dead-code-eliminated. Reported values are medians of pooled reps, never means of single runs.

Launch configuration (driver, `run.js`):

```js
puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
})
```

Fixtures: **detached** depth trees of 1/10/50/500 nested `<div>`s (detached so path length == tree depth exactly; attached trees add 2–3 constant body/html/document entries — scaling is identical, confirmed by the attached flat-tree cases); an **attached container of 1000 `<button data-k>`**; an **attached 2000-node flat sibling tree**; and a focused `<input>` for Layer B. The linear-scan matching case places the hit **last** of 50 bindings (worst case; average ≈2× faster).

### 7.3 Stability and honesty flags

Two full runs were executed; per-case medians agreed **within ±10% for 61 of 63 cases**. The 2 outliers were rerun once and pooled (15 reps instead of 10). One case — `capture-vs-bubble :: bubble@leaf` — showed a genuinely **bimodal distribution** (~26k vs ~32k ops/s across runs), a JIT/GC tier shift; it is reported at its pooled median (30.9k) and flagged, not smoothed away. The Map-of-Maps trie case had one deopt rep (CV 18.6%). Bimodality of this kind is inherent to micro-benchmarking tiered JITs: tight loops amortize tier-up that real ~150 ms-cadence keypress handlers never get [^10^][^32^], so Layer A numbers describe steady-state dispatch, not cold-press reality. All **absolute numbers are machine-specific to this container**; single engine (Blink/V8), headless only. The portable results are the _ratios_.

### 7.4 Reproduce and extend

| File                           | Role                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `key-bench/bench.html`         | In-page harness (`runSuites`, `measureOnce`, `stats`), all 14 suites, fixtures, Layer B counters |
| `key-bench/run.js`             | puppeteer-core driver: launch, 2 full runs, outlier rerun, Layer B loop, writes all JSON         |
| `key-bench/gen_report.js`      | Renders `RESULTS.md` tables from `results.json`                                                  |
| `key-bench/results_run1.json`  | Raw run 1 (per-rep samples retained)                                                             |
| `key-bench/results_run2.json`  | Raw run 2                                                                                        |
| `key-bench/results_rerun.json` | Rerun reps for the 2 outlier cases                                                               |
| `key-bench/results.json`       | Merged medians/CV/agreement flags + Layer B data                                                 |
| `key-bench/RESULTS.md`         | Rendered tables, findings, caveats                                                               |

Rerun end-to-end:

```sh
cd key-bench && npm i puppeteer-core && node run.js && node gen_report.js
```

To extend: add a `suite(name, cases)` block to `bench.html`; each case is `{name, fn, setup?, before?, cleanup?}` where `fn` is the timed op. Keep handler results flowing into `sink()`, keep fixtures detached unless attachment is the variable, and let the outlier-rerun logic in `run.js` arbitrate disagreement. To port to another engine, point `executablePath` at its binary; expect absolutes to move and ratios to hold.
