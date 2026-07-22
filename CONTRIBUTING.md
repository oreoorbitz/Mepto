# Contributing to Mepto

Thanks for helping out! Mepto is a TypeScript rewrite of Zepto targeting modern
browsers. This guide covers getting a local dev environment running, the test
suite, the CI gates your PR must pass, and how to plug an AI coding assistant
into the workflow.

If you are an end user just looking to _use_ Mepto, the **[README](README.md)**
is the right place to start — this document is for people working _on_ the
library.

> **Status:** The TypeScript transition is ~40% complete. Some modules are
> fully typed and modernized; others are still close to the original Zepto
> source. `npm run typecheck` and the declaration step of `npm run build` print
> known type errors from the unconverted modules — this is expected, the build
> still exits 0 and produces working bundles. Don't be alarmed by red output.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Dev setup](#dev-setup)
- [The test suite](#the-test-suite)
- [The dev server](#the-dev-server)
- [Code style](#code-style)
- [Pull request checklist](#pull-request-checklist)
- [What not to edit](#what-not-to-edit)
- [Working with an AI coding assistant](#working-with-an-ai-coding-assistant)
- [Git & GitHub workflow](#git--github-workflow)

---

## Prerequisites

**Node.js 24 (LTS) is required.** The project is pinned to Node 24
(`.nvmrc` = 24, `engines.node` = `"24.x"`, `engine-strict` on). Any other
version is rejected.

```sh
node --version    # must print v24.x
nvm use           # if you use nvm — reads .nvmrc
```

You'll also need the Playwright Chromium browser for e2e tests (installed
below).

## Dev setup

```sh
git clone https://github.com/oreoorbitz/Mepto.git
cd Mepto
npm ci                      # install deps (engine-strict: needs Node 24)
npx playwright install --with-deps chromium   # one-time: browser for e2e
npm run dev                 # start the Vite dev server
```

`npm run dev` scans ports 3000–3099, binds to the first free one, and writes it
to `.port`. The landing page at `http://localhost:<port>/` **is** the unit test
suite — it loads Mepto straight from source (no build step) and runs 234
assertions on page load.

> **No build step is needed for testing or dev.** Both Vitest and Playwright
> work directly against `src/`. You only need `npm run build` to produce the
> `dist/` bundles.

## The test suite

There are three tiers, fastest first. Run the fast one while iterating; run the
browser one before opening a PR.

| Command                                                              | Time | Tests | What it checks                            |
| -------------------------------------------------------------------- | ---- | ----- | ----------------------------------------- |
| `npm test`                                                           | ~1s  | 73    | Vitest in jsdom — fast unit tests         |
| `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` | ~2s  | 234   | Full suite in a real Chromium browser     |
| `npm run test:e2e`                                                   | ~5s  | all   | All Playwright specs, all browser engines |

### One-shot full validation

```sh
npm run test:all
```

This kills stale dev servers on ports 3000–3099, runs Vitest, then runs the
234-test Playwright unit suite in Chromium. This is the closest local mirror of
CI.

### Where tests live

- **`src/mepto.test.ts`** — Vitest unit tests (jsdom). Add per-method tests here.
- **`index.html`** (repo root) — the 234-test browser suite. Loaded from source.
- **`test/e2e/unit-suite.spec.ts`** — drives `index.html` via Playwright.
- **`test/e2e/ajax-suite.spec.ts`**, **`event-suite.spec.ts`**,
  **`todo-app.spec.ts`** — feature-specific e2e specs.
- **`test/functional/`** — manual interactive test pages (touch, gestures, fx).

### What's covered vs. not

The suites cover: type utilities, selectors, DOM manipulation, attributes, CSS,
events, form serialization, dimensions, AJAX, deferreds, callbacks, and the
todo app end-to-end.

**Not yet covered:** animations (fx), touch events, gesture, browser detection,
assets, stack methods. When you change one of those modules, add tests
alongside your change.

### Port conflicts

Dev servers sometimes linger on ports 3000–3099. Kill them before re-running
Playwright:

```sh
npm run killports
```

## The dev server

```sh
npm run dev
cat .port          # → e.g. 3000
```

The landing page (`http://localhost:<cat .port>/`) loads Mepto from source and
runs the 234 tests automatically. Results are visible on the page and via:

- `#summary.pass` / `#summary.fail` — visible status
- `document.body.dataset.status` — `"passed"` / `"failed"` (machine-readable)
- `window.meptoTestResults` — `{ passed, failed, total, results[] }`

Never assume the server is up just because `.port` exists — it may still be
binding. This one-liner retries until the server answers:

```sh
curl -s -o /dev/null -w "%{http_code}" \
  --retry 5 --retry-delay 1 --retry-connrefused \
  "http://localhost:$(cat .port)/"
# 200 = ready, 000 = not yet
```

## Code style

- **Two-space** indentation, no trailing whitespace.
- **No optional semicolons.** Put a single semicolon _before_ statements that
  start with `(` or `[` (ASI guard).
- `function name() { }` for named functions; `function () { }` for anonymous.
- No braces for single-line control flow (`if` / `else` / etc.).
- Long, descriptive variable and method names.
- Use blank lines to separate "paragraphs" of code.
- Comment the _why_, not the _what_.

Formatting is enforced by **Prettier** (`npm run format`), linting by **ESLint**
(`npm run lint`). Run `npm run format` before committing and most style nits
take care of themselves.

### Performance philosophy

Every API decision should minimize live DOM touches — the browser's layout
engine dominates real-world cost. Prefer `DocumentFragment` for bulk inserts,
separate read/write passes to avoid layout thrashing, cache query results, and
use `WeakMap`/`WeakSet` for element-associated data. The full philosophy and
the patterns-to-prefer / patterns-to-avoid tables are in **[AGENTS.md](AGENTS.md)**
under "Performance Philosophy" — read it before touching hot paths.

### TypeScript conventions

- The project uses **relaxed** `tsconfig.json` settings (`strict: false`,
  `noImplicitAny: false`) to allow gradual typing. **Do not tighten these**
  during the transition; correctness comes first.
- `any` is allowed during the transition — type what you can, annotate the rest
  `any` and move on. Don't block on perfect types.
- Don't add `@types/*` packages or type stubs for legacy browser APIs. If the
  DOM lib is missing a type for a modern API, use a type assertion.
- When converting a module, follow the **Module Conversion Playbook** in
  AGENTS.md (type the IIFE param → `var`→`const`/`let` → type module vars →
  type params → fix local antipatterns → build & verify).

## Pull request checklist

**One concern per PR.** If a commit needs "and also" to make sense, split it.

CI runs this sequence on every push and PR — run the same locally before
pushing:

```sh
npm ci
npm run typecheck          # tsc --noEmit (known errors from unconverted modules are expected)
npm run lint
npm run format:check
npm test                   # Vitest
npm run test:all           # Vitest + 234-test Playwright suite
npm run build              # produces dist/ (exits 0 despite known type errors)
npm run size               # 15 KB budget per bundle
```

For faster feedback during the inner loop:

```sh
npm run lint:fast          # oxlint — sub-second, catches common issues
npm run verify             # typecheck + lint + test + build + size:check (no browser suite)
```

`verify` excludes the browser suite — run `npx playwright test --project=chromium`
separately if you need full CI parity.

A passing PR:

- [ ] Targets one module or one concern
- [ ] Keeps or expands test coverage (every change needs a test)
- [ ] Maintains jQuery API compatibility for any method it touches
- [ ] Is written in English, with a description detailed enough to serve as docs
- [ ] Passes all the gates above

**Do not silence gates to make CI green.** If a check blocks you on pre-existing
debt you didn't cause, open a narrow PR against that one gate and link it from
your PR.

> **Note on `npm run build`:** It will print a flood of red TypeScript errors
> from `vite-plugin-dts`. This is expected (~40% through the TS transition).
> The build **succeeds** (exit 0) and `dist/meptos.js` + `dist/meptos.umd.cjs`
> are produced correctly. To check whether _you_ introduced a new error, compare
> the `npm run typecheck` error count against `main`.

## What not to edit

- **`AGENTS.md`** — contributor/agent conventions and progress report
- **`plans/`** — planning documents
- **`tools/llm-test-harness/`** — the test harness source (only modify when
  improving the harness itself)
- **`.claude/settings.local.json`** — local IDE permissions

## Working with an AI coding assistant

Mepto is set up to be friendly to AI pair-programming (Claude, Cursor, ZCode,
etc.). There are two complementary pieces.

### 1. Agent instructions (`AGENTS.md`)

**[AGENTS.md](AGENTS.md)** is the single source of truth for any coding agent
working in this repo. It covers: the library's goals, the browser target, the
verify-before-trusting routine, how the dev server works, the TypeScript
transition status, the module conversion playbook, and the performance
philosophy. **Point your assistant at it first** — most "how do I…" questions
are answered there.

To plug in your assistant:

- **Cursor / Continue / similar:** they auto-discover `AGENTS.md` (or
  `.cursorrules`) at the repo root. No config needed — just open the project.
- **Claude Code / ZCode:** read `AGENTS.md` automatically as workspace
  instructions. Verify with `/memory` or the equivalent in your client.
- **GitHub Copilot Chat:** reference it explicitly with `@workspace` and ask it
  to follow `AGENTS.md`.
- **Any assistant:** if it doesn't auto-load it, paste the instruction
  _"Read and follow AGENTS.md before making changes."_ into your first message.

### 2. The LLM test harness

`tools/llm-test-harness/` is a **secure, sandboxed Puppeteer runner** that lets
an agent (or you) execute JavaScript snippets against Mepto loaded from source.
It exists so an agent can verify a change _without_ hallucinating test results:
it detects prompt-injection attempts, blocks network, neuters `localStorage` /
`document.cookie` / `window.open`, and returns structured JSON.

Set it up once:

```sh
cd tools/llm-test-harness && npm install && npm run build && cd ../..
```

Then run code against Mepto in an isolated browser page:

```sh
# expression value via return
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" --json

# assertions
node tools/llm-test-harness/bin/mepto-test.js \
  --code="assert($('div').length === 2); expect(2+2).toEqual(4)" \
  --html="<div>a</div><div>b</div>"

# batch + compare return values against jQuery 3.7 (catches compat regressions)
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare --json

# validate safety without executing
node tools/llm-test-harness/bin/mepto-test.js --validate --code="return $('div').length"
```

`assert()` and `expect()` (with `.toBe`/`.toEqual`/`.toBeTruthy`/`.not`) are
available in every run. `--compare` runs each case against **both** Mepto and
jQuery (both exposed as `$`) and diffs return values — the fastest way to catch
a jQuery-compatibility regression. Full options and the security model are in
AGENTS.md ("LLM Test Harness").

**The rule for agents:** _always verify through the harness or the test suite —
never report a change as "working" from inspection alone._

## Git & GitHub workflow

- Default branch: `main`. Squash merges are the default; the squashed commit
  message is taken from the **PR title**, so write it like a final commit
  subject (`fix(ajax): handle empty response`, not "fixes").
- Branch naming: `<type>/<short-kebab-desc>` — e.g. `feat/ts7-typecheck`,
  `fix/ajax-jsonp`. Match the branch's primary commit type.
- Commits use **Conventional Commits** (`feat`, `fix`, `refactor`, `chore`,
  `ci`, `build`, `docs`, `test`, `perf`) with an optional scope. Imperative
  subject, lowercase, no trailing period.
- Changes to jQuery-based API methods **must match their jQuery counterparts**.
  Don't just copy jQuery code — Mepto has different size/style/platform goals.
  If you do borrow, mark the origin and license clearly.
- **Always confirm with a maintainer** before `git push`, force-push, `git reset
--hard` on a shared ref, `gh pr create/merge/close`, or `gh release`. The
  full gate list is in AGENTS.md ("Git & GitHub workflow").

## Need help?

1. Read **[AGENTS.md](AGENTS.md)** — it answers most questions.
2. Check the harness details in `plans/llm-test-harness.md`.
3. Look at example tests in `test/`.
4. Open an issue on the [issue tracker][issues].

[issues]: https://github.com/oreoorbitz/Mepto/issues
