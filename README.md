# Mepto – a modern TypeScript jQuery alternative

[![ci](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml/badge.svg)](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml)

Mepto is a lightweight, jQuery-compatible library for modern browsers, and a
TypeScript rewrite of [Zepto.js][zepto]. If you use jQuery, you already know
how to use Mepto.

The package is published as **`meptos`**; the browser globals are `$` and
`mepto`.

> **Status: transition in progress.** This branch (`ts-transition`) is an
> active rewrite of the original Zepto codebase into TypeScript with modern
> tooling (Vite, Vitest, Playwright). Some modules are fully typed and
> modernized, others are still close to the original source. `npm run
> typecheck` and the declaration step of `npm run build` print known type
> errors from the unconverted modules — this is expected; the build still
> exits 0 and produces working bundles.

Mepto is licensed under the terms of the MIT License, like Zepto itself.

## Browser support

Evergreen browsers only: the last 3 versions of Chrome, Firefox, Safari, and
Edge. There is no IE or legacy compatibility code — no polyfills, no legacy
feature detection. Requires Node.js >= 18 for development.

## Getting started

~~~ sh
$ npm install
$ npm run dev        # Vite dev server (auto-picks a port in 3000–3099, opens the browser)
~~~

### Building

~~~ sh
$ npm run build
~~~

This bundles everything from the single entry point `src/meptos.ts` and
produces:

1. `dist/meptos.js` – ES module
2. `dist/meptos.umd.cjs` – UMD build (exposes `window.$` / `window.mepto`)
3. `dist/meptos.d.ts` – TypeScript declarations

plus sourcemaps. The output is currently unminified; `npm run size` enforces
a 15 KB budget on each bundle via size-limit.

~~~ ts
import { $ } from 'meptos'

$('#app').addClass('ready').on('click', handler)
~~~

> Note: the old Zepto custom-build mechanism (`MODULES="zepto event data"
> npm run-script dist`, CoffeeScript `make`) no longer exists. All modules
> are bundled unconditionally; the legacy `make` file and `script/`
> directory still in the repo are stale and slated for removal.

## Modules

The source lives in `src/` as TypeScript modules:

| module | description |
|---|---|
| `mepto` | Core module; contains most methods (`mepto.ts`) |
| `event` | Event handling via `on()` & `off()` |
| `ajax` | XMLHttpRequest and JSONP functionality |
| `form` | Serialize & submit web forms |
| `detect` | Provides `$.os` and `$.browser` information |
| `fx` | The `animate()` method |
| `fx_methods` | Animated `show`, `hide`, `toggle`, and `fade*()` methods |
| `data` | Full-blown `data()` method, storing arbitrary objects (WeakMap-based) |
| `selector` | jQuery CSS extensions such as `$('div:first')` and `el.is(':visible')` |
| `stack` | Provides `andSelf` & `end()` chaining methods |
| `touch` | Tap– and swipe–related events on touch devices |
| `gesture` | Pinch gesture events on touch devices |
| `callbacks` | `$.Callbacks` (used by `deferred`) |
| `deferred` | `$.Deferred` promises API |
| `assets` | Experimental iOS memory cleanup for removed image elements |

The Zepto-era `ie` and `ios3` modules were dropped along with all legacy
browser support. `types.ts` holds the shared type definitions.

## Migration tooling

Mepto doubles as a bridge for progressively migrating from jQuery-style code
to vanilla JS, including LLM-assisted migration. It exposes bridge APIs with
native-DOM signatures (`mepto.getElementById`, `mepto.getElementsByClassName`,
`mepto.getElementsByTagName`) and a `classList` bridge on collections. See
[docs-stub.md](docs-stub.md) for the migration guide.

## Running tests

Unit tests (Vitest + jsdom):

~~~ sh
$ npm test           # or: npm run test:watch
~~~

End-to-end tests in real browsers (Playwright; runs the suite in
`index.html`, which imports the library straight from source — no build
needed):

~~~ sh
$ npm run test:e2e   # chromium, firefox, webkit, Mobile Chrome, Mobile Safari
~~~

Everything at once:

~~~ sh
$ npm run test:all
~~~

`test/functional/` contains manual test pages for touch, gestures, and
effects. Other useful checks: `npm run lint`, `npm run format:check`,
`npm run typecheck`, `npm run size`.

### LLM test harness

`tools/llm-test-harness/` is a secure, sandboxed Puppeteer runner that lets
LLM agents execute JavaScript snippets against Mepto loaded from source,
with prompt-injection detection and network isolation:

~~~ sh
$ cd tools/llm-test-harness && npm install && npm run build
$ node bin/mepto-test.js --code "return $('div').length"
$ node bin/mepto-test.js --batch=cases.json --compare   # diff against jQuery 3.7
~~~

See `tools/llm-test-harness/TODO.md` and `plans/llm-test-harness.md` for
details.

## Contributing

See [AGENTS.md](AGENTS.md) for the coding conventions, performance
philosophy, and transition status that contributors are expected to follow.
Bugs go to the [issue tracker][issues].

  [zepto]: https://github.com/madrobby/zepto
  [issues]: https://github.com/oreoorbitz/Mepto/issues
