# Mepto Migration Guide

Tools for progressively moving from jQuery to plain vanilla JavaScript using Mepto as a bridge, with assistance from an LLM.

---

## Core Selector Bridge Methods

These standalone helpers expose the same signatures as their native DOM methods, making them straightforward for an LLM to map directly to vanilla JS.

### `mepto.getElementById(id, context?)`

Returns a Mepto collection containing the element with the given ID.

```javascript
// Mepto
mepto.getElementById('my-id').addClass('active')

// → Plain JS
document.getElementById('my-id').classList.add('active')
```

### `mepto.getElementsByClassName(className, context?)`

Returns a Mepto collection of elements with the given class.

```javascript
// Mepto
mepto.getElementsByClassName('item').hide()

// → Plain JS
document.querySelectorAll('.item').forEach(el => el.classList.add('hidden'))
```

### `mepto.getElementsByTagName(tagName, context?)`

Returns a Mepto collection of elements with the given tag name.

```javascript
// Mepto
mepto.getElementsByTagName('div').addClass('box')

// → Plain JS
document.querySelectorAll('div').forEach(el => el.classList.add('box'))
```

> **LLM prompt tip:** When converting Mepto selectors to vanilla JS, prefer `document.querySelectorAll()` for class and tag lookups — it handles context elements directly and is more widely supported than the older `getElementsByClassName`/`getElementsByTagName` APIs.

---

## `$.fn.classList` — Direct DOMTokenList Bridge

Most jQuery class methods do not map 1:1 to their vanilla counterparts. Mepto's `classList` bridge exposes the native `DOMTokenList` API on every Mepto collection, so an LLM can make the smallest possible leap: just drop `.classList.` in the middle of an expression.

### Why this pattern?

```javascript
// jQuery: method chain breaks at class ops
$('.btn').addClass('active').removeClass('stale')

// Plain DOM: method chain stays intact
el.classList.add('active')
el.classList.remove('stale')

// Mepto: same chain pattern as plain DOM
$('.btn').classList.add('active').classList.remove('stale')
```

### All available methods

All mutating methods (`add`, `remove`, `toggle`, `replace`) return the Mepto collection, enabling chained calls:

```javascript
$('.item')
  .classList.add('active')
  .classList.remove('stale')
  .classList.toggle('collapsed')
  .classList.replace('old', 'new')
```

**Read methods** operate on the first element in the collection:

```javascript
$('.item').classList.contains('active')   // boolean
$('.item').classList.length                // number
$('.item').classList.value                 // string (full className)
$('.item').classList.item(0)              // string | null
$('.item').classList.toString()           // string
```

**Iteration:**

```javascript
$('.item').classList.forEach((value, key) => { ... })
$('.item').classList.entries()   // Iterator
$('.item').classList.keys()      // Iterator
$('.item').classList.values()     // Iterator
```

### LLM Translation Workflow

```
jQuery:     $('.item').addClass('active').hasClass('active')
               ↓ LLM recognizes .addClass() / .hasClass()
Mepto:      $('.item').classList.add('active').classList.contains('active')
               ↓ LLM recognizes .classList.* bridge
Vanilla JS: document.querySelectorAll('.item').forEach(
              el => { el.classList.add('active') }
            )
            document.querySelectorAll('.item')[0].classList.contains('active')
```

### Complete LLM Prompt Template

When asking an LLM to convert jQuery to vanilla JS using Mepto:

```
Convert this jQuery code to plain vanilla JavaScript.
Use Mepto as an intermediate step if helpful:
  - mepto.getElementById(id)     → document.getElementById(id)
  - mepto.getElementsByClassName(c) → document.querySelectorAll('.' + c)
  - mepto.getElementsByTagName(t)   → document.querySelectorAll(t)
  - $('selector').classList.add(c) → el.classList.add(c)
  - $('selector').classList.remove(c) → el.classList.remove(c)
  - $('selector').classList.toggle(c) → el.classList.toggle(c)
  - $('selector').classList.contains(c) → el.classList.contains(c)

Apply the changes directly to the code below.
```

---

## Migration Sequence

### Phase 1 — Replace selectors with Mepto helpers

```javascript
// Before (jQuery)
$('#header').addClass('scrolled')
$('.btn').on('click', handler)
$('input[name=email]').val()

// After (Mepto — same selectors, same chaining)
mepto.getElementById('header').classList.add('scrolled')
mepto.getElementsByClassName('btn').on('click', handler)
mepto.getElementById('email-input').val()
```

### Phase 2 — Replace class mutations with `.classList`

```javascript
// Before (Mepto, jQuery-style class ops)
$('.btn').addClass('active').removeClass('disabled')

// After (Mepto, direct classList — LLM-friendly)
$('.btn').classList.add('active').classList.remove('disabled')
```

### Phase 3 — Drop Mepto, use plain DOM

```javascript
// Before (Mepto)
mepto.getElementsByClassName('btn').classList.add('active')

// After (Plain JS — direct from Mepto translation)
document.querySelectorAll('.btn').forEach(el => el.classList.add('active'))
```

---

## Method Reference

### Selector Bridge Methods

| Mepto | Vanilla JS | Notes |
|-------|-----------|-------|
| `mepto.getElementById(id)` | `document.getElementById(id)` | |
| `mepto.getElementsByClassName(name)` | `document.querySelectorAll('.' + name)` | Prefer `querySelectorAll` in plain JS |
| `mepto.getElementsByTagName(name)` | `document.querySelectorAll(name)` | Prefer `querySelectorAll` in plain JS |

### classList Bridge Methods (on `$.fn`)

| Mepto | Vanilla JS | Returns |
|-------|-----------|--------|
| `.classList.add(name)` | `el.classList.add(name)` | Mepto collection |
| `.classList.remove(name)` | `el.classList.remove(name)` | Mepto collection |
| `.classList.toggle(name)` | `el.classList.toggle(name)` | Mepto collection |
| `.classList.toggle(name, force)` | `el.classList.toggle(name, force)` | Mepto collection |
| `.classList.replace(old, new)` | `el.classList.replace(old, new)` | Mepto collection |
| `.classList.contains(name)` | `el.classList.contains(name)` | boolean |
| `.classList.item(index)` | `el.classList.item(index)` | string \| null |
| `.classList.length` | `el.classList.length` | number |
| `.classList.value` | `el.classList.value` | string |
| `.classList.toString()` | `el.classList.toString()` | string |
| `.classList.forEach(fn)` | `el.classList.forEach(fn)` | void |
| `.classList.entries()` | `el.classList.entries()` | Iterator |
| `.classList.keys()` | `el.classList.keys()` | Iterator |
| `.classList.values()` | `el.classList.values()` | Iterator |
