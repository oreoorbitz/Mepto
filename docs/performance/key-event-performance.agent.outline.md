# The Definitive Reference: Event Listener & Keyboard Key Detection Performance in Frontend JavaScript

Audience: high-performance JS library authors. Raw throughput and per-keystroke latency; readability
not a goal. Companion sandbox: /mnt/agents/output/key-bench/ (Chromium 150, Blink+V8, headless).

## 1. The Mental Model: What a Keystroke Costs (~1500 words, 2 tables)

Sources: /mnt/agents/output/research/keyevent_dim01_api_semantics.md

### 1.1 Listener registration surface

#### 1.1.1 addEventListener options (capture/once/passive/signal), dedup key, removeEventListener matching; on\* single-slot handlers; handleEvent objects

#### 1.1.2 The five cost layers of a keystroke: OS/input pipeline → EventPath build → per-node listener lookup → per-listener JS invocation → handler body

### 1.2 Event flow semantics that cost money

#### 1.2.1 Capture→target→bubble; path computed once up front; composedPath() allocates; stopPropagation/stopImmediatePropagation/preventDefault flag semantics

#### 1.2.2 Passive defaults (wheel/touch only, never keyboard); cancelable per type; shadow retargeting & composed flag (keyboard events are composed)

### 1.3 The KeyboardEvent surface

#### 1.3.1 key vs code vs keyCode/which/charCode; location; repeat; isComposing; modifier booleans vs getModifierState; getLayoutMap; Dead/Process/Unidentified

#### 1.3.2 Event ordering: keydown→(keypress)→beforeinput→input→keyup; canceling keydown suppresses insertion/scroll/Tab; auto-repeat shape; keyCode 229 IME convention

#### 1.3.3 Trusted vs synthetic: isTrusted, synthetic dispatch produces no default actions and keyCode 0 — benchmarking implications

### 1.4 Focus, targeting, and IME

#### 1.4.1 Keyboard target rule (focused element → body → root); focus/blur vs focusin/focusout

#### 1.4.2 Composition session shape; isComposing progression; cross-browser divergence (Safari 229, post-compositionend keyup)

## 2. Engine Internals: The Dispatch Machine (~1800 words, 2 tables, code excerpts)

Sources: /mnt/agents/output/research/keyevent_dim02_engine_internals.md

### 2.1 The Blink input pipeline for real keys

#### 2.1.1 Browser process → InputRouter → compositor (no keyboard fast path) → main thread; keys never coalesced/frame-aligned; accelerators consume pre-renderer

#### 2.1.2 Auto-repeat = one full pipeline traversal per repeat

### 2.2 The dispatch algorithm's cost structure

#### 2.2.1 EventPath built fresh per dispatch: O(depth) exactly-sized vector, no cache

#### 2.2.2 SkipEventCapture: one stray capture listener disables page-wide capture-skip

#### 2.2.3 Per-node: EventListenerMap::Find + spec-mandated copy-on-fire listener vector snapshot; per-listener phase checks, once-removal

### 2.3 KeyboardEvent getter internals

#### 2.3.1 Blink: key/code computed eagerly at construction via KeycodeConverter tables, cached — per-read cost is just the binding call

#### 2.3.2 Gecko re-maps name tables per access → hoist e.key in hot paths

### 2.4 V8 invocation anatomy: per listener HandleScope/ScriptState scope, TryCatch, Function::Call; one wrapper per event per world; handleEvent extra property lookup; N listeners = N round trips; signal-abort = K removal scans

### 2.5 Where per-keystroke latency actually lives: main-thread busy-ness, INP instrumentation (UIEventTiming) wrapping every keyboard dispatch

## 3. Measured Results: Chromium 150 Sandbox (~1800 words, 8 tables)

Sources: /mnt/agents/output/key-bench/RESULTS.md, results.json (copy numbers exactly)

### 3.1 Dispatch topology

#### 3.1.1 Listener position irrelevant; path length everything: leaf vs root @depth1 = 1.002; depth 1→50 = 1.6×; 1→500 = ~8× (32 µs)

#### 3.1.2 Capture ≈ bubble @depth500 (1.01); 1/10/100 listeners ≤1.5% apart; 10 listeners across 10 ancestors = 3× slower (path-bound)

### 3.2 Delegation economics

#### 3.2.1 Dispatch parity: 1 doc listener + closest() 176k vs 1000 direct 174k ops/s

#### 3.2.2 Registration is the real cost: 0.74 µs per add/remove pair → 1000 direct = ~1000× the delegated registration

### 3.3 Handler hot path

#### 3.3.1 Property reads all within 1–6% of baseline (key/code/keyCode/which/charCode/ctrlKey/getModifierState); e.key×2 = ×1

#### 3.3.2 Shortcut matching: bitmask+Map 16.5M ≈ trie 14.6M > string+Map 5.4M (3.1×) > 50-scan 2.3M (7.2×)

#### 3.3.3 Guards (repeat/isComposing) free (<0.5%); listener shape: function ≈ arrow > onprop (−8%) ≈ handleEvent (−10%)

### 3.4 Control calls, event types, construction

#### 3.4.1 preventDefault within noise; stopPropagation faster than propagating (235k vs 202k)

#### 3.4.2 KeyboardEvent ~45% slower dispatch than CompositionEvent; keydown/keyup 247k vs compositionstart 359k

#### 3.4.3 Event reuse: construct 2.3 µs; reused-event dispatch 1.3 µs vs fresh construct+dispatch 4.1 µs (3.2×)

### 3.5 Registration/removal and the trusted layer

#### 3.5.1 AbortController teardown of 100 listeners 1.9× slower than 100 removeEventListener calls; once:true fine (183k incl. dispatch)

#### 3.5.2 Trusted layer: 234–252 presses/s (CDP-bound), marker→handler ~1.3 ms incl. IPC; preventDefault raises throughput to 635/s; honest caveats

## 4. Published Evidence & the Latency Budget (~1200 words, 2 tables)

Sources: /mnt/agents/output/research/keyevent_dim03_benchmark_evidence.md

### 4.1 The published microbenchmark record is thin

#### 4.1.1 MeasureThat registration numbers (~1.5% onclick-vs-aEL); jQuery dispatch 2.5× overhead; the capture/delegation/keyCode gaps

### 4.2 The latency budget: why handler bodies dominate

#### 4.2.1 Dan Luu: keyboards 15–60 ms; modern end-to-end 100–200 ms; Fatin: I/O floor ~26 ms, app latency 0.9–49.4 ms (GVim vs Atom)

#### 4.2.2 Dispatch nanoseconds vs handler microseconds vs 26 ms floor — where optimization matters

### 4.3 Passive interventions and INP

#### 4.3.1 Scroll intervention numbers (80% never preventDefault; 10% >100 ms); keyboard never in scope (Akulov 2017)

#### 4.3.2 INP: 200/500 ms p75; keystroke latency = max(down, press, up); 18.76% of slow interactions blocked on long tasks; scheduler.yield

### 4.4 Reconciling our Chromium-150 numbers with the literature

## 5. Decision Matrix: Architecture by Scenario (~1500 words, 1 master table)

Sources: chapters 1–4 outputs

### 5.1 By application type: shortcut library / text editor / game / form UI / global hotkeys

#### 5.1.1 Key identification: event.code for physical (games/WASD), event.key for semantic (shortcuts/text), keyCode only for legacy tables

#### 5.1.2 Listener topology: one root listener + internal dispatch for libraries; depth rarely matters but capture listeners poison SkipEventCapture

### 5.2 By event volume and registration churn

#### 5.2.1 High-churn UIs: delegation always (registration 1000×); static apps: direct listeners fine

#### 5.2.2 Teardown: removeEventListener for hot paths; AbortSignal for ergonomic bulk teardown despite 1.9× cost

### 5.3 The master decision table (scenario → listener topology → key ID → matching structure → measured anchor → engine reason)

## 6. The Library-Author Playbook (~1800 words, 2 tables, code snippets)

Sources: /mnt/agents/output/research/keyevent_dim04_library_practices.md + chapter 3

### 6.1 Attach once, dispatch internally

#### 6.1.1 VS Code single root keydown → KeybindingService; tinykeys one listener per map; kbar window listener; React root delegation (#18195/#19659)

#### 6.1.2 Outlier anti-pattern: react-hotkeys-hook per-hook listeners

### 6.2 Parse at registration, match at dispatch

#### 6.2.1 Three encoding families: bitmask int (VS Code \_computeKeybinding, xterm 4-bit mask) vs normalized strings (CM6/ProseMirror w3c-keyname, Alt-Ctrl-Meta-Shift order) vs ASTs parsed once (tinykeys KeybindingPress)

#### 6.2.2 Matching structures: bucket by first chord (VS Code \_map), keyCode buckets (hotkeys-js), WeakMap-cached scope maps (CM6); measured anchors (16.5M vs 5.4M vs 2.3M)

### 6.3 Chords, IME, and the traps

#### 6.3.1 Timeout-based chords (1000 ms tinykeys/Mousetrap; 4000 ms CM6; 5 s VS Code + focus-loss; VS Code disables IME in chord mode)

#### 6.3.2 IME guards: VS Code KEY_IN_COMPOSITION normalization; AltGraph-on-Windows = ctrl+alt trap; macOS Option; isComposing filtering

### 6.4 preventDefault discipline and the 12-point playbook (each bullet re-anchored to measured numbers)

## 7. Appendix: Methodology, Sandbox, Caveats (~800 words, 1 table)

Sources: /mnt/agents/output/key-bench/RESULTS.md, bench.html, run.js

### 7.1 Two layers: synthetic dispatchEvent (in-page EventPath+invocation) vs CDP trusted input (pipeline-bound); what each can and cannot prove

### 7.2 Harness: warmup/median/DCE sink/expose-gc/alternating order; fixtures (depth 1/50/500, 1000 buttons, 2000-node flat)

### 7.3 Stability: 61/63 cases within ±10% across two runs; bimodal JIT-tier case flagged; machine-specific absolutes

### 7.4 Reproduce and extend (file inventory table)

# References

## Research briefs — /mnt/agents/output/research/keyevent*dim01..04*\*.md

## Benchmark sandbox — /mnt/agents/output/key-bench/
