# LLM Test Harness — Improvement Backlog

Tracking file for harness improvements identified during the codebase review.
Check items off as completed. See `AGENTS.md` for harness goals and usage.

## Status legend

- ☐ todo
- ☒ done

---

## Critical — correctness & the stated security model

- ☒ **Delete the unused whitelist (`whitelist.ts`).** It defined 300+ allowed
  globals/methods and exported `isAllowedMethod` / `getAllAllowedMethods` /
  `validateIdentifiers`, but nothing enforced them — `sanitize()` only runs
  `FORBIDDEN_PATTERNS`. Removed the file and all references; the denylist in
  `sanitizer.ts` is the actual (sole) gate. Replaced with a layered runtime
  model — see the next item.
- ☒ **Make the regex denylist advisory, not authoritative.** Split the flat
  `FORBIDDEN_PATTERNS` list into two honestly-named tiers in `sanitizer.ts`:
  `HARD_BLOCK` (dynamic code execution, prototype pollution, unambiguous
  Node-only identifiers like `child_process`/`require('fs')`) rejects the run;
  `ADVISORY` (storage, network, navigation, markup, `on\w+=`, `parent.`) only
  warns. The authoritative boundary is now the Puppeteer page: `runner.ts`
  `createPage` neuters `localStorage`/`sessionStorage`/`indexedDB`/`cookie`/
  `window.open`/`location` setters/`document.write`/`clipboard`/`sendBeacon`
  via `evaluateOnNewDocument`, each throwing a labeled error. `eval`/`Function`
  stay in HARD_BLOCK because the harness's own execution path uses `eval` (see
  `runner.ts:execute`) and can't safely neuter it.
- ☒ **Stop false-positives in the denylist.** All over-broad patterns
  (`/<script\b/i`, `/iframe/i`, `/on\w+\s*=/i`, `/parent\./`, `/top\./`,
  `/global\s*\.\s*/`, `/process\s*\.\s*/`) moved to ADVISORY — they no longer
  block legitimate tests like `el.onclick = fn`, `$('.oauth-token')`, or
  comments containing the word "global." `process.`/`global.`/`globalThis.`
  specifically were demoted from HARD_BLOCK because in a plain browser page
  they're just `undefined` (harmless), and matching them in source caused
  false positives on prose.
- ☒ **Align port-scan range.** `index.ts` scanned only 3000–3009 (10 ports)
  while `vite.config.ts` and `AGENTS.md` use 3000–3099 — so a server bound to
  e.g. 3015 was invisible to the harness, which would silently start a
  duplicate. Widened the scan to 3000–3099 via `PORT_RANGE_START`/`END`
  constants that mirror `vite.config.ts`, with a comment noting the two must
  stay in sync.

## High — the harness doesn't serve the TS-transition task it's documented for

- ☒ **Load Mepto from source, not `/dist`.** `blank.html` previously loaded
  `/dist/meptos.umd.cjs`, so editing `src/event.ts` gave stale behavior until a
  rebuild — directly contradicting the project's "no build step" workflow. Now
  loads `import { $ } from '/src/meptos.ts'` like `index.html` does, so the
  harness always reflects current source via Vite.
- ☒ **Add a batch / multi-snippet mode.** `TestRunner.runBatch()` and
  `LLMTestHarness.runBatch()` run N cases in a single browser+server session:
  the browser launches once and each case gets a fresh page (isolation without
  leaking pages). CLI: `--batch cases.json` where the file is
  `{ "cases": [{ name, code, html?, timeout? }] }` or a bare array. Output
  carries a `summary: { total, passed, failed, errored, duration }`. Measured
  ~2.2× faster than N single runs for 6 cases; the gap widens with N. Exit
  code is 0 only when all cases pass.
- ☐ **Add a diff/compare primitive.** The most common harness question is
  "does X match jQuery / match before my change?" A `--compare` that runs the
  same code against two builds and diffs results beats another security regex.

## Medium — agent ergonomics & reliability

- ☒ **Add an assertion API.** `execute()` now injects `assert(cond, msg)` and
  `expect(actual)` with `.toBe/.toEqual/.toBeTruthy/.toBeFalsy` (and `.not`)
  into the page before each run. Tallies land in `result.assertions`
  (`{ passed, failed, failures[] }`). The wrapping is now an async IIFE
  (`(async function(){ <code> })()`) so top-level `return` still works.
- ☒ **Split exit codes.** `TestResult` gained two independent fields:
  `success` (code executed without throwing) and `passed` (success AND no
  failed assertions, or no assertions used). The CLI exits on `passed`, and the
  JSON output lets an agent distinguish "execution error" (`success:false`)
  from "hypothesis was wrong" (`success:true, passed:false`). Human output now
  prints `Executed:` / `Passed:` separately with the assertion tally.
- ☒ **Support async/promise results.** `execute()` wraps user code in an async
  IIFE and awaits the returned value, so `await Promise.resolve(42)` yields
  `42` instead of `{}`. AJAX / Deferreds / animations that return thenables now
  resolve to real values within the existing timeout. (rAF-specific waiting is
  still TODO — the timeout is the only upper bound.)
- ☒ **De-duplicate console capture.** Removed the `window.MeptoTestBridge`
  console override from `blank.html` — it double-buffered every message into
  an array nothing ever read. Puppeteer's `page.on('console')` in `runner.ts`
  is the single source of truth. `blank.html` now carries a comment warning
  against re-adding it.

## Low — cleanup

- ☐ **Remove dead exports.** `wrapInContext` (exported, never used — real
  wrapping is inline in `execute()`), `validateIdentifiers` (gone with
  whitelist), `--url`/`navigate()` (unused).
- ☐ **Drop manual `findChrome()`.** ~25 lines of platform path detection
  (`runner.ts:60`) that fight the user's installed Chrome and break on path
  changes. Let Puppeteer use its bundled Chromium for reproducibility.
- ☐ **Improve `--no-server` detection diagnostics.** Only checks
  `/test/blank.html`; a 404 (e.g. after a rename) silently starts a duplicate
  server. Log when detection fails and why.
- ☒ **Tighten suspicious-keyword warnings.** Trimmed `SUSPICIOUS_KEYWORDS` to
  the unambiguous set (`password`, `secret`, `private_key`, `credential`,
  `bearer`) and removed `auth`/`authorization`/`token`/`apikey`/`api_key`,
  which fired on legitimate selectors like `$('.oauth-token')`.
