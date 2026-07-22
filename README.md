# Mepto – a modern TypeScript jQuery alternative

[![ci](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml/badge.svg)](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml)

Mepto is a lightweight, jQuery-compatible library for modern browsers, and a
TypeScript rewrite of [Zepto.js][zepto]. **If you use jQuery, you already know
how to use Mepto.** It targets evergreen browsers only — no IE, no legacy Edge,
no polyfills — and uses native platform APIs throughout.

The package is published as **`meptos`**. The browser globals are `$` and
`mepto`, matching jQuery/Zepto.

> **Status: transition in progress.** This repo is an active rewrite of the
> original Zepto codebase into TypeScript with modern tooling (Vite, Vitest,
> Playwright). Some modules are fully typed and modernized, others are still
> close to the original source. `npm run typecheck` and the declaration step of
> `npm run build` print known type errors from the unconverted modules — this is
> expected; the build still exits 0 and produces working bundles.

Mepto is licensed under the MIT License, like Zepto itself.

---

## Install

```sh
npm install meptos
# or
pnpm add meptos
yarn add meptos
```

If you want a prebuilt UMD bundle without a bundler, grab it from your
`node_modules` or a CDN and include it with a `<script>` tag (see
[Browser / `<script>`](#browser--script-tag) below).

## Usage

### ES module / bundler

```ts
import { $ } from 'meptos'

$('#app').addClass('ready').on('click', 'button', handleClick)
```

### Browser / `<script>` tag

The UMD build exposes `window.$` and `window.mepto`:

```html
<script src="https://cdn.jsdelivr.net/npm/meptos/dist/meptos.umd.cjs"></script>
<script>
  $(function () {
    $('#app').addClass('ready')
  })
</script>
```

Or pin a version from a CDN of your choice (`esm.sh`, `jsdelivr`, `unpkg`).
When loaded as a UMD global, `$` and `mepto` are available immediately — no
`domready` wrapper is required, but `$(fn)` is supported jQuery-style.

### TypeScript

Type declarations ship in the package (`dist/meptos.d.ts`), so editor
autocomplete and type-checking work out of the box:

```ts
import { $, type MeptoCollection } from 'meptos'

const items: MeptoCollection = $('.item').addClass('active')
```

## What's in the box

Mepto bundles these modules in every build — there is no custom-build step:

| Module       | What it gives you                                                         |
| ------------ | ------------------------------------------------------------------------- |
| `mepto`      | Core: selectors, DOM manipulation, traversal, attributes, CSS, dimensions |
| `event`      | `on()` / `off()` / `trigger()`, event delegation, custom events           |
| `ajax`       | `$.ajax`, `$.get`, `$.post`, `$.getJSON`, JSONP (built on `fetch`)        |
| `form`       | `serializeArray()`, `serialize()`, `submit()`                             |
| `detect`     | `$.os` and `$.browser` device/browser sniffing                            |
| `fx`         | `animate()`                                                               |
| `fx_methods` | Animated `show()` / `hide()` / `toggle()` / `fade*()`                     |
| `data`       | `data()` storing arbitrary objects (WeakMap-backed, leak-free)            |
| `selector`   | jQuery CSS pseudo extensions: `:first`, `:visible`, etc.                  |
| `stack`      | `end()`, `andSelf()` chaining helpers                                     |
| `touch`      | Tap & swipe events on touch devices                                       |
| `gesture`    | Pinch gesture events                                                      |
| `callbacks`  | `$.Callbacks`                                                             |
| `deferred`   | `$.Deferred` / promise API                                                |
| `assets`     | Experimental iOS memory cleanup for removed image elements                |

The Zepto-era `ie` and `ios3` modules were dropped along with all legacy
browser support. `types.ts` holds the shared type definitions.

## Browser support

**Evergreen browsers only** — the last 3 versions of Chrome, Firefox, Safari,
and Edge. Mepto uses native APIs (`WeakMap`, `AbortController`, `fetch`,
`classList`, `closest`, `dataset`, `requestAnimationFrame`, …) freely; there is
no IE, legacy Edge, or old-Safari compatibility code. If you need to support a
legacy browser, Mepto is not the right tool.

## jQuery compatibility

Mepto mirrors the jQuery API for the modules above. Two notes:

- **AJAX is built on `fetch`**, not `XMLHttpRequest`. The public `$.ajax`
  surface (`success` / `error` / `complete` callbacks, `$.get`, `$.post`,
  `$.getJSON`, JSONP) is preserved; the transport is modernized.
- **`data()` is WeakMap-backed.** Values are stored off the DOM node (via a
  `Symbol` expando), so they are garbage-collected when the node is removed —
  no leaks, no expando properties visible on elements.

For the full migration story (including bridge APIs for progressively moving
toward vanilla DOM), see [docs-stub.md](docs-stub.md).

## Examples

The `examples/` directory contains runnable pages served by the dev server:

- `examples/todo/` — a full TodoMVC-feature-parity todo app that doubles as a
  validation tool exercising the real-world API surface (event delegation,
  `$.Callbacks`, `localStorage` persistence, edit-in-place).

## Bundles

`npm run build` produces, in `dist/`:

| File             | Format | Use                                  |
| ---------------- | ------ | ------------------------------------ |
| `meptos.js`      | ESM    | Bundlers (`import`), modern browsers |
| `meptos.umd.cjs` | UMD    | `<script>` tags, CommonJS `require`  |
| `meptos.d.ts`    | Types  | TypeScript editor/CLI support        |

plus sourcemaps. Output is minified via esbuild; `npm run size` enforces a
15 KB budget on each bundle via size-limit.

## Running tests

Unit tests (Vitest + jsdom):

```sh
npm test           # or: npm run test:watch
```

End-to-end tests in real browsers (Playwright; runs the suite in
`test/index.html`, which imports the library straight from source — no build
needed):

```sh
npx playwright test --project=chromium   # quick Chromium run
npm run test:e2e                         # all browsers + mobile
```

Everything at once:

```sh
npm run test:all
```

`test/functional/` contains manual test pages for touch, gestures, and effects.
Other useful checks: `npm run lint`, `npm run lint:fast`, `npm run format:check`,
`npm run typecheck`, `npm run size`.

### LLM test harness

`tools/llm-test-harness/` is a secure, sandboxed Puppeteer runner that lets
LLM agents execute JavaScript snippets against Mepto loaded from source, with
prompt-injection detection and network isolation:

```sh
cd tools/llm-test-harness && npm install && npm run build && cd ../..
node tools/llm-test-harness/bin/mepto-test.js --code "return $('div').length"
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare   # diff against jQuery 3.7
```

See `tools/llm-test-harness/TODO.md` and `plans/llm-test-harness.md` for
details.

## Contributing

Contributions are welcome! Mepto is a TypeScript rewrite in active progress.
For dev setup, the test pyramid, CI gates, and how to plug in an AI coding
assistant, see **[CONTRIBUTING.md](CONTRIBUTING.md)**. Coding conventions and
the performance philosophy live in **[AGENTS.md](AGENTS.md)**.

Bugs and feature requests go to the [issue tracker][issues].

[zepto]: https://github.com/madrobby/zepto
[issues]: https://github.com/oreoorbitz/Mepto/issues
