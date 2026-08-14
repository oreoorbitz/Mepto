# Plan: Deep Investigation — Event Listener Performance, Key Detection Focus

**Goal**: Definitive performance reference for library authors on DOM event listeners with deep
focus on keyboard/key detection: listener registration models (addEventListener vs on\* props,
capture/bubble/passive/once/signal), delegation, dispatch-path costs, and every key-identification
strategy (`key` vs `code` vs legacy `keyCode/which/charCode`, modifiers, getModifierState,
getLayoutMap, IME/composition, repeat), plus shortcut-matching architectures. Raw throughput and
per-keystroke latency are the goals; readability is not.

**Deliverables**: `/mnt/agents/output/key-event-performance-reference.md` (+ `.docx`) and runnable
sandbox `/mnt/agents/output/key-bench/`.

## Stage 1 — Research swarm (4 parallel explore agents, background)

- **R1 — API & semantics**: full KeyboardEvent surface (key/code/keyCode/which/charCode, repeat,
  isComposing, modifiers, getModifierState, getLayoutMap), keydown/keypress/keyup/beforeinput/
  input/composition events & ordering, trusted vs synthetic, addEventListener options semantics
  (capture/passive/once/signal), on\* property handlers, delegate patterns, browser default actions.
  Output: /mnt/agents/output/research/keyevent_dim01_api_semantics.md
- **R2 — Engine internals**: Blink event dispatch (EventDispatcher, EventPath, capture/bubble,
  listener registry, retargeting), input pipeline for real keys (browser process → compositor →
  main thread, KeyboardEvent creation), WebIDL attribute getter costs for key/code, WebKit/Gecko
  equivalents, V8 wrapper/allocation costs per dispatch. Output: keyevent_dim02_engine_internals.md
- **R3 — Published benchmark evidence**: measurethat/jsperf/blog numbers on listener overhead,
  capture vs bubble, delegation, key vs keyCode, passive listeners (scroll intervention), keyboard
  input latency studies (typing latency, editor latency), methodology pitfalls for event
  benchmarks. Output: keyevent_dim03_benchmark_evidence.md
- **R4 — Library practices**: Mousetrap, hotkeys-js, tinykeys, VS Code KeybindingService, Monaco,
  CodeMirror 6 keymaps, ProseMirror, xterm.js — shortcut normalization, modifier bitmask encoding,
  matching data structures (Map/trie/scan), chord handling, IME handling, preventDefault heuristics,
  per-keystroke work minimization. Output: keyevent_dim04_library_practices.md

## Stage 2 — Benchmark sandbox (coder, headless Chromium via puppeteer-core, parallel with Stage 1)

Two measurement layers: (a) synthetic `dispatchEvent(new KeyboardEvent(...))` for DOM-side dispatch
cost; (b) CDP `Input.dispatchKeyEvent` (trusted, full pipeline) for end-to-end keystroke cost.
Cases: bubble-vs-capture vs depth (1/50/500-deep DOM); 1/10/100 listeners per node; document-level
delegation vs 1000 direct listeners; reading key vs code vs keyCode vs which in handler;
getModifierState vs ctrlKey boolean; shortcut matching (string+Map vs bitmask int vs array scan vs
trie); once vs manual remove vs AbortSignal; stopPropagation/preventDefault cost; keydown vs
beforeinput vs input dispatch cost; handleEvent-object vs function listener; repeat-filter guard;
isComposing guard. Harness: same rigor as dom-bench (warmup, median-of-N, DCE sink, expose-gc,
alternating order). Outputs: key-bench/{bench.html,run.js,results.json,RESULTS.md}

## Stage 3 — Writing (report-writing skill, round dispatch)

Ch1 semantics/cost model; Ch2 engine internals; Ch3 measured results; Ch4 historical/published
evidence; Ch5 decision matrix; Ch6 library playbook (shortcut engines, editors); Ch7 methodology
appendix. Rounds: {1,2,3,4,7} parallel → {5,6} parallel.

## Stage 4 — Assemble (global citation renumbering + reference list), independent numeric

verification against results.json, fix pass, md2docx conversion, deliver .md + .docx + sandbox.

## Gates

- G1: 4 briefs complete & consistent; G2: benchmark JSON stable (2 runs, medians ±10%);
- G3: verifier PASS on all numeric claims; then deliver.
