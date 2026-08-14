## 7. Appendix: Benchmark Methodology, Sandbox, and Caveats

All numbers in chapters 3–4 come from one self-contained sandbox (`dom-bench/`). This appendix documents it completely so any reader can rerun, audit, or extend it. Environment: Chrome/150.0.7871.181 (Blink + V8), new headless mode, Linux x86_64, Puppeteer-core driving `/usr/bin/chromium`; Node.js runner, no other dependencies. Absolute ops/s values are machine-specific — ratios are the signal.

### 7.1 Harness design

The harness runs **in-page** (no per-call CDP overhead). Each benchmark function is wrapped so its result feeds a global XOR **sink guard** against dead-code elimination — the classic pitfall that discarded microbenchmark results are optimized away entirely [^33^][^34^]:

```js
var sink = 0
function eatNode(n) {
  sink = (sink ^ (n ? n.nodeType + (n.nodeName.length << 4) : 7)) | 0
}
function eatNum(x) {
  sink = (sink ^ (x | 0)) | 0
}
```

Every timed call passes its node or count through `eatNode`/`eatNum`, forcing a live value across the JS→C++ boundary. The final `sink` value is recorded in `results.json.meta` as proof of liveness.

Timing follows a warmup/batch/median protocol:

```js
var REPS = 5,
  SAMPLE_MS = 300,
  WARMUP_MS = 200
// 1) warmup(fn, 200) for every benchmark, listed order (JIT tiering [^35^])
// 2) per sample: run fn in batches of 50 until >= 300 ms elapsed; ops/s = n / dt
function sampleOnce(fn, minMs) {
  var t0 = performance.now()
  var n = 0
  do {
    for (var i = 0; i < 50; i++) fn()
    n += 50
  } while (performance.now() - t0 < minMs)
  return n / ((performance.now() - t0) / 1000)
}
// 3) 5 reps per suite run; case order rotated per rep (idx = (k + rep*7) % N)
//    to cancel thermal/GC drift; median of samples is the reported figure.
```

Two GC disciplines: Chromium is launched with `--js-flags=--expose-gc`, and the driver calls `window.gc()` after each fixture build and after each size suite completes — never inside a timed region, since GC pauses between samples skew distributions [^36^]. Finally, **read/write isolation**: no timed loop writes to the DOM, touches geometry, or reads layout properties. Interleaving reads and writes forces synchronous layout flushes and measures the renderer, not the selector engine [^38^]; all fixtures are built and attached _before_ any timing begins.

### 7.2 Fixtures and launch configuration

Three size fixtures are generated procedurally (BFS, branching factor 4 → depth ~7–8), then attached to `document.body`: small = **261**, medium = **2,061**, large = **20,097** actual nodes (including injected targets). Composition: div/span/input mix, classes `.a/.b/.c` round-robin, ids on ~1% of nodes, `data-x="1"` + class `.dx` on 10%, plus a ~50-node `#scope-root` subtree with a deeply nested `.deep-target` and one `#target` id host at ~60% depth. A separate **500-deep nested-div chain** (detached; the match target sits 50 levels above the leaf) backs the `closest()`/traversal cases. Unit fixtures add interleaved text nodes for child/sibling cases.

Launch configuration (verbatim from `run.js`):

```js
puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
})
```

The runner waits on `window.__done === true` (timeout 900 s, 1 s polling), then serializes `window.__results` to `results.json`.

### 7.3 Stability and limitations

Two independent full-suite runs agreed within **±10%** on nearly all medians (worst ~13%); reported numbers merge both runs (10 samples per measurement). Worst observed CV is **18%** (case 15 complex selectors; also case 6 and case 2 medium), traced to occasional GC pauses inside 300 ms samples — medians nonetheless stayed stable across runs; min/max in `results.json` expose those pauses. Honest limitations: (1) **single engine** — Blink/V8 only; WebKit and Gecko may differ where caches and tree scans trade off differently. (2) Headless `--disable-gpu` on shared CI-like hardware. (3) **Fixture-specific effects** — the case-6 scoped-`querySelector` anomaly (document-level beat subtree scoping) depends on the document-level class cache locating a rare class quickly; with a common class or deeper scope the outcome can flip. (4) **jsdom numbers are not transferable** — jsdom has no engine selector caches or layout pipeline, so its ratios reflect its own pure-JS tree walk, not any real browser. (5) Case 8's `childNodes[0]` intentionally returns a text node and is not semantically equivalent.

### 7.4 How to reproduce and extend

| File                                      | Purpose                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bench.html`                              | Fixtures, harness (`warmup`/`sampleOnce`/`runAll`), all 15 case definitions; runs in-page    |
| `run.js`                                  | Puppeteer-core driver: launches headless Chromium, polls progress, writes `results.json`     |
| `results.json`                            | Merged machine-readable output (medians, min/max, per-sample arrays, meta incl. UA and sink) |
| `results_run1.json` / `results_run2.json` | Raw per-run outputs used for the ±10% cross-run stability check                              |
| `RESULTS.md`                              | Rendered tables, key findings, stability notes for the runs above                            |
| `package.json`                            | Declares `puppeteer-core`; no other dependencies                                             |

To rerun: `cd dom-bench && npm i && node run.js` (progress on stderr; ~15 cases × 5 reps × ≥300 ms/sample × 3 fixture sizes, several minutes total). Run twice, saving each `results.json`, to replicate the stability check. To extend: add variants via `addCase()` inside `addSizeCases` (size-scaled) or `addUnitCases` (size-independent), always routing results through `eatNode`/`eatNum`, keeping DOM writes out of timed functions, and adding new fixtures before — never during — timing. Record UA and date with any published numbers; engine drift invalidates old ratios [^30^][^39^].
