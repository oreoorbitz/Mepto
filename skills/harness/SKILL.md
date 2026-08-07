---
name: harness
description: Secure Puppeteer harness at tools/llm-test-harness/ for isolated Mepto snippet execution. Use for fast, injection-safe verification before running the full suite.
---

# Harness — LLM Test Harness

Secure Puppeteer harness at `tools/llm-test-harness/` for isolated JS/TS execution against Mepto. Detects prompt injection, blocks `eval`/`Function`/network/`process`/`require`/filesystem, neuters `localStorage`/`document.cookie`/`window.open` via `evaluateOnNewDocument`.

## Install (once)

```bash
cd tools/llm-test-harness && npm install && npm run build && cd ../..
```

## Run a snippet

Use an explicit `return` to surface a value — multi-statement code runs inside a function body, so `return` is always valid.

```bash
# DOM manipulation
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" --json

# Element count
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('div').length" \
  --html="<div>A</div><div>B</div>"

# Event handling
node tools/llm-test-harness/bin/mepto-test.js \
  --code="
    var clicked = false;
    $('.btn').on('click', function() { clicked = true; });
    $('.btn').trigger('click');
    return clicked;
  " \
  --html="<button class='btn'>Click</button>"
```

## Validate without executing

```bash
node tools/llm-test-harness/bin/mepto-test.js --validate --code="return $('.item').length"
```

## Run from file

```bash
node tools/llm-test-harness/bin/mepto-test.js --file=./my-test.js --html-file=./fixture.html
```

## Visible browser (debugging)

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').fadeIn()" \
  --html="<div class='test' style='display:none'>Hello</div>" \
  --no-headless
```

## Assertions

`assert(cond, msg?)` and `expect(actual)` (`.toBe`/`.toEqual`/`.toBeTruthy`/`.toBeFalsy`/`.not`) are injected before each run:

```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="assert($('.x').addClass('a').hasClass('a')); expect(2+2).toEqual(4)" \
  --html="<div class='x'></div>" --json
```

## Batch — one browser session for many cases

~2× faster than N cold starts; each case gets a fresh page so DOM/listeners don't bleed.

`cases.json`:

```json
{
  "cases": [
    {
      "name": "addClass",
      "code": "return $('.x').addClass('a').hasClass('a')",
      "html": "<div class='x'></div>"
    },
    { "name": "count", "code": "return $('div').length", "html": "<div>a</div><div>b</div>" },
    { "name": "async", "code": "return await Promise.resolve('ok')" }
  ]
}
```

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --json
```

Exit 0 only when every case passes. JSON carries `summary: { total, passed, failed, errored, duration }` + `results[]`.

## Compare Mepto vs jQuery

Add `--compare` to a `--batch` run — each case runs against both Mepto and jQuery (each as `$`) and return values are diffed. jQuery is bundled with the harness (no network).

```bash
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare --json
```

Output: `summary: { total, matched, differed, duration }`, each entry has `mepto` + `jquery` sub-results and a `match` flag. Exit 0 only when every case matches. Compares _return values_ — to catch DOM side-effect differences, return observable state (e.g. `return $('div')[0].outerHTML`).

## Output shape

```json
{
  "success": true,
  "passed": true,
  "result": true,
  "assertions": { "passed": 2, "failed": 0, "failures": [] },
  "console": [{ "type": "log", "message": "Mepto loaded", "timestamp": "2024-01-01T00:00:00Z" }],
  "timing": { "duration": 523 },
  "security": { "safe": true, "violations": [], "warnings": [] }
}
```

`success` = executed without throwing; `passed` = success AND no assertion failed (equals `success` when no assertions used).

## Security model

Two tiers (`tools/llm-test-harness/src/security/sanitizer.ts`):

- **Hard-block** (rejects run): `eval`/`Function`/string-arg timers, prototype pollution (`__proto__`, `constructor.prototype`), Node-only identifiers (`child_process`, `require('fs')`).
- **Advisory** (warns, enforced at runtime): storage, network, navigation, `document.write`, markup/`on*=` handlers — neutered via `evaluateOnNewDocument`.

Regex is a first-pass gate; real isolation is the browser page (no Node surface, request interception blocks non-local network).
