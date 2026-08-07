---
name: mepto-to-vanilla
description: Migrate Mepto code to plain vanilla JS via the bridge APIs. Use when removing Mepto in phases. LLM-focused mapping for selectors, classList, attrs, styles, and migration sequencing.
---

# Mepto → Vanilla JS

Mepto ships **intentional bridge APIs** shaped like the native DOM so an LLM can make the smallest possible textual leap. Migrate in three small phases — each is a find-and-replace that stays correct even before the next phase.

Do not load `skills/jquery-to-mepto/SKILL.md` at the same time — this skill assumes the codebase is already on Mepto.

## Phase overview

```
jQuery                          Mepto (bridge)                           Vanilla DOM
$('.x').addClass('a')     →  $('.x').classList.add('a')            →  el.classList.add('a')
$('#id').addClass('c')    →  mepto.getElementById('id').classList.add('c')  →  document.getElementById('id').classList.add('c')
$('.x').attr('role','r')  →  $('.x').attrs.set('role','r')         →  el.setAttribute('role','r')
$('.x').css('color','red')→  $('.x').styles.set('color','red')     →  el.style.setProperty('color','red')
```

Phases: **1) Selectors → 2) classList/attrs/styles → 3) Drop Mepto**. Each phase is safe to ship on its own.

## Phase 1 — Selector bridges

Same signatures as native, returning a `MeptoCollection` so chaining keeps working.

```js
// Mepto
mepto.getElementById('my-id').addClass('active')
mepto.getElementsByClassName('item').hide()
mepto.getElementsByTagName('div').addClass('box')
mepto.getElementsByClassName('btn', contextEl).on('click', handler)

// → Vanilla
document.getElementById('my-id').classList.add('active')
document.querySelectorAll('.item').forEach(el => (el.style.display = 'none'))
document.querySelectorAll('div').forEach(el => el.classList.add('box'))
contextEl.querySelectorAll('.btn').forEach(el => el.addEventListener('click', handler))
```

Reference:

| Mepto                                          | Vanilla                                                                                    | Notes                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `mepto.getElementById(id, context?)`           | `document.getElementById(id)` _or_ `context.getElementById(id)` if `context` is `Document` | Guarded: returns empty collection if `Document` has no `getElementById` |
| `mepto.getElementsByClassName(name, context?)` | `context.querySelectorAll('.'+name)` (prefer `querySelectorAll` in vanilla)                | Mepto uses live `getElementsByClassName` internally                     |
| `mepto.getElementsByTagName(name, context?)`   | `context.querySelectorAll(name)`                                                           | Same                                                                    |

> LLM tip: emit `querySelectorAll` in vanilla for the class/tag cases — it handles context elements uniformly.

Implementation is in `src/mepto.ts:718` (`getElementsByClassName`), `:740` (`getElementsByTagName`), `:760` (`getElementById`); types `src/types.ts:87`.

## Phase 2 — classList / attrs / styles bridges

These live on `$.fn` as getters (`Object.defineProperty`) so existing jQuery-style code (`addClass`/`attr`/`css`) can be swapped with minimal syntax:

```js
// Before (jQuery-style, still Mepto)
$('.btn').addClass('active').removeClass('stale')
$('.item').attr('role', 'tab')
$('.hero').css('color', 'red')

// After (bridge — LLM-friendly, still Mepto, same chaining)
$('.btn').classList.add('active').classList.remove('stale')
$('.item').attrs.set('role', 'tab')
$('.hero').styles.set('color', 'red')
```

### `$.fn.classList` — DOMTokenList-shaped bridge

Mutating methods apply to **every** element and return the collection for chaining. Read methods reflect the **first** element. Unlike native `DOMTokenList`, space-separated tokens are split (mirroring `addClass`), so `.classList.add('a b')` adds both and never throws on `''`.

```js
$('.item').classList.add('active').classList.remove('stale').classList.toggle('collapsed').classList.replace('old','new')
$('.item').classList.contains('active')   // boolean (first element)
$('.item').classList.length                // number
$('.item').classList.value                 // string (full className) — also setter: .classList.value = 'a b'
$('.item').classList.item(0)              // string | null
$('.item').classList.toString()           // string
$('.item').classList.forEach((value, key) => { … })
$('.item').classList.entries().keys().values() // Iterators (first element)
```

| Mepto                                  | Vanilla                                  | Returns                             |
| -------------------------------------- | ---------------------------------------- | ----------------------------------- |
| `.classList.add(...tokens)`            | `el.classList.add(...tokens)`            | Mepto coll                          |
| `.classList.remove(...tokens)`         | `el.classList.remove(...tokens)`         | Mepto coll                          |
| `.classList.toggle(token, force?)`     | `el.classList.toggle(token, force)`      | Mepto coll                          |
| `.classList.replace(old, nw)`          | `el.classList.replace(old, nw)`          | Mepto coll                          |
| `.classList.contains(token)`           | `el.classList.contains(token)`           | boolean                             |
| `.classList.item(i)`                   | `el.classList.item(i)`                   | string \| null                      |
| `.classList.length`                    | `el.classList.length`                    | number                              |
| `.classList.value`                     | `el.classList.value`                     | string (setter maps to `className`) |
| `.classList.toString()`                | `el.classList.toString()`                | string                              |
| `.classList.forEach(fn)`               | `el.classList.forEach(fn)`               | void                                |
| `.classList.entries()/keys()/values()` | `el.classList.entries()/keys()/values()` | Iterator                            |

Type: `src/types.ts:132` (`MeptoClassList`); impl `src/mepto.ts:2224` (`Object.defineProperty $.fn classList`).

LLM workflow for classes:

```
$('.item').addClass('active').hasClass('active')
  → $('.item').classList.add('active').classList.contains('active')   // Mepto bridge
  → document.querySelectorAll('.item').forEach(el => el.classList.add('active'))
    document.querySelectorAll('.item')[0].classList.contains('active')   // Vanilla
```

### `$.fn.attrs` — attribute bridge

Mirrors `getAttribute`/`setAttribute`/`removeAttribute`. `set` returns collection for chaining; `get` reads first element; `null`/`undefined` as value removes the attr; `remove` splits whitespace.

```js
$('.item').attrs.set('role', 'tab').attrs.set('aria-selected', 'true')
$('.item').attrs.set({ role: 'tab', tabindex: '0' }) // object map
$('.item').attrs.remove('role tabindex') // whitespace-split
$('.item').attrs.get('role') // → 'tab' | undefined
```

| Mepto                                         | Vanilla                                      | Returns         |
| --------------------------------------------- | -------------------------------------------- | --------------- |
| `.attrs.get(name)`                            | `el.getAttribute(name) ?? undefined`         | string \| undef |
| `.attrs.set(name, value)` / `.attrs.set({…})` | `el.setAttribute(name, value)` (null→remove) | Mepto coll      |
| `.attrs.remove(names)`                        | `el.removeAttribute(name)` per name          | Mepto coll      |

Type: `src/types.ts:149` (`MeptoAttrs`); impl `src/mepto.ts:2315`.

### `$.fn.styles` — inline-style bridge

Mirrors `style.setProperty`/`removeProperty`/computed read. `set` returns collection; `get` reads first element (inline then computed). camelCase or dashed keys both work; numeric `px` suffix added except for unit-less props; `null`/'' removes.

```js
$('.hero').styles.set('color', 'red').styles.set({ marginTop: 12 })
$('.hero').styles.get('color') // → 'red' | undefined (computed fallback)
$('.hero').styles.set('color', null) // removes
```

| Mepto                                           | Vanilla                                                  | Returns         |
| ----------------------------------------------- | -------------------------------------------------------- | --------------- |
| `.styles.get(name)`                             | `getComputedStyle(el).getPropertyValue(dashed)`          | string \| undef |
| `.styles.set(name, value)` / `.styles.set({…})` | `el.style.setProperty(dashed, value)` / `removeProperty` | Mepto coll      |

Type: `src/types.ts:166` (`MeptoStyles`); impl follows `attrs` pattern in `src/mepto.ts`.

## Phase 3 — Drop Mepto

After phases 1–2 the remaining Mepto calls are thin wrappers. Replace each collection call with an element loop:

```js
// Mepto (phases 1+2 done)
mepto.getElementsByClassName('btn').classList.add('active')

// Vanilla
document.querySelectorAll('.btn').forEach(el => el.classList.add('active'))
```

For single-element reads, use `[0]`:

```js
// Mepto
$('.hero').styles.get('color')
// Vanilla
getComputedStyle(document.querySelector('.hero')).getPropertyValue('color')
```

Events: `.on(event, selector, handler)` (delegation) → `addEventListener` on a container + `event.target.closest(selector)` guard; `.trigger` → `dispatchEvent(new CustomEvent(...))`. Keep delegation — a single container listener scales better than per-element listeners.

## LLM prompt template

```
Convert this Mepto file to plain vanilla JS using the Mepto bridges as a guide:

Selectors:
  - mepto.getElementById(id) → document.getElementById(id)
  - mepto.getElementsByClassName(c) → document.querySelectorAll('.' + c)
  - mepto.getElementsByTagName(t) → document.querySelectorAll(t)

Bridges (on $.fn):
  - .classList.add(c) → el.classList.add(c)
  - .classList.remove(c) → el.classList.remove(c)
  - .classList.toggle(c) / .classList.toggle(c, force) → el.classList.toggle(c, force)
  - .classList.contains(c) → el.classList.contains(c)
  - .classList.replace(old,nw) → el.classList.replace(old,nw)
  - .attrs.get(n) → el.getAttribute(n) ?? undefined
  - .attrs.set(n,v) → el.setAttribute(n,v) (null/undefined → removeAttribute)
  - .attrs.remove(n) → el.removeAttribute(n) per whitespace name
  - .styles.get(n) → getComputedStyle(el).getPropertyValue(dasherize(n))
  - .styles.set(n,v) → el.style.setProperty(dasherize(n), v) (numeric→px except unitless, null→remove)

Rules:
  - For collections, loop: document.querySelectorAll(sel).forEach(el => …)
  - For reads (contains/get/length), use [0]: element = document.querySelector(sel); if (element) element.classList.contains(c)
  - Preserve delegation via closest()
  - Do not invent new APIs — only translate the bridges above

Apply to the file below.
```

## What NOT to translate yet

`ajax`/`Callbacks`/`Deferred`/`detect`/`touch`/`gesture`/`fx` have no bridge — port them with dedicated logic or keep Mepto for those files. Animations should move to CSS `transform`/`opacity` + `requestAnimationFrame` (see `skills/perf/SKILL.md`), not `style.top` loops.
