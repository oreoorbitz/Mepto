# Agent Development Guide for Mepto

## Library Goal

Mepto is a lightweight, modern replacement for jQuery. The core aim is to match jQuery's ergonomics while outperforming it by reducing browser overhead — fewer reflows, repaints, layout thrashes, and unnecessary DOM queries. Teams should be able to gradually replace jQuery with Mepto without sacrificing performance, and often gaining it.

**Browser target: evergreen browsers only.** No IE, no legacy Edge, no Safari < 14. Do not add polyfills, fallbacks, or feature-detection code for old browsers. Use native platform APIs (`WeakMap`, `WeakSet`, `queueMicrotask`, `AbortController`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, `classList`, `closest`, `dataset`, etc.) freely — they are all available in the target environment. If you encounter legacy-compatibility code in the existing source, you may remove it.

## Current Task

Transition all source files to TypeScript, adding parameter types to untyped functions. Refactor antipatterns (shared mutable module-level variables, parameter mutation, `let` where `const` applies) as they are encountered. Verify each change with the 228-test suite before moving on.

---

## Performance Philosophy

Every API decision should minimize live DOM touches. The browser's layout engine dominates real-world cost. jQuery's convenience hides per-operation overhead (selector engine, wrapper allocations, repeated traversals) that compounds in loops and large UIs. Mepto wins by providing ergonomic APIs that internally batch, cache, and reuse — while exposing zero-dependency, modern code.

### High-Impact Areas (in priority order)

1. **Batching DOM updates** — Use `DocumentFragment` for bulk insertions. One-by-one appends trigger multiple reflows; a fragment batches them into one.
2. **Read/write separation** — Never interleave layout reads (`getBoundingClientRect`, `offsetWidth`, `scrollTop`) with DOM writes. A read after a write forces a synchronous layout recalculation.
3. **Caching & minimal queries** — `querySelector` and traversals are slow when repeated. Cache results; scope queries narrowly. Use `WeakMap` for element-associated data.
4. **Scheduling with rAF** — Batch visual changes to align with paint cycles. Use `requestAnimationFrame` for animations and high-frequency updates.
5. **Memory & cleanup** — Use `WeakMap`/`WeakSet` for element data so GC can collect removed nodes. Prefer modify-in-place over destroy/create cycles.
6. **Event delegation** — A single listener on a container scales better than per-element listeners, especially for dynamic content.

### Patterns to Prefer

| Prefer | Over |
|--------|------|
| `DocumentFragment` + single `appendChild` | Repeated per-element `appendChild` in a loop |
| `element.classList` or batch `cssText` | Many individual `element.style.prop = value` sets |
| Cache `querySelector` result before a loop | Repeated `querySelector` for the same selector inside a loop |
| `WeakMap` for element-associated data | Expanding properties directly onto DOM nodes |
| `<template>` clone + insert | Many `createElement` + `setAttribute` calls |
| CSS `transform`/`opacity` for animation | JS-driven `style.top`/`style.left` updates |
| Modify existing elements in-place | Remove + recreate cycles |

### Patterns to Avoid

- **Layout thrashing**: reading `offsetWidth`, `getBoundingClientRect`, `scrollTop` etc. inside a write loop forces synchronous layout recalc on every iteration.
- **Per-element listeners** on dynamic content — use event delegation instead.
- **Repeated DOM queries inside loops** — cache the result before the loop.
- **Unnecessary `$(el)` wrapper allocations** in hot paths — call helpers directly when possible.

### Measurement

Profile with Chrome DevTools **Performance** tab on realistic scenarios (large lists, frequent updates, mobile). Focus on:
- Reflow/repaint count and long tasks
- Heap growth over time
- Direct comparison against jQuery equivalents

Target: smooth 60fps and good INP (Interaction to Next Paint).

### V8 Note (library internals only)

In hot internal helper functions, prefer consistent object shapes (fixed property order in config objects). Do not sacrifice API clarity for marginal JIT gains — the layout engine dominates costs.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
The Vite dev server starts at `http://localhost:3000`

### 3. Build the Library
```bash
npm run build
```

---

## LLM Test Harness (For Safe Code Testing)

We have built a secure Puppeteer-based testing harness at `tools/llm-test-harness/` that allows safe execution of JavaScript/TypeScript code.

### Why Use the Harness?
- **Security**: Runs code in an isolated browser sandbox
- **Safety**: Detects and blocks prompt injection attempts
- **Convenience**: Single command starts both Vite and Puppeteer
- **Console Access**: Captures all console output for debugging

### Installation
```bash
# Install harness dependencies
cd tools/llm-test-harness && npm install
cd ../..
# Build the harness
cd tools/llm-test-harness && npm run build && cd ../..
```

---

## Running the Full Unit Test Suite

`test/mepto-unit.html` is a self-contained test page covering every method in `src/mepto.ts` plus events and forms. It runs 228 tests automatically when loaded, logs `PASS/FAIL` to the browser console, and exposes `window.meptoTestResults`.

```bash
# Start Vite, run all 228 tests, get JSON summary
node tools/llm-test-harness/bin/mepto-test.js \
  --url=http://localhost:3000/test/mepto-unit.html \
  --code='return window.meptoTestResults' \
  --json

# Or with --no-server if Vite is already running
node tools/llm-test-harness/bin/mepto-test.js --no-server \
  --url=http://localhost:3000/test/mepto-unit.html \
  --code='return window.meptoTestResults' \
  --json
```

The result object:
```json
{
  "success": true,
  "result": {
    "passed": 228,
    "failed": 0,
    "total": 228,
    "results": [
      { "name": "$.type string", "pass": true },
      ...
    ]
  }
}
```

You can also open `http://localhost:3000/test/mepto-unit.html` in a browser for a visual pass/fail list.

---

### Harness Usage Examples

#### Test Mepto DOM Manipulation
```bash
# Test adding a class (use `return` for expression values)
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" \
  --json

# Test element count
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('div').length" \
  --html="<div>A</div><div>B</div>"

# Test event handling (return gives back the assertion value)
node tools/llm-test-harness/bin/mepto-test.js \
  --code="
    var clicked = false;
    $('.btn').on('click', function() { clicked = true; });
    $('.btn').trigger('click');
    return clicked;
  " \
  --html="<button class='btn'>Click</button>"
```

> **Note:** To return a value from `--code`, use an explicit `return` statement.
> Multi-statement code runs in a function body so `return` is always valid.

#### Validate Code Before Execution
```bash
# Check if code is safe (doesn't execute)
node tools/llm-test-harness/bin/mepto-test.js \
  --validate \
  --code="return $('.item').length"
```

#### Run From File
```bash
# Execute code from file
node tools/llm-test-harness/bin/mepto-test.js \
  --file=./my-test.js \
  --html-file=./fixture.html
```

#### Interactive Mode (Visible Browser)
```bash
# See the browser while testing
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').fadeIn()" \
  --html="<div class='test' style='display:none'>Hello</div>" \
  --no-headless
```

### Output Format

The harness returns JSON:
```json
{
  "success": true,
  "result": true,
  "console": [
    {"type": "log", "message": "Mepto loaded", "timestamp": "2024-01-01T00:00:00Z"}
  ],
  "timing": {
    "duration": 523
  },
  "security": {
    "safe": true,
    "violations": [],
    "warnings": []
  }
}
```

### Security Features

The harness automatically blocks:
- `eval()` and `Function()` constructor
- Dynamic imports and external network requests
- Access to `process`, `require`, filesystem
- Prompt injection patterns (system/user/assistant markers)
- Script injection attempts

---

## Project Structure

```
mepto/
├── src/                      # Source TypeScript files
│   ├── mepto.ts             # Core module
│   ├── event.ts             # Event handling
│   ├── ajax.ts              # AJAX functionality
│   ├── form.ts              # Form utilities
│   ├── fx.ts                # Animations
│   └── ...                  # Other modules
├── tools/
│   └── llm-test-harness/    # Testing harness for agents
│       ├── bin/mepto-test.js
│       └── src/
├── test/                     # Test files
│   └── blank.html           # Test page template
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

---

## Development Workflow

### 1. Make Changes to Source Files
Edit files in `src/` — all files are TypeScript (`.ts`).

### 2. Build the Library
```bash
npm run build
```

### 3. Run the Full Test Suite
```bash
# Start Vite if not running
npm run dev &

# Run 228 unit tests against the compiled bundle
node tools/llm-test-harness/bin/mepto-test.js --no-server \
  --url=http://localhost:3000/test/mepto-unit.html \
  --code='return window.meptoTestResults' --json
```

A passing run returns `"failed": 0`.

### 4. Test a Specific Method
```bash
node tools/llm-test-harness/bin/mepto-test.js --no-server \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>"
```

### 5. Run Linting
```bash
npm run lint
```

---

## TypeScript Configuration

The project uses relaxed TypeScript settings (`tsconfig.json`):
- `strict: false` - Allows gradual typing
- `allowJs: true` - Can import JavaScript
- `noImplicitAny: false` - No errors on implicit any

This enables progressive enhancement — add types as needed without breaking existing code. Do not tighten these settings during the TS transition; correctness comes first.

Do not introduce `@types/` packages or type stubs for legacy browser APIs that don't exist in the target environment. If the TypeScript DOM lib is missing a type for a modern API, use a type assertion rather than polyfilling or downgrading.

---

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build library to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run typecheck` | Check TypeScript |

### Harness Commands

| Command | Description |
|---------|-------------|
| `mepto-test --code="..."` | Execute code with auto-start |
| `mepto-test --validate --code="..."` | Validate without executing |
| `mepto-test --file=./test.js` | Run code from file |
| `mepto-test --no-headless` | Show browser window |

---

## Testing Tips

1. **Always use the harness first** - Test your changes in isolation before running full test suite
2. **Use `--json` flag** - For programmatic result parsing
3. **Use `--validate`** - Check code safety before execution
4. **Start with simple fixtures** - Test with minimal HTML, then add complexity

---

## Migration Notes

- All source files converted from `.js` to `.ts`
- Original mepto IIFE pattern preserved in `mepto.ts`
- Modules use `;(function($){...})(mepto)` pattern
- Entry point is `src/meptos.ts` which imports all modules

---

## Need Help?

1. Check the harness architecture in `plans/llm-test-harness.md`
2. Review example tests in `test/` directory
3. Use `--json` flag for structured output when debugging
