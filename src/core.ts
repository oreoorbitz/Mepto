/**
 * Core Mepto module - the main library implementation
 * This is the modernized TypeScript version of mepto's core
 */

import type { MeptoStatic, MeptoCollection, MeptoElement, PlainObject } from './types';

// Create the core mepto object with querySelector functionality
const mepto: Record<string, unknown> = {};

// Cache for computed styles and element display values
const elementDisplay: Record<string, string> = {};
const classCache: Record<string, RegExp> = {};

// CSS number properties that shouldn't have 'px' appended
const cssNumber: Record<string, number> = {
  'column-count': 1,
  columns: 1,
  'font-weight': 1,
  'line-height': 1,
  opacity: 1,
  'z-index': 1,
  zoom: 1,
};

// Regular expressions for parsing
const fragmentRE = /^\s*<(\w+|!)[^>]*>/;
const singleTagRE = /^<(\w+)\s*\/?>(?:<\/\1>|)$/;
const tagExpanderRE = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi;
const rootNodeRE = /^(?:body|html)$/i;
const capitalRE = /([A-Z])/g;

// Containers for HTML generation
const table = document.createElement('table');
const tableRow = document.createElement('tr');
const containers: Record<string, HTMLElement> = {
  tr: document.createElement('tbody'),
  tbody: table,
  thead: table,
  tfoot: table,
  td: tableRow,
  th: tableRow,
  '*': document.createElement('div'),
};

// Property name mapping (HTML -> DOM)
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
};

// Type checking
function type(obj: unknown): string {
  return obj == null ? String(obj) : ({} as Record<string, string>)[{}.toString.call(obj)] || 'object';
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return type(value) === 'function';
}

function isWindow(obj: unknown): obj is Window {
  return obj != null && obj === (obj as Window).window;
}

function isDocument(obj: unknown): obj is Document {
  return obj != null && (obj as Node).nodeType === (obj as Document).DOCUMENT_NODE;
}

function isObject(obj: unknown): obj is Record<string, unknown> {
  return type(obj) === 'object';
}

function isPlainObject(obj: unknown): boolean {
  return (
    isObject(obj) &&
    !isWindow(obj) &&
    Object.getPrototypeOf(obj) === Object.prototype
  );
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// String utilities
function camelize(str: string): string {
  return str.replace(/-+(.)?/g, (_, chr: string | undefined) =>
    chr ? chr.toUpperCase() : ''
  );
}

function dasherize(str: string): string {
  return str
    .replace(/::/g, '/')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

// Array utilities
function compact<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item != null);
}

function flatten<T>(array: (T | T[])[]): T[] {
  return array.length > 0 ? ([] as T[]).concat(...array) : [];
}

function uniq<T>(array: T[]): T[] {
  return array.filter((item, idx) => array.indexOf(item) === idx);
}

// Class name utilities
function classRE(name: string): RegExp {
  return classCache[name] || (classCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)'));
}

function maybeAddPx(name: string, value: string | number): string {
  return typeof value === 'number' && !cssNumber[dasherize(name)]
    ? `${value}px`
    : String(value);
}

// DOM utilities
const tempParent = document.createElement('div');

function contains(parent: Node, node: Node): boolean {
  return parent !== node && parent.contains(node);
}

// Generate a fragment from HTML
function fragment(html: string, name?: string, properties?: Record<string, unknown>): DocumentFragment {
  let dom: Node[], nodes: Node[];

  if (singleTagRE.test(html)) {
    dom = [document.createElement(RegExp.$1)];
  } else {
    if (html.replace) {
      html = html.replace(tagExpanderRE, '<$1></$2>');
    }

    if (name === undefined) {
      name = fragmentRE.test(html) && RegExp.$1 as string;
    }

    const container = containers[name as keyof typeof containers] || containers['*'];
    container.innerHTML = '' + html;
    dom = Array.from(container.childNodes);

    container.innerHTML = '';
  }

  if (properties) {
    nodes = dom.map((node) => {
      if (node.nodeType === 1) {
        // Element node
        for (const key in properties) {
          if (Object.prototype.hasOwnProperty.call(properties, key)) {
            (node as Element).setAttribute(key, String(properties[key]));
          }
        }
      }
      return node;
    });
  } else {
    nodes = dom;
  }

  const result = document.createDocumentFragment();
  nodes.forEach((node) => result.appendChild(node));
  return result;
}

// Check if element matches selector
mepto.matches = function (
  element: Element,
  selector: string
): boolean {
  if (!selector || !element || element.nodeType !== 1) return false;

  const matchesSelector =
    element.matches ||
    (element as unknown as Record<string, (sel: string) => boolean>).webkitMatchesSelector ||
    (element as unknown as Record<string, (sel: string) => boolean>).mozMatchesSelector ||
    (element as unknown as Record<string, (sel: string) => boolean>).oMatchesSelector ||
    (element as unknown as Record<string, (sel: string) => boolean>).msMatchesSelector;

  if (matchesSelector) {
    return matchesSelector.call(element, selector);
  }

  // Fallback: use querySelector
  let parent = element.parentNode;
  const temp = !parent;
  if (temp) {
    parent = tempParent;
    parent.appendChild(element);
  }

  const match = Array.from(mepto.qsa(parent as ParentNode, selector)).indexOf(element) > -1;

  if (temp) {
    tempParent.removeChild(element);
  }

  return match;
};

// Query selector all
mepto.qsa = function (
  element: ParentNode,
  selector: string
): Element[] {
  let found: Element[];
  const maybeID = selector[0] === '#';
  const maybeClass = selector[0] === '.';
  const nameOnly = maybeID || maybeClass ? selector.slice(1) : selector;
  const isSimple = /^[\w-]*$/.test(nameOnly);

  if (isSimple && maybeID && element.getElementById) {
    const el = (element as Document).getElementById(nameOnly);
    found = el ? [el] : [];
  } else {
    if (element.nodeType !== 1 && element.nodeType !== 9) {
      found = [];
    } else if (isSimple && !maybeID && element.getElementsByClassName) {
      if (maybeClass) {
        found = Array.from(element.getElementsByClassName(nameOnly));
      } else {
        found = Array.from(element.getElementsByTagName(selector));
      }
    } else {
      found = Array.from(element.querySelectorAll(selector));
    }
  }

  return found;
};

// Initialize Mepto collection
function init(selector: unknown, context?: Document | Element): MeptoCollection<MeptoElement> {
  let dom: MeptoElement[];

  if (!selector) {
    dom = [];
  } else if (typeof selector === 'string') {
    selector = selector.trim();

    if (selector[0] === '<' && fragmentRE.test(selector)) {
      // HTML fragment
      dom = Array.from(fragment(selector).childNodes) as MeptoElement[];
      context = undefined;
    } else {
      // CSS selector
      dom = mepto.qsa(
        (context || document) as ParentNode,
        selector
      ) as MeptoElement[];
    }
  } else if (isFunction(selector)) {
    // Document ready
    return (document as unknown as { readyState: string }).readyState === 'complete'
      ? selector.call(document, $) as MeptoCollection<MeptoElement>
      : ($ as MeptoStatic).ready(selector as () => void);
  } else if (mepto.isZ(selector)) {
    // Already a Mepto collection
    return selector as MeptoCollection<MeptoElement>;
  } else {
    if (isArray(selector)) {
      dom = compact(selector as MeptoElement[]);
    } else if (isObject(selector)) {
      dom = [selector as unknown as MeptoElement];
      context = undefined;
    } else {
      dom = mepto.qsa(document, selector as string) as MeptoElement[];
    }
  }

  return new MeptoCollectionImpl(dom, selector as string, context) as unknown as MeptoCollection<MeptoElement>;
}

// Check if object is a Mepto collection
mepto.isZ = function (object: unknown): boolean {
  return object instanceof MeptoCollectionImpl;
};

// MeptoCollection implementation
class MeptoCollectionImpl {
  length: number;
  [index: number]: MeptoElement;

  constructor(dom: MeptoElement[], selector?: string, context?: Document | Element) {
    this.length = dom.length;
    for (let i = 0; i < dom.length; i++) {
      this[i] = dom[i];
    }
    (this as unknown as Record<string, unknown>).selector = selector || '';
    (this as unknown as Record<string, unknown>).context = context || document;
  }
}

// Initialize the Mepto static object
export function initMepto(): MeptoStatic {
  const $ = init as unknown as MeptoStatic;

  // Expose mepto utilities
  $.mepto = mepto;

  // Expose isZ check
  $.isZ = mepto.isZ;

  // UUID generator
  let uuidCounter = 0;
  Object.defineProperty($, 'uuid', {
    get: () => ++uuidCounter,
  });

  // Expando property name
  $.expando = 'Mepto' + Date.now();

  // Utility functions
  $.each = function <T>(
    collection: T[] | Record<string, T>,
    callback: (index: string | number, item: T) => boolean | void
  ): T[] | Record<string, T> {
    if (isArray(collection)) {
      for (let i = 0, l = collection.length; i < l; i++) {
        if (callback.call(collection[i], i, collection[i]) === false) {
          return collection;
        }
      }
    } else {
      for (const key in collection) {
        if (Object.prototype.hasOwnProperty.call(collection, key)) {
          if (callback.call(collection[key], key, collection[key]) === false) {
            return collection;
          }
        }
      }
    }
    return collection;
  };

  $.extend = function <T>(target: T, ...sources: unknown[]): T {
    const deep = target === true;
    if (sources.length === 0) {
      sources = [target];
      target = {} as T;
    }

    sources.forEach((source) => {
      if (source && typeof source === 'object') {
        for (const key in source as Record<string, unknown>) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            const value = (source as Record<string, unknown>)[key];
            if (deep && isPlainObject(value)) {
              (target as Record<string, unknown>)[key] = $.extend(
                true,
                (target as Record<string, unknown>)[key] || {},
                value
              );
            } else {
              (target as Record<string, unknown>)[key] = value;
            }
          }
        }
      }
    });

    return target;
  };

  $.noop = function (): void {};

  $.type = type;
  $.isArray = isArray;
  $.isFunction = isFunction;
  $.isWindow = isWindow;
  $.isPlainObject = isPlainObject;
  $.isObject = isObject;
  $.isNumeric = function (obj: unknown): boolean {
    const n = parseFloat(String(obj));
    return !isNaN(n) && isFinite(n);
  };

  $.trim = function (str: string): string {
    return str == null ? '' : String.prototype.trim.call(str);
  };

  $.camelCase = camelize;
  $.dasherize = dasherize;

  // Make the collection prototype available
  $.fn = MeptoCollectionImpl.prototype as unknown as MeptoCollection<MeptoElement>;

  // Add basic collection methods
  const proto = MeptoCollectionImpl.prototype as unknown as Record<string, unknown>;

  proto.each = function (
    this: MeptoCollectionImpl,
    callback: (index: number, element: MeptoElement) => boolean | void
  ): MeptoCollection<MeptoElement> {
    for (let i = 0, l = this.length; i < l; i++) {
      if (callback.call(this[i], i, this[i]) === false) {
        return this as unknown as MeptoCollection<MeptoElement>;
      }
    }
    return this as unknown as MeptoCollection<MeptoElement>;
  };

  proto.map = function <U>(
    this: MeptoCollectionImpl,
    callback: (index: number, element: MeptoElement) => U
  ): MeptoCollection<MeptoElement> {
    const values: U[] = [];
    for (let i = 0, l = this.length; i < l; i++) {
      const value = callback.call(this[i], i, this[i]);
      if (value != null) {
        values.push(value);
      }
    }
    return new MeptoCollectionImpl(values as unknown as MeptoElement[], undefined, undefined) as unknown as MeptoCollection<MeptoElement>;
  };

  proto.get = function (
    this: MeptoCollectionImpl,
    index?: number
  ): MeptoElement | MeptoElement[] | undefined {
    return index === undefined
      ? Array.from(this as unknown as MeptoElement[])
      : this[index < 0 ? this.length + index : index];
  };

  proto.eq = function (
    this: MeptoCollectionImpl,
    index: number
  ): MeptoCollection<MeptoElement> {
    return index === -1
      ? (this.slice(index) as unknown as MeptoCollection<MeptoElement>)
      : (this.slice(index, index + 1) as unknown as MeptoCollection<MeptoElement>);
  };

  proto.first = function (this: MeptoCollectionImpl): MeptoCollection<MeptoElement> {
    return this.eq(0);
  };

  proto.last = function (this: MeptoCollectionImpl): MeptoCollection<MeptoElement> {
    return this.eq(-1);
  };

  proto.slice = function (
    this: MeptoCollectionImpl,
    start?: number,
    end?: number
  ): MeptoCollection<MeptoElement> {
    return new MeptoCollectionImpl(
      Array.prototype.slice.call(this, start, end) as MeptoElement[],
      undefined,
      undefined
    ) as unknown as MeptoCollection<MeptoElement>;
  };

  proto.toArray = function (this: MeptoCollectionImpl): MeptoElement[] {
    return Array.from(this as unknown as MeptoElement[]);
  };

  proto.index = function (
    this: MeptoCollectionImpl,
    element?: string | MeptoElement
  ): number {
    if (element) {
      const el = typeof element === 'string'
        ? (mepto.qsa(document, element)[0] as MeptoElement)
        : element;
      return Array.from(this as unknown as MeptoElement[]).indexOf(el);
    }
    return this.length > 0
      ? Array.from(
          (this[0] as unknown as { parentNode: ParentNode }).parentNode.children
        ).indexOf(this[0] as Element)
      : -1;
  };

  proto.size = function (this: MeptoCollectionImpl): number {
    return this.length;
  };

  // Return the completed Mepto object
  return $;
}

// Export helper types and functions
export { mepto, isFunction, isArray, isPlainObject, camelize, dasherize, compact, flatten };
