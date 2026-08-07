---
name: jquery-to-mepto
description: Migrate jQuery code to Mepto (drop-in). Use when porting an existing jQuery codebase or auditing jQuery-compat. LLM-focused mapping plus known differences.
---

# jQuery → Mepto

Mepto is a jQuery-compatible DOM library for evergreen browsers. **If you use jQuery, you already know Mepto** — most code runs unchanged. This skill helps an LLM port jQuery to Mepto and flag the few intentional divergences.

Load `skills/mepto-to-vanilla/SKILL.md` only after this phase is done — do not mix the two mappings in one prompt.

## Install

```sh
npm install meptos
# pnpm add meptos / yarn add meptos
```

ES module:

```ts
import { $ } from 'meptos'
$('#app').addClass('ready').on('click', 'button', handleClick)
```

Browser / `<script>` tag (exposes `window.$` + `window.mepto`):

```html
<script src="https://cdn.jsdelivr.net/npm/meptos/dist/meptos.umd.cjs"></script>
<script>
  $(function () {
    $('#app').addClass('ready')
  })
</script>
```

## What works unchanged

All modules in the build are jQuery-compatible. Most call sites port by swapping the import:

| jQuery                                                                                                                | Mepto                      | Notes                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `$('selector')`                                                                                                       | `$('#app')` / `$('.item')` | Same selector engine + pseudo extensions (`:first`, `:visible`, etc. via `selector` module) |
| `$.fn` traversal / manipulation (`find`, `parent`, `children`, `closest`, `append`, `html`, `text`, `attr`, `css`, …) | identical                  | Chaining preserved                                                                          |
| `on`/`off`/`trigger`/`one`, `delegate`/`undelegate`, event shorthands (`click`, `submit`, …)                          | identical                  | Delegation `on(event, selector, handler)` works                                             |
| `serialize`/`serializeArray`                                                                                          | identical                  | `form` module                                                                               |
| `$.Callbacks`, `$.Deferred`, `$.when`                                                                                 | identical                  | `callbacks`/`deferred` modules                                                              |
| `animate`/`show`/`hide`/`fade*`/`delay`/`queue`                                                                       | identical                  | `fx`/`fx_methods`                                                                           |

The test suite (`test/index.html`, 234 assertions) locks this surface — run `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` to verify.

## Known differences (flag these)

Only these need code changes. An LLM should not invent others.

1. **AJAX is `fetch`-backed, not `XMLHttpRequest`.** Public surface `$.ajax`/`$.get`/`$.post`/`$.getJSON`/`ajaxJSONP` + `success`/`error`/`complete` callbacks is preserved, but transport is `fetch`. `xhr` argument to callbacks is a minimal `XMLHttpRequest`-like shim, not a real XHR. `beforeSend` receiving a real `xhr` to mutate is not supported the same way. JSONP still works via dynamic `<script>`.
2. **`data()` is WeakMap-backed, not an expando.** `$(el).data('key', obj)` stores off-node via `Symbol` + `WeakMap`. GC-safe, not visible on `el.dataset`/`el._data`. Reading falls back to `data-*` attributes only on first access — `removeData` then re-read re-hydrates from the attribute (jQuery-parity quirk retained).
3. **Dropped modules / APIs.** `ie`, `ios3` removed. Deprecated jQuery `$.fn.live`/`die` removed (use `on`/`off`). Zepto-era `assets` module ships nothing and is not imported.
4. **Evergreen browsers only.** No IE, legacy Edge, or Safari < 14 polyfills. Native `WeakMap`, `AbortController`, `fetch`, `classList`, `closest`, `dataset`, `requestAnimationFrame` assumed. Vendor-prefix dance (e.g. `MSGesture`/`MSPointer`) removed.

No other jQuery API is intentionally dropped. If a method type-checks (see `src/types.ts` `MeptoCollection`/`MeptoStatic`) it is intended to be compat.

## LLM porting prompt

```
Port this jQuery file to Mepto. Keep all selectors, chaining, and event delegation as-is.
Only change:
  - import: import { $ } from 'meptos' (or script tag to meptos.umd.cjs)
  - if the file uses $.ajax / $.get / $.getJSON, keep the same call shape — transport is now fetch but callbacks are identical
  - if it reads data() expando properties directly on the element, switch to $(el).data()
  - replace $.fn.live / die with on / off delegation

Do not change class APIs (addClass etc.) yet — that is the next phase (mepto-to-vanilla).
Return a diff, not a rewrite.
```

## Verify the port (before touching class APIs)

```bash
# one-off snippet
node tools/llm-test-harness/bin/mepto-test.js \
  --code="return $('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" --json

# batch + auto-diff against jQuery 3.7 (fastest compat check)
node tools/llm-test-harness/bin/mepto-test.js --batch=cases.json --compare --json
# cases.json: { "cases": [{ "name":"addClass", "code":"return $('.x').addClass('a').hasClass('a')", "html":"<div class='x'></div>" }] }
# Output: summary { total, matched, differed } + per-case mepto vs jquery. 0 exit = all matched.
```

Once `--compare` shows `matched === total`, the jQuery→Mepto phase is done. Next: `skills/mepto-to-vanilla/SKILL.md` for the bridge APIs.
