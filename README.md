# Mepto – a modern TypeScript jQuery alternative

[![ci](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml/badge.svg)](https://github.com/oreoorbitz/Mepto/actions/workflows/ci.yml)

Mepto is a lightweight, jQuery-compatible library for evergreen browsers, and a
TypeScript rewrite of [Zepto.js][zepto]. **If you use jQuery, you already know
how to use Mepto.** It targets evergreen browsers only — no IE, no legacy Edge,
no polyfills — and uses native platform APIs throughout.

The package is published as **`meptos`**. The browser globals are `$` and
`mepto`, matching jQuery/Zepto.

> **Status: TypeScript transition in progress.** The library is fully usable from
> `dist/` today. Source is being incrementally typed; `npm run build` prints
> expected type errors from unconverted modules but exits 0 and emits working
> bundles.

Licensed under the MIT License, like Zepto itself. Derivative of Zepto.js by
Thomas Fuchs — original copyright in [LICENSE](LICENSE).

---

## Install

```sh
npm install meptos
# or
pnpm add meptos
yarn add meptos
```

Prebuilt UMD bundle (no bundler) via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/meptos/dist/meptos.umd.cjs"></script>
```

Or `esm.sh` / `jsdelivr` / `unpkg` — pin a version.

## Usage

### ES module / bundler (full)

```ts
import { $ } from 'meptos'

$('#app').addClass('ready').on('click', 'button', handleClick)
```

### Treeshakable ESM (Shopify apps — import only what you need)

The full bundle (`dist/meptos.js`, 87 KB / 24.6 KB gzip) stays for legacy Shopify themes (single `{{ 'mepto.js' | asset_url }}` tag). For Shopify **apps** (Vite/esbuild/Rollup), import granular ESM subpaths — downstream bundler drops the rest (verified with `esbuild --bundle --minify`, Chrome 150 bench context):

```ts
// App needs only keyboard shortcuts (bitmask hotkey helper — 60 ns vs 186 ns string, Table 3-7)
import { hotkey } from 'meptos/hotkey'
const map = new Map([[hotkey.parse('Ctrl+K'), handler]])
document.addEventListener('keydown', e => {
  if (hotkey.shouldIgnore(e)) return
  const h = map.get(hotkey.encode(e))
  if (h) {
    h(e)
    e.preventDefault()
  }
})

// App needs only DOM + delegated events (4.1× closest vs manual loop)
import 'meptos/core' // 61 KB ESM (22.6 KB min / 7.7 KB gzip)
import 'meptos/event' // +11 KB (core+event 27.2 KB min / 9.5 KB gzip vs full 48 KB min / 18 KB gzip)
$('#app').on('click', '.btn', handler)

// App needs only core (no Ajax/FX/hotkey)
import 'meptos/core'
```

| Entry                                                | Min     | Gzip    | vs full   |
| ---------------------------------------------------- | ------- | ------- | --------- |
| `meptos` (full)                                      | 48.0 KB | 18.0 KB | —         |
| `meptos/core`                                        | 22.6 KB | 7.7 KB  | **-57 %** |
| `meptos/core` + `meptos/event`                       | 27.2 KB | 9.5 KB  | **-47 %** |
| `meptos/hotkey` (pure `hotkey` export → core+hotkey) | 25.6 KB | 8.8 KB  | **-51 %** |

Available subpaths: `meptos/core`, `meptos/event`, `meptos/ajax`, `meptos/hotkey`, `meptos/fx`, `meptos/fx-methods`, `meptos/data`, `meptos/selector`, `meptos/callbacks`, `meptos/deferred`, `meptos/form`, `meptos/detect`, `meptos/stack`, `meptos/touch`, `meptos/gesture` — each `dist/esm/*.js` (transpiled, `es2020`, with `import "./mepto.js"` auto-prepended) and treeshaken by the **app's** bundler, not just Mepto's build. Legacy themes keep the single `mepto.js` asset for `layout/theme.liquid`.

### Browser / `<script>` tag

UMD exposes `window.$` and `window.mepto` immediately — no `domready` wrapper
required, but `$(fn)` is supported jQuery-style:

```html
<script src="https://cdn.jsdelivr.net/npm/meptos/dist/meptos.umd.cjs"></script>
<script>
  $(function () {
    $('#app').addClass('ready')
  })
</script>
```

### TypeScript

Declarations ship with the package (`dist/meptos.d.ts`):

```ts
import { $, type MeptoCollection } from 'meptos'

const items: MeptoCollection = $('.item').addClass('active')
```

## What's in the box

No custom-build step — every build bundles:

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

`ie` / `ios3` removed with legacy browser support. Shared types in `src/types.ts`.

## Browser support

**Evergreen only** — last 3 versions of Chrome, Firefox, Safari, Edge. Uses
`WeakMap`, `AbortController`, `fetch`, `classList`, `closest`, `dataset`,
`requestAnimationFrame`, … freely. No IE / legacy Edge / old-Safari shims. If
you need legacy browsers, Mepto isn’t the right tool.

## jQuery compatibility

Mepto mirrors the jQuery API for the modules above:

- **AJAX is `fetch`-backed.** Public surface (`$.ajax`, `$.get`, `$.post`,
  `$.getJSON`, JSONP, `success`/`error`/`complete` callbacks) is preserved;
  transport is modernized.
- **`data()` is WeakMap-backed.** Values live off-node via `Symbol` + `WeakMap`,
  GC’d on removal — no leaks, no visible expando.
- **Dropped:** Zepto `ie`/`ios3`, deprecated `$.fn.live`/`die` (use
  `on`/`off` delegation).

## Migrating

Mepto is designed as a **progressive bridge** — jQuery → Mepto is near drop-in,
Mepto → vanilla JS is phased via bridge APIs that mirror the native DOM.

| Path                                                                         | Start here                         |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| **jQuery → Mepto** (install + drop-in + known differences)                   | `skills/jquery-to-mepto/SKILL.md`  |
| **Mepto → Vanilla JS** (selector / `classList` / `attrs` / `styles` bridges) | `skills/mepto-to-vanilla/SKILL.md` |

For LLMs: load **one** skill at a time. Do not mix the two mappings in a single
prompt — `jquery-to-mepto` first, then `mepto-to-vanilla` after the port is
green. Each skill contains a copy-paste prompt template and verification steps
(`tools/llm-test-harness --compare` diffs Mepto vs jQuery).

## Examples

Runnable pages served by the dev server (`examples/`):

- `examples/todo/` — TodoMVC-parity todo app exercising the real API surface
  (delegation, `$.Callbacks`, `localStorage`, edit-in-place)
- `examples/mlick/`, `examples/pokemon/`, `examples/snow/`, etc.

## Bundles

`npm run build` emits to `dist/`:

| File             | Format | Use                                  |
| ---------------- | ------ | ------------------------------------ |
| `meptos.js`      | ESM    | Bundlers (`import`), modern browsers |
| `meptos.umd.cjs` | UMD    | `<script>` tags, CommonJS `require`  |
| `meptos.d.ts`    | Types  | TypeScript editor/CLI support        |

Plus sourcemaps. Minified via esbuild; `npm run size` enforces a 15 KB budget per bundle.

## Bundled Shopify ThemeKit fork (for Timber 1.0 / Mimber)

Mepto bundles **ThemeKit** (`vendor/themekit`, fork [`oreoorbitz/themekit`](https://github.com/oreoorbitz/themekit), Go) for Shopify 1.0 themes (Mimber/Timber `assets/layout/snippets/templates/config`) where `shopify theme` 2.0 CLI is incompatible. ThemeKit is used only for `watch`/`deploy` — JS bundling stays Vite.

```bash
git clone https://github.com/oreoorbitz/themekit vendor/themekit  # already vendored
npm run themekit:build   # go build -o vendor/themekit/bin/theme ./vendor/themekit/...
npm run themekit -- watch --config ../Mimber/config.yml
```

See `tools/themekit.mjs` (prefers `vendor/themekit/bin/theme` → `@shopify/themekit` fallback) and `oreoorbitz/themekit` for Go customization.

## Contributing

Mepto is an active TypeScript rewrite — contributions welcome. For dev setup,
test pyramid, CI gates, and how to plug in an AI assistant, see
**[CONTRIBUTING.md](CONTRIBUTING.md)**. For agent routing, see
**[AGENTS.md](AGENTS.md)**.

Bugs and feature requests: [issue tracker][issues].

[zepto]: https://github.com/madrobby/zepto
[issues]: https://github.com/oreoorbitz/Mepto/issues
