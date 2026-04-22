//     mepto.js
//     (c) 2010-2017 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type Mepto, type PlainObject } from './types';

let mepto: Mepto = (function () {
  let undefined;
  let $;
  let emptyArray: any[] = [];
  let concat = emptyArray.concat;
  let filter = emptyArray.filter;
  let slice = emptyArray.slice;
  let document = window.document;
  let elementDisplay: Record<string, any> = {};
  let classCache: Record<string, any> = {};
  let cssNumber: Record<string, number> = {
    'column-count': 1,
    columns: 1,
    'font-weight': 1,
    'line-height': 1,
    opacity: 1,
    'z-index': 1,
    zoom: 1,
  };
  let fragmentRE = /^\s*<(\w+|!)[^>]*>/;
  let singleTagRE = /^<(\w+)\s*\/?>(?:<\/\1>|)$/;
  let tagExpanderRE = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi;
  let rootNodeRE = /^(?:body|html)$/i;
  let capitalRE = /([A-Z])/g;
  let doubleColonRE = /::/g;
  let upperUpperLowerRE = /([A-Z]+)([A-Z][a-z])/g;
  let lowerDigitUpperRE = /([a-z\d])([A-Z])/g;
  let underscoreRE = /_/g;

  // special attributes that should be get/set via method calls
  let methodAttributes = ['val', 'css', 'html', 'text', 'data', 'width', 'height', 'offset'];

  let adjacencyOperators = ['after', 'prepend', 'before', 'append'];
  let table = document.createElement('table');
  let tableRow = document.createElement('tr');
  let containers = {
    tr: document.createElement('tbody'),
    tbody: table,
    thead: table,
    tfoot: table,
    td: tableRow,
    th: tableRow,
    '*': document.createElement('div'),
  };
  let simpleSelectorRE = /^[\w-]*$/;
  let class2type: Record<string, any> = {};
  let toString = class2type.toString;
  let mepto: any = {};
  let camelize: any;
  let uniq: <T>(array: ArrayLike<T>) => T[];
  let tempParent = document.createElement('div');
  let propMap: Record<string, string> = {
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
  };
  let isArray =
    Array.isArray ||
    function (object: any) {
      return object instanceof Array;
    };

  /**
   * Checks if `element` matches the given CSS `selector`.
   * Uses the standard `Element.matches` API with vendor-prefix fallbacks,
   * and falls back to a `qsa`-based query for unsupported browsers.
   */
  mepto.matches = function (element: Element, selector: string): boolean {
    if (!selector || !element || element.nodeType !== 1) return false;

    // Standard + vendor-prefixed matches implementations
    const matchesSelector =
      element.matches ||
      (element as any).webkitMatchesSelector ||
      (element as any).mozMatchesSelector ||
      (element as any).oMatchesSelector ||
      (element as any).msMatchesSelector;

    if (matchesSelector) {
      return matchesSelector.call(element, selector);
    }

    // Fallback: query the parent node for elements matching the selector
    let parent = element.parentNode;
    const isOrphan = !parent;

    if (isOrphan) {
      parent = tempParent;
      parent.appendChild(element);
    }

    const match = mepto.qsa(parent, selector).indexOf(element) > -1;

    if (isOrphan) {
      tempParent.removeChild(element);
    }

    return match;
  };

  /**
   * Returns the internal JavaScript [[Class]] name of `obj` as a lowercase string
   * (e.g. `"array"`, `"function"`, `"date"`, `"regexp"`, `"object"`).
   * Returns `"null"` or `"undefined"` for those respective values.
   */
  function type(obj: unknown): string {
    return obj == null ? String(obj) : class2type[toString.call(obj)] || 'object';
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
    if (!isObject(obj) || isWindow(obj)) return false;
    const proto = Object.getPrototypeOf(obj);
    return proto === null || proto === Object.prototype;
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
    // Falsy values (null, undefined, "", 0, false, NaN) are never array-like
    if (!obj) return false;

    // Functions and the Window object are never array-like
    const objType = type(obj);
    if (objType === 'function' || isWindow(obj)) return false;

    // Actual arrays are always array-like
    if (objType === 'array') return true;

    // Only objects can safely use the `in` operator for property checks.
    // Primitives (number, boolean, string) are not array-like.
    if (typeof obj !== 'object') return false;

    // Check for a valid `length` property indicating array-like behavior
    const length = (obj as any).length;
    if (length === 0) return true;

    return (
      typeof length === 'number' &&
      length > 0 &&
      (length - 1) in (obj as any)
    );
  }

  /**
   * Filters out `null` and `undefined` values from an array-like object.
   * Uses a type guard to narrow the return type to non-nullable values.
   */
  function compact<T>(array: ArrayLike<T | null | undefined>): T[] {
    return filter.call(array, function (item: T | null | undefined): item is T {
      return item != null;
    });
  }

  /**
   * Flattens a single level of nested arrays.
   * Returns an empty array for empty or falsy input to ensure a consistent return type.
   */
  function flatten<T>(array: (T | T[])[]): T[] {
    if (!array || array.length === 0) return [] as T[];
    return $.fn.concat.apply([], array) as T[];
  }

  /**
   * Converts a dash-separated string to camelCase.
   * Handles leading, trailing, and consecutive dashes gracefully.
   */
  camelize = function (str: string): string {
    return str.replace(/-+(.)?/g, function (match: string, chr: string | undefined): string {
      return chr ? chr.toUpperCase() : '';
    });
  };
  /**
   * Converts a camelCase or PascalCase string to a dash-separated lowercase
   * string (e.g. `backgroundColor` → `background-color`, `XMLParser` →
   * `xml-parser`).  The `::` token is treated as a namespace separator and
   * converted to `/`.
   */
  function dasherize(str: string): string {
    if (!str) return str;
    return str
      .replace(doubleColonRE, '/')           // `::` → `/` (namespace separator)
      .replace(upperUpperLowerRE, '$1_$2')   // `XMLParser` → `XML_Parser`
      .replace(lowerDigitUpperRE, '$1_$2')   // `fooBar1B` → `foo_Bar1_B`
      .replace(underscoreRE, '-')            // `_` → `-`
      .toLowerCase();
  }
  /**
   * Returns a new array with duplicate elements removed, preserving the
   * order of first occurrence. Uses a `Set` for O(n) lookups instead of
   * repeated `indexOf` scans (which would be O(n²)).
   */
  uniq = function <T>(array: ArrayLike<T>): T[] {
    if (!array || (array as any).length === 0) return [] as T[];
    const seen = new Set<T>();
    return filter.call(array, function (item: T): boolean {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    }) as T[];
  };

  /**
   * Builds (and caches) a RegExp that matches a CSS class name as a
   * whole word — i.e., bounded by whitespace or start/end of the string.
   * Returns an empty-matching RegExp for falsy names as a safe fallback.
   *
   * @param name - The CSS class name to build a regex for.
   */
  function classRE(name: string): RegExp {
    if (!name) return /(?:)/;
    return name in classCache
      ? classCache[name]
      : (classCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)'));
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
    return typeof value === 'number' && !cssNumber[dasherize(name)] ? value + 'px' : value;
  }

  function defaultDisplay(nodeName: string): string {
    if (!elementDisplay[nodeName]) {
      const element = document.createElement(nodeName);
      document.body.appendChild(element);
      let display = getComputedStyle(element, '').getPropertyValue('display');
      element.parentNode!.removeChild(element);
      if (display === 'none') display = 'block';
      elementDisplay[nodeName] = display;
    }
    return elementDisplay[nodeName];
  }

  function children(element: Node): Element[] {
    return 'children' in element
      ? slice.call((element as Element).children)
      : $.map(element.childNodes, function (node: Node) {
          if (node.nodeType === 1) return node as Element;
        });
  }

  function Z(dom: ArrayLike<Element> | null | undefined, selector: string) {
    const len = dom ? dom.length : 0;
    for (let i = 0; i < len; i++) this[i] = dom![i];
    this.length = len;
    this.selector = selector || '';
  }

  // `$.mepto.fragment` takes a html string and an optional tag name
  // to generate DOM nodes from the given html string.
  // The generated DOM nodes are returned as an array.
  // This function can be overridden in plugins for example to make
  // it compatible with browsers that don't support the DOM fully.
  mepto.fragment = function (html: string, name: string | undefined, properties: PlainObject | null | undefined): ArrayLike<Element> {
    let dom: ArrayLike<Element>;

    // Fast path: a single empty or self-closing tag like <div>, <br/>
    const singleMatch = singleTagRE.exec(html);
    if (singleMatch) {
      dom = $(document.createElement(singleMatch[1]));
    } else {
      // Expand implicit self-closing non-void tags: <foo bar/> → <foo bar></foo>
      html = html.replace(tagExpanderRE, '<$1></$2>');

      // Determine the right container so the browser parses the HTML correctly.
      // e.g. <tr> must live inside <tbody>, not a bare <div>.
      if (name === undefined) {
        const fragMatch = fragmentRE.exec(html);
        name = fragMatch ? fragMatch[1] : undefined;
      }
      const containerKey = (name !== undefined && name in containers) ? name : '*';
      const container = containers[containerKey];
      container.innerHTML = html;
      dom = $.each(slice.call(container.childNodes), function (this: ChildNode) {
        container.removeChild(this);
      });
    }

    if (isPlainObject(properties)) {
      const nodes = $(dom);
      $.each(properties, function (key: string, value: unknown) {
        if (methodAttributes.indexOf(key) > -1) (nodes as any)[key](value);
        else nodes.attr(key, value as string);
      });
    }

    return dom;
  };

  // `$.mepto.Z` swaps out the prototype of the given `dom` array
  // of nodes with `$.fn` and thus supplying all the mepto functions
  // to the array. This method can be overridden in plugins.
  mepto.Z = function (dom: ArrayLike<Element> | null | undefined, selector: string) {
    return new Z(dom, selector);
  };

  // `$.mepto.isZ` should return `true` if the given object is a mepto
  // collection. This method can be overridden in plugins.
  mepto.isZ = function (object: unknown): boolean {
    return object instanceof mepto.Z;
  };

  // `$.mepto.init` is mepto's counterpart to jQuery's `$.fn.init` and
  // takes a CSS selector and an optional context (and handles various
  // special cases).
  // This method can be overridden in plugins.
  mepto.init = function (selector: any, context?: any): any {
    let dom: ArrayLike<Element> | null | undefined;
    let finalSelector: any = selector;

    if (!selector) {
      return mepto.Z();
    } else if (typeof selector === 'string') {
      const str = selector.trim();
      finalSelector = str;
      // HTML fragment: create nodes from it
      // Note: In both Chrome 21 and Firefox 15, DOM error 12
      // is thrown if the fragment doesn't begin with <
      const fragMatch = str[0] === '<' ? fragmentRE.exec(str) : null;
      if (fragMatch) {
        dom = mepto.fragment(str, fragMatch[1], context);
        finalSelector = null;
      } else if (context !== undefined) {
        return $(context).find(str);
      } else {
        dom = mepto.qsa(document, str);
      }
    } else if (isFunction(selector)) {
      return $(document).ready(selector);
    } else if (mepto.isZ(selector)) {
      return selector;
    } else {
      if (isArray(selector)) {
        dom = compact(selector);
      } else if (isObject(selector)) {
        dom = [selector];
        finalSelector = null;
      } else {
        const fragMatch = fragmentRE.exec(selector);
        if (fragMatch) {
          dom = mepto.fragment(selector.trim(), fragMatch[1], context);
          finalSelector = null;
        } else if (context !== undefined) {
          return $(context).find(selector);
        } else {
          dom = mepto.qsa(document, selector);
        }
      }
    }

    return mepto.Z(dom, finalSelector);
  };

  // `$` will be the base `mepto` object. When calling this
  // function just call `$.mepto.init, which makes the implementation
  // details of selecting nodes and creating mepto collections
  // patchable in plugins.
  $ = function (selector: any, context?: any) {
    return mepto.init(selector, context);
  };

  /**
   * Recursively merge properties from `source` into `target`.
   * When `deep` is true, plain objects and arrays are merged recursively;
   * otherwise properties are copied by reference (shallow copy).
   * Properties with `undefined` values are always skipped.
   */
  function extend(
    target: Record<string, any>,
    source: Record<string, any>,
    deep: boolean
  ): void {
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

      const sourceValue = source[key];

      if (deep && (isPlainObject(sourceValue) || isArray(sourceValue))) {
        // Ensure the target has a compatible container before recursing
        if (isPlainObject(sourceValue) && !isPlainObject(target[key])) {
          target[key] = {};
        }
        if (isArray(sourceValue) && !isArray(target[key])) {
          target[key] = [];
        }
        extend(target[key], sourceValue, deep);
      } else if (sourceValue !== undefined) {
        target[key] = sourceValue;
      }
    }
  }

  // Copy all but undefined properties from one or more
  // objects to the `target` object.
  $.extend = function (target: any, ...rest: any[]): any {
    let deep = false;
    let destination = target;

    if (typeof target === 'boolean') {
      deep = target;
      destination = rest.shift();
    }

    rest.forEach(function (arg) {
      extend(destination, arg, deep);
    });

    return destination;
  };

  // `$.mepto.qsa` is mepto's CSS selector implementation which
  // uses `document.querySelectorAll` and optimizes for some special cases, like `#id`.
  // This method can be overridden in plugins.
  mepto.qsa = function (element: ParentNode, selector: string): Element[] {
    const maybeID = selector[0] === '#';
    const maybeClass = !maybeID && selector[0] === '.';
    // For ID/class selectors, strip the prefix; otherwise use the full selector
    const nameOnly = (maybeID || maybeClass) ? selector.slice(1) : selector;
    const isSimple = simpleSelectorRE.test(nameOnly);

    // Fast path: simple ID lookup via getElementById
    // Supported on Document and DocumentFragment (Safari 26.2+); not on Element
    if (maybeID && isSimple && 'getElementById' in element) {
      const found = (element as Document).getElementById(nameOnly);
      return found ? [found] : [];
    }

    // Only Element (1), Document (9), and DocumentFragment (11) support query methods
    const nodeType = (element as Node).nodeType;
    if (nodeType !== 1 && nodeType !== 9 && nodeType !== 11) {
      return [];
    }

    // Fast path: simple class or tag lookup via getElementsByClassName/TagName
    // (DocumentFragment doesn't have getElementsByClassName/TagName)
    if (isSimple && !maybeID && 'getElementsByClassName' in element) {
      const results = maybeClass
        ? (element as Document).getElementsByClassName(nameOnly)
        : (element as Document).getElementsByTagName(selector);
      return slice.call(results);
    }

    // General path: use querySelectorAll for complex selectors
    return slice.call(element.querySelectorAll(selector));
  };

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
  mepto.getElementsByClassName = function (className: string, context?: ParentNode): any {
    const root = context || document;
    const elements = (root as Element).getElementsByClassName(className);
    return $(slice.call(elements));
  };

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
  mepto.getElementsByTagName = function (tagName: string, context?: ParentNode): any {
    const root = context || document;
    const elements = (root as Element).getElementsByTagName(tagName);
    return $(slice.call(elements));
  };

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
  mepto.getElementById = function (id: string, context?: ParentNode): any {
    const root = context || document;
    if (!('getElementById' in root)) return $();
    const found = (root as Document).getElementById(id);
    return found ? $([found]) : $();
  };

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
  ): any {
    if (selector == null) return $(nodes);
    return $(nodes).filter(selector);
  }

  $.contains = function (parent: Node, node: Node): boolean {
    return parent !== node && parent.contains(node);
  };

  function setAttribute(node: Element, name: string, value: string | null | undefined): void {
    value == null ? node.removeAttribute(name) : node.setAttribute(name, value);
  }

  // access className property while respecting SVGAnimatedString
  function className(node: Element & { className: any }, value?: string): string | void {
    const klass = node.className || '';
    const svg = klass && klass.baseVal !== undefined;

    if (value === undefined) return svg ? klass.baseVal : klass;
    svg ? (klass.baseVal = value) : (node.className = value);
  }

  // "true"  => true
  // "false" => false
  // "null"  => null
  // "42"    => 42
  // "42.5"  => 42.5
  // "08"    => "08"   (preserved — not a valid decimal literal)
  // JSON    => parse if valid, otherwise return as-is
  // String  => self
  function deserializeValue(value: string): any {
    // Falsy values (empty string, null, undefined) — return as-is
    if (!value) return value;

    // Boolean literals
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Null literal
    if (value === 'null') return null;

    // Numeric strings — round-trip check preserves non-decimal strings like "08"
    const num = +value;
    if ('' + num === value) return num;

    // JSON arrays/objects — charAt is cheaper than regex for first-char check
    if (value.charAt(0) === '[' || value.charAt(0) === '{') {
      try {
        return $.parseJSON(value);
      } catch {
        return value;
      }
    }

    // Everything else — return as-is
    return value;
  }

  $.type = type;
  $.isFunction = isFunction;
  $.isWindow = isWindow;
  $.isArray = isArray;
  $.isPlainObject = isPlainObject;

  $.isEmptyObject = function (obj: Record<string, unknown>): boolean {
    for (const _name in obj) return false;
    return true;
  };

  $.isNumeric = function (val: unknown): boolean {
    const num = Number(val);
    const type = typeof val;
    return (
      (val != null &&
        type != 'boolean' &&
        (type != 'string' || (val as string).length) &&
        !isNaN(num) &&
        isFinite(num)) ||
      false
    );
  };

  $.inArray = function <T>(elem: T, array: ArrayLike<T>, i?: number): number {
    return emptyArray.indexOf.call(array, elem, i);
  };

  $.camelCase = camelize;
  $.trim = function (str: string | null | undefined): string {
    return str == null ? '' : String.prototype.trim.call(str);
  };

  // plugin compatibility
  $.uuid = 0;
  $.support = {};
  $.expr = {};
  $.noop = function (): void {};

  $.map = function <T, U>(
    elements: ArrayLike<T> | Record<string, T>,
    callback: (item: T, index: number | string) => U | null | undefined
  ): U[] {
    const values: U[] = [];
    if (likeArray(elements)) {
      const arr = elements as ArrayLike<T>;
      for (let i = 0; i < arr.length; i++) {
        const value = callback(arr[i], i);
        if (value != null) values.push(value);
      }
    } else {
      for (const key in elements as Record<string, T>) {
        const value = callback((elements as Record<string, T>)[key], key);
        if (value != null) values.push(value);
      }
    }
    return flatten(values);
  };

  $.each = function <T>(
    elements: ArrayLike<T> | Record<string, T>,
    callback: (this: T, index: number | string, item: T) => boolean | void
  ): typeof elements {
    if (likeArray(elements)) {
      const arr = elements as ArrayLike<T>;
      for (let i = 0; i < arr.length; i++)
        if (callback.call(arr[i], i, arr[i]) === false) return elements;
    } else {
      for (const key in elements as Record<string, T>)
        if (callback.call((elements as Record<string, T>)[key], key, (elements as Record<string, T>)[key]) === false) return elements;
    }
    return elements;
  };

  $.grep = function (elements, callback) {
    return filter.call(elements, callback);
  };

  if (window.JSON) $.parseJSON = JSON.parse;

  // Populate the class2type map
  $.each(
    'Boolean Number String Function Array Date RegExp Object Error'.split(' '),
    function (i, name) {
      class2type['[object ' + name + ']'] = name.toLowerCase();
    }
  );

  // Define methods that will be available on all
  // mepto collections
  $.fn = {
    letructor: mepto.Z,
    length: 0,

    // Because a collection acts like an array
    // copy over these useful array functions.
    forEach: emptyArray.forEach,
    reduce: emptyArray.reduce,
    push: emptyArray.push,
    sort: emptyArray.sort,
    splice: emptyArray.splice,
    indexOf: emptyArray.indexOf,
    concat: function () {
      let i,
        value,
        args = [];
      for (i = 0; i < arguments.length; i++) {
        value = arguments[i];
        args[i] = mepto.isZ(value) ? value.toArray() : value;
      }
      return concat.apply(mepto.isZ(this) ? this.toArray() : this, args);
    },

    // `map` and `slice` in the jQuery API work differently
    // from their array counterparts
    map: function <U>(fn: (this: Element, index: number, element: Element) => U | null | undefined) {
      const values: U[] = [];
      for (let i = 0, len = this.length; i < len; i++) {
        const value = fn.call(this[i], i, this[i]);
        if (value != null) values.push(value);
      }
      return $(flatten(values));
    },
    slice: function (start?, end?) {
      return $(slice.call(this, start, end));
    },

    ready: function (callback: (mepto: any) => void) {
      if (document.readyState !== 'loading') {
        setTimeout(() => callback($), 0);
      } else {
        document.addEventListener('DOMContentLoaded', () => callback($), { once: true });
      }
      return this;
    },
    get: function (idx?: number) {
      return idx === undefined ? slice.call(this) : this[idx >= 0 ? idx : idx + this.length];
    },
    toArray: function () {
      return this.get();
    },
    size: function () {
      return this.length;
    },
    remove: function () {
      return this.each(function () {
        if (this.parentNode != null) this.parentNode.removeChild(this);
      });
    },
    each: function (callback: (this: Element, index: number, element: Element) => boolean | void) {
      for (let i = 0, len = this.length; i < len; i++) {
        if (callback.call(this[i], i, this[i]) === false) break;
      }
      return this;
    },
    filter: function (selector: string | ((index: number, element: Element) => boolean)) {
      if (isFunction(selector)) {
        // Filter directly with the callback — O(n) instead of the previous
        // double-negation pattern this.not(this.not(selector)) which was
        // O(n*m) and created two intermediate collections.
        return $(
          filter.call(this, function (element: Element, index: number) {
            return selector.call(element, index, element);
          })
        );
      }

      // Short-circuit on nullish selector — avoids iterating when no element
      // can possibly match. mepto.matches already guards against this, but we
      // skip the loop entirely.
      if (selector == null) return $();

      return $(
        filter.call(this, function (element: Element) {
          return mepto.matches(element, selector as string);
        })
      );
    },
    add: function (selector: any, context?: any) {
      return $(uniq(this.concat($(selector, context))));
    },
    is: function (selector: string | { selector: string }): boolean {
      return typeof selector == 'string'
        ? this.length > 0 && mepto.matches(this[0], selector)
        : !!(selector && this.selector == (selector as { selector: string }).selector);
    },
    not: function (selector: string | Element | ArrayLike<Element> | ((this: Element, index: number) => boolean)) {
      const nodes: Element[] = [];
      if (isFunction(selector))
        this.each(function (idx) {
          if (!(selector as Function).call(this, idx)) nodes.push(this as Element);
        });
      else {
        const excludes =
          typeof selector == 'string'
            ? this.filter(selector)
            : likeArray(selector) && isFunction((selector as any).item)
              ? slice.call(selector)
              : $(selector);
        this.forEach(function (el: Element) {
          if (excludes.indexOf(el) < 0) nodes.push(el);
        });
      }
      return $(nodes);
    },
    has: function (selector: string | Node) {
      return this.filter(function (this: HTMLElement) {
        return isObject(selector) ? $.contains(this, selector as Node) : $(this).find(selector as string).length > 0;
      });
    },
    eq: function (idx: number) {
      return idx === -1 ? this.slice(idx) : this.slice(idx, +idx + 1);
    },
    first: function () {
      const el = this[0];
      return el && !isObject(el) ? el : $(el);
    },
    last: function () {
      const el = this[this.length - 1];
      return el && !isObject(el) ? el : $(el);
    },
    find: function (selector: string | Element | ArrayLike<Element>) {
      if (!selector) return $();

      if (typeof selector == 'object') {
        const nodes = $(selector);
        const result: Element[] = [];
        const parents = this;
        for (let i = 0, nlen = nodes.length; i < nlen; i++) {
          for (let j = 0, plen = parents.length; j < plen; j++) {
            if ($.contains(parents[j], nodes[i])) {
              result.push(nodes[i]);
              break;
            }
          }
        }
        return $(result);
      }

      if (this.length == 1) return $(mepto.qsa(this[0], selector));

      return $(uniq(flatten($.map(this, function (el: Element) {
        return mepto.qsa(el, selector as string);
      }))));
    },
    closest: function (selector: string | Element | ArrayLike<Element>, context?: Element | Document) {
      const nodes: Element[] = [];
      const collection = typeof selector == 'object' && $(selector);
      const matchers: Set<Element> | null = collection ? new Set() : null;
      const seen = new Set<Element>();

      if (matchers && collection)
        for (let i = 0, len = collection.length; i < len; i++) matchers.add(collection[i]);

      for (let i = 0, len = this.length; i < len; i++) {
        let node: Node | null = this[i];
        while (node) {
          if (matchers ? matchers.has(node as Element) : mepto.matches(node as Element, selector as string)) {
            if (!seen.has(node as Element)) {
              seen.add(node as Element);
              nodes.push(node as Element);
            }
            break;
          }
          if (node === context || isDocument(node)) break;
          node = node.parentNode;
        }
      }

      return $(nodes);
    },
    parents: function (selector?: string) {
      const ancestors: Element[] = [];
      let nodes: ArrayLike<Element> = this;
      while (nodes.length > 0)
        nodes = $.map(nodes, function (node: any) {
          node = node.parentNode;
          if (node && !isDocument(node) && ancestors.indexOf(node) < 0) {
            ancestors.push(node);
            return node;
          }
        });
      return filtered(ancestors, selector);
    },
    parent: function (selector?: string) {
      const parents: Element[] = [];
      const seen = new Set<Node>();
      for (let i = 0, len = this.length; i < len; i++) {
        const parent = this[i].parentNode;
        if (parent && !seen.has(parent)) {
          seen.add(parent);
          parents.push(parent as Element);
        }
      }
      return filtered(parents, selector);
    },
    children: function (selector?: string) {
      return filtered(
        this.map(function () {
          return children(this);
        }),
        selector
      );
    },
    contents: function () {
      return this.map(function () {
        return this.contentDocument || slice.call(this.childNodes);
      });
    },
    siblings: function (selector?: string) {
      return filtered(
        this.map(function (i: number, el: Element) {
          return filter.call(children(el.parentNode!), function (child: Element) {
            return child !== el;
          });
        }),
        selector
      );
    },
    empty: function () {
      return this.each(function () {
        this.innerHTML = '';
      });
    },
    // `pluck` is borrowed from Prototype.js
    pluck: function (property: string) {
      return $.map(this, function (el: any) {
        return el[property];
      });
    },
    show: function () {
      return this.each(function () {
        this.style.display == 'none' && (this.style.display = '');
        if (getComputedStyle(this, '').getPropertyValue('display') == 'none')
          this.style.display = defaultDisplay(this.nodeName);
      });
    },
    replaceWith: function (newContent: any) {
      return this.before(newContent).remove();
    },
    wrap: function (structure: string | Element | ((index: number) => string | Element)) {
      const isCallable = isFunction(structure);
      let wrapperElement: Element | undefined;
      let shouldClone = false;

      if (this[0] && !isCallable) {
        wrapperElement = $(structure).get(0);
        shouldClone = !!wrapperElement && (!!wrapperElement.parentNode || this.length > 1);
      }

      return this.each(function (index) {
        const wrapper = isCallable
          ? (structure as Function).call(this, index)
          : shouldClone
            ? wrapperElement!.cloneNode(true)
            : wrapperElement;
        $(this).wrapAll(wrapper);
      });
    },
    wrapAll: function (structure: string | Element | ArrayLike<Element>) {
      if (!this[0]) return this;

      const wrapper = $(structure);
      $(this[0]).before(wrapper);

      let innermost = wrapper;
      let kids = innermost.children();
      while (kids.length) {
        innermost = kids.first();
        kids = innermost.children();
      }

      $(innermost).append(this);
      return this;
    },
    wrapInner: function (structure: string | Element | ((index: number) => string | Element) | null) {
      if (structure == null) return this;

      const isCallable = isFunction(structure);
      return this.each(function (index) {
        const self = $(this);
        const contents = self.contents();
        const wrappingContent = isCallable
          ? (structure as Function).call(this, index)
          : structure;

        if (contents.length) {
          contents.wrapAll(wrappingContent);
        } else {
          self.append(wrappingContent);
        }
      });
    },
    unwrap: function () {
      this.parent().each(function () {
        $(this).replaceWith($(this).children());
      });
      return this;
    },
    clone: function () {
      return this.map(function () {
        return this.cloneNode(true);
      });
    },
    hide: function () {
      return this.css('display', 'none');
    },
    toggle: function (setting?: boolean) {
      return this.each(function () {
        const el = $(this);
        (setting === undefined ? el.css('display') == 'none' : setting) ? el.show() : el.hide();
      });
    },
    prev: function (selector?: string) {
      return $(this.pluck('previousElementSibling')).filter(selector || '*');
    },
    next: function (selector?: string) {
      return $(this.pluck('nextElementSibling')).filter(selector || '*');
    },
    html: function (html?: string | ((idx: number, currentHtml: string) => string)) {
      return 0 in arguments
        ? this.each(function (idx) {
            const originHtml = this.innerHTML;
            $(this)
              .empty()
              .append(isFunction(html) ? (html as Function).call(this, idx, originHtml) : html);
          })
        : 0 in this
          ? this[0].innerHTML
          : null;
    },
    text: function (text?: string | number | null | ((idx: number, current: string | null) => string | null)) {
      return 0 in arguments
        ? this.each(function (idx) {
            const newText = isFunction(text) ? (text as Function).call(this, idx, this.textContent) : text;
            this.textContent = newText == null ? '' : '' + newText;
          })
        : 0 in this
          ? this.pluck('textContent').join('')
          : null;
    },
    attr: function (name: string | Record<string, string | null | undefined>, value?: string | null | ((i: number, old: string | null) => string | null)) {
      // Getter
      if (typeof name == 'string' && arguments.length < 2) {
        if (this.length > 0 && this[0].nodeType === 1) {
          const result = this[0].getAttribute(name);
          return result != null ? result : undefined;
        }
        return undefined;
      }

      // Setter
      for (let i = 0, len = this.length; i < len; i++) {
        const el = this[i];
        if (el.nodeType !== 1) continue;
        if (isObject(name)) {
          for (const k in name as Record<string, string | null>) setAttribute(el, k, (name as Record<string, string | null>)[k]);
        } else {
          setAttribute(el, name as string, isFunction(value) ? (value as Function).call(el, i, el.getAttribute(name as string)) : value as string | null);
        }
      }
      return this;
    },
    removeAttr: function (name: string) {
      return this.each(function () {
        this.nodeType === 1 &&
          name.split(' ').forEach(function (attribute) {
            setAttribute(this as any, attribute);
          }, this);
      });
    },
    prop: function (name: string | Record<string, any>, value?: any) {
      const resolvedName: string | Record<string, any> = typeof name === 'string' ? (propMap[name] || name) : name;
      return typeof resolvedName == 'string' && !(1 in arguments)
        ? this[0] && (this[0] as any)[resolvedName]
        : this.each(function (idx) {
            if (isObject(resolvedName)) {
              for (const k in resolvedName as Record<string, any>)
                (this as any)[propMap[k] || k] = (resolvedName as Record<string, any>)[k];
            } else {
              (this as any)[resolvedName as string] = isFunction(value) ? value.call(this, idx, (this as any)[resolvedName as string]) : value;
            }
          });
    },
    removeProp: function (name: string) {
      const resolvedName = propMap[name] || name;
      return this.each(function () {
        delete (this as any)[resolvedName];
      });
    },
    data: function (name: string, value?: any) {
      const attrName = 'data-' + name.replace(capitalRE, '-$1').toLowerCase();

      if (arguments.length > 1) {
        return this.attr(attrName, value);
      }

      const data = this.attr(attrName);
      return data !== undefined ? deserializeValue(data) : undefined;
    },
    val: function (value?: string | string[] | ((idx: number, current: string) => string)) {
      // Setter
      if (arguments.length > 0) {
        const v = value == null ? '' : value;
        for (let i = 0, len = this.length; i < len; i++) {
          const el = this[i] as any;
          el.value = isFunction(v) ? (v as Function).call(el, i, el.value) : v;
        }
        return this;
      }

      // Getter
      const el = this[0] as any;
      if (!el) return undefined;

      if (el.multiple) {
        const result: string[] = [];
        for (let i = 0, len = el.selectedOptions.length; i < len; i++) {
          result.push(el.selectedOptions[i].value);
        }
        return result;
      }

      return el.value;
    },
    offset: function (coordinates?: { top: number; left: number } | ((index: number, current: { top: number; left: number }) => { top: number; left: number })) {
      if (coordinates)
        return this.each(function (index) {
          const $this = $(this);
          const coords = isFunction(coordinates)
            ? (coordinates as Function).call(this, index, $this.offset())
            : coordinates as { top: number; left: number };
          const parentOffset = $this.offsetParent().offset();
          const props: Record<string, string | number> = {
            top: coords.top - parentOffset.top,
            left: coords.left - parentOffset.left,
          };
          if ($this.css('position') == 'static') props['position'] = 'relative';
          $this.css(props);
        });
      if (!this.length) return null;
      if (document.documentElement !== this[0] && !$.contains(document.documentElement, this[0]))
        return { top: 0, left: 0 };
      const obj = this[0].getBoundingClientRect();
      return {
        left: obj.left + window.pageXOffset,
        top: obj.top + window.pageYOffset,
        width: Math.round(obj.width),
        height: Math.round(obj.height),
      };
    },
    css: function (property: string | string[] | Record<string, string | number | null | undefined>, value?: string | number | null) {
      if (arguments.length < 2) {
        const element = this[0] as HTMLElement | undefined;
        if (typeof property == 'string') {
          if (!element) return;
          return (
            (element.style as any)[camelize(property as string)] ||
            getComputedStyle(element, '').getPropertyValue(property as string)
          );
        } else if (isArray(property)) {
          if (!element) return;
          const props: Record<string, string> = {};
          const computedStyle = getComputedStyle(element, '');
          $.each(property as string[], function (_: number, prop: string) {
            props[prop] = (element.style as any)[camelize(prop)] || computedStyle.getPropertyValue(prop);
          });
          return props;
        }
      }

      let css = '';
      if (type(property) == 'string') {
        if (!value && value !== 0)
          this.each(function () {
            (this as HTMLElement).style.removeProperty(dasherize(property as string));
          });
        else css = dasherize(property as string) + ':' + maybeAddPx(property as string, value as string | number);
      } else {
        for (const key in property as Record<string, any>) {
          if (!(property as Record<string, any>)[key] && (property as Record<string, any>)[key] !== 0)
            this.each(function () {
              (this as HTMLElement).style.removeProperty(dasherize(key));
            });
          else css += dasherize(key) + ':' + maybeAddPx(key, (property as Record<string, any>)[key]) + ';';
        }
      }

      return this.each(function () {
        (this as HTMLElement).style.cssText += ';' + css;
      });
    },
    index: function (element?: string | Element | ArrayLike<Element>): number {
      return element ? this.indexOf($(element)[0]) : this.parent().children().indexOf(this[0]);
    },
    hasClass: function (name: string): boolean {
      if (!name) return false;
      return emptyArray.some.call(
        this,
        function (this: RegExp, el: Element) {
          return this.test(className(el as any));
        },
        classRE(name)
      );
    },
    addClass: function (name: string | ((index: number, currentClass: string) => string)) {
      if (!name) return this;
      return this.each(function (idx) {
        if (!('className' in this)) return;
        const cls = className(this as any) as string;
        const newName = isFunction(name) ? (name as Function).call(this, idx, cls) : name as string;
        const toAdd: string[] = [];
        newName.split(/\s+/g).forEach(function (klass) {
          if (!classRE(klass).test(cls)) toAdd.push(klass);
        });
        if (toAdd.length) className(this as any, cls + (cls ? ' ' : '') + toAdd.join(' '));
      });
    },
    removeClass: function (name?: string | ((index: number, currentClass: string) => string)) {
      return this.each(function (idx) {
        if (!('className' in this)) return;
        if (name === undefined) return className(this as any, '');
        let cls = className(this as any) as string;
        const resolved = isFunction(name) ? (name as Function).call(this, idx, cls) : name as string;
        resolved.split(/\s+/g).forEach(function (klass) {
          cls = cls.replace(classRE(klass), ' ');
        });
        className(this as any, cls.trim());
      });
    },
    toggleClass: function (name: string | ((index: number, currentClass: string) => string), when?: boolean) {
      if (!name) return this;
      return this.each(function (idx) {
        const $this = $(this);
        const names = isFunction(name) ? (name as Function).call(this, idx, className(this as any)) : name as string;
        names.split(/\s+/g).forEach(function (klass) {
          (when === undefined ? !$this.hasClass(klass) : when)
            ? $this.addClass(klass)
            : $this.removeClass(klass);
        });
      });
    },
    scrollTop: function (value?: number) {
      if (!this.length) return;
      const hasScrollTop = 'scrollTop' in this[0];
      if (value === undefined) return hasScrollTop ? (this[0] as any).scrollTop : (this[0] as any).pageYOffset;
      return this.each(
        hasScrollTop
          ? function () { (this as any).scrollTop = value; }
          : function () { (this as any).scrollTo((this as any).scrollX, value); }
      );
    },
    scrollLeft: function (value?: number) {
      if (!this.length) return;
      const hasScrollLeft = 'scrollLeft' in this[0];
      if (value === undefined) return hasScrollLeft ? (this[0] as any).scrollLeft : (this[0] as any).pageXOffset;
      return this.each(
        hasScrollLeft
          ? function () { (this as any).scrollLeft = value; }
          : function () { (this as any).scrollTo(value, (this as any).scrollY); }
      );
    },
    position: function () {
      if (!this.length) return;

      const elem = this[0];
      const offsetParent = this.offsetParent();
      const offset = this.offset();
      const parentOffset = rootNodeRE.test(offsetParent[0].nodeName)
        ? { top: 0, left: 0 }
        : offsetParent.offset();

      // Subtract element margins
      // note: when an element has margin: auto the offsetLeft and marginLeft
      // are the same in Safari causing offset.left to incorrectly be 0
      offset.top -= parseFloat($(elem).css('margin-top')) || 0;
      offset.left -= parseFloat($(elem).css('margin-left')) || 0;

      // Add offsetParent borders
      parentOffset.top += parseFloat($(offsetParent[0]).css('border-top-width')) || 0;
      parentOffset.left += parseFloat($(offsetParent[0]).css('border-left-width')) || 0;

      return {
        top: offset.top - parentOffset.top,
        left: offset.left - parentOffset.left,
      };
    },
    offsetParent: function () {
      return this.map(function () {
        let parent = this.offsetParent || document.body;
        while (parent && !rootNodeRE.test(parent.nodeName) && $(parent).css('position') == 'static')
          parent = parent.offsetParent;
        return parent;
      });
    },
  };

  // for now
  $.fn.detach = $.fn.remove;

  // Generate the `width` and `height` functions
  ['width', 'height'].forEach(function (dimension) {
    let dimensionProperty = dimension.replace(/./, function (m) {
      return m[0].toUpperCase();
    });

    $.fn[dimension] = function (value) {
      let offset,
        el = this[0];
      if (value === undefined)
        return isWindow(el)
          ? el['inner' + dimensionProperty]
          : isDocument(el)
            ? el.documentElement['scroll' + dimensionProperty]
            : (offset = this.offset()) && offset[dimension];
      else
        return this.each(function (idx) {
          el = $(this);
          el.css(dimension, isFunction(value) ? value.call(this, idx, el[dimension]()) : value);
        });
    };
  });

  function traverseNode(node: Node, callback: (node: any) => void): void {
    if (!node) return;
    callback(node);
    const children = node.childNodes;
    for (let i = 0, len = children.length; i < len; i++) {
      traverseNode(children[i], callback);
    }
  }

  // Generate the `after`, `prepend`, `before`, `append`,
  // `insertAfter`, `insertBefore`, `appendTo`, and `prependTo` methods.
  adjacencyOperators.forEach(function (operator, operatorIndex) {
    let inside = operatorIndex % 2; //=> prepend, append

    $.fn[operator] = function () {
      // arguments can be nodes, arrays of nodes, mepto objects and HTML strings
      let argType,
        nodes = $.map(arguments, function (arg) {
          let arr = [];
          argType = type(arg);
          if (argType == 'array') {
            arg.forEach(function (el) {
              if (el.nodeType !== undefined) return arr.push(el);
              else if ($.mepto.isZ(el)) return (arr = arr.concat(el.get()));
              arr = arr.concat(mepto.fragment(el));
            });
            return arr;
          }
          return argType == 'object' || arg == null ? arg : mepto.fragment(arg);
        }),
        parent,
        copyByClone = this.length > 1;
      if (nodes.length < 1) return this;

      return this.each(function (_, target) {
        parent = inside ? target : target.parentNode;

        // convert all methods to a "before" operation
        target =
          operatorIndex == 0
            ? target.nextSibling
            : operatorIndex == 1
              ? target.firstChild
              : operatorIndex == 2
                ? target
                : null;

        let parentInDocument = $.contains(document.documentElement, parent);

        nodes.forEach(function (node) {
          if (copyByClone) node = node.cloneNode(true);
          else if (!parent) return $(node).remove();

          parent.insertBefore(node, target);
          if (parentInDocument)
            traverseNode(node, function (el) {
              if (
                el.nodeName != null &&
                el.nodeName.toUpperCase() === 'SCRIPT' &&
                (!el.type || el.type === 'text/javascript') &&
                !el.src
              ) {
                let target = el.ownerDocument ? el.ownerDocument.defaultView : window;
                target['eval'].call(target, el.innerHTML);
              }
            });
        });
      });
    };

    // after    => insertAfter
    // prepend  => prependTo
    // before   => insertBefore
    // append   => appendTo
    $.fn[inside ? operator + 'To' : 'insert' + (operatorIndex ? 'Before' : 'After')] = function (
      html
    ) {
      $(html)[operator](this);
      return this;
    };
  });

  mepto.Z.prototype = Z.prototype = $.fn;

  // Export internal API functions in the `$.mepto` namespace
  mepto.uniq = uniq;
  mepto.deserializeValue = deserializeValue;
  $.mepto = mepto;

  return $;
})();

// If `$` is not yet defined, point it to `mepto`
window.mepto = mepto;
window.$ === undefined && (window.$ = mepto);
