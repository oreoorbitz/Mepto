//     mepto.js
//     (c) 2010-2017 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoCollection, type MeptoStatic, type PlainObject } from './types'

const mepto: MeptoStatic = (function (): MeptoStatic {
  let $: MeptoStatic = null as unknown as MeptoStatic
  const emptyArray: any[] = []
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const filter = Array.prototype.filter
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const slice = Array.prototype.slice
  const document = window.document
  const elementDisplay: Record<string, any> = {}
  const classCache: Record<string, any> = {}
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

  const adjacencyOperators = ['after', 'prepend', 'before', 'append']
  const table = document.createElement('table')
  const tableRow = document.createElement('tr')
  const containers = {
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
  const mepto: any = {}
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
  function likeArray(obj: unknown): boolean {
    // Fast path: native arrays are always array-like
    if (isArray(obj)) return true

    // Filter out primitives, null, and functions.
    // typeof obj !== 'object' safely excludes strings, numbers, booleans, and functions.
    // !obj excludes null (typeof null === 'object').
    if (!obj || typeof obj !== 'object') return false

    // The Window object is an object with a `length` property, but it is not array-like.
    if (isWindow(obj)) return false

    // Check for a valid `length` property indicating array-like behavior
    const length = (obj as any).length
    if (length === 0) return true

    // Ensure length is a valid number and the last expected index exists
    return typeof length === 'number' && length > 0 && length - 1 in obj
  }

  /**
   * Filters out `null` and `undefined` values from an array-like object.
   * Uses a type guard to narrow the return type to non-nullable values.
   */
  function compact<T>(array: ArrayLike<T | null | undefined>): T[] {
    return filter.call(array, (item: T | null | undefined): item is T => item != null)
  }

  /**
   * Flattens a single level of nested arrays.
   * Returns an empty array for empty or falsy input to ensure a consistent return type.
   */
  function flatten<T>(array: (T | T[])[]): T[] {
    if (!array || array.length === 0) return [] as T[]
    return $.fn.concat.apply([], array) as T[]
  }

  /**
   * Converts a dash-separated string to camelCase.
   * Handles leading, trailing, and consecutive dashes gracefully.
   */
  const camelize = (str: string): string =>
    str.replace(/-+(.)?/g, (_match: string, chr?: string): string => (chr ? chr.toUpperCase() : ''))
  /**
   * Converts a camelCase or PascalCase string to a dash-separated lowercase
   * string (e.g. `backgroundColor` → `background-color`, `XMLParser` →
   * `xml-parser`).  The `::` token is treated as a namespace separator and
   * converted to `/`.
   */
  function dasherize(str: string): string {
    if (!str) return str
    return str
      .replace(doubleColonRE, '/') // `::` → `/` (namespace separator)
      .replace(upperUpperLowerRE, '$1_$2') // `XMLParser` → `XML_Parser`
      .replace(lowerDigitUpperRE, '$1_$2') // `fooBar1B` → `foo_Bar1_B`
      .replace(underscoreRE, '-') // `_` → `-`
      .toLowerCase()
  }
  /**
   * Returns a new array with duplicate elements removed, preserving the
   * order of first occurrence. Uses a `Set` for O(n) lookups instead of
   * repeated `indexOf` scans (which would be O(n²)).
   */
  const uniq = function <T>(array: ArrayLike<T>): T[] {
    if (!array || array.length === 0) return []
    const seen = new Set<T>()
    return filter.call(array, (item: T): boolean => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    }) as T[]
  }

  /**
   * Builds (and caches) a RegExp that matches a CSS class name as a
   * whole word — i.e., bounded by whitespace or start/end of the string.
   * Returns an empty-matching RegExp for falsy names as a safe fallback.
   *
   * @param name - The CSS class name to build a regex for.
   */
  function classRE(name: string): RegExp {
    if (!name) return /(?:)/
    return name in classCache
      ? classCache[name]
      : (classCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)'))
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
    if (!elementDisplay[nodeName]) {
      const element = document.createElement(nodeName)
      document.body.appendChild(element)

      let display = getComputedStyle(element, '').getPropertyValue('display')

      const parent = element.parentNode
      if (parent) {
        parent.removeChild(element)
      }

      if (display === 'none') {
        display = 'block'
      }

      elementDisplay[nodeName] = display
    }
    return elementDisplay[nodeName]
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
    const key = name !== undefined && name in containers ? (name as keyof typeof containers) : '*'
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
    return 'children' in element ? slice.call((element as Element).children) : []
  }

  /**
   * Mepto collection constructor. Stores matched DOM elements as indexed
   * properties with a `length` and `selector` string.
   * Not called directly — use `mepto.Z()` which delegates here.
   *
   * @param dom      - Array-like list of matched elements.
   * @param selector - The CSS selector string that produced this collection.
   */
  function Z(
    this: MeptoCollection & { selector?: string },
    dom: ArrayLike<Element> | null | undefined,
    selector: string
  ): void {
    const len = dom ? dom.length : 0
    for (let i = 0; i < len; i++) {
      if (dom) {
        ;(this as any)[i] = dom[i]
      }
    }
    this.length = len
    this.selector = selector || ''
  }

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
      dom = $(document.createElement(singleMatch[1]))
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
      dom = $.each(slice.call(container.childNodes) as Element[], function (this: ChildNode) {
        container.removeChild(this)
      }) as unknown as ArrayLike<Element>
    }

    if (isPlainObject(properties)) {
      const nodes = $(dom as unknown as Element[])

      Object.entries(properties).forEach(([key, value]) => {
        if (methodAttributes.includes(key)) {
          const methodName = key as keyof typeof nodes
          const method = nodes[methodName] as (val: unknown) => void
          method.call(nodes, value)
        } else {
          nodes.attr(key, value as string | number | null)
        }
      })
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
  mepto.Z = function (dom: ArrayLike<Element> | null | undefined, selector: string) {
    return new Z(dom, selector)
  }

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
  mepto.init = function (selector: any, context?: any): any {
    let dom: ArrayLike<Element> | null | undefined
    let finalSelector: any = selector

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
        dom = mepto.fragment(str, fragMatch[1], context)
        finalSelector = null
      } else if (context !== undefined) {
        return $(context).find(str)
      } else {
        dom = mepto.qsa(document, str)
      }
    } else if (isFunction(selector)) {
      return $(document).ready(selector)
    } else if (mepto.isZ(selector)) {
      return selector
    } else {
      if (isArray(selector)) {
        dom = compact(selector)
      } else if (isObject(selector)) {
        dom = [selector]
        finalSelector = null
      } else {
        const fragMatch = fragmentRE.exec(selector)
        if (fragMatch) {
          dom = mepto.fragment(selector.trim(), fragMatch[1], context)
          finalSelector = null
        } else if (context !== undefined) {
          return $(context).find(selector)
        } else {
          dom = mepto.qsa(document, selector)
        }
      }
    }

    return mepto.Z(dom, finalSelector)
  }

  /**
   * The main Mepto factory function. Delegates to `mepto.init` so that
   * selector logic remains patchable in plugins.
   *
   * @param selector - Selector string, element, array, function, or collection.
   * @param context  - Optional root element to scope the query.
   * @returns A Mepto collection.
   */
  $ = function (selector: any, context?: any) {
    return mepto.init(selector, context)
  }

  /**
   * Recursively merge properties from `source` into `target`.
   * When `deep` is true, plain objects and arrays are merged recursively;
   * otherwise properties are copied by reference (shallow copy).
   * Properties with `undefined` values are always skipped.
   */
  function extend(target: Record<string, any>, source: Record<string, any>, deep: boolean): void {
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue

      const sourceValue = source[key]

      if (deep && (isPlainObject(sourceValue) || isArray(sourceValue))) {
        // Ensure the target has a compatible container before recursing
        if (isPlainObject(sourceValue) && !isPlainObject(target[key])) {
          target[key] = {}
        }
        if (isArray(sourceValue) && !isArray(target[key])) {
          target[key] = []
        }
        extend(target[key], sourceValue, deep)
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
  $.extend = function (target: any, ...rest: any[]): any {
    let deep = false
    let destination = target

    if (typeof target === 'boolean') {
      deep = target
      destination = rest.shift()
    }

    rest.forEach(function (arg) {
      extend(destination, arg, deep)
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
    if (maybeID && isSimple && 'getElementById' in element) {
      const found = (element as Document).getElementById(nameOnly)
      return found ? [found] : []
    }

    // Only Element (1), Document (9), and DocumentFragment (11) support query methods
    const nodeType = (element as Node).nodeType
    if (nodeType !== 1 && nodeType !== 9 && nodeType !== 11) {
      return []
    }

    // Fast path: simple class or tag lookup via getElementsByClassName/TagName
    // (DocumentFragment doesn't have getElementsByClassName/TagName)
    if (isSimple && !maybeID && 'getElementsByClassName' in element) {
      const results = maybeClass
        ? (element as Document).getElementsByClassName(nameOnly)
        : (element as Document).getElementsByTagName(selector)
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
  mepto.getElementsByClassName = function (className: string, context?: ParentNode): MeptoCollection {
    const root = context || document
    if (!('getElementsByClassName' in root)) return $() as unknown as MeptoCollection
    const elements = (root as Element).getElementsByClassName(className)
    return $(slice.call(elements) as Element[]) as unknown as MeptoCollection
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
  mepto.getElementsByTagName = function (tagName: string, context?: Document | Element): MeptoCollection {
    const root: Document | Element = context || document
    if (!('getElementsByTagName' in root)) return $() as unknown as MeptoCollection
    const elements = root.getElementsByTagName(tagName)
    return $(slice.call(elements) as Element[]) as unknown as MeptoCollection
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
    if (!('getElementById' in root)) return $() as unknown as MeptoCollection
    const found = (root as Document).getElementById(id)
    return found ? ($( [found] as Element[] ) as unknown as MeptoCollection) : ($() as unknown as MeptoCollection)
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
  function filtered(nodes: Element | ArrayLike<Element>, selector?: string | null): any {
    if (selector == null) return $(nodes)
    return $(nodes).filter(selector)
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
  function setAttribute(node: Element, name: string, value: string | null | undefined): void {
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
  function className(node: Element & { className: any }, value?: string): string | void {
    const klass = node.className || ''
    const svg = klass && klass.baseVal !== undefined

    if (value === undefined) return svg ? klass.baseVal : klass
    svg ? (klass.baseVal = value) : (node.className = value)
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

    // JSON arrays/objects — charAt is cheaper than regex for first-char check
    if (value.charAt(0) === '[' || value.charAt(0) === '{') {
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
    const type = typeof val
    return (
      (val != null &&
        type !== 'boolean' &&
        (type !== 'string' || (val as string).length) &&
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
  $.expr = {}
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
      const arr = elements as ArrayLike<T>
      for (let i = 0; i < arr.length; i++) {
        const value = callback(arr[i], i)
        if (value != null) values.push(value)
      }
    } else {
      for (const key in elements as Record<string, T>) {
        const value = callback((elements as Record<string, T>)[key], key)
        if (value != null) values.push(value)
      }
    }
    return flatten(values)
  }

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
      const arr = elements as ArrayLike<T>
      for (let i = 0, len = arr.length; i < len; i++) {
        const item = arr[i]
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
  }

  /**
   * Filters `elements` using `callback`, returning only items for which
   * `callback` returns `true`. Delegates to `Array.prototype.filter`.
   *
   * @param elements - An array-like collection to filter.
   * @param callback - Predicate function called with `(item, index)`.
   * @returns A new array of matching elements.
   */
  $.grep = function (elements, callback) {
    return filter.call(elements, callback)
  }

  if (window.JSON) $.parseJSON = JSON.parse

  // Define methods that will be available on all
  // mepto collections
  $.fn = {
    letructor: mepto.Z,
    length: 0,

    // Because a collection acts like an array,
    // copy over these useful native array methods.
    // Explicit functions are used over emptyArray.* to satisfy unbound-method linter rules
    // while preserving the dynamic `this` binding required for array-like operations.
    forEach(
      this: any[],
      callback: (value: any, index: number, array: any[]) => void,
      thisArg?: any
    ): void {
      return emptyArray.forEach.call(this, callback, thisArg)
    },
    reduce(
      this: any[],
      callback: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any,
      initialValue?: any
    ): any {
      return arguments.length > 1
        ? emptyArray.reduce.call(this, callback, initialValue)
        : emptyArray.reduce.call(this, callback)
    },
    push(this: any[], ...items: any[]): number {
      return emptyArray.push.apply(this, items)
    },
    sort(this: any[], compareFn?: (a: any, b: any) => number): any[] {
      return emptyArray.sort.call(this, compareFn)
    },
    splice(this: any[], ...args: Parameters<Array<any>['splice']>): any[] {
      return emptyArray.splice.apply(this, args)
    },
    indexOf(this: any[], searchElement: any, fromIndex?: number): number {
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
    concat(...args: any[]): any[] {
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
      return $($.map(this, (el, i) => fn.call(el, i, el)))
    },
    slice(start?: number, end?: number): MeptoCollection {
      return $(slice.call(this, start, end))
    },

    /**
     * Executes `callback` when the DOM is ready (DOMContentLoaded).
     * If the DOM is already loaded, the callback is scheduled via `setTimeout`.
     *
     * @param callback - Function receiving the `$` factory.
     * @returns The collection for chaining.
     */
    ready(callback: (mepto: any) => void): any {
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
    get(idx?: number): any {
      return idx === undefined ? slice.call(this) : this[idx >= 0 ? idx : idx + this.length]
    },
    toArray(): Element[] {
      return this.get()
    },
    size(): number {
      return this.length
    },
    remove(): MeptoCollection {
      return this.each(function () {
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
    each(callback: (this: Element, index: number, element: Element) => boolean | void): MeptoCollection {
      for (let i = 0, len = this.length; i < len; i++) {
        const element = this[i]
        if (callback.call(element, i, element) === false) break
      }
      return this as unknown as MeptoCollection
    },
    /**
     * Filters the collection by a CSS selector or predicate function.
     * When a function is provided, keeps elements for which it returns `true`.
     * When a string is provided, keeps elements matching the selector.
     *
     * @param selector - CSS selector string or predicate function.
     * @returns A new Mepto collection of matching elements.
     */
    filter(selector: string | ((index: number, element: Element) => boolean)): MeptoCollection {
      if (selector == null) return $() as unknown as MeptoCollection
      const predicate: (el: Element, i: number) => boolean = isFunction(selector)
        ? (el, i) => selector.call(el, i, el)
        : el => mepto.matches(el, selector as string)
      return $(filter.call(this, predicate)) as unknown as MeptoCollection
    },
    add(selector: any, context?: any): MeptoCollection {
      return $(uniq(this.concat($(selector, context)))) as unknown as MeptoCollection
    },
    /**
     * Checks whether the first element matches the given CSS selector,
     * or compares `selector` properties when passed a Mepto collection.
     *
     * @param selector - CSS selector string or Mepto collection to compare.
     * @returns `true` if the first element matches.
     */
    is(selector: string | { selector: string }): boolean {
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
      selector: string | Element | ArrayLike<Element> | ((this: Element, index: number) => boolean)
    ): MeptoCollection {
      if (isFunction(selector)) {
        // isFunction narrows selector to (...args: unknown[]) => unknown,
        // so we can call it directly without casting to Function.
        return $(
          filter.call(this, function (el: Element, idx: number) {
            return !selector.call(el, idx)
          })
        ) as unknown as MeptoCollection
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
            : $(selector)

      // Build a Set for O(1) membership tests instead of repeated indexOf scans.
      const excludeSet = new Set<Element>()
      for (let i = 0, len = excludes.length; i < len; i++) {
        excludeSet.add(excludes[i] as Element)
      }

      return $(filter.call(this, (el: Element) => !excludeSet.has(el))) as unknown as MeptoCollection
    },
    /**
     * Filters elements to those that contain a descendant matching the
     * given selector, or that contain the given DOM node.
     *
     * @param selector - CSS selector string or DOM node.
     * @returns A new Mepto collection of matching elements.
     */
    has(selector: string | Node): MeptoCollection {
      return this.filter(function (this: HTMLElement) {
        return isObject(selector)
          ? $.contains(this, selector as Node)
          : $(this).find(selector as string).length > 0
      }) as unknown as MeptoCollection
    },
    /**
     * Returns the element at the given index as a Mepto collection.
     * Negative indices count from the end.
     *
     * @param idx - Zero-based index (negative counts from end).
     * @returns A new Mepto collection containing the single element.
     */
    eq(idx: number): MeptoCollection {
      return idx === -1 ? this.slice(idx) : this.slice(idx, +idx + 1)
    },
    first(): MeptoCollection {
      const el = this[0]
      return (el && !isObject(el) ? el : $(el)) as unknown as MeptoCollection
    },
    last(): MeptoCollection {
      const el = this[this.length - 1]
      return (el && !isObject(el) ? el : $(el)) as unknown as MeptoCollection
    },
    /**
     * Finds descendant elements matching the given CSS selector,
     * or filters for elements containing the given element(s).
     *
     * @param selector - CSS selector string, element, or array-like of elements.
     * @returns A new Mepto collection of matched descendants.
     */
    find(selector: string | Element | ArrayLike<Element>): MeptoCollection {
      if (!selector) return $() as unknown as MeptoCollection

      if (typeof selector == 'object') {
        const nodes = $(selector)
        const result: Element[] = []
        const parents = this
        for (let i = 0, nlen = nodes.length; i < nlen; i++) {
          for (let j = 0, plen = parents.length; j < plen; j++) {
            if ($.contains(parents[j], nodes[i] as unknown as Node)) {
              result.push(nodes[i] as unknown as Element)
              break
            }
          }
        }
        return $(result) as unknown as MeptoCollection
      }

      if (this.length == 1) return $(mepto.qsa(this[0], selector)) as unknown as MeptoCollection

      return $(
        uniq(
          flatten(
            $.map(this, (el: Element) => mepto.qsa(el, selector as string))
          )
        )
      ) as unknown as MeptoCollection
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
      selector: string | Element | ArrayLike<Element>,
      context?: Element | Document
    ): MeptoCollection {
      const nodes: Element[] = []
      const collection = typeof selector == 'object' && $(selector)
      const matchers: Set<Element> | null = collection ? new Set() : null
      const seen = new Set<Element>()

      if (matchers && collection) {
        for (let i = 0, len = collection.length; i < len; i++) {
          matchers.add(collection[i] as unknown as Element)
        }
      }

      for (let i = 0, len = this.length; i < len; i++) {
        let node: Node | null = this[i] as unknown as Node
        while (node) {
          if (
            matchers
              ? matchers.has(node as Element)
              : mepto.matches(node as Element, selector as string)
          ) {
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

      return $(nodes) as unknown as MeptoCollection
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
      selector: string | Element | ArrayLike<Element>,
      context?: Element | Document
    ): MeptoCollection {
      if (this.length === 0) return $() as unknown as MeptoCollection

      const firstEl = this[0] as Element

      if (typeof selector === 'string') {
        const found = firstEl.closest(selector)
        if (!found) return $() as unknown as MeptoCollection
        if (context && !context.contains(found)) return $() as unknown as MeptoCollection
        return $(found) as unknown as MeptoCollection
      }

      // For object selectors, fall back to a set-based match on the first element only
      const collection = $(selector)
      const matchers = new Set<Element>()
      for (let i = 0, len = collection.length; i < len; i++) {
        matchers.add(collection[i] as unknown as Element)
      }

      let node: Node | null = firstEl as Node
      while (node) {
        if (matchers.has(node as Element)) {
          return $(node as Element) as unknown as MeptoCollection
        }
        if (node === context || isDocument(node)) break
        node = node.parentNode
      }

      return $() as unknown as MeptoCollection
    },
    parents(selector?: string): MeptoCollection {
      const ancestors: Element[] = []
      let nodes: ArrayLike<Element> = this
      while (nodes.length > 0) {
        nodes = $.map(nodes as unknown as any[], function (node: any) {
          node = node.parentNode
          if (node && !isDocument(node) && ancestors.indexOf(node) < 0) {
            ancestors.push(node)
            return node
          }
        }) as unknown as ArrayLike<Element>
      }
      return filtered(ancestors, selector) as unknown as MeptoCollection
    },
    parent(selector?: string): MeptoCollection {
      const parents: Element[] = []
      const seen = new Set<Node>()
      for (let i = 0, len = this.length; i < len; i++) {
        const parent = this[i].parentNode
        if (parent && !seen.has(parent)) {
          seen.add(parent)
          parents.push(parent as Element)
        }
      }
      return filtered(parents, selector) as unknown as MeptoCollection
    },
    children(selector?: string): MeptoCollection {
      return filtered(
        this.map(function () {
          return children(this as unknown as Node)
        }),
        selector
      ) as unknown as MeptoCollection
    },
    contents(): MeptoCollection {
      return this.map(function () {
        return (this as any).contentDocument || slice.call((this as unknown as Node).childNodes)
      }) as unknown as MeptoCollection
    },
    siblings(selector?: string): MeptoCollection {
      return filtered(
        this.map(function (i: number, el: Element) {
          return filter.call(children(el.parentNode!), function (child: Element) {
            return child !== el
          })
        }),
        selector
      ) as unknown as MeptoCollection
    },
    empty(): MeptoCollection {
      return this.each(function () {
        setInnerHTML(this, '')
      })
    },
    // `pluck` is borrowed from Prototype.js
    pluck: function (property: string) {
      return $.map(this, function (el: any) {
        return el[property]
      })
    },
    show: function () {
      return this.each(function () {
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
    replaceWith: function (newContent: any) {
      return this.before(newContent).remove()
    },
    /**
     * Wraps `structure` around each element in the collection.
     * `structure` can be an HTML string, DOM element, or a function
     * returning one.
     *
     * @param structure - Wrapper element, HTML string, or function.
     * @returns The original collection for chaining.
     */
    wrap: function (structure: string | Element | ((index: number) => string | Element)) {
      const isCallable = isFunction(structure)
      let wrapperElement: Element | undefined
      let shouldClone = false

      if (this[0] && !isCallable) {
        wrapperElement = $(structure).get(0)
        shouldClone = !!wrapperElement && (!!wrapperElement.parentNode || this.length > 1)
      }

      return this.each(function (index) {
        const wrapper = isCallable
          ? (structure as Function).call(this, index)
          : shouldClone
            ? wrapperElement!.cloneNode(true)
            : wrapperElement
        $(this).wrapAll(wrapper)
      })
    },
    /**
     * Wraps `structure` around the entire collection as a single group,
     * inserting it before the first element and moving all elements inside.
     *
     * @param structure - Wrapper element, HTML string, or Mepto collection.
     * @returns The original collection for chaining.
     */
    wrapAll: function (structure: string | Element | ArrayLike<Element>) {
      if (!this[0]) return this

      const wrapper = $(structure)
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
    wrapInner: function (
      structure: string | Element | ((index: number) => string | Element) | null
    ) {
      if (structure == null) return this

      const isCallable = isFunction(structure)
      return this.each(function (index) {
        const self = $(this)
        const contents = self.contents()
        const wrappingContent = isCallable ? (structure as Function).call(this, index) : structure

        if (contents.length) {
          contents.wrapAll(wrappingContent)
        } else {
          self.append(wrappingContent)
        }
      })
    },
    unwrap(): MeptoCollection {
      this.parent().each(function () {
        $(this).replaceWith($(this).children())
      })
      return this
    },
    clone(): MeptoCollection {
      return this.map(function () {
        return this.cloneNode(true)
      }) as unknown as MeptoCollection
    },
    hide(): MeptoCollection {
      return this.css('display', 'none')
    },
    toggle(setting?: boolean): MeptoCollection {
      return this.each(function () {
        const el = $(this)
        ;(setting === undefined ? el.css('display') == 'none' : setting) ? el.show() : el.hide()
      })
    },
    prev(selector?: string): MeptoCollection {
      return $(this.pluck('previousElementSibling')).filter(selector || '*') as unknown as MeptoCollection
    },
    next(selector?: string): MeptoCollection {
      return $(this.pluck('nextElementSibling')).filter(selector || '*') as unknown as MeptoCollection
    },
    /**
     * Gets or sets the `innerHTML` of elements.
     * When called without arguments, returns the HTML of the first element.
     * Accepts a function receiving `(index, currentHtml)`.
     *
     * @param html - HTML string or function returning HTML.
     * @returns HTML string (getter) or the collection (setter).
     */
    html(html?: string | ((idx: number, currentHtml: string) => string)): string | null | MeptoCollection {
      return 0 in arguments
        ? this.each(function (idx) {
            const originHtml = this.innerHTML
            $(this)
              .empty()
              .append(isFunction(html) ? html.call(this, idx, originHtml) : html)
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
    text: function (
      text?: string | number | null | ((idx: number, current: string | null) => string | null)
    ) {
      return 0 in arguments
        ? this.each(function (idx) {
            const newText = isFunction(text)
              ? (text as Function).call(this, idx, this.textContent)
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
    attr: function (
      name: string | Record<string, string | null | undefined>,
      value?: string | null | ((i: number, old: string | null) => string | null)
    ) {
      // Getter
      if (typeof name == 'string' && arguments.length < 2) {
        if (this.length > 0 && this[0].nodeType === 1) {
          const result = this[0].getAttribute(name)
          return result != null ? result : undefined
        }
        return undefined
      }

      // Setter
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i]
        if (el.nodeType !== 1) continue
        if (isObject(name)) {
          for (const k in name as Record<string, string | null>)
            setAttribute(el, k, (name as Record<string, string | null>)[k])
        } else {
          setAttribute(
            el,
            name as string,
            isFunction(value)
              ? (value as Function).call(el, i, el.getAttribute(name as string))
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
    removeAttr: function (name: string) {
      return this.each(function () {
        this.nodeType === 1 &&
          name.split(' ').forEach(function (attribute) {
            setAttribute(this as any, attribute)
          }, this)
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
    prop: function (name: string | Record<string, any>, value?: any) {
      const resolvedName: string | Record<string, any> =
        typeof name === 'string' ? propMap[name] || name : name
      return typeof resolvedName == 'string' && !(1 in arguments)
        ? this[0] && (this[0] as any)[resolvedName]
        : this.each(function (idx) {
            if (isObject(resolvedName)) {
              for (const k in resolvedName as Record<string, any>)
                (this as any)[propMap[k] || k] = (resolvedName as Record<string, any>)[k]
            } else {
              ;(this as any)[resolvedName as string] = isFunction(value)
                ? value.call(this, idx, (this as any)[resolvedName as string])
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
    removeProp: function (name: string) {
      const resolvedName = propMap[name] || name
      return this.each(function () {
        delete (this as any)[resolvedName]
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
    data: function (name: string, value?: any) {
      const attrName = 'data-' + name.replace(capitalRE, '-$1').toLowerCase()

      if (arguments.length > 1) {
        return this.attr(attrName, value)
      }

      const data = this.attr(attrName)
      return data !== undefined ? deserializeValue(data) : undefined
    },
    /**
     * Gets or sets the value of form elements.
     * For `<select multiple>`, returns an array of selected values.
     * Accepts a function receiving `(index, currentValue)`.
     *
     * @param value - Value string, array, or function.
     * @returns Value (getter) or the collection (setter).
     */
    val: function (value?: string | string[] | ((idx: number, current: string) => string)) {
      // Setter
      if (arguments.length > 0) {
        const v = value == null ? '' : value
        for (let i = 0, len = this.length; i < len; i++) {
          const el = this[i] as any
          el.value = isFunction(v) ? (v as Function).call(el, i, el.value) : v
        }
        return this
      }

      // Getter
      const el = this[0] as any
      if (!el) return undefined

      if (el.multiple) {
        const result: string[] = []
        for (let i = 0, len = el.selectedOptions.length; i < len; i++) {
          result.push(el.selectedOptions[i].value)
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
    offset: function (
      coordinates?:
        | { top: number; left: number }
        | ((index: number, current: { top: number; left: number }) => { top: number; left: number })
    ) {
      if (coordinates)
        return this.each(function (index) {
          const $this = $(this)
          const coords = isFunction(coordinates)
            ? (coordinates as Function).call(this, index, $this.offset())
            : (coordinates as { top: number; left: number })
          const parentOffset = $this.offsetParent().offset()
          const props: Record<string, string | number> = {
            top: coords.top - parentOffset.top,
            left: coords.left - parentOffset.left,
          }
          if ($this.css('position') == 'static') props['position'] = 'relative'
          $this.css(props)
        })
      if (!this.length) return null
      if (document.documentElement !== this[0] && !$.contains(document.documentElement, this[0]))
        return { top: 0, left: 0 }
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
    css: function (
      property: string | string[] | Record<string, string | number | null | undefined>,
      value?: string | number | null
    ) {
      if (arguments.length < 2) {
        const element = this[0] as HTMLElement | undefined
        if (typeof property == 'string') {
          if (!element) return
          return (
            (element.style as any)[camelize(property as string)] ||
            getComputedStyle(element, '').getPropertyValue(property as string)
          )
        } else if (isArray(property)) {
          if (!element) return
          const props: Record<string, string> = {}
          const computedStyle = getComputedStyle(element, '')
          $.each(property as string[], function (_: number, prop: string) {
            props[prop] =
              (element.style as any)[camelize(prop)] || computedStyle.getPropertyValue(prop)
          })
          return props
        }
      }

      let css = ''
      if (type(property) == 'string') {
        if (!value && value !== 0)
          this.each(function () {
            ;(this as HTMLElement).style.removeProperty(dasherize(property as string))
          })
        else
          css =
            dasherize(property as string) +
            ':' +
            maybeAddPx(property as string, value as string | number)
      } else {
        for (const key in property as Record<string, any>) {
          if (
            !(property as Record<string, any>)[key] &&
            (property as Record<string, any>)[key] !== 0
          )
            this.each(function () {
              ;(this as HTMLElement).style.removeProperty(dasherize(key))
            })
          else
            css +=
              dasherize(key) + ':' + maybeAddPx(key, (property as Record<string, any>)[key]) + ';'
        }
      }

      return this.each(function () {
        ;(this as HTMLElement).style.cssText += ';' + css
      })
    },
    /**
     * Returns the index of the first element among its siblings,
     * or the index of `element` within this collection.
     *
     * @param element - Optional selector or element to locate.
     * @returns Zero-based index.
     */
    index: function (element?: string | Element | ArrayLike<Element>): number {
      return element ? this.indexOf($(element)[0]) : this.parent().children().indexOf(this[0])
    },
    /**
     * Checks whether any element in the collection has the given CSS class.
     *
     * @param name - CSS class name to check for.
     * @returns `true` if at least one element has the class.
     */
    hasClass: function (name: string): boolean {
      if (!name) return false
      return emptyArray.some.call(
        this,
        function (this: RegExp, el: Element) {
          return this.test(className(el as any))
        },
        classRE(name)
      )
    },
    /**
     * Adds one or more CSS classes to every element. Duplicates are skipped.
     * Accepts a function receiving `(index, currentClass)`.
     *
     * @param name - Space-separated class names, or function returning them.
     * @returns The collection for chaining.
     */
    addClass: function (name: string | ((index: number, currentClass: string) => string)) {
      if (!name) return this
      return this.each(function (idx) {
        if (!('className' in this)) return
        const cls = className(this as any) as string
        const newName = isFunction(name)
          ? (name as Function).call(this, idx, cls)
          : (name as string)
        const toAdd: string[] = []
        newName.split(/\s+/g).forEach(function (klass) {
          if (!classRE(klass).test(cls)) toAdd.push(klass)
        })
        if (toAdd.length) className(this as any, cls + (cls ? ' ' : '') + toAdd.join(' '))
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
    removeClass: function (name?: string | ((index: number, currentClass: string) => string)) {
      return this.each(function (idx) {
        if (!('className' in this)) return
        if (name === undefined) return className(this as any, '')
        let cls = className(this as any) as string
        const resolved = isFunction(name)
          ? (name as Function).call(this, idx, cls)
          : (name as string)
        resolved.split(/\s+/g).forEach(function (klass) {
          cls = cls.replace(classRE(klass), ' ')
        })
        className(this as any, cls.trim())
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
    toggleClass: function (
      name: string | ((index: number, currentClass: string) => string),
      when?: boolean
    ) {
      if (!name) return this
      return this.each(function (idx) {
        const $this = $(this)
        const names = isFunction(name)
          ? (name as Function).call(this, idx, className(this as any))
          : (name as string)
        names.split(/\s+/g).forEach(function (klass) {
          ;(when === undefined ? !$this.hasClass(klass) : when)
            ? $this.addClass(klass)
            : $this.removeClass(klass)
        })
      })
    },
    /**
     * Gets or sets the vertical scroll position of the first element.
     *
     * @param value - Scroll position in pixels (omit to get).
     * @returns Current scroll position (getter) or the collection (setter).
     */
    scrollTop: function (value?: number) {
      if (!this.length) return
      const hasScrollTop = 'scrollTop' in this[0]
      if (value === undefined)
        return hasScrollTop ? (this[0] as any).scrollTop : (this[0] as any).pageYOffset
      return this.each(
        hasScrollTop
          ? function () {
              ;(this as any).scrollTop = value
            }
          : function () {
              ;(this as any).scrollTo((this as any).scrollX, value)
            }
      )
    },
    /**
     * Gets or sets the horizontal scroll position of the first element.
     *
     * @param value - Scroll position in pixels (omit to get).
     * @returns Current scroll position (getter) or the collection (setter).
     */
    scrollLeft: function (value?: number) {
      if (!this.length) return
      const hasScrollLeft = 'scrollLeft' in this[0]
      if (value === undefined)
        return hasScrollLeft ? (this[0] as any).scrollLeft : (this[0] as any).pageXOffset
      return this.each(
        hasScrollLeft
          ? function () {
              ;(this as any).scrollLeft = value
            }
          : function () {
              ;(this as any).scrollTo(value, (this as any).scrollY)
            }
      )
    },
    position: function () {
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
      offset.top -= parseFloat($(elem).css('margin-top')) || 0
      offset.left -= parseFloat($(elem).css('margin-left')) || 0

      // Add offsetParent borders
      parentOffset.top += parseFloat($(offsetParent[0]).css('border-top-width')) || 0
      parentOffset.left += parseFloat($(offsetParent[0]).css('border-left-width')) || 0

      return {
        top: offset.top - parentOffset.top,
        left: offset.left - parentOffset.left,
      }
    },
    offsetParent: function () {
      return this.map(function () {
        let parent = this.offsetParent || document.body
        while (parent && !rootNodeRE.test(parent.nodeName) && $(parent).css('position') == 'static')
          parent = parent.offsetParent
        return parent
      })
    },
  }

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
    get: function () {
      const collection = this
      return {
        add: function (...tokens: string[]) {
          return collection.each(function () {
            this.classList.add(...tokens)
          })
        },
        remove: function (...tokens: string[]) {
          return collection.each(function () {
            this.classList.remove(...tokens)
          })
        },
        toggle: function (token: string, force?: boolean) {
          return collection.each(function () {
            this.classList.toggle(token, force)
          })
        },
        contains: function (token: string): boolean {
          return collection.length > 0 && collection[0].classList.contains(token)
        },
        replace: function (oldToken: string, newToken: string) {
          return collection.each(function () {
            this.classList.replace(oldToken, newToken)
          })
        },
        entries: function () {
          return collection.length > 0
            ? collection[0].classList.entries()
            : ([] as string[])[Symbol.iterator]()
        },
        forEach: function (callback: (value: string, key: number, list: DOMTokenList) => void) {
          if (collection.length > 0) collection[0].classList.forEach(callback)
        },
        item: function (index: number): string | null {
          return collection.length > 0 ? collection[0].classList.item(index) : null
        },
        keys: function () {
          return collection.length > 0
            ? collection[0].classList.keys()
            : ([] as string[])[Symbol.iterator]()
        },
        values: function () {
          return collection.length > 0
            ? collection[0].classList.values()
            : ([] as string[])[Symbol.iterator]()
        },
        toString: function (): string {
          return collection.length > 0 ? collection[0].classList.toString() : ''
        },
        get length(): number {
          return collection.length > 0 ? collection[0].classList.length : 0
        },
        get value(): string {
          return collection.length > 0 ? collection[0].classList.value : ''
        },
        set value(val: string) {
          collection.each(function () {
            this.classList.value = val
          })
        },
      }
    },
  })

  // Generate the `width` and `height` functions
  ;['width', 'height'].forEach(function (dimension) {
    const dimensionProperty = dimension.replace(/./, function (m) {
      return m[0].toUpperCase()
    })

    $.fn[dimension] = function (value) {
      let offset,
        el = this[0]
      if (value === undefined)
        return isWindow(el)
          ? el['inner' + dimensionProperty]
          : isDocument(el)
            ? el.documentElement['scroll' + dimensionProperty]
            : (offset = this.offset()) && offset[dimension]
      else
        return this.each(function (idx) {
          el = $(this)
          el.css(dimension, isFunction(value) ? value.call(this, idx, el[dimension]()) : value)
        })
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
  function traverseNode(node: Node, callback: (node: any) => void): void {
    if (!node) return
    callback(node)
    const children = node.childNodes
    for (let i = 0, len = children.length; i < len; i++) {
      traverseNode(children[i], callback)
    }
  }

  // Generate the `after`, `prepend`, `before`, `append`,
  // `insertAfter`, `insertBefore`, `appendTo`, and `prependTo` methods.
  adjacencyOperators.forEach(function (operator, operatorIndex) {
    const inside = operatorIndex % 2

    $.fn[operator] = function () {
      // arguments can be nodes, arrays of nodes, mepto objects and HTML strings
      let argType,
        nodes = $.map(arguments, function (arg) {
          let arr = []
          argType = type(arg)
          if (argType == 'array') {
            arg.forEach(function (el) {
              if (el.nodeType !== undefined) return arr.push(el)
              else if ($.mepto.isZ(el)) return (arr = arr.concat(el.get()))
              arr = arr.concat(mepto.fragment(el))
            })
            return arr
          }
          return argType == 'object' || arg == null ? arg : mepto.fragment(arg)
        }),
        parent,
        copyByClone = this.length > 1
      if (nodes.length < 1) return this

      return this.each(function (_, target) {
        parent = inside ? target : target.parentNode

        // convert all methods to a "before" operation
        target =
          operatorIndex == 0
            ? target.nextSibling
            : operatorIndex == 1
              ? target.firstChild
              : operatorIndex == 2
                ? target
                : null

        const parentInDocument = $.contains(document.documentElement, parent)

        nodes.forEach(function (node) {
          if (copyByClone) node = node.cloneNode(true)
          else if (!parent) return $(node).remove()

          parent.insertBefore(node, target)
          if (parentInDocument)
            traverseNode(node, function (el) {
              if (
                el.nodeName != null &&
                el.nodeName.toUpperCase() === 'SCRIPT' &&
                (!el.type || el.type === 'text/javascript') &&
                !el.src
              ) {
                const target = el.ownerDocument ? el.ownerDocument.defaultView : window
                target['eval'].call(target, el.innerHTML)
              }
            })
        })
      })
    }

    // after    => insertAfter
    // prepend  => prependTo
    // before   => insertBefore
    // append   => appendTo
    $.fn[inside ? operator + 'To' : 'insert' + (operatorIndex ? 'Before' : 'After')] = function (
      html
    ) {
      $(html)[operator](this)
      return this
    }
  })

  mepto.Z.prototype = Z.prototype = $.fn

  // Export internal API functions in the `$.mepto` namespace
  mepto.uniq = uniq
  mepto.deserializeValue = deserializeValue
  $.mepto = mepto

  return $
})()

// If `$` is not yet defined, point it to `mepto`
window.mepto = mepto
window.$ === undefined && (window.$ = mepto)
