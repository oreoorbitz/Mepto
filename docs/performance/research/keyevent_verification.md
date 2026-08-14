# Verification Report — DOM Keyboard Event Listener & Key-Detection Performance Reference

Date: 2026-08-14 (verification). Method: every quantitative claim in sec03 recomputed from
`key-bench/results.json` (python3); sec05/sec06 measured references checked against the same
recomputation; sec02 checked claim-by-claim against `research/keyevent_dim02_engine_internals.md`;
sec04 checked against `research/keyevent_dim03_benchmark_evidence.md`. Flag threshold: >5% relative
error, plus factual/consistency errors regardless of magnitude.

## Per-chapter verdicts

| Chapter                    | Verdict             | Reason                                                                                                                                                                                                               |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sec03 (measured results)   | **FAIL**            | All 64 table cells (median/ns/CV) and the trusted-layer table match raw data exactly, but 4 narrative numbers are wrong (>5%) and two n=15 poolings are mislabeled (trie wrongly flagged; remove case flag missing). |
| sec04 (published evidence) | **FAIL**            | Every published number matches dim03 exactly, but three internal claims are unsupported by/contradictory to Ch 3 measurements ("tens-to-hundreds of ns"; "passive-on-keydown measured"; "N = 10…10,000").            |
| sec05 (decision matrix)    | **FAIL**            | Inherits sec03's two wrong numbers ("within 1.5%", "3× slower"); one 0.74 vs 0.75 µs inconsistency. All other anchors correct.                                                                                       |
| sec02 (engine internals)   | **PASS (1 caveat)** | Every claim traced to dim02 verbatim/source-accurate. Caveat: "30 repeats/second" is not in dim02 (plausible OS-typical value, uncorroborated by the brief).                                                         |
| sec06 (library playbook)   | **PASS (1 nit)**    | All measured anchors match recomputation. Nit: "0.77 µs-per-pair" conflates per-add (0.767 µs) with per-pair (0.744 µs).                                                                                             |

## Checked claims — measured numbers (sec03 vs results.json)

### Table cells (all PASS)

All 63 case rows: medians, ns/op, CV, rel-to-fastest recomputed and match to stated rounding
(two integer-ns roundings: bitmask 60.46→60, trie 68.59→69 — normal rounding). Trusted layer:
252/234/635 presses/s, 200/200/200 & 200/0/0 event counts, 1.27/1.43/0.93 ms avg, 6.6/6.0/4.1 ms
max — all match `trusted` section exactly.

### Narrative numbers

| #   | Claim (sec03 location)                                                                                            | Expected (recomputed)                                         | Found in text       | Verdict                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | leaf/root ratio depth 1 (§3.1.1)                                                                                  | 252632/252083 = 1.002                                         | 1.002               | PASS                                                                                                |
| 2   | leaf/root ratio depth 500 (§3.1.1)                                                                                | 31521/31281 = 1.008                                           | 1.006               | PASS (0.2%)                                                                                         |
| 3   | depth 1→50 cost, "root case 252.6k→142.3k" (§3.1.1)                                                               | 252632/142316 = **1.78×** (leaf case = 1.63×)                 | "1.6×"              | **FAIL (9.9%)** — ratio belongs to the leaf case, not the cited root numbers                        |
| 4   | depth 1→500 cost (§3.1.1)                                                                                         | 252632/31281 = 8.08×                                          | "~8×"               | PASS                                                                                                |
| 5   | depth-500 dispatch ≈ 32 µs (§3.1.1)                                                                               | 31.7–32.0 µs                                                  | "~32 µs"            | PASS                                                                                                |
| 6   | capture/bubble rows ns spread (§3.1.2)                                                                            | 35019−32374 = 2.65 µs                                         | "2.6 µs"            | PASS                                                                                                |
| 7   | bubble@leaf rep spread (§3.1.2)                                                                                   | 1/25205−1/34365 = **10.6 µs** (ops/s spread = 9.16k)          | "9.2 µs"            | **FAIL (13%)** — unit mix-up with the 9.16k ops/s spread                                            |
| 8   | capture@root vs bubble@root (§3.1.2)                                                                              | 28869/28556 = 1.011                                           | 1.01                | PASS                                                                                                |
| 9   | 1/10/100 same-node listeners "within 1.5%" (§3.1.2, repeated §5.1.2/§5.3 row 9)                                   | extremes 248.4k/243.0k differ by **2.2%** (±1.2% around mean) | "within 1.5%"       | **FAIL** as "of each other"; only true vs. mean                                                     |
| 10  | 10 listeners/10 ancestors vs 10-on-one-node (§3.1.2, §5.1.2, §5.3 row 11)                                         | 221719/80959 = **2.74×**                                      | "3× slower"         | **FAIL (9.5%)**                                                                                     |
| 11  | delegated 176.1k vs direct 174.0k gap (§3.2.1)                                                                    | 1.22%                                                         | "1.2%"              | PASS                                                                                                |
| 12  | target checks "within 4%" (§3.2.1, §5.2.1)                                                                        | 130.4k/125.1k = **4.2%** spread                               | "within 4%"         | borderline (5.1% rel) — MINOR                                                                       |
| 13  | single addEventListener (§3.2.2)                                                                                  | 753 ns, CV 1.7%                                               | "~0.75 µs, CV 1.7%" | PASS                                                                                                |
| 14  | 1000 registrations "almost exactly 1000×" (§3.2.2)                                                                | 766871/753 = 1018×                                            | "~1000×"            | PASS                                                                                                |
| 15  | per-control registration (§3.2.2, §5.2.1)                                                                         | 766.9 ns                                                      | "~0.77 µs"          | PASS                                                                                                |
| 16  | property reads "within 1–6% of baseline", CVs 1.5–3.6% (§3.3.1)                                                   | deltas 0.03–6.1%; CVs 1.5–3.63%                               | as stated           | PASS                                                                                                |
| 17  | getModifierState ~6% / ~260 ns (§3.3.1)                                                                           | 6.1%, 261 ns                                                  | "~6% (~260 ns)"     | PASS                                                                                                |
| 18  | e.key twice ≈ once (§3.3.1)                                                                                       | 241.2k vs 238.8k (within CV)                                  | as stated           | PASS                                                                                                |
| 19  | string match 3.1× slower (§3.3.2, §5.3 r1, §6 T6-2)                                                               | 16541800/5379821 = 3.07                                       | "3.1×"              | PASS                                                                                                |
| 20  | linear scan 7.2× slower (§3.3.2, §5.3 r3, §6)                                                                     | 16541800/2284622 = 7.24                                       | "7.2×"              | PASS                                                                                                |
| 21  | trie 0.881 of bitmask, CV 18.6%, min 6.21M (§3.3.2, §5.3 r2)                                                      | 0.881, 18.63%, 6.21M                                          | as stated           | PASS                                                                                                |
| 22  | **Table 3-7 header "trie pooled n=15"**                                                                           | results.json: trie **n=10, agreement10=true**                 | "trie pooled n=15"  | **FAIL** — no rerun/pool recorded for trie                                                          |
| 23  | guards deltas −0.3%/−0.4% vs CVs 3.3–4.4% (§3.3.3)                                                                | −0.27%/−0.41%                                                 | as stated           | PASS                                                                                                |
| 24  | listener shape: arrow −2%, onkeydown −8%, handleEvent −10% (§3.3.3, §5.3)                                         | −2.0%, −8.1%, −9.8%                                           | as stated           | PASS                                                                                                |
| 25  | preventDefault −1.5%, CV 4.1% (§3.4.1)                                                                            | −1.45%                                                        | as stated           | PASS                                                                                                |
| 26  | stopPropagation 17% faster (§3.4.1, §5.1.2, §6.4)                                                                 | 235285/201615 = 16.7%                                         | "17%"               | PASS                                                                                                |
| 27  | KeyboardEvent ~45% slower than CompositionEvent (§3.4.2)                                                          | time/op: 4056/2783 = +45.7%                                   | "~45%"              | PASS (time basis)                                                                                   |
| 28  | KeyboardEvent ~25% slower than InputEvent (§3.4.2)                                                                | 4056/3239 = +25.2%                                            | "~25%"              | PASS                                                                                                |
| 29  | construction "over half" of 4.1 µs fresh baseline (§3.4.3)                                                        | 2314/4072 = 56.8%                                             | "over half"         | PASS                                                                                                |
| 30  | reuse 3.2× speedup; min 606.2k/max 789.3k; CV 9.8% (§3.4.3, §5.3 r17)                                             | 3.16; 606.2k/789.3k; 9.75%                                    | as stated           | PASS                                                                                                |
| 31  | add+remove pair 0.74 µs (§3.5.1)                                                                                  | 744 ns                                                        | "744 ns / 0.74 µs"  | PASS                                                                                                |
| 32  | once:true +34% over dispatch baseline (§3.5.1, §5.2.2)                                                            | +34.0–34.8% (vs 245.6k/247.1k)                                | "~34%"              | PASS                                                                                                |
| 33  | abort 1.9× slower; 44.2 vs 83.8 µs; CVs 23.0/11.1%; remove spans 9.0k–24.9k (§3.5.1, §5.2.2, §5.3 r12–13, §6.1.1) | 1.898; all exact                                              | as stated           | PASS                                                                                                |
| 34  | **Table 3-13 header "n=10"**                                                                                      | remove case: **n=15, agreement10=false**                      | no flag             | **FAIL** — preamble promises outliers "flagged where they appear"; remove-case pooling is unflagged |
| 35  | trusted: 234–252 presses/s, ~1.3–1.4 ms, 635/s, preventDefault 200→0, 1.43 vs 1.27 ms (§3.5.2)                    | 233.9/252.2/634.9; 1.27/1.43 ms; counts exact                 | as stated           | PASS                                                                                                |
| 36  | "highest CV in the suite (9.2%)" (§3.1.1) vs "suite's highest CV (9.9%)" (§3.1.2)                                 | per-table both true; study-wide max is 23.0%                  | —                   | MINOR wording (defensible per-table)                                                                |

## Cross-chapter measured references (sec05/sec06 vs recomputation)

| Claim                                                                                                                                                                                                             | Recomputed                                                                          | Verdict                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| sec05 §5.1.2: 1.002 / 1.006 position ratios                                                                                                                                                                       | 1.002 / 1.008                                                                       | PASS                                                                                 |
| sec05 §5.1.2: capture/bubble within 1.01                                                                                                                                                                          | 1.011                                                                               | PASS                                                                                 |
| sec05 §5.1.2: 4.0 µs→32 µs, ~8×                                                                                                                                                                                   | 3.97→32.0 µs, 8.08×                                                                 | PASS                                                                                 |
| sec05 §5.1.2 & §5.3 r9: "within 1.5%" same-node                                                                                                                                                                   | 2.2%                                                                                | **FAIL (inherits #9)**                                                               |
| sec05 §5.1.2 & §5.3 r11: "3× slower" 10 ancestors                                                                                                                                                                 | 2.74×                                                                               | **FAIL (inherits #10)**                                                              |
| sec05 §5.2.1: 176k vs 174k (1.2%); 0.77 µs/control; 766.9 µs                                                                                                                                                      | 1.22%; 0.767; 766.9                                                                 | PASS                                                                                 |
| sec05 §5.2.1: "one `addEventListener` costs ~0.74 µs"                                                                                                                                                             | single add = **753 ns = 0.75 µs**; 0.744 µs is the add+remove _pair_                | MINOR (1.3%; wrong-figure borrowing, sec03/§5.3-r8/sec06 use 0.75 or "0.74 µs/pair") |
| sec05 §5.3: 16.5M/5.4M (3.1×), 14.6M (0.88), 2.3M (7.2×), guards <0.5%, 183k +34%, 776k vs 246k 3.2×, 1.9×, 44 vs 84 µs, e.which 1.000, 8–10% shape penalty, ~10⁻⁴ of 30 ms                                       | 3.07, 0.881, 7.24, ≤0.41%, 34%, 3.16, 1.898, 44.2/83.8, 0.9997, 8.1/9.8%, 1.33×10⁻⁴ | PASS (all)                                                                           |
| sec06: 176.1k/174.0k, 0.75 vs 766.9 µs ~1000×, 83.8 vs 44.2 µs 1.9×, T6-2 (16.5M/60 ns; 14.6M CV 18.6%; 5.4M 3.1×; 2.3M 7.2×), guards <0.5%, 635 presses/s, 17% faster, reads within 1–6%, 438 ns swamped in 4 µs | all match recomputation                                                             | PASS                                                                                 |
| sec06 §6.1.2: "0.77 µs-per-pair"                                                                                                                                                                                  | per-pair = 0.744 µs; per-add-in-batch = 0.767 µs                                    | MINOR (conflated)                                                                    |

## sec02 vs dim02 (engine internals)

PASS on all targeted claims: SkipEventCapture default-on, `HasCaptureListener()` document-global
disable, WebKit `EventListenerCounts::hasCapturing` parallel; EventPath O(depth) exactly-sized
`HeapVector<Member<Node>,64>` + one GC allocation, no cache; copy-on-fire
`EventListenerVectorSnapshot = HeapVector<...,1>` with "Do not try to optimize it away" header;
Blink eager `key_`/`code_` in constructor (crbug.com/482880 TODO) vs Gecko
`GetDOMKeyName`/`GetDOMCodeName` per access (RFP spoofing note); one JS wrapper per event per
world (`main_world_wrapper_`/`DOMWrapperMap`); AbortSignal = K individual removal scans via
AbortSignalRegistry (whatwg/dom#911/PR #919); no compositor fast path for keys (frame attribution
only, quoted snippet matches); keys never coalesced/never frame-aligned; `once` =
remove-before-invoke; dedup on (callback, capture); crbug.com/1420890 log2 crash keys past 8;
`{handleEvent}` per-invocation Get; two dispatch passes per character keystroke; UIEventTiming
per dispatch, keyboard always eligible; `timeStamp == startTime`; WebKit bug 188370.
Caveat: "30 repeats/second" (§2.1.2) has no dim02 source — typical-OS value, uncorroborated.

## sec04 vs dim03 (published numbers)

PASS on all published figures: MeasureThat #32515 2,611 vs 2,650 exec/s (aEL 1.46% slower ✓);
jQuery 3,232,016 vs 1,283,495 (2.518× ✓), Chrome 121/macOS 10.15.7; #20888 gap; jsben.ch;
GreatFrontEnd sub-millisecond/memory claim; Firefox ≥59 2 ms rounding; Luu 15/30/50/60 ms,
~45 ms spread, gaming not faster, Apple IIe 30 ms, MBP 2014 100 ms, 2017 box 170–200 ms, ~2 ms
perception; Fatin input 8–22/avg 14 ms, debounce 8.5 ms, output avg 12 ms (17+~4 max), ~26 ms
floor, ~3 ms ideal, GVim 0.9 ms, Atom 1.1 49.4 ms, 1–2 s spikes, ≥16.7 ms Aero quantization;
80%/10%/1% intervention stats, Chrome 51/56/73, >98.5% wheel; Akulov Chrome 62 Canary/Firefox 55
2017 keydown no-benefit; INP Mar 2024, keystroke = max(keydown,keypress,keyup), ≤200/>500 p75,
18.76%/~10%/8% trace stats, FID median 3/p95 30 ms, ~65% vs 93%+, scheduler.yield Chrome 129+,
~1 s vs >2 min, ~50 ms batches.

Internal-consistency FAILs:

- §4.2.2 "Dispatch itself is tens-to-hundreds of nanoseconds per event in the engine" —
  contradicts Ch 3's own measurements (reused-event dispatch = **1,289 ns**; fresh keydown
  construct+dispatch = 4,072 ns; depth-500 = 32 µs). (Inherited from dim03 §2.4, but false
  against this work's data.)
- §4.1.3 "Our sandbox … capture vs bubble, delegation crossover at N = 10…10,000, property-read
  costs, and passive-on-keydown all measured" — results.json contains **no passive case**
  (suites 1–12, 14 only) and delegation was measured at N=1000/2000-node, not "N = 10…10,000".

## REQUIRED FIXES

1. **sec03 §3.1.1**: "depth 1→50 costs 1.6× (252.6k→142.3k ops/s for the root case)" →
   "depth 1→50 costs 1.8× (252.6k→142.3k ops/s for the root case; 1.6× for the leaf case)".
2. **sec03 §3.1.2**: "a 9.2 µs spread across bubble@leaf's own reps" → "a 10.6 µs spread…"
   (or "a 9.2k ops/s spread").
3. **sec03 §3.1.2 + sec05 §5.1.2 + sec05 §5.3 row 9**: "within 1.5%" → "within ~2.5% of each
   other" (extremes differ 2.2%) or "within 1.5% of their mean".
4. **sec03 §3.1.2 + sec05 §5.1.2 + sec05 §5.3 row 11**: "3× slower" → "2.7× slower"
   (221719/80959 = 2.74).
5. **sec03 Table 3-7 header + §3.3.2 text**: delete "trie pooled n=15" / "flagged, rerun, and
   pooled" — results.json records trie at n=10, agreement10=true.
6. **sec03 Table 3-13 header**: flag the remove case as pooled n=15 (results.json: n=15,
   agreement10=false), per the preamble's promise that outliers are "flagged where they appear".
7. **sec04 §4.2.2**: "tens-to-hundreds of nanoseconds per event" → "single-digit microseconds
   per event" (Ch 3: 1.3 µs reused-dispatch floor, 4 µs fresh keydown).
8. **sec04 §4.1.3**: drop "passive-on-keydown … measured" (no such case in results.json) and
   narrow "N = 10…10,000" to the measured N (1,000 listeners; 2,000-node tree).
9. **sec05 §5.2.1**: "one `addEventListener` costs ~0.74 µs" → "~0.75 µs" (0.74 µs is the
   add+remove pair, Table 3-13).
10. (minor) sec03 §3.2.1/sec05 §5.2.1 "within 4%" target checks → "within ~4.2%"; sec06 §6.1.2
    "0.77 µs-per-pair" → "0.77 µs per registration" (pair = 0.74 µs).

## Unverified scope

- rep-level distributions (bimodal ~26k/~32k bubble@leaf claim; trie deopt rep) — only
  min/max/median aggregates exist in results.json; claims are consistent with aggregates.
- sec06 library-source facts (VS Code/CM6/tinykeys/kbar/xterm internals, issue numbers) — outside
  dim02/dim03 ground truth; not checked.
- "30 repeats/second" (sec02) — uncorroborated by brief, plausible.
- No re-execution of the benchmark harness (verification from recorded raw data only).
