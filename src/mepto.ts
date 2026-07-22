//     mepto.js
//     (c) 2010-2017 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoCollection, type MeptoStatic, type PlainObject } from './types'

const mepto: MeptoStatic = (function (): MeptoStatic {
  let $: MeptoStatic = undefined as unknown as MeptoStatic
  const emptyArray: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const filter = Array.prototype.filter
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const slice = Array.prototype.slice
  // Typed view of Array.prototype.reduce for the fn.reduce wrapper — calling
  // the untyped method resolves to an overload that requires initialValue.
  const arrayReduce: (
    this: unknown[],
    callback: (
      previousValue: unknown,
      currentValue: unknown,
      currentIndex: number,
      array: unknown[]
    ) => unknown,
    initialValue?: unknown
  ) => unknown = Array.prototype.reduce
  const document = window.document
  // perf: Map for this churn-heavy string-keyed cache — get/set lookups avoid
  // Object.prototype-chain walks and dictionary-mode transitions (R2).
  const elementDisplay = new Map<string, string>()
  const cssNumber: Record<string, number> = {
    'column-count': 1,
    columns: 1,
    'font-weight': 1,
    'line-height': 1,
    opacity: 1,
    'z-index': 1,
    zoom: 1,
  }
  const fragmentRE = /^\s*<(\w+|!)[^>]*>/
  const singleTagRE = /^<(\w+)\s*\/?>(?:<\/\1>|)$/
  const tagExpanderRE = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi
  const rootNodeRE = /^(?:body|html)$/i
  const capitalRE = /([A-Z])/g
  const doubleColonRE = /::/g
  const upperUpperLowerRE = /([A-Z]+)([A-Z][a-z])/g
  const lowerDigitUpperRE = /([a-z\d])([A-Z])/g
  const underscoreRE = /_/g

  const methodAttributes = ['val', 'css', 'html', 'text', 'data', 'width', 'height', 'offset']
  // perf: O(1) Set membership instead of an Array.includes scan per fragment property
  const methodAttributesSet = new Set<string>(methodAttributes)

  const adjacencyOperators = ['after', 'prepend', 'before', 'append']
  const table = document.createElement('table')
  const tableRow = document.createElement('tr')
  const containers: Record<string, Element> = {
    tr: document.createElement('tbody'),
    tbody: table,
    thead: table,
    tfoot: table,
    td: tableRow,
    th: tableRow,
    '*': document.createElement('div'),
  }
  const simpleSelectorRE = /^[\w-]*$/
  const toString = Object.prototype.toString

  // Internal type of the `mepto` namespace object (exported as `$.mepto`).
  // `Z` is called without `new` and carries a `prototype` (wired to $.fn
  // below); `init` is part of the plugin-overridable surface.
  interface MeptoNamespace {
    matches(element: Element, selector: string): boolean
    fragment(html: string, name?: string, properties?: PlainObject | null): ArrayLike<Element>
    Z: {
      (dom?: ArrayLike<Element> | null, selector?: string): MeptoCollection
      prototype: MeptoCollection
    }
    isZ(object: unknown): boolean
    init(
      selector:
        | string
        | Element
        | ArrayLike<Element>
        | ((...args: unknown[]) => unknown)
        | null
        | undefined,
      context?: Element | Document | string
    ): MeptoCollection
    qsa(element: ParentNode, selector: string): Element[]
    getElementById(id: string, context?: ParentNode): MeptoCollection
    getElementsByClassName(className: string, context?: ParentNode): MeptoCollection
    getElementsByTagName(tagName: string, context?: Document | Element): MeptoCollection
    uniq<T>(array: ArrayLike<T>): T[]
    deserializeValue(value: string): unknown
  }
  const mepto = {} as MeptoNamespace
  const propMap: Record<string, string> = {
    tabindex: 'tabIndex',
    readonly: 'readOnly',
    for: 'htmlFor',
    class: 'className',
    maxlength: 'maxLength',
    cellspacing: 'cellSpacing',
    cellpadding: 'cellPadding',
    rowspan: 'rowSpan',
    colspan: 'colSpan',
    usemap: 'useMap',
    frameborder: 'frameBorder',
    contenteditable: 'contentEditable',
  }
  const isArray = Array.isArray

  /**
   * Checks if `element` matches the given CSS `selector`.
   * Uses the standard `Element.matches` API.
   */
  mepto.matches = function (element: Element, selector: string): boolean {
    if (!selector || !element || element.nodeType !== 1) return false
    return element.matches(selector)
  }

  /**
   * Returns the internal JavaScript [[Class]] name of `obj` as a lowercase string
   * (e.g. `"array"`, `"function"`, `"date"`, `"regexp"`, `"object"`).
   * Returns `"null"` or `"undefined"` for those respective values.
   */
  function type(obj: unknown): string {
    if (obj === null) return 'null'
    if (typeof obj === 'undefined') return 'undefined'

    const primitiveType = typeof obj
    const isObject = primitiveType === 'object'

    const className = toString.call(obj)
    const objectType =
      typeof className === 'string' ? className.slice(8, -1).toLowerCase() : 'object'

    return isObject ? objectType : primitiveType
  }

  /** Checks whether `value` is a callable function (including async/generator). */
  function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function'
  }

  /** Checks whether `obj` is the `Window` global object. */
  function isWindow(obj: unknown): obj is Window {
    return obj instanceof Window
  }

  /** Checks whether `obj` is a `Document` node. */
  function isDocument(obj: unknown): obj is Document {
    return obj instanceof Document
  }

  /**
   * Checks whether `obj` is a non-null object that is not an array.
   * Returns `true` for plain objects, class instances, `Window`, `Document`, etc.
   */
  function isObject(obj: unknown): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
  }
  /**
   * Checks if `obj` is a "plain" object — an object created by `{}` or
   * `Object.create(null)` whose direct prototype is `Object.prototype`.
   * Returns `false` for arrays, `Window`, `Document`, and class instances.
   */
  function isPlainObject(obj: unknown): obj is PlainObject {
    if (!isObject(obj) || isWindow(obj)) return false
    const proto = Object.getPrototypeOf(obj)
    return proto === null || proto === Object.prototype
  }

  /**
   * Checks whether `obj` is an "array-like" collection — i.e., something that
   * can be iterated with a numeric index from `0` to `length - 1`.
   *
   * Returns `true` for arrays, empty array-likes, and objects with a numeric
   * `length` where index `length - 1` exists.
   * Returns `false` for `null`, `undefined`, functions, Window, strings,
   * numbers, booleans, and other non-array-like values.
   */
  function likeArray(obj: unknown): obj is ArrayLike<unknown> {
    // Fast path: native arrays are always array-like
    if (isArray(obj)) return true

    // Filter out primitives, null, and functions.
    // typeof obj !== 'object' safely excludes strings, numbers, booleans, and functions.
    // !obj excludes null (typeof null === 'object').
    if (!obj || typeof obj !== 'object') return false

    // The Window object is an object with a `length` property, but it is not array-like.
    if (isWindow(obj)) return false

    // Check for a valid `length` property indicating array-like behavior
    const length = (obj as ArrayLike<unknown>).length
    if (length === 0) return true

    // Ensure length is a valid number and the last expected index exists
    return typeof length === 'number' && length > 0 && length - 1 in obj
  }

  /**
   * Filters out `null` and `undefined` values from an array-like object.
   * Uses a type guard to narrow the return type to non-nullable values.
   */
  function compact<T>(array: ArrayLike<T | null | undefined>): T[] {
    // perf: manual loop — Array.prototype.filter.call on a non-array array-like
    // misses V8's elements-kind fast paths and takes the generic slow path.
    const result: T[] = []
    for (let i = 0; i < array.length; i++) {
      const item = array[i]
      if (item != null) result.push(item)
    }
    return result
  }

  /**
   * Flattens a single level of nested arrays.
   * Returns an empty array for empty or falsy input to ensure a consistent return type.
   */
  function flatten<T>(array: (T | T[])[]): T[] {
    if (!array || array.length === 0) return []
    // perf: simple loop — the old `$.fn.concat.apply([], array)` path re-checked
    // mepto.isZ on every item via the fn.concat wrapper.
    const result: T[] = []
    for (let i = 0; i < array.length; i++) {
      const item = array[i]
      if (isArray(item)) {
        for (let j = 0; j < item.length; j++) result.push(item[j])
      } else if (mepto.isZ(item)) {
        // Spread MeptoCollection items element-by-element, matching the old
        // fn.concat behavior (which flattened them via toArray()).
        const collection = item as unknown as MeptoCollection
        for (let j = 0; j < collection.length; j++) result.push(collection[j] as T)
      } else {
        result.push(item)
      }
    }
    return result
  }

  /** Uncached core of `camelize` (see below). */
  function camelizeCore(str: string): string {
    return str.replace(/-+(.)?/g, (_match: string, chr?: string): string =>
      chr ? chr.toUpperCase() : ''
    )
  }

  // perf: memoized — css()/data() call these per operation and each uncached
  // call allocates several intermediate strings. The cache is unbounded, but
  // the property-name key space is small.
  const camelizeCache = new Map<string, string>()

  /**
   * Converts a dash-separated string to camelCase (memoized).
   * Handles leading, trailing, and consecutive dashes gracefully.
   */
  function camelize(str: string): string {
    let result = camelizeCache.get(str)
    if (result === undefined) {
      result = camelizeCore(str)
      camelizeCache.set(str, result)
    }
    return result
  }

  /** Uncached core of `dasherize` (see below). */
  function dasherizeCore(str: string): string {
    if (!str) return str
    return str
      .replace(doubleColonRE, '/') // `::` → `/` (namespace separator)
      .replace(upperUpperLowerRE, '$1_$2') // `XMLParser` → `XML_Parser`
      .replace(lowerDigitUpperRE, '$1_$2') // `fooBar1B` → `foo_Bar1_B`
      .replace(underscoreRE, '-') // `_` → `-`
      .toLowerCase()
  }

  // perf: memoized — see camelize above.
  const dasherizeCache = new Map<string, string>()

  /**
   * Converts a camelCase or PascalCase string to a dash-separated lowercase
   * string (e.g. `backgroundColor` → `background-color`, `XMLParser` →
   * `xml-parser`).  The `::` token is treated as a namespace separator and
   * converted to `/`. Results are memoized.
   */
  function dasherize(str: string): string {
    let result = dasherizeCache.get(str)
    if (result === undefined) {
      result = dasherizeCore(str)
      dasherizeCache.set(str, result)
    }
    return result
  }
  /**
   * Returns a new array with duplicate elements removed, preserving the
   * order of first occurrence. Uses a `Set` for O(n) lookups instead of
   * repeated `indexOf` scans (which would be O(n²)).
   */
  const uniq = function <T>(array: ArrayLike<T>): T[] {
    if (!array || array.length === 0) return []
    const seen = new Set<T>()
    // perf: manual loop — filter.call on a non-array array-like misses V8's
    // elements-kind fast paths.
    const result: T[] = []
    for (let i = 0; i < array.length; i++) {
      const item = array[i]
      if (!seen.has(item)) {
        seen.add(item)
        result.push(item)
      }
    }
    return result
  }

  /**
   * Iterates over the whitespace-separated class tokens in `name`, invoking
   * `callback` for each. Empty tokens are skipped because the native
   * `classList` methods throw on empty strings.
   *
   * @param name     - Space-separated class names.
   * @param callback - Function called with each non-empty class token.
   */
  function eachClass(name: string, callback: (klass: string) => void): void {
    const classes = name.split(/\s+/)
    for (let i = 0; i < classes.length; i++) {
      const klass = classes[i]
      if (klass) callback(klass)
    }
  }

  /**
   * Appends "px" to a numeric `value` when the CSS property identified
   * by `name` is **not** a unitless property (as listed in `cssNumber`).
   *
   * @param name  - A CSS property name (camelCase or dash-case).
   * @param value - The property value, typically a number or string.
   * @returns The value with "px" appended when appropriate.
   */
  function maybeAddPx(name: string, value: string | number): string | number {
    return typeof value === 'number' && !cssNumber[dasherize(name)] ? value + 'px' : value
  }

  /**
   * Returns the default CSS `display` value for the given `nodeName`.
   * Results are cached in `elementDisplay` so each tag is only probed once.
   *
   * @param nodeName - The DOM element tag name (e.g. `"div"`, `"span"`).
   * @returns The default `display` value (e.g. `"block"`, `"inline"`).
   */
  function defaultDisplay(nodeName: string): string {
    // perf: Map.get hit check — the cached value is returned directly.
    let display = elementDisplay.get(nodeName)
    if (display === undefined) {
      const element = document.createElement(nodeName)
      document.body.appendChild(element)

      display = getComputedStyle(element, '').getPropertyValue('display')

      const parent = element.parentNode
      if (parent) {
        parent.removeChild(element)
      }

      if (display === 'none') {
        display = 'block'
      }

      elementDisplay.set(nodeName, display)
    }
    return display
  }

  /**
   * Safely sets innerHTML on an element. This utility acts as a central
   * point for innerHTML assignments, making it easier to integrate with
   * Trusted Types or HTML sanitizers in the future.
   */
  function setInnerHTML(element: Element, html: string): void {
    element.innerHTML = html
  }

  /**
   * Safely retrieves a container element by its tag name.
   */
  function getContainer(name: string | undefined): Element {
    const key = name !== undefined && name in containers ? name : '*'
    return containers[key]
  }

  /**
   * Returns the child `Element` nodes of `element`, handling both nodes
   * that have a `.children` collection (Elements, Documents) and those
   * that don't (text nodes, etc.).
   *
   * @param element - The parent node whose children to retrieve.
   * @returns An array of child `Element` nodes.
   */
  function children(element: Node): Element[] {
    return element instanceof Element ? slice.call(element.children) : []
  }

  /**
   * Mepto collection constructor. Stores matched DOM elements as indexed
   * properties with a `length` and `selector` string.
   * Not called directly — use `mepto.Z()` which delegates here.
   *
   * @param dom      - Array-like list of matched elements.
   * @param selector - The CSS selector string that produced this collection.
   */
  // Constructor view of Z: `new Z(...)` builds a collection and `Z.prototype`
  // (wired to $.fn at the bottom of this module) is its prototype. The
  // implementation is an old-style constructor function; the cast only tells
  // TypeScript what `new Z(...)` produces — runtime is unchanged.
  interface ZConstructor {
    new (dom?: ArrayLike<Element> | null, selector?: string): MeptoCollection
    prototype: MeptoCollection
  }
  const Z = function (
    this: MeptoCollection & { selector?: string },
    dom?: ArrayLike<Element> | null,
    selector?: string
  ): void {
    const len = dom ? dom.length : 0
    for (let i = 0; i < len; i++) {
      if (dom) {
        ;(this as Record<number, Element>)[i] = dom[i]
      }
    }
    this.length = len
    this.selector = selector || ''
  } as unknown as ZConstructor

  /**
   * Parses an HTML string into DOM nodes, optionally applying properties.
   * Selects the correct container element (`<tbody>`, `<tr>`, `<div>`, etc.)
   * so the browser parses the fragment correctly.
   *
   * This method can be overridden in plugins.
   *
   * @param html       - The HTML string to parse.
   * @param name       - Optional tag name hint for container selection.
   * @param properties - Optional plain object of attributes/method-values to apply.
   * @returns An array-like collection of created DOM elements.
   */
  mepto.fragment = function (
    html: string,
    name: string | undefined,
    properties: PlainObject | null | undefined
  ): ArrayLike<Element> {
    let dom: ArrayLike<Element>

    // Fast path: a single empty or self-closing tag like <div>, <br/>
    const singleMatch = singleTagRE.exec(html)
    if (singleMatch) {
      dom = [document.createElement(singleMatch[1])]
    } else {
      // Expand implicit self-closing non-void tags: <foo bar/> → <foo bar></foo>
      html = html.replace(tagExpanderRE, '<$1></$2>')

      // Determine the right container so the browser parses the HTML correctly.
      // e.g. <tr> must live inside <tbody>, not a bare <div>.
      if (name === undefined) {
        const fragMatch = fragmentRE.exec(html)
        name = fragMatch ? fragMatch[1] : undefined
      }
      const container = getContainer(name)
      setInnerHTML(container, html)
      const childNodes = slice.call(container.childNodes) as Element[]
      dom = $.each(childNodes, function (this: Element) {
        container.removeChild(this)
      }) as ArrayLike<Element>
    }

    if (isPlainObject(properties)) {
      const nodes = $(dom as Element[]) // ArrayLike is fine at runtime; see filtered()

      // perf: Object.keys loop avoids the per-entry tuple arrays of Object.entries
      const keys = Object.keys(properties)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const value = properties[key]
        if (methodAttributesSet.has(key)) {
          const method = nodes[key as keyof MeptoCollection] as (val: unknown) => void
          method.call(nodes, value)
        } else {
          nodes.attr(key, value as string | number | null)
        }
      }
    }

    return dom
  }

  /**
   * Creates a new Mepto collection wrapping the given DOM nodes.
   * This method can be overridden in plugins.
   *
   * @param dom      - Array-like list of matched elements.
   * @param selector - The CSS selector string that produced this collection.
   * @returns A new Mepto collection instance.
   */
  mepto.Z = function (dom?: ArrayLike<Element> | null, selector?: string): MeptoCollection {
    return new Z(dom, selector)
  } as unknown as MeptoNamespace['Z'] // runtime functions already carry .prototype

  /**
   * Returns `true` if the given object is a Mepto collection instance.
   * This method can be overridden in plugins.
   *
   * @param object - Value to test.
   */
  mepto.isZ = function (object: unknown): boolean {
    return object instanceof mepto.Z
  }

  /**
   * Mepto's selector initializer — counterpart to jQuery's `$.fn.init`.
   * Accepts a CSS selector string, HTML fragment, DOM element, array,
   * function (DOMContentLoaded shortcut), or existing Mepto collection.
   *
   * This method can be overridden in plugins.
   *
   * @param selector - Selector string, element, array, function, or collection.
   * @param context  - Optional root element to scope the query.
   * @returns A Mepto collection.
   */
  mepto.init = function (
    selector:
      | string
      | Element
      | ArrayLike<Element>
      | ((...args: unknown[]) => unknown)
      | null
      | undefined,
    context?: Element | Document | string
  ): MeptoCollection {
    let dom: ArrayLike<Element> | null | undefined
    let finalSelector:
      | string
      | Element
      | ArrayLike<Element>
      | ((...args: unknown[]) => unknown)
      | null
      | undefined = selector

    if (!selector) {
      return mepto.Z()
    } else if (typeof selector === 'string') {
      const str = selector.trim()
      finalSelector = str
      // HTML fragment: create nodes from it
      // Note: In both Chrome 21 and Firefox 15, DOM error 12
      // is thrown if the fragment doesn't begin with <
      const fragMatch = str[0] === '<' ? fragmentRE.exec(str) : null
      if (fragMatch) {
        dom = mepto.fragment(str, fragMatch[1], context as PlainObject | null | undefined)
        finalSelector = null
      } else if (context !== undefined) {
        return $(context).find(str)
      } else {
        dom = mepto.qsa(document, str)
      }
    } else if (isFunction(selector)) {
      return $(document).ready(selector)
    } else if (mepto.isZ(selector)) {
      return selector as MeptoCollection
    } else {
      if (isArray(selector)) {
        dom = compact(selector as ArrayLike<Element | null | undefined>)
      } else if (isObject(selector)) {
        dom = [selector as Element]
        finalSelector = null
      } else {
        const fragMatch = fragmentRE.exec(String(selector))
        if (fragMatch) {
          dom = mepto.fragment(
            String(selector).trim(),
            fragMatch[1],
            context as PlainObject | null | undefined
          )
          finalSelector = null
        } else if (context !== undefined) {
          return $(context).find(selector as unknown as string)
        } else {
          dom = mepto.qsa(document, String(selector))
        }
      }
    }

    return mepto.Z(dom, finalSelector as string)
  }

  /**
   * The main Mepto factory function. Delegates to `mepto.init` so that
   * selector logic remains patchable in plugins.
   *
   * @param selector - Selector string, element, array, function, or collection.
   * @param context  - Optional root element to scope the query.
   * @returns A Mepto collection.
   */
  $ = function (
    selector:
      | string
      | Element
      | ArrayLike<Element>
      | ((...args: unknown[]) => unknown)
      | null
      | undefined,
    context?: Element | Document | string
  ): MeptoCollection {
    return mepto.init(selector, context)
  } as unknown as MeptoStatic // statics ($.fn, $.each, ...) are attached below

  /**
   * Recursively merge properties from `source` into `target`.
   * When `deep` is true, plain objects and arrays are merged recursively;
   * otherwise properties are copied by reference (shallow copy).
   * Properties with `undefined` values are always skipped.
   */
  function extend(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    deep: boolean
  ): void {
    // perf: Object.keys takes V8's fast enumerable-keys path and yields own
    // keys only, making the per-key hasOwnProperty check unnecessary.
    const keys = Object.keys(source)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const sourceValue = source[key]

      if (deep && (isPlainObject(sourceValue) || isArray(sourceValue))) {
        // Ensure the target has a compatible container before recursing
        if (isPlainObject(sourceValue) && !isPlainObject(target[key])) {
          target[key] = {}
        }
        if (isArray(sourceValue) && !isArray(target[key])) {
          target[key] = []
        }
        extend(target[key] as Record<string, unknown>, sourceValue as Record<string, unknown>, deep)
      } else if (sourceValue !== undefined) {
        target[key] = sourceValue
      }
    }
  }

  /**
   * Merges properties from one or more source objects into `target`.
   * Pass `true` as the first argument for a deep (recursive) merge.
   * Properties with `undefined` values are always skipped.
   *
   * @param target - Destination object, or `true` for deep merge followed by destination.
   * @param rest   - One or more source objects whose properties are copied.
   * @returns The modified `target` object.
   */
  $.extend = function (
    target: boolean | Record<string, unknown>,
    ...rest: (Record<string, unknown> | undefined)[]
  ): Record<string, unknown> {
    let deep = false
    let destination: Record<string, unknown>

    if (typeof target === 'boolean') {
      deep = target
      destination = rest.shift() as Record<string, unknown>
    } else {
      destination = target
    }

    rest.forEach(arg => {
      if (arg) extend(destination, arg, deep)
    })

    return destination
  }

  /**
   * Mepto's CSS selector engine. Optimises for simple ID (`#foo`),
   * class (`.bar`), and tag (`div`) selectors by using native
   * `getElementById`, `getElementsByClassName`, and `getElementsByTagName`
   * before falling back to `querySelectorAll`.
   *
   * This method can be overridden in plugins.
   *
   * @param element  - The root element to query within.
   * @param selector - A CSS selector string.
   * @returns An array of matched `Element` nodes.
   */
  mepto.qsa = function (element: ParentNode, selector: string): Element[] {
    const maybeID = selector[0] === '#'
    const maybeClass = !maybeID && selector[0] === '.'
    const nameOnly = maybeID || maybeClass ? selector.slice(1) : selector
    const isSimple = simpleSelectorRE.test(nameOnly)

    // Fast path: simple ID lookup via getElementById
    // Supported on Document and DocumentFragment (Safari 26.2+); not on Element
    if (maybeID && isSimple && element instanceof Document) {
      const found = element.getElementById(nameOnly)
      return found ? [found] : []
    }

    // Only Element (1), Document (9), and DocumentFragment (11) support query methods
    const nodeType = element.nodeType
    if (nodeType !== 1 && nodeType !== 9 && nodeType !== 11) {
      return []
    }

    // Fast path: simple class or tag lookup via getElementsByClassName/TagName
    // (DocumentFragment doesn't have getElementsByClassName/TagName)
    if (isSimple && !maybeID && element instanceof Element) {
      const results = maybeClass
        ? element.getElementsByClassName(nameOnly)
        : element.getElementsByTagName(selector)
      return slice.call(results)
    }

    // General path: use querySelectorAll for complex selectors
    return slice.call(element.querySelectorAll(selector))
  }

  /**
   * Selects elements by class name, returning a chainable Mepto collection.
   * Provides a jQuery-compatible API that maps directly to the native
   * `getElementsByClassName` for straightforward jQuery-to-vanilla migration.
   *
   * @example
   * // jQuery: $('.my-class').addClass('active')
   * // Mepto:  mepto.getElementsByClassName('my-class').addClass('active')
   *
   * // jQuery: $('.my-class', contextElement).hide()
   * // Mepto:  mepto.getElementsByClassName('my-class', contextElement).hide()
   */
  mepto.getElementsByClassName = function (
    className: string,
    context?: ParentNode
  ): MeptoCollection {
    const root = context || document
    if (!('getElementsByClassName' in root)) return $()
    const elements = (root as Document | Element).getElementsByClassName(className)
    return $(slice.call(elements))
  }

  /**
   * Selects elements by tag name, returning a chainable Mepto collection.
   * Provides a jQuery-compatible API that maps directly to the native
   * `getElementsByTagName` for straightforward jQuery-to-vanilla migration.
   *
   * @example
   * // jQuery: $('div').addClass('highlight')
   * // Mepto:  mepto.getElementsByTagName('div').addClass('highlight')
   *
   * // jQuery: $('li', listElement).remove()
   * // Mepto:  mepto.getElementsByTagName('li', listElement).remove()
   */
  mepto.getElementsByTagName = function (
    tagName: string,
    context?: Document | Element
  ): MeptoCollection {
    const root: Document | Element = context || document
    const elements = root.getElementsByTagName(tagName)
    return $(slice.call(elements))
  }

  /**
   * Selects a single element by its ID, returning a chainable Mepto collection.
   * Mirrors the `getElementById` fast path used inside `mepto.qsa`, but as a
   * standalone method for straightforward jQuery-to-vanilla migration.
   *
   * Supported on `Document` and `DocumentFragment` (Safari 26.2+).
   * Not available on `Element` — the `'getElementById' in root` guard
   * handles this gracefully.
   *
   * @example
   * // jQuery: $('#my-element').addClass('active')
   * // Mepto:  mepto.getElementById('my-element').addClass('active')
   *
   * // With explicit document context:
   * mepto.getElementById('my-element', iframe.contentDocument).hide()
   */
  mepto.getElementById = function (id: string, context?: ParentNode): MeptoCollection {
    const root = context || document
    if (!(root instanceof Document)) return $()
    const found = root.getElementById(id)
    return found ? $([found]) : $()
  }

  /**
   * Wraps `nodes` in a Mepto collection, optionally filtering by `selector`.
   *
   * Used internally by traversal methods (`parents`, `parent`, `children`,
   * `siblings`) to apply an optional CSS selector filter to collected DOM nodes.
   *
   * - `null` / `undefined` selector → all nodes are included as-is.
   * - Non-empty string selector    → only matching nodes are kept.
   * - Empty-string selector (`""`) → returns an empty collection (nothing matches).
   *
   * @param nodes    - Array-like of DOM elements (or a single element) to wrap.
   * @param selector - Optional CSS selector string, or `null`/`undefined` to skip filtering.
   * @returns A new Mepto collection containing the (optionally filtered) nodes.
   */
  function filtered(
    nodes: Element | ArrayLike<Element>,
    selector?: string | null
  ): MeptoCollection {
    // The `as Element[]` casts are compile-time only: $() accepts array-likes
    // at runtime; the public Selector type just doesn't spell that out.
    if (selector == null) return $(nodes as Element[])
    return $(nodes as Element[]).filter(selector)
  }

  /**
   * Checks whether `parent` contains `node` in the DOM tree.
   * Returns `false` when both nodes are the same element.
   *
   * @param parent - The potential ancestor node.
   * @param node   - The potential descendant node.
   */
  $.contains = function (parent: Node, node: Node): boolean {
    return parent !== node && parent.contains(node)
  }

  /**
   * Sets or removes an attribute on `node`. When `value` is `null` or
   * `undefined`, the attribute is removed; otherwise it is set.
   *
   * @param node  - The target element.
   * @param name  - The attribute name.
   * @param value - The attribute value, or `null`/`undefined` to remove.
   */
  function setAttribute(node: Element, name: string, value?: string | null): void {
    value == null ? node.removeAttribute(name) : node.setAttribute(name, value)
  }

  /**
   * Gets or sets the `className` property of an element, correctly
   * handling SVG elements whose `className` is an `SVGAnimatedString`.
   *
   * @param node  - The target element (may be an SVG element).
   * @param value - When provided, sets the class name; otherwise returns it.
   * @returns The current class name string when called as a getter.
   */
  function className(node: Element, value?: string): string | void {
    const klass = node?.className
    const svg = klass && typeof klass === 'object' && 'baseVal' in klass

    if (value === undefined) {
      return svg ? (klass as SVGAnimatedString).baseVal : klass
    }
    if (svg) {
      ;(klass as SVGAnimatedString).baseVal = value
    } else {
      ;(node as HTMLElement).className = value
    }
  }

  /**
   * Deserializes a `data-*` attribute value string into its JavaScript
   * equivalent. Converts `"true"` → `true`, `"false"` → `false`,
   * `"null"` → `null`, numeric strings → numbers, and JSON → objects.
   * Strings that can't be converted are returned as-is.
   *
   * @param value - The raw attribute value string.
   * @returns The deserialized value.
   */
  function deserializeValue(value: string): any {
    // Falsy values (empty string, null, undefined) — return as-is
    if (!value) return value

    // Boolean literals
    if (value === 'true') return true
    if (value === 'false') return false

    // Null literal
    if (value === 'null') return null

    // Numeric strings — round-trip check preserves non-decimal strings like "08"
    const num = +value
    if ('' + num === value) return num

    // JSON arrays/objects — perf: a single charCodeAt(0) read for the
    // first-char check. The try/catch stays: it does not deopt in modern V8
    // (fixed since V8 5.6 / Chrome 56).
    const c0 = value.charCodeAt(0)
    if (c0 === 91 /* [ */ || c0 === 123 /* { */) {
      try {
        return $.parseJSON(value)
      } catch {
        return value
      }
    }

    // Everything else — return as-is
    return value
  }

  $.type = type
  $.isFunction = isFunction
  $.isWindow = isWindow
  $.isArray = isArray
  $.isPlainObject = isPlainObject

  /**
   * Returns `true` if the given object has no own enumerable properties.
   *
   * @param obj - The object to test.
   */
  $.isEmptyObject = function (obj: Record<string, unknown>): boolean {
    for (const _name in obj) return false
    return true
  }

  /**
   * Returns `true` if `val` represents a finite number.
   * Numeric strings are considered numeric; `NaN`, `Infinity`,
   * booleans, and `null` are not.
   *
   * @param val - The value to test.
   */
  $.isNumeric = function (val: unknown): boolean {
    const num = Number(val)
    const t = typeof val
    return (
      (val != null &&
        t !== 'boolean' &&
        (t !== 'string' || (val as string).length > 0) &&
        !isNaN(num) &&
        isFinite(num)) ||
      false
    )
  }

  /**
   * Returns the index of `elem` in `array`, or `-1` if not found.
   * Optionally starts the search at index `i`.
   *
   * @param elem  - The value to locate.
   * @param array - The array-like to search.
   * @param i     - Optional starting index.
   */
  $.inArray = function <T>(elem: T, array: ArrayLike<T>, i?: number): number {
    return emptyArray.indexOf.call(array, elem, i)
  }

  $.camelCase = camelize
  /**
   * Trims leading and trailing whitespace from `str`.
   * Returns an empty string for `null`/`undefined`.
   *
   * @param str - The string to trim.
   */
  $.trim = function (str: string | null | undefined): string {
    return str == null ? '' : String.prototype.trim.call(str)
  }

  // plugin compatibility
  $.uuid = 0
  $.support = {}
  $.expr = {} as MeptoStatic['expr'] // the `':'` bucket is filled by selector.ts
  $.noop = function (): void {}

  /**
   * Iterates over `elements` (array-like or object), collecting non-null
   * return values from `callback` into a flat array. Nested arrays returned
   * by the callback are flattened one level.
   *
   * @typeParam T - The input element type.
   * @typeParam U - The output element type.
   * @param elements - An array-like or plain object to iterate.
   * @param callback - Function returning a value to collect, or `null`/`undefined` to skip.
   * @returns A flattened array of collected values.
   */
  $.map = function <T, U>(
    elements: ArrayLike<T> | Record<string, T>,
    callback: (item: T, index: number | string) => U | null | undefined
  ): U[] {
    const values: U[] = []
    if (likeArray(elements)) {
      for (let i = 0; i < elements.length; i++) {
        const value = callback(elements[i], i)
        if (value != null) values.push(value)
      }
    } else {
      const obj = elements as Record<string, T>
      for (const key in obj) {
        const value = callback(obj[key], key)
        if (value != null) values.push(value)
      }
    }
    return flatten(values)
  } as MeptoStatic['map'] // impl accepts array-likes/objects, wider than the public signature

  /**
   * Iterates over `elements` (array-like or object), calling `callback`
   * for each item. Returning `false` from the callback breaks the loop.
   * For array-likes, the callback receives `(index, item)`;
   * for plain objects, it receives `(key, value)`.
   *
   * @typeParam T - The element type.
   * @param elements - An array-like or plain object to iterate.
   * @param callback - Function called with each item. Return `false` to stop.
   * @returns The original `elements` collection.
   */
  $.each = function <T>(
    elements: ArrayLike<T> | Record<string, T>,
    callback: (this: T, index: number | string, item: T) => boolean | void
  ): typeof elements {
    if (likeArray(elements)) {
      for (let i = 0, len = elements.length; i < len; i++) {
        const item = elements[i]
        if (callback.call(item, i, item) === false) return elements
      }
    } else {
      const obj = elements as Record<string, T>
      for (const key in obj) {
        const item = obj[key]
        if (callback.call(item, key, item) === false) return elements
      }
    }
    return elements
  } as MeptoStatic['each'] // impl accepts array-likes and binds `this`, wider than the public signature

  /**
   * Filters `elements` using `callback`, returning only items for which
   * `callback` returns `true`. Delegates to `Array.prototype.filter`.
   *
   * @param elements - An array-like collection to filter.
   * @param callback - Predicate function called with `(item, index)`.
   * @returns A new array of matching elements.
   */
  $.grep = function <T>(
    elements: ArrayLike<T>,
    callback: (item: T, index: number) => boolean
  ): T[] {
    return filter.call(elements, callback)
  }

  $.parseJSON = JSON.parse

  // Hoisted scroll setters — perf: scrollTop/scrollLeft reuse these instead of
  // allocating a fresh closure pair on every call. The element/window branch is
  // chosen once per call based on the first element, exactly as before.
  function setElementScrollTop(this: HTMLElement, value: number): void {
    this.scrollTop = value
  }
  function setWindowScrollTop(this: Window, value: number): void {
    this.scrollTo(this.scrollX, value)
  }
  function setElementScrollLeft(this: HTMLElement, value: number): void {
    this.scrollLeft = value
  }
  function setWindowScrollLeft(this: Window, value: number): void {
    this.scrollTo(value, this.scrollY)
  }

  /**
   * Reads a single CSS property the same way the `$.fn.css` getter does —
   * inline style first, then the computed style — but without allocating a
   * Mepto collection. perf: `position()`/`offsetParent()` read styles on the
   * layout hot path, where each `$(el).css(...)` wrap is avoidable churn.
   */
  function readStyle(el: Element, camelName: string, dashedName: string): string {
    return (
      ((el as HTMLElement).style as unknown as Record<string, string>)[camelName] ||
      getComputedStyle(el, '').getPropertyValue(dashedName)
    )
  }

  // Compile-time `this` for $.fn method bodies: a collection of Elements with
  // the `selector` string the Z constructor stores. The public MeptoCollection
  // interface unions in Document/Window for the static $ API, but collection
  // methods in this file only ever operate on Elements. It also spells out the
  // array-like helpers (indexOf) and traversal methods (offsetParent, wrapAll)
  // that exist on $.fn at runtime but are missing from the public interface.
  type FnThis = MeptoCollection<Element> & {
    selector: string
    indexOf(searchElement: unknown, fromIndex?: number): number
    offsetParent(): MeptoCollection<Element>
    wrapAll(structure: string | Element | ArrayLike<Element>): MeptoCollection<Element>
  }

  // Define methods that will be available on all
  // mepto collections
  $.fn = {
    constructor: mepto.Z,
    length: 0,

    // Because a collection acts like an array,
    // copy over these useful native array methods.
    // Explicit functions are used over emptyArray.* to satisfy unbound-method linter rules
    // while preserving the dynamic `this` binding required for array-like operations.
    forEach(
      this: unknown[],
      callback: (value: unknown, index: number, array: unknown[]) => void,
      thisArg?: unknown
    ): void {
      return emptyArray.forEach.call(this, callback, thisArg)
    },
    reduce(
      this: unknown[],
      callback: (
        previousValue: unknown,
        currentValue: unknown,
        currentIndex: number,
        array: unknown[]
      ) => unknown,
      initialValue?: unknown
    ): unknown {
      return arguments.length > 1
        ? arrayReduce.call(this, callback, initialValue)
        : arrayReduce.call(this, callback)
    },
    push(this: unknown[], ...items: unknown[]): number {
      return emptyArray.push.apply(this, items)
    },
    sort(this: unknown[], compareFn?: (a: unknown, b: unknown) => number): unknown[] {
      return emptyArray.sort.call(this, compareFn)
    },
    splice(this: unknown[], ...args: Parameters<Array<unknown>['splice']>): unknown[] {
      return emptyArray.splice.apply(this, args)
    },
    indexOf(this: unknown[], searchElement: unknown, fromIndex?: number): number {
      return emptyArray.indexOf.call(this, searchElement, fromIndex)
    },

    /**
     * Merges the collection with additional elements, arrays, or MeptoCollections.
     * MeptoCollection arguments are flattened to their underlying element arrays
     * before merging, matching `Array.prototype.concat` semantics.
     *
     * @param args - Elements, arrays, or MeptoCollections to concatenate.
     * @returns A new plain array containing all merged elements.
     */
    concat(this: FnThis, ...args: any[]): any[] {
      // Flatten MeptoCollection arguments to plain arrays so concat
      // spreads their elements rather than nesting the whole object.
      const flattened = args.map(arg => (mepto.isZ(arg) ? arg.toArray() : arg))
      return emptyArray.concat(mepto.isZ(this) ? this.toArray() : this, ...flattened)
    },

    // `map` and `slice` follow jQuery conventions, not Array.prototype:
    // - `map` invokes the callback as `(index, element)` with `this` bound to
    //   the element, and excludes null/undefined results from the output.
    // - `slice` wraps the result in a new Mepto collection instead of a plain array.
    map<U>(
      fn: (this: Element, index: number, element: Element) => U | null | undefined
    ): MeptoCollection {
      // $() accepts any array of values at runtime; the cast is compile-time only
      return $(
        $.map(this as unknown as Element[], (el, i) => fn.call(el, i, el)) as unknown as Element[]
      )
    },
    slice(this: FnThis, start?: number, end?: number): MeptoCollection {
      return $(slice.call(this, start, end))
    },

    /**
     * Executes `callback` when the DOM is ready (DOMContentLoaded).
     * If the DOM is already loaded, the callback is scheduled via `setTimeout`.
     *
     * @param callback - Function receiving the `$` factory.
     * @returns The collection for chaining.
     */
    ready(this: FnThis, callback: (mepto: MeptoStatic) => void): MeptoCollection {
      if (document.readyState !== 'loading') {
        setTimeout(() => callback($), 0)
      } else {
        document.addEventListener('DOMContentLoaded', () => callback($), { once: true })
      }
      return this
    },
    /**
     * Retrieves an element by index, or the entire collection as an array.
     * Negative indices count from the end (`-1` is the last element).
     *
     * @param idx - Zero-based index, or `undefined` for the full array.
     * @returns A single DOM element, or an array of all elements.
     */
    get(this: FnThis, idx?: number): any {
      return idx === undefined ? slice.call(this) : this[idx >= 0 ? idx : idx + this.length]
    },
    toArray(this: FnThis): Element[] {
      return this.get() as Element[]
    },
    size(this: FnThis): number {
      return this.length
    },
    remove(this: FnThis): MeptoCollection {
      return this.each(function (this: Element) {
        if (this.parentNode != null) this.parentNode.removeChild(this)
      })
    },
    /**
     * Iterates over the collection, calling `callback` for each element.
     * Returning `false` from the callback breaks the loop.
     *
     * @param callback - Function called with `(index, element)`, `this` bound to the element.
     * @returns The collection for chaining.
     */
    each(
      this: FnThis,
      callback: (this: Element, index: number, element: Element) => boolean | void
    ): MeptoCollection {
      for (let i = 0, len = this.length; i < len; i++) {
        const element = this[i]
        if (callback.call(element, i, element) === false) break
      }
      return this
    },
    /**
     * Filters the collection by a CSS selector or predicate function.
     * When a function is provided, keeps elements for which it returns `true`.
     * When a string is provided, keeps elements matching the selector.
     *
     * @param selector - CSS selector string or predicate function.
     * @returns A new Mepto collection of matching elements.
     */
    filter(
      this: FnThis,
      selector: string | ((index: number, element: Element) => boolean)
    ): MeptoCollection {
      if (selector == null) return $()
      const predicate: (el: Element, i: number) => unknown = isFunction(selector)
        ? (el, i) => selector.call(el, i, el)
        : el => mepto.matches(el, selector as string)
      // perf: manual loop — filter.call on a non-array array-like (a Z
      // collection) misses V8's elements-kind fast paths.
      const result: Element[] = []
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (predicate(el, i)) result.push(el)
      }
      return $(result)
    },
    add(
      this: FnThis,
      selector: string | Element | ArrayLike<Element>,
      context?: Element | Document
    ): MeptoCollection {
      // concat flattens MeptoCollection arguments to arrays at runtime
      return $(
        uniq(
          this.concat($(selector as string | Element | Element[], context) as unknown as Element[])
        )
      )
    },
    /**
     * Checks whether the first element matches the given CSS selector,
     * or compares `selector` properties when passed a Mepto collection.
     *
     * @param selector - CSS selector string or Mepto collection to compare.
     * @returns `true` if the first element matches.
     */
    is(this: FnThis, selector: string | { selector: string }): boolean {
      return typeof selector == 'string'
        ? this.length > 0 && mepto.matches(this[0], selector)
        : !!(selector && this.selector == (selector as { selector: string }).selector)
    },
    /**
     * Returns a new collection excluding elements matched by the selector,
     * element(s), or predicate function.
     *
     * @param selector - CSS selector string, element(s), or predicate function.
     * @returns A new Mepto collection of non-matching elements.
     */
    not(
      this: FnThis,
      selector: string | Element | ArrayLike<Element> | ((this: Element, index: number) => boolean)
    ): MeptoCollection {
      if (isFunction(selector)) {
        // isFunction narrows selector to (...args: unknown[]) => unknown,
        // so we can call it directly without casting to Function.
        // perf: manual loop instead of filter.call on this Z array-like.
        const result: Element[] = []
        for (let i = 0, len = this.length; i < len; i++) {
          const el = this[i]
          if (!selector.call(el, i)) result.push(el)
        }
        return $(result)
      }

      // Resolve the set of elements to exclude:
      //  - string  → filter this collection by CSS selector
      //  - NodeList/HTMLCollection (array-like with .item) → slice to plain array
      //  - anything else (Element, array, etc.) → wrap with $()
      const excludes =
        typeof selector === 'string'
          ? this.filter(selector)
          : likeArray(selector) &&
              isFunction((selector as ArrayLike<Element> & { item?: unknown }).item)
            ? slice.call(selector)
            : $(selector as Element | Element[]) // array-likes are fine at runtime

      // Build a Set for O(1) membership tests instead of repeated indexOf scans.
      const excludeSet = new Set<Element>()
      for (let i = 0, len = excludes.length; i < len; i++) {
        excludeSet.add(excludes[i])
      }

      // perf: manual loop instead of filter.call on this Z array-like.
      const result: Element[] = []
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (!excludeSet.has(el)) result.push(el)
      }
      return $(result)
    },
    /**
     * Filters elements to those that contain a descendant matching the
     * given selector, or that contain the given DOM node.
     *
     * @param selector - CSS selector string or DOM node.
     * @returns A new Mepto collection of matching elements.
     */
    has(this: FnThis, selector: string | Node): MeptoCollection {
      return this.filter(function (this: HTMLElement) {
        return isObject(selector)
          ? $.contains(this, selector as unknown as Element)
          : $(this).find(selector as string).length > 0
      })
    },
    /**
     * Returns the element at the given index as a Mepto collection.
     * Negative indices count from the end.
     *
     * @param idx - Zero-based index (negative counts from end).
     * @returns A new Mepto collection containing the single element.
     */
    eq(this: FnThis, idx: number): MeptoCollection {
      return idx === -1 ? this.slice(idx) : this.slice(idx, +idx + 1)
    },
    first(this: FnThis): MeptoCollection {
      // The original `el && !isObject(el) ? $(el) : $(el)` had identical
      // branches (suspected unfinished refactor) — collapsed; behavior unchanged.
      return $(this[0])
    },
    last(this: FnThis): MeptoCollection {
      return $(this[this.length - 1])
    },
    /**
     * Finds descendant elements matching the given CSS selector,
     * or filters for elements containing the given element(s).
     *
     * @param selector - CSS selector string, element, or array-like of elements.
     * @returns A new Mepto collection of matched descendants.
     */
    find(this: FnThis, selector: string | Element | ArrayLike<Element>): MeptoCollection {
      if (!selector) return $()

      if (typeof selector == 'object') {
        const nodes = $(selector as Element | Element[])
        const result: Element[] = []
        const parents = this
        for (let i = 0, nlen = nodes.length; i < nlen; i++) {
          const node = nodes[i]
          if (!(node instanceof Element)) continue
          for (let j = 0, plen = parents.length; j < plen; j++) {
            if ($.contains(parents[j], node)) {
              result.push(node)
              break
            }
          }
        }
        return $(result)
      }

      if (this.length == 1) return $(mepto.qsa(this[0], selector))

      // perf: single loop with Set dedupe — replaces uniq(flatten($.map(...)))
      // which built three intermediate arrays per call.
      const seen = new Set<Element>()
      const result: Element[] = []
      for (let i = 0, len = this.length; i < len; i++) {
        const found = mepto.qsa(this[i], selector)
        for (let j = 0, foundLen = found.length; j < foundLen; j++) {
          const el = found[j]
          if (!seen.has(el)) {
            seen.add(el)
            result.push(el)
          }
        }
      }
      return $(result)
    },
    /**
     * Traverses ancestors of each element, returning the first that matches
     * `selector`. Stops at `context` or the document root.
     *
     * @param selector - CSS selector string, element, or array-like of elements to match.
     * @param context  - Optional boundary element; traversal stops here.
     * @returns A new Mepto collection of closest matching ancestors.
     */
    closest(
      this: FnThis,
      selector: string | Element | ArrayLike<Element>,
      context?: Element | Document
    ): MeptoCollection {
      const nodes: Element[] = []
      const collection = typeof selector == 'object' && $(selector as Element | Element[])
      const seen = new Set<Element>()

      if (collection) {
        // Object selector: walk ancestors, matching against the collection set.
        const matchers = new Set<Element>()
        for (let i = 0, len = collection.length; i < len; i++) {
          const el = collection[i]
          if (el instanceof Element) matchers.add(el)
        }

        for (let i = 0, len = this.length; i < len; i++) {
          const el = this[i]
          if (!(el instanceof Element)) continue
          let node: Node | null = el
          while (node) {
            if (matchers.has(node as Element)) {
              if (!seen.has(node as Element)) {
                seen.add(node as Element)
                nodes.push(node as Element)
              }
              break
            }
            if (node === context || isDocument(node)) break
            node = node.parentNode
          }
        }

        return $(nodes)
      }

      // perf: string selectors go through native Element.closest; the `context`
      // boundary is applied afterwards via context.contains(found) — for
      // elements in the same tree this is equivalent to the old manual walk.
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (!(el instanceof Element)) continue
        const found = el.closest(selector as string)
        if (found && (!context || context.contains(found)) && !seen.has(found)) {
          seen.add(found)
          nodes.push(found)
        }
      }

      return $(nodes)
    },
    /**
     * Like {@link closest}, but returns **only the first match** from the
     * first element in the collection — mirroring the native
     * `Element.closest()` semantics.
     *
     * This is the preferred bridge toward vanilla JS: an LLM or developer
     * reading `singleClosest` knows the result is always either a
     * single-element collection or an empty one.
     *
     * @param selector - CSS selector string to match.
     * @param context  - Optional boundary element; traversal stops here.
     * @returns A Mepto collection containing at most one element.
     */
    singleClosest(
      this: FnThis,
      selector: string | Element | ArrayLike<Element>,
      context?: Element | Document
    ): MeptoCollection {
      if (this.length === 0) return $()

      const firstEl = this[0]

      if (typeof selector === 'string') {
        const found = firstEl.closest(selector)
        if (!found) return $()
        if (context && !context.contains(found)) return $()
        return $(found)
      }

      // For object selectors, fall back to a set-based match on the first element only
      const collection = $(selector as Element | Element[])
      const matchers = new Set<Element>()
      for (let i = 0, len = collection.length; i < len; i++) {
        const el = collection[i]
        if (el instanceof Element) matchers.add(el)
      }

      let node: Node | null = firstEl
      while (node) {
        if (node instanceof Element && matchers.has(node)) {
          return $(node)
        }
        if (node === context || isDocument(node)) break
        node = node.parentNode
      }

      return $()
    },
    parents(this: FnThis, selector?: string): MeptoCollection {
      const ancestors: Element[] = []
      // perf: Set membership (O(1)) instead of ancestors.indexOf scans (O(n²))
      const seen = new Set<Element>()
      let nodes: ArrayLike<Element> = this
      while (nodes.length > 0) {
        nodes = $.map(nodes as Element[], (node: Element) => {
          const parent = node.parentNode
          if (parent && !isDocument(parent) && parent instanceof Element && !seen.has(parent)) {
            seen.add(parent)
            ancestors.push(parent)
            return parent
          }
          return null
        }) as unknown as ArrayLike<Element>
      }
      return filtered(ancestors, selector)
    },
    parent(this: FnThis, selector?: string): MeptoCollection {
      const parents: Element[] = []
      const seen = new Set<Node>()
      for (let i = 0, len = this.length; i < len; i++) {
        const parent = this[i].parentNode
        if (parent && !seen.has(parent)) {
          seen.add(parent)
          parents.push(parent as Element)
        }
      }
      return filtered(parents, selector)
    },
    children(this: FnThis, selector?: string): MeptoCollection {
      return filtered(
        // the map callback returns plain arrays, which $.map flattens
        this.map(function (this: Element) {
          return children(this)
        }) as unknown as Element[],
        selector
      )
    },
    contents(this: FnThis): MeptoCollection {
      return this.map(function (this: Element) {
        return (this as HTMLIFrameElement).contentDocument || slice.call(this.childNodes)
      })
    },
    siblings(this: FnThis, selector?: string): MeptoCollection {
      return filtered(
        this.map((_i: number, el: Element) => {
          // perf: manual loop instead of filter.call on the children array
          const result: Element[] = []
          const kids = children(el.parentNode!)
          for (let i = 0; i < kids.length; i++) {
            const child = kids[i]
            if (child !== el) result.push(child)
          }
          return result
        }) as unknown as Element[],
        selector
      )
    },
    empty(this: FnThis): MeptoCollection {
      return this.each(function (this: Element) {
        setInnerHTML(this, '')
      })
    },
    // `pluck` is borrowed from Prototype.js
    pluck(this: FnThis, property: string): unknown[] {
      return $.map(this as unknown as Element[], (el: Element) => {
        return (el as unknown as Record<string, unknown>)[property]
      })
    },
    show(this: FnThis): MeptoCollection {
      return this.each(function (this: HTMLElement) {
        this.style.display == 'none' && (this.style.display = '')
        if (getComputedStyle(this, '').getPropertyValue('display') == 'none')
          this.style.display = defaultDisplay(this.nodeName)
      })
    },
    /**
     * Replaces each element in the collection with `newContent`.
     *
     * @param newContent - HTML string, element, or Mepto collection to insert.
     * @returns The original (now detached) collection.
     */
    replaceWith(this: FnThis, newContent: string | Element | ArrayLike<Element>): MeptoCollection {
      return this.before(newContent as string | Element | Element[]).remove()
    },
    /**
     * Wraps `structure` around each element in the collection.
     * `structure` can be an HTML string, DOM element, or a function
     * returning one.
     *
     * @param structure - Wrapper element, HTML string, or function.
     * @returns The original collection for chaining.
     */
    wrap(
      this: FnThis,
      structure: string | Element | ((index: number) => string | Element)
    ): MeptoCollection {
      const isCallable = isFunction(structure)
      let wrapperElement: Element | undefined
      let shouldClone = false

      if (this[0] && !isCallable) {
        wrapperElement = $(structure as string | Element).get(0) as Element | undefined
        shouldClone = !!wrapperElement && (!!wrapperElement.parentNode || this.length > 1)
      }

      return this.each(function (this: Element, index) {
        const wrapper = isCallable
          ? structure.call(this, index)
          : shouldClone
            ? wrapperElement!.cloneNode(true)
            : wrapperElement
        ;($(this) as FnThis).wrapAll(wrapper as Element)
      })
    },
    /**
     * Wraps `structure` around the entire collection as a single group,
     * inserting it before the first element and moving all elements inside.
     *
     * @param structure - Wrapper element, HTML string, or Mepto collection.
     * @returns The original collection for chaining.
     */
    wrapAll(this: FnThis, structure: string | Element | ArrayLike<Element>): MeptoCollection {
      if (!this[0]) return this

      const wrapper = $(structure as string | Element | Element[])
      $(this[0]).before(wrapper)

      let innermost = wrapper
      let kids = innermost.children()
      while (kids.length) {
        innermost = kids.first()
        kids = innermost.children()
      }

      $(innermost).append(this)
      return this
    },
    /**
     * Wraps the inner contents of each element with `structure`.
     * Pass `null` to skip wrapping.
     *
     * @param structure - Wrapper element, HTML string, or function returning one.
     * @returns The original collection for chaining.
     */
    wrapInner(
      this: FnThis,
      structure: string | Element | ((index: number) => string | Element) | null
    ): MeptoCollection {
      if (structure == null) return this

      const isCallable = isFunction(structure)
      return this.each(function (this: Element, index) {
        const self = $(this)
        const contents = self.contents()
        const wrappingContent = (isCallable ? structure.call(this, index) : structure) as
          | string
          | Element

        if (contents.length) {
          ;(contents as FnThis).wrapAll(wrappingContent)
        } else {
          self.append(wrappingContent)
        }
      })
    },
    unwrap(this: FnThis): MeptoCollection {
      this.parent().each(function (this: Element) {
        $(this).replaceWith($(this).children())
      })
      return this
    },
    clone(this: FnThis): MeptoCollection {
      return this.map(function (this: Element) {
        return this.cloneNode(true)
      })
    },
    hide(this: FnThis): MeptoCollection {
      return this.css('display', 'none')
    },
    toggle(this: FnThis, setting?: boolean): MeptoCollection {
      return this.each(function (this: Element) {
        const el = $(this)
        ;(setting === undefined ? el.css('display') == 'none' : setting) ? el.show() : el.hide()
      })
    },
    prev(this: FnThis, selector?: string): MeptoCollection {
      return $(this.pluck('previousElementSibling') as Element[]).filter(selector || '*')
    },
    next(this: FnThis, selector?: string): MeptoCollection {
      return $(this.pluck('nextElementSibling') as Element[]).filter(selector || '*')
    },
    /**
     * Gets or sets the `innerHTML` of elements.
     * When called without arguments, returns the HTML of the first element.
     * Accepts a function receiving `(index, currentHtml)`.
     *
     * @param html - HTML string or function returning HTML.
     * @returns HTML string (getter) or the collection (setter).
     */
    html(
      this: FnThis,
      html?: string | ((idx: number, currentHtml: string) => string)
    ): string | null | MeptoCollection {
      // perf: arguments.length read instead of `0 in arguments` — `in` on
      // `arguments` forces V8 to materialize the arguments object.
      return arguments.length > 0
        ? this.each(function (this: Element, idx) {
            const originHtml = this.innerHTML
            $(this)
              .empty()
              .append(
                isFunction(html)
                  ? (html as (idx: number, currentHtml: string) => string).call(
                      this,
                      idx,
                      originHtml
                    )
                  : (html as string)
              )
          })
        : 0 in this
          ? this[0].innerHTML
          : null
    },
    /**
     * Gets or sets the `textContent` of elements.
     * When called without arguments, returns the concatenated text of all elements.
     * Accepts a function receiving `(index, currentText)`.
     *
     * @param text - Text string, number, or function returning text.
     * @returns Text string (getter) or the collection (setter).
     */
    text(
      this: FnThis,
      text?: string | number | null | ((idx: number, current: string | null) => string | null)
    ): string | null | MeptoCollection {
      // perf: arguments.length read instead of `0 in arguments` (see html()).
      return arguments.length > 0
        ? this.each(function (this: Element, idx) {
            const newText = isFunction(text)
              ? (text as (idx: number, current: string | null) => string | null).call(
                  this,
                  idx,
                  this.textContent
                )
              : text
            this.textContent = newText == null ? '' : '' + newText
          })
        : 0 in this
          ? this.pluck('textContent').join('')
          : null
    },
    /**
     * Gets or sets HTML attributes on elements.
     * - `.attr(name)` — get attribute of first element.
     * - `.attr(name, value)` — set attribute on all elements.
     * - `.attr({ name: value, ... })` — set multiple attributes.
     * - `.attr(name, fn)` — set via function receiving `(index, oldValue)`.
     *
     * @param name  - Attribute name, or object of name/value pairs.
     * @param value - Attribute value, function, or `null` to remove.
     * @returns Attribute value (getter) or the collection (setter).
     */
    attr(
      this: FnThis,
      name: string | Record<string, string | null | undefined>,
      value?: string | null | ((i: number, old: string | null) => string | null)
    ): string | undefined | MeptoCollection {
      // Getter
      if (typeof name == 'string' && arguments.length < 2) {
        if (this.length > 0 && this[0].nodeType === 1) {
          const result = this[0].getAttribute(name)
          return result != null ? result : undefined
        }
        return undefined
      }

      // Setter
      // perf: hoist the object/function checks out of the element loop
      const nameIsObject = isObject(name)
      const valueIsFunction = isFunction(value)
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (el.nodeType !== 1) continue
        if (nameIsObject) {
          const attrs = name as Record<string, string | null | undefined>
          for (const k in attrs) setAttribute(el, k, attrs[k])
        } else {
          setAttribute(
            el,
            name as string,
            valueIsFunction
              ? (value as (i: number, old: string | null) => string | null).call(
                  el,
                  i,
                  el.getAttribute(name as string)
                )
              : (value as string | null)
          )
        }
      }
      return this
    },
    /**
     * Removes one or more space-separated attributes from every element.
     *
     * @param name - Space-separated attribute names to remove.
     * @returns The collection for chaining.
     */
    removeAttr(this: FnThis, name: string): MeptoCollection {
      // perf: split the attribute list once per call, not once per element
      const attributes = name.split(' ')
      return this.each(function (this: Element) {
        if (this.nodeType !== 1) return
        for (let i = 0; i < attributes.length; i++) {
          setAttribute(this, attributes[i])
        }
      })
    },
    /**
     * Gets or sets DOM properties on elements. Normalises property names
     * via `propMap` (e.g. `"for"` → `"htmlFor"`, `"class"` → `"className"`).
     *
     * - `.prop(name)` — get property of first element.
     * - `.prop(name, value)` — set property on all elements.
     * - `.prop({ name: value })` — set multiple properties.
     *
     * @param name  - Property name or object of name/value pairs.
     * @param value - Property value or function receiving `(index, oldValue)`.
     * @returns Property value (getter) or the collection (setter).
     */
    prop(
      this: FnThis,
      name: string | Record<string, unknown>,
      value?: unknown
    ): unknown | MeptoCollection {
      const resolvedName: string | Record<string, unknown> =
        typeof name === 'string' ? propMap[name] || name : name
      // perf: arguments.length read instead of `1 in arguments` — `in` on
      // `arguments` forces V8 to materialize the arguments object.
      if (typeof resolvedName == 'string' && arguments.length < 2) {
        return this[0] && (this[0] as unknown as Record<string, unknown>)[resolvedName]
      }
      // perf: hoist the object/function checks out of the element loop
      const nameIsObject = isObject(resolvedName)
      const valueIsFunction = isFunction(value)
      return this.each(function (this: Element, idx) {
        const el = this as unknown as Record<string, unknown>
        if (nameIsObject) {
          const props = resolvedName as Record<string, unknown>
          for (const k in props) el[propMap[k] || k] = props[k]
        } else {
          const key = resolvedName as string
          el[key] = valueIsFunction
            ? (value as (idx: number, old: unknown) => unknown).call(this, idx, el[key])
            : value
        }
      })
    },
    /**
     * Deletes a DOM property from every element. Normalises via `propMap`.
     *
     * @param name - Property name to delete.
     * @returns The collection for chaining.
     */
    removeProp(this: FnThis, name: string): MeptoCollection {
      const resolvedName = propMap[name] || name
      return this.each(function (this: Element) {
        delete (this as unknown as Record<string, unknown>)[resolvedName]
      })
    },
    /**
     * Reads or writes a `data-*` attribute. The attribute name is
     * dasherized automatically (e.g. `data("myVal")` reads `data-my-val`).
     * Values are deserialized via `deserializeValue`.
     *
     * @param name  - Data key name.
     * @param value - Value to set (omitted for getter).
     * @returns Deserialized value (getter) or the collection (setter).
     */
    data(this: FnThis, name: string, value?: unknown): unknown | MeptoCollection {
      const attrName = 'data-' + name.replace(capitalRE, '-$1').toLowerCase()

      if (arguments.length > 1) {
        return this.attr(attrName, value as string | null)
      }

      const data = this.attr(attrName)
      return data !== undefined ? deserializeValue(data as string) : undefined
    },
    /**
     * Gets or sets the value of form elements.
     * For `<select multiple>`, returns an array of selected values.
     * Accepts a function receiving `(index, currentValue)`.
     *
     * @param value - Value string, array, or function.
     * @returns Value (getter) or the collection (setter).
     */
    val(
      this: FnThis,
      value?: string | string[] | ((idx: number, current: string) => string)
    ): string | string[] | undefined | MeptoCollection {
      // Setter
      if (arguments.length > 0) {
        const v = value == null ? '' : value
        for (let i = 0, len = this.length; i < len; i++) {
          const el = this[i] as HTMLInputElement
          el.value = isFunction(v)
            ? (v as (idx: number, current: string) => string).call(el, i, el.value)
            : (v as string)
        }
        return this
      }

      // Getter
      const el = this[0] as HTMLInputElement | undefined
      if (!el) return undefined

      if (el.multiple) {
        // <select multiple> — selectedOptions only exists on HTMLSelectElement
        const result: string[] = []
        const options = (el as unknown as HTMLSelectElement).selectedOptions
        for (let i = 0, len = options.length; i < len; i++) {
          result.push(options[i].value)
        }
        return result
      }

      return el.value
    },
    /**
     * Gets or sets the position of the first element relative to the document.
     * As a setter, positions elements relative to their offset parent.
     * Accepts a function receiving `(index, currentOffset)`.
     *
     * @param coordinates - `{ top, left }` object or function returning one.
     * @returns Object with `top`, `left`, `width`, `height` (getter) or the collection (setter).
     */
    offset(
      this: FnThis,
      coordinates?:
        | { top: number; left: number }
        | ((index: number, current: { top: number; left: number }) => { top: number; left: number })
    ): { top: number; left: number; width: number; height: number } | null | MeptoCollection {
      if (coordinates)
        return this.each(function (this: Element, index) {
          const $this = $(this) as FnThis
          const coords = isFunction(coordinates)
            ? (
                coordinates as (
                  index: number,
                  current: { top: number; left: number }
                ) => { top: number; left: number }
              ).call(this, index, $this.offset() as { top: number; left: number })
            : (coordinates as { top: number; left: number })
          const parentOffset = $this.offsetParent().offset() as { top: number; left: number }
          const props: Record<string, string | number> = {
            top: coords.top - parentOffset.top,
            left: coords.left - parentOffset.left,
          }
          if ($this.css('position') == 'static') props['position'] = 'relative'
          $this.css(props)
        })
      if (!this.length) return null
      if (document.documentElement !== this[0] && !$.contains(document.documentElement, this[0]))
        // the runtime getter historically omits width/height on this branch
        return { top: 0, left: 0 } as unknown as {
          top: number
          left: number
          width: number
          height: number
        }
      const obj = this[0].getBoundingClientRect()
      return {
        left: obj.left + window.pageXOffset,
        top: obj.top + window.pageYOffset,
        width: Math.round(obj.width),
        height: Math.round(obj.height),
      }
    },
    /**
     * Gets or sets CSS properties on elements.
     * - `.css(prop)` — get computed value of a single property.
     * - `.css([prop, ...])` — get multiple properties as an object.
     * - `.css(prop, value)` — set a single property (omit value to remove).
     * - `.css({ prop: value })` — set multiple properties.
     *
     * @param property - CSS property name(s) or an object of name/value pairs.
     * @param value    - CSS value, or omitted/`null` to remove the property.
     * @returns CSS value (getter) or the collection (setter).
     */
    css(
      this: FnThis,
      property: string | string[] | Record<string, string | number | null | undefined>,
      value?: string | number | null
    ): string | Record<string, string> | undefined | MeptoCollection {
      if (arguments.length < 2) {
        const element = this[0] as HTMLElement | undefined
        if (typeof property == 'string') {
          if (!element) return
          return (
            (element.style as unknown as Record<string, string>)[camelize(property)] ||
            getComputedStyle(element, '').getPropertyValue(property)
          )
        } else if (isArray(property)) {
          if (!element) return
          const props: Record<string, string> = {}
          const computedStyle = getComputedStyle(element, '')
          $.each(property, (_: number | string, prop: string) => {
            props[prop] =
              (element.style as unknown as Record<string, string>)[camelize(prop)] ||
              computedStyle.getPropertyValue(prop)
          })
          return props
        }
      }

      // Setter. perf: apply per-property setProperty/removeProperty instead of
      // `style.cssText += ';' + css`, which re-serialized the whole declaration
      // block for every element.
      if (type(property) == 'string') {
        // perf: the dasherized name and final value are computed once,
        // outside the element loop.
        const dashedName = dasherize(property as string)
        if (!value && value !== 0) {
          return this.each(function (this: Element) {
            ;(this as HTMLElement).style.removeProperty(dashedName)
          })
        }
        const cssValue = String(maybeAddPx(property as string, value as string | number))
        return this.each(function (this: Element) {
          ;(this as HTMLElement).style.setProperty(dashedName, cssValue)
        })
      }

      const propObj = property as Record<string, string | number | null | undefined>
      // perf: Object.keys takes V8's fast enumerable-keys path (R7), and each
      // key's dasherized name + final value is resolved exactly once here (R8)
      // instead of once per element. `null` marks a removal.
      const entries: [dashedName: string, cssValue: string | null][] = []
      const propKeys = Object.keys(propObj)
      for (let i = 0; i < propKeys.length; i++) {
        const key = propKeys[i]
        const propValue = propObj[key]
        entries.push(
          !propValue && propValue !== 0
            ? [dasherize(key), null]
            : [dasherize(key), String(maybeAddPx(key, propValue as string | number))]
        )
      }
      return this.each(function (this: Element) {
        const style = (this as HTMLElement).style
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          if (entry[1] === null) style.removeProperty(entry[0])
          else style.setProperty(entry[0], entry[1])
        }
      })
    },
    /**
     * Returns the index of the first element among its siblings,
     * or the index of `element` within this collection.
     *
     * @param element - Optional selector or element to locate.
     * @returns Zero-based index.
     */
    index(this: FnThis, element?: string | Element | ArrayLike<Element>): number {
      return element
        ? this.indexOf($(element as string | Element | Element[])[0])
        : (this.parent().children() as FnThis).indexOf(this[0])
    },
    /**
     * Checks whether any element in the collection has the given CSS class.
     * For space-separated names, every listed class must be present.
     *
     * @param name - CSS class name to check for.
     * @returns `true` if at least one element has the class.
     */
    hasClass(this: FnThis, name: string): boolean {
      if (!name) return false
      // perf: split once up front and use a manual loop with early exit —
      // Array.prototype.some.call on a Z array-like misses V8's elements-kind
      // fast paths and would allocate a callback closure per call (R5, R8).
      const tokens = name.split(/\s+/)
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (!(el instanceof Element)) continue
        // For space-separated names, every listed class must be present.
        // Empty tokens are skipped: native classList throws on ''.
        let sawToken = false
        let allPresent = true
        for (let j = 0; j < tokens.length; j++) {
          const token = tokens[j]
          if (!token) continue
          sawToken = true
          if (!el.classList.contains(token)) {
            allPresent = false
            break
          }
        }
        if (sawToken && allPresent) return true
      }
      return false
    },
    /**
     * Adds one or more CSS classes to every element. Duplicates are skipped.
     * Accepts a function receiving `(index, currentClass)`.
     *
     * @param name - Space-separated class names, or function returning them.
     * @returns The collection for chaining.
     */
    addClass(
      this: FnThis,
      name: string | ((index: number, currentClass: string) => string)
    ): MeptoCollection {
      if (!name) return this
      return this.each(function (this: Element, idx) {
        if (!('className' in this)) return
        const newName = isFunction(name)
          ? (name as (index: number, currentClass: string) => string).call(
              this,
              idx,
              className(this) || ''
            )
          : (name as string)
        // perf: native classList.add skips duplicates; eachClass drops empty
        // tokens, which classList would throw on.
        const list = this.classList
        eachClass(newName, klass => {
          list.add(klass)
        })
      })
    },
    /**
     * Removes one or more CSS classes from every element.
     * With no arguments, removes all classes. Accepts a function
     * receiving `(index, currentClass)`.
     *
     * @param name - Space-separated class names, or function returning them.
     * @returns The collection for chaining.
     */
    removeClass(
      this: FnThis,
      name?: string | ((index: number, currentClass: string) => string)
    ): MeptoCollection {
      return this.each(function (this: Element, idx) {
        if (!('className' in this)) return
        if (name === undefined) {
          className(this, '')
          return
        }
        const resolved = isFunction(name)
          ? (name as (index: number, currentClass: string) => string).call(
              this,
              idx,
              className(this) || ''
            )
          : (name as string)
        // perf: native classList.remove per token (empty tokens skipped)
        const list = this.classList
        eachClass(resolved, klass => {
          list.remove(klass)
        })
      })
    },
    /**
     * Toggles one or more CSS classes on every element.
     * Pass `true`/`false` as `when` to force add/remove.
     * Accepts a function receiving `(index, currentClass)`.
     *
     * @param name - Space-separated class names, or function returning them.
     * @param when - `true` to add, `false` to remove; omit to toggle.
     * @returns The collection for chaining.
     */
    toggleClass(
      this: FnThis,
      name: string | ((index: number, currentClass: string) => string),
      when?: boolean
    ): MeptoCollection {
      if (!name) return this
      return this.each(function (this: Element, idx) {
        if (!('className' in this)) return
        const names = isFunction(name)
          ? (name as (index: number, currentClass: string) => string).call(
              this,
              idx,
              className(this) || ''
            )
          : (name as string)
        // perf: split once per element and use native classList.toggle —
        // no per-token $(this) re-wrap and hasClass/addClass round-trips.
        const list = this.classList
        eachClass(names, klass => {
          list.toggle(klass, when)
        })
      })
    },
    /**
     * Gets or sets the vertical scroll position of the first element.
     *
     * @param value - Scroll position in pixels (omit to get).
     * @returns Current scroll position (getter) or the collection (setter).
     */
    scrollTop(this: FnThis, value?: number): number | undefined | MeptoCollection {
      if (!this.length) return
      const first = this[0] as HTMLElement | Window
      const hasScrollTop = 'scrollTop' in first
      if (value === undefined)
        return hasScrollTop ? (first as HTMLElement).scrollTop : (first as Window).pageYOffset
      // perf: hoisted setter functions — no per-call closure pair
      const setter = (hasScrollTop ? setElementScrollTop : setWindowScrollTop) as (
        this: Element,
        value: number
      ) => void
      return this.each(function (this: Element) {
        setter.call(this, value)
      })
    },
    /**
     * Gets or sets the horizontal scroll position of the first element.
     *
     * @param value - Scroll position in pixels (omit to get).
     * @returns Current scroll position (getter) or the collection (setter).
     */
    scrollLeft(this: FnThis, value?: number): number | undefined | MeptoCollection {
      if (!this.length) return
      const first = this[0] as HTMLElement | Window
      const hasScrollLeft = 'scrollLeft' in first
      if (value === undefined)
        return hasScrollLeft ? (first as HTMLElement).scrollLeft : (first as Window).pageXOffset
      // perf: hoisted setter functions — no per-call closure pair
      const setter = (hasScrollLeft ? setElementScrollLeft : setWindowScrollLeft) as (
        this: Element,
        value: number
      ) => void
      return this.each(function (this: Element) {
        setter.call(this, value)
      })
    },
    position(this: FnThis): { top: number; left: number } | undefined {
      if (!this.length) return

      const elem = this[0]
      const offsetParent = this.offsetParent()
      const offset = this.offset()
      const parentOffset = rootNodeRE.test(offsetParent[0].nodeName)
        ? { top: 0, left: 0 }
        : offsetParent.offset()

      // Subtract element margins
      // note: when an element has margin: auto the offsetLeft and marginLeft
      // are the same in Safari causing offset.left to incorrectly be 0
      // perf: readStyle reads one property without allocating a $() wrapper
      offset.top -= parseFloat(readStyle(elem, 'marginTop', 'margin-top')) || 0
      offset.left -= parseFloat(readStyle(elem, 'marginLeft', 'margin-left')) || 0

      // Add offsetParent borders
      const offsetParentEl = offsetParent[0]
      parentOffset.top +=
        parseFloat(readStyle(offsetParentEl, 'borderTopWidth', 'border-top-width')) || 0
      parentOffset.left +=
        parseFloat(readStyle(offsetParentEl, 'borderLeftWidth', 'border-left-width')) || 0

      return {
        top: offset.top - parentOffset.top,
        left: offset.left - parentOffset.left,
      }
    },
    offsetParent(this: FnThis): MeptoCollection {
      return this.map(function (this: Element): Element | null {
        let parent: Element | null = (this as HTMLElement).offsetParent || document.body
        // perf: readStyle avoids a $() wrapper allocation per loop iteration
        while (
          parent &&
          !rootNodeRE.test(parent.nodeName) &&
          readStyle(parent, 'position', 'position') == 'static'
        )
          parent = (parent as HTMLElement).offsetParent
        return parent
      }) as unknown as MeptoCollection // $.map drops the nulls at runtime
    },
  } as unknown as MeptoCollection // impl signatures are wider than the public interface (compile-time view only)

  // for now
  $.fn.detach = $.fn.remove

  /**
   * Provides a `classList`-compatible API on Mepto collections, mirroring
   * the native `Element.classList` (`DOMTokenList`). This is a migration
   * bridge: an LLM can map `$('.x').addClass('y')` → `$('.x').classList.add('y')`
   * → `el.classList.add('y')` without any conceptual leap.
   *
   * All mutating methods (`add`, `remove`, `toggle`, `replace`) return the
   * Mepto collection for chaining:
   *
   *   $('.item').classList.add('active').classList.remove('stale')
   *
   * Read methods (`contains`, `toString`) operate on the first element.
   *
   *   $('.item').classList.contains('active')   // → true | false
   *   $('.item').classList.toString()            // → "foo bar baz"
   */
  Object.defineProperty($.fn, 'classList', {
    get() {
      const collection = this
      return {
        add(...tokens: string[]) {
          return collection.each(function (this: Element) {
            this.classList.add(...tokens)
          })
        },
        remove(...tokens: string[]) {
          return collection.each(function (this: Element) {
            this.classList.remove(...tokens)
          })
        },
        toggle(token: string, force?: boolean) {
          return collection.each(function (this: Element) {
            this.classList.toggle(token, force)
          })
        },
        contains(token: string): boolean {
          return collection.length > 0 && collection[0].classList.contains(token)
        },
        replace(oldToken: string, newToken: string) {
          return collection.each(function (this: Element) {
            this.classList.replace(oldToken, newToken)
          })
        },
        entries() {
          return collection.length > 0
            ? collection[0].classList.entries()
            : ([] as string[])[Symbol.iterator]()
        },
        forEach(callback: (value: string, key: number, list: DOMTokenList) => void) {
          if (collection.length > 0) collection[0].classList.forEach(callback)
        },
        item(index: number): string | null {
          return collection.length > 0 ? collection[0].classList.item(index) : null
        },
        keys() {
          return collection.length > 0
            ? collection[0].classList.keys()
            : ([] as string[])[Symbol.iterator]()
        },
        values() {
          return collection.length > 0
            ? collection[0].classList.values()
            : ([] as string[])[Symbol.iterator]()
        },
        toString(): string {
          return collection.length > 0 ? collection[0].classList.toString() : ''
        },
        get length(): number {
          return collection.length > 0 ? collection[0].classList.length : 0
        },
        get value(): string {
          return collection.length > 0 ? collection[0].classList.value : ''
        },
        set value(val: string) {
          collection.each(function (this: Element) {
            this.classList.value = val
          })
        },
      }
    },
  })

  // Generate the `width` and `height` functions
  ;['width', 'height'].forEach(dimension => {
    const dimensionProperty = dimension.replace(/./, m => {
      return m[0].toUpperCase()
    })

    // `$.fn[dimension]` — dynamic key; the width/height methods exist on the
    // runtime object but not in the public MeptoCollection interface.
    ;($.fn as unknown as Record<string, unknown>)[dimension] = function (
      this: FnThis,
      value?: number | string | ((idx: number, current: number) => number | string)
    ): number | MeptoCollection {
      let offset: { width: number; height: number } | null,
        el = this[0]
      if (value === undefined)
        return isWindow(el)
          ? (el as unknown as Window)[('inner' + dimensionProperty) as 'innerWidth' | 'innerHeight']
          : isDocument(el)
            ? (el as unknown as Document).documentElement[
                ('scroll' + dimensionProperty) as 'scrollWidth' | 'scrollHeight'
              ]
            : (((offset = this.offset() as unknown as { width: number; height: number } | null) &&
                offset![dimension as 'width' | 'height']) as number)
      else
        return this.each(function (this: Element, idx) {
          const $el = $(this)
          $el.css(
            dimension,
            isFunction(value)
              ? (value as (idx: number, current: number) => number | string).call(
                  this,
                  idx,
                  ($el as unknown as Record<string, () => number>)[dimension]() as number
                )
              : (value as string | number)
          )
        })
    }
  })

  // Generate the `outerWidth` and `outerHeight` functions. jQuery semantics:
  // border-box size (offsetWidth/offsetHeight), plus margins when
  // `includeMargin` is true. Declared in the public MeptoCollection interface.
  ;['width', 'height'].forEach(dimension => {
    const dimensionProperty = dimension.replace(/./, m => {
      return m[0].toUpperCase()
    })
    const offsetProperty = ('offset' + dimensionProperty) as 'offsetWidth' | 'offsetHeight'
    const margins =
      dimension === 'width'
        ? (['marginLeft', 'marginRight'] as const)
        : (['marginTop', 'marginBottom'] as const)

    ;($.fn as unknown as Record<string, unknown>)['outer' + dimensionProperty] = function (
      this: FnThis,
      includeMargin?: boolean
    ): number {
      const el = this[0] as HTMLElement | undefined
      if (el?.nodeType !== 1) return 0
      let size = el[offsetProperty]
      if (includeMargin) {
        const style = getComputedStyle(el)
        size += parseFloat(style[margins[0]]) + parseFloat(style[margins[1]])
      }
      return size
    }
  })

  /**
   * Recursively visits `node` and all its descendants, calling
   * `callback` on each. Used to execute inline `<script>` tags
   * after DOM insertion.
   *
   * @param node     - The root node to traverse.
   * @param callback - Function called for each node in the subtree.
   */
  function traverseNode(node: Node | null | undefined, callback: (node: Node) => void): void {
    if (!node) return
    callback(node)
    const children = node.childNodes
    for (let i = 0, len = children.length; i < len; i++) {
      traverseNode(children[i], callback)
    }
  }

  // Generate the `after`, `prepend`, `before`, `append`,
  // `insertAfter`, `insertBefore`, `appendTo`, and `prependTo` methods.
  adjacencyOperators.forEach((operator, operatorIndex) => {
    const inside = operatorIndex % 2

    ;($.fn as unknown as Record<string, unknown>)[operator] = function (
      this: FnThis,
      ...args: (string | Element | ArrayLike<Element> | null | undefined)[]
    ): MeptoCollection {
      // arguments can be nodes, arrays of nodes, mepto objects and HTML strings
      let argType: string,
        nodes = $.map(args, arg => {
          const arr: (Element | Node | null | undefined)[] = []
          argType = type(arg)
          if (argType == 'array') {
            ;(arg as unknown[]).forEach((el: unknown) => {
              if ((el as Node).nodeType !== undefined) return arr.push(el as Element)
              else if (mepto.isZ(el))
                return arr.push(...((el as MeptoCollection).get() as Element[]))
              arr.push(...(mepto.fragment(el as string) as Element[]))
            })
            return arr
          }
          return argType === 'object' || arg == null || (arg as Node).nodeType !== undefined
            ? arg
            : mepto.fragment(arg as string)
        }) as unknown as (Node | null | undefined)[],
        parent: Node | null,
        copyByClone = this.length > 1
      if (nodes.length < 1) return this

      return this.each((_, target) => {
        parent = inside ? target : target.parentNode

        // convert all methods to a "before" operation
        target = (
          operatorIndex == 0
            ? target.nextSibling
            : operatorIndex == 1
              ? target.firstChild
              : operatorIndex == 2
                ? target
                : null
        ) as Element

        const parentInDocument = $.contains(document.documentElement, parent as unknown as Element)

        nodes.forEach(node => {
          if (copyByClone) node = (node as Node).cloneNode(true)
          else if (!parent) return $(node as Element).remove()

          parent!.insertBefore(node as Node, target)
          if (parentInDocument)
            traverseNode(node, el => {
              // perf: direct comparison — nodeName is already uppercase for
              // HTML elements, so no per-node toUpperCase() string allocation
              // (R8). Caveat: in XML documents nodeName keeps the source case,
              // so a lowercase <script> there would be missed (accepted).
              const script = el as HTMLScriptElement
              if (
                el.nodeName === 'SCRIPT' &&
                (!script.type || script.type === 'text/javascript') &&
                !script.src
              ) {
                const win = script.ownerDocument ? script.ownerDocument.defaultView : window
                ;(win as unknown as Record<string, (...evalArgs: unknown[]) => unknown>)[
                  'eval'
                ].call(win, script.innerHTML)
              }
            })
        })
      })
    }

    // after    => insertAfter
    // prepend  => prependTo
    // before   => insertBefore
    // append   => appendTo
    ;($.fn as unknown as Record<string, unknown>)[
      inside ? operator + 'To' : 'insert' + (operatorIndex ? 'Before' : 'After')
    ] = function (this: FnThis, html: string | Element | ArrayLike<Element>): MeptoCollection {
      ;(
        $(html as string | Element | Element[]) as unknown as Record<string, (arg: FnThis) => void>
      )[operator](this)
      return this
    }
  })

  mepto.Z.prototype = Z.prototype = $.fn

  // Export internal API functions in the `$.mepto` namespace
  mepto.uniq = uniq
  mepto.deserializeValue = deserializeValue
  // `mepto` is absent from the public MeptoStatic interface; attach via cast
  ;($ as unknown as Record<string, unknown>).mepto = mepto

  return $
})()

// If `$` is not yet defined, point it to `mepto`
const globalScope = window as unknown as Record<string, unknown>
globalScope.mepto = mepto
globalScope.$ === undefined && (globalScope.$ = mepto)
