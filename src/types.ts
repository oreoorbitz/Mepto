/**
 * Type definitions for Mepto.js
 */

// Basic element types
export type MeptoElement = Element | Document | Window
export type Selector = string | MeptoElement | MeptoElement[] | NodeList | MeptoCollection | null

// Plain object type (object literal)
export interface PlainObject<T = unknown> {
  [key: string]: T
}

// Event handler function type
export interface EventHandler {
  (event: Event, ...args: unknown[]): unknown
}

// Event listener options
export interface EventListener {
  (event: Event): void
}

// CSS properties
export type CSSProperties = Record<string, string | number>

// Animation options
export interface AnimationOptions {
  duration?: number
  easing?: string
  complete?: () => void
  step?: (now: number, fx: unknown) => void
  queue?: boolean | string
  specialEasing?: Record<string, string>
}

// Ajax settings
export interface AjaxSettings {
  url?: string
  type?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string
  method?: string
  data?: PlainObject | string | FormData
  contentType?: string | false
  processData?: boolean
  dataType?: 'json' | 'xml' | 'html' | 'text' | 'script' | 'jsonp'
  timeout?: number
  async?: boolean
  cache?: boolean
  global?: boolean
  headers?: Record<string, string>
  accepts?: Record<string, string>
  context?: unknown
  traditional?: boolean
  beforeSend?: (xhr: XMLHttpRequest, settings: AjaxSettings) => boolean | void
  success?: AjaxSuccessCallback
  error?: AjaxErrorCallback
  complete?: AjaxCompleteCallback
  jsonp?: string | false
  jsonpCallback?: string | (() => string)
  scriptCharset?: string
  mimeType?: string
  xhrFields?: Record<string, unknown>
  statusCode?: Record<number, () => void>
  crossDomain?: boolean
}

export type AjaxSuccessCallback = (data: unknown, status: string, xhr: XMLHttpRequest) => void

export type AjaxErrorCallback = (xhr: XMLHttpRequest, errorType: string, error: Error) => void

export type AjaxCompleteCallback = (xhr: XMLHttpRequest, status: string) => void

// Deferred/Promise types
export interface DeferredObject<T = unknown> extends PromiseObject<T> {
  resolve(value?: T): DeferredObject<T>
  reject(reason?: unknown): DeferredObject<T>
  notify(value?: unknown): DeferredObject<T>
  state(): 'pending' | 'resolved' | 'rejected'
  promise(target?: unknown): PromiseObject<T>
}

export interface PromiseObject<T = unknown> {
  always(...callbacks: (() => void)[]): PromiseObject<T>
  done(...callbacks: ((value: T) => void)[]): PromiseObject<T>
  fail(...callbacks: ((reason: unknown) => void)[]): PromiseObject<T>
  progress(...callbacks: ((value: unknown) => void)[]): PromiseObject<T>
  then<U>(
    doneFilter: (value: T) => U | PromiseObject<U>,
    failFilter?: (reason: unknown) => U | PromiseObject<U>,
    progressFilter?: (value: unknown) => unknown
  ): PromiseObject<U>
  catch<U>(failFilter: (reason: unknown) => U | PromiseObject<U>): PromiseObject<U>
  pipe?(
    doneFilter?: (value: T) => unknown,
    failFilter?: (reason: unknown) => unknown,
    progressFilter?: (value: unknown) => unknown
  ): PromiseObject<unknown>
}

// Callbacks options
export interface CallbacksOptions {
  once?: boolean
  memory?: boolean
  unique?: boolean
  stopOnFalse?: boolean
}

// Offset object
export interface OffsetObject {
  top: number
  left: number
}

// Event object extensions
export interface MeptoEvent extends Event {
  _zid?: number
  namespace?: string
  namespace_re?: RegExp
  result?: unknown
  isImmediatePropagationStopped?: boolean
}

/**
 * DOMTokenList-flavoured view over a {@link MeptoCollection}, exposed as the
 * `.classList` getter. Mutating methods (`add`/`remove`/`toggle`/`replace`,
 * the `value` setter) apply to every element in the collection and return the
 * collection for chaining; read methods (`contains`, `length`, `value`,
 * iterators) reflect only the first element. Unlike the native DOMTokenList,
 * space-separated strings are split per token (mirroring `addClass`), so
 * `.classList.add('a b')` adds both classes instead of throwing.
 */
export interface MeptoClassList {
  add(...tokens: string[]): MeptoCollection
  remove(...tokens: string[]): MeptoCollection
  toggle(token: string, force?: boolean): MeptoCollection
  contains(token: string): boolean
  replace(oldToken: string, newToken: string): MeptoCollection
  entries(): IterableIterator<[number, string]>
  forEach(callback: (value: string, key: number, list: DOMTokenList) => void): void
  item(index: number): string | null
  keys(): IterableIterator<number>
  values(): IterableIterator<string>
  toString(): string
  readonly length: number
  value: string
}

/**
 * Attribute view over a {@link MeptoCollection}, exposed as the `.attrs`
 * getter. A migration bridge mirroring the native `getAttribute` /
 * `setAttribute` / `removeAttribute`: `set`/`remove` apply to every element
 * and return the collection for chaining, while `get` reads only the first
 * element. Like `.attr`, a `null`/`undefined` value passed to `set` removes
 * the attribute, and `remove` accepts a whitespace-separated list of names.
 */
export interface MeptoAttrs {
  get(name: string): string | undefined
  set(
    name: string | Record<string, string | number | boolean | null | undefined>,
    value?: string | number | boolean | null
  ): MeptoCollection
  remove(names: string): MeptoCollection
}

/**
 * Inline-style view over a {@link MeptoCollection}, exposed as the `.styles`
 * getter. A migration bridge mirroring native `style.setProperty` /
 * `style.removeProperty` / computed-style reads: `set` applies to every
 * element and returns the collection for chaining, while `get` reads only the
 * first element. Like `.css`, camelCase or dashed keys both work, a numeric
 * value gets a `px` suffix (except unit-less properties), and a
 * `null`/empty-string value removes the property.
 */
export interface MeptoStyles {
  get(name: string): string | undefined
  set(
    name: string | Record<string, string | number | null | undefined>,
    value?: string | number | null
  ): MeptoCollection
}

// Main Mepto collection interface
export interface MeptoCollection<T extends MeptoElement = MeptoElement> {
  // Core properties
  length: number
  [index: number]: T

  // Core methods
  each(callback: (index: number, element: T) => boolean | void): MeptoCollection<T>
  map<U>(callback: (index: number, element: T) => U): MeptoCollection<U & MeptoElement>
  filter(selector: string | ((index: number, element: T) => boolean)): MeptoCollection<T>
  is(selector: string | ((index: number, element: T) => boolean)): boolean
  not(selector: string | ((index: number, element: T) => boolean)): MeptoCollection<T>
  has(selector: string): MeptoCollection<T>
  eq(index: number): MeptoCollection<T>
  first(): MeptoCollection<T>
  last(): MeptoCollection<T>
  slice(start?: number, end?: number): MeptoCollection<T>
  toArray(): T[]
  get(index?: number): T | T[] | undefined
  size(): number
  index(selector?: string | T): number
  end(): MeptoCollection<T>
  add(selector: Selector, context?: Document): MeptoCollection<T>

  // DOM manipulation
  html(): string
  html(content: string | MeptoCollection): MeptoCollection<T>
  text(): string
  text(content: string | number): MeptoCollection<T>
  attr(name: string): string | null
  attr(name: string, value: string | number | null): MeptoCollection<T>
  attr(attributes: Record<string, string | number>): MeptoCollection<T>
  removeAttr(name: string): MeptoCollection<T>
  prop(name: string): unknown
  prop(name: string, value: unknown): MeptoCollection<T>
  prop(properties: Record<string, unknown>): MeptoCollection<T>
  removeProp(name: string): MeptoCollection<T>
  data(): Record<string, unknown>
  data(name: string): unknown
  data(name: string, value: unknown): MeptoCollection<T>
  data(attributes: Record<string, unknown>): MeptoCollection<T>
  removeData(name?: string): MeptoCollection<T>
  val(): string | string[] | number
  val(value: string | string[] | number | null): MeptoCollection<T>
  css(property: string): string
  css(property: string, value: string | number): MeptoCollection<T>
  css(properties: CSSProperties): MeptoCollection<T>
  width(): number
  width(value: number | string): MeptoCollection<T>
  height(): number
  height(value: number | string): MeptoCollection<T>
  innerWidth(): number
  innerHeight(): number
  outerWidth(includeMargin?: boolean): number
  outerHeight(includeMargin?: boolean): number
  offset(): OffsetObject
  offset(coordinates: OffsetObject): MeptoCollection<T>
  position(): OffsetObject
  scrollLeft(): number
  scrollLeft(value: number): MeptoCollection<T>
  scrollTop(): number
  scrollTop(value: number): MeptoCollection<T>

  // Class manipulation
  addClass(names: string): MeptoCollection<T>
  removeClass(names?: string): MeptoCollection<T>
  toggleClass(names: string, switch_?: boolean): MeptoCollection<T>
  hasClass(name: string): boolean
  /**
   * DOMTokenList-flavoured bridge over the collection. Mutating methods apply
   * to every element; read methods reflect the first element. Unlike the
   * native DOMTokenList, space-separated strings are split per token (matching
   * addClass/removeClass), so `.classList.add('a b')` does not throw.
   */
  readonly classList: MeptoClassList
  /**
   * Attribute bridge over the collection. Mutating methods apply to every
   * element; `get` reflects the first element. A `null`/`undefined` value
   * removes the attribute (matching `.attr`), and `remove` splits on
   * whitespace (matching `removeAttr`).
   */
  readonly attrs: MeptoAttrs
  /**
   * Inline-style bridge over the collection. `set` applies to every element;
   * `get` reflects the first element (inline style, else computed). camelCase
   * or dashed keys both work, a numeric value gets a `px` suffix (except
   * unit-less properties), and a `null`/empty value removes the property
   * (matching `.css`).
   */
  readonly styles: MeptoStyles

  // Content manipulation
  append(content: Selector): MeptoCollection<T>
  prepend(content: Selector): MeptoCollection<T>
  after(content: Selector): MeptoCollection<T>
  before(content: Selector): MeptoCollection<T>
  appendTo(target: Selector): MeptoCollection<T>
  prependTo(target: Selector): MeptoCollection<T>
  insertAfter(target: Selector): MeptoCollection<T>
  insertBefore(target: Selector): MeptoCollection<T>
  replaceWith(content: Selector): MeptoCollection<T>
  replaceAll(target: Selector): MeptoCollection<T>
  remove(selector?: string): MeptoCollection<T>
  detach(selector?: string): MeptoCollection<T>
  empty(): MeptoCollection<T>
  clone(deep?: boolean): MeptoCollection<T>

  // Traversal
  find(selector: string): MeptoCollection<Element>
  closest(selector: string, context?: Element): MeptoCollection<Element>
  singleClosest(selector: string, context?: Element): MeptoCollection<Element>
  parents(selector?: string): MeptoCollection<Element>
  parent(selector?: string): MeptoCollection<Element>
  children(selector?: string): MeptoCollection<Element>
  contents(): MeptoCollection<Element>
  siblings(selector?: string): MeptoCollection<Element>
  next(selector?: string): MeptoCollection<Element>
  nextAll(selector?: string): MeptoCollection<Element>
  nextUntil(selector?: string, filter?: string): MeptoCollection<Element>
  prev(selector?: string): MeptoCollection<Element>
  prevAll(selector?: string): MeptoCollection<Element>
  prevUntil(selector?: string, filter?: string): MeptoCollection<Element>

  // Events
  on(event: string, handler: EventHandler): MeptoCollection<T>
  on(event: string, selector: string, handler: EventHandler): MeptoCollection<T>
  on(event: string, data: unknown, handler: EventHandler): MeptoCollection<T>
  on(events: Record<string, EventHandler>): MeptoCollection<T>
  off(event?: string, handler?: EventHandler): MeptoCollection<T>
  off(event: string, selector: string, handler?: EventHandler): MeptoCollection<T>
  one(event: string, handler: EventHandler): MeptoCollection<T>
  one(event: string, selector: string, handler: EventHandler): MeptoCollection<T>
  one(event: string, data: unknown, handler: EventHandler): MeptoCollection<T>
  trigger(event: string | Event, data?: unknown): MeptoCollection<T>
  triggerHandler(event: string | Event, data?: unknown): unknown
  bind(event: string, handler: EventHandler): MeptoCollection<T>
  unbind(event?: string, handler?: EventHandler): MeptoCollection<T>
  delegate(selector: string, event: string, handler: EventHandler): MeptoCollection<T>
  undelegate(selector?: string, event?: string, handler?: EventHandler): MeptoCollection<T>
  hover(enter: EventHandler, leave: EventHandler): MeptoCollection<T>
  click(handler?: EventHandler): MeptoCollection<T>
  dblclick(handler?: EventHandler): MeptoCollection<T>
  mousedown(handler?: EventHandler): MeptoCollection<T>
  mouseup(handler?: EventHandler): MeptoCollection<T>
  mousemove(handler?: EventHandler): MeptoCollection<T>
  mouseover(handler?: EventHandler): MeptoCollection<T>
  mouseout(handler?: EventHandler): MeptoCollection<T>
  mouseenter(handler?: EventHandler): MeptoCollection<T>
  mouseleave(handler?: EventHandler): MeptoCollection<T>
  keydown(handler?: EventHandler): MeptoCollection<T>
  keyup(handler?: EventHandler): MeptoCollection<T>
  keypress(handler?: EventHandler): MeptoCollection<T>
  submit(handler?: EventHandler): MeptoCollection<T>
  change(handler?: EventHandler): MeptoCollection<T>
  focus(handler?: EventHandler): MeptoCollection<T>
  blur(handler?: EventHandler): MeptoCollection<T>
  focusin(handler?: EventHandler): MeptoCollection<T>
  focusout(handler?: EventHandler): MeptoCollection<T>
  resize(handler?: EventHandler): MeptoCollection<T>
  scroll(handler?: EventHandler): MeptoCollection<T>
  select(handler?: EventHandler): MeptoCollection<T>
  error(handler?: EventHandler): MeptoCollection<T>
  /**
   * Performs an ajax GET request to `url` and replaces the collection's
   * HTML with the response. If `url` contains a space, the second token
   * is treated as a CSS selector to filter the response.
   *
   * (jQuery also exposes `load(handler)` as an event-binding shortcut,
   * but mepto's `$.fn.load` is ajax-only — for event handling, use
   * `$.fn.on('load', handler)` instead.)
   */
  load(url: string, data?: unknown, success?: unknown): MeptoCollection<T>
  unload(handler?: EventHandler): MeptoCollection<T>

  // Forms
  serialize(): string
  serializeArray(): Array<{ name: string; value: string }>
  submit(handler?: EventHandler): MeptoCollection<T>

  // Effects
  show(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  show(options: AnimationOptions): MeptoCollection<T>
  hide(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  hide(options: AnimationOptions): MeptoCollection<T>
  toggle(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  toggle(options: AnimationOptions): MeptoCollection<T>
  toggle(show: boolean): MeptoCollection<T>
  fadeIn(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  fadeIn(options: AnimationOptions): MeptoCollection<T>
  fadeOut(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  fadeOut(options: AnimationOptions): MeptoCollection<T>
  fadeTo(
    duration: number | string,
    opacity: number,
    easing?: string,
    callback?: () => void
  ): MeptoCollection<T>
  fadeToggle(duration?: number | string, easing?: string, callback?: () => void): MeptoCollection<T>
  fadeToggle(options: AnimationOptions): MeptoCollection<T>
  animate(
    properties: CSSProperties,
    duration?: number | string,
    easing?: string,
    callback?: () => void
  ): MeptoCollection<T>
  animate(properties: CSSProperties, options: AnimationOptions): MeptoCollection<T>
  stop(clearQueue?: boolean, jumpToEnd?: boolean): MeptoCollection<T>
  stop(queue: string, clearQueue?: boolean, jumpToEnd?: boolean): MeptoCollection<T>
  delay(duration: number, queue?: string): MeptoCollection<T>
  clearQueue(queue?: string): MeptoCollection<T>
  queue(): unknown[]
  queue(callback: () => void): MeptoCollection<T>
  queue(queue: string, callback: () => void): MeptoCollection<T>
  dequeue(queue?: string): MeptoCollection<T>

  // Utilities
  pluck(property: string): unknown[]
  concat(...items: (T | T[])[]): MeptoCollection<T>
  push(...items: T[]): number
  pop(): T | undefined
  shift(): T | undefined
  unshift(...items: T[]): number
  splice(start: number, deleteCount?: number, ...items: T[]): T[]
  slice(start?: number, end?: number): MeptoCollection<T>
  ready(callback: () => void): MeptoCollection<T>
}

// Static Mepto interface
export interface MeptoStatic {
  // Core — mirrors mepto.init: selector string / element / array / collection,
  // plus a ready-callback function; context may be Element, Document, or
  // a selector string (for $(context).find(selector)).
  (
    selector?: Selector | ((...args: unknown[]) => unknown) | null,
    context?: Document | Element | string
  ): MeptoCollection
  fn: MeptoCollection

  // Utilities
  // Static $.each is a generic iterator — accept any callback shape, since
  // callbacks often bind extra args (`(i, el) => ...`) or use the same
  // function for both array and object iteration. The runtime forwards
  // the iteration index and value; the callback decides what to read.
  each<T>(
    collection: T[] | Record<string, T> | unknown,
    callback: (index: unknown, item: unknown) => boolean | void | unknown
  ): T[] | Record<string, T> | unknown
  map<T, U>(collection: T[], callback: (item: T, index: number) => U | null | undefined): U[]
  extend<T, U>(target: T, source: U): T & U
  extend<T, U, V>(target: T, source1: U, source2: V): T & U & V
  extend<T>(deep: boolean, target: T, ...sources: unknown[]): T
  noop(): void
  identity<T>(value: T): T

  // Type checking
  type(obj: unknown): string
  isArray(obj: unknown): obj is unknown[]
  isFunction(obj: unknown): obj is (...args: unknown[]) => unknown
  isWindow(obj: unknown): obj is Window
  isDocument(obj: unknown): obj is Document
  isObject(obj: unknown): obj is Record<string, unknown>
  isPlainObject(obj: unknown): obj is PlainObject
  isEmptyObject(obj: Record<string, unknown>): boolean
  isNumeric(obj: unknown): boolean
  isString(obj: unknown): obj is string
  isBoolean(obj: unknown): obj is boolean
  isRegExp(obj: unknown): obj is RegExp
  isDate(obj: unknown): obj is Date
  isError(obj: unknown): obj is Error
  isNull(obj: unknown): obj is null
  isUndefined(obj: unknown): obj is undefined

  // String utilities
  trim(str: string): string
  camelCase(str: string): string
  dasherize(str: string): string
  parseJSON(json: string): unknown

  // Array/Object utilities
  grep<T>(array: T[], callback: (item: T, index: number) => boolean): T[]
  inArray<T>(value: T, array: T[], fromIndex?: number): number
  merge<T>(first: T[], second: T[]): T[]
  unique<T>(array: T[]): T[]
  uniqueSort<T>(array: T[]): T[]
  makeArray<T>(obj: T | T[]): T[]
  contains(container: Element, contained: Element): boolean

  // Browser/OS detection
  browser: {
    webkit?: boolean
    chrome?: boolean
    firefox?: boolean
    safari?: boolean
    webview?: boolean
    version?: string
  }
  os: {
    ios?: boolean
    android?: boolean
    webos?: boolean
    blackberry?: boolean
    bb10?: boolean
    rimtabletos?: boolean
    playbook?: boolean
    kindle?: boolean
    silk?: boolean
    windowsphone?: boolean
    windows?: boolean
    mac?: boolean
    linux?: boolean
    version?: string
    phone?: boolean
    tablet?: boolean
    touch?: boolean
  }
  support: Record<string, boolean>

  // Ajax
  ajax(settings: AjaxSettings): XMLHttpRequest
  ajax(url: string, settings?: AjaxSettings): XMLHttpRequest
  /**
   * Defaults applied to every $.ajax call. Override individual fields to
   * change global ajax behaviour (e.g. contentType, headers).
   */
  ajaxSettings: AjaxSettings
  /**
   * Number of in-flight ajax requests — used to fire the global
   * ajaxStart/ajaxStop events.
   */
  active: number
  ajaxSetup(options: AjaxSettings): void
  get(
    url: string,
    data?: PlainObject | string,
    success?: AjaxSuccessCallback,
    dataType?: string
  ): XMLHttpRequest
  post(
    url: string,
    data?: PlainObject | string,
    success?: AjaxSuccessCallback,
    dataType?: string
  ): XMLHttpRequest
  getJSON(url: string, data?: PlainObject | string, success?: AjaxSuccessCallback): XMLHttpRequest
  getScript(url: string, success?: AjaxSuccessCallback): XMLHttpRequest
  param(obj: PlainObject | unknown[], traditional?: boolean): string

  // JSONP
  ajaxJSONP(settings: AjaxSettings): XMLHttpRequest

  // Deferred/Promise
  Deferred<T>(fn?: (deferred: DeferredObject<T>) => void): DeferredObject<T>
  when<T>(...deferreds: PromiseObject<T>[]): PromiseObject<T[]>
  ready(callback: () => void): void
  holdReady(hold: boolean): void

  // Callbacks
  Callbacks(options?: CallbacksOptions): {
    add(...callbacks: (() => void)[]): unknown
    disable(): unknown
    disabled(): boolean
    empty(): unknown
    fire(...arguments_: unknown[]): unknown
    fired(): boolean
    fireWith(context: unknown, args?: unknown[]): unknown
    has(callback: () => void): boolean
    lock(): unknown
    locked(): boolean
    remove(...callbacks: (() => void)[]): unknown
  }

  // Events
  event: {
    add(
      element: Element,
      events: string,
      fn: (...args: unknown[]) => unknown,
      data?: unknown,
      selector?: string,
      delegator?: (...args: unknown[]) => unknown,
      capture?: boolean
    ): void
    remove(
      element: Element,
      events?: string,
      fn?: (...args: unknown[]) => unknown,
      selector?: string,
      capture?: boolean
    ): void
  }
  Event(type: string | Record<string, unknown>, properties?: Record<string, unknown>): Event
  proxy(
    fn: (...args: unknown[]) => unknown,
    context: unknown,
    ...args: unknown[]
  ): (...args: unknown[]) => unknown

  // Data
  data(element: Element, name: string): unknown
  data(element: Element, name: string, value: unknown): void
  data(element: Element): Record<string, unknown>
  removeData(element: Element, name?: string): void
  hasData(element: Element): boolean

  // Internal
  queue(element: Element, queueName: string, callback?: () => void): unknown
  dequeue(element: Element, queueName: string): void
  fx: {
    off: boolean
    speeds: { slow: number; fast: number; _default: number }
    cssPrefix: string
    transitionEnd: string
    animationEnd: string
  }
  expr: {
    ':': Record<string, (element: Element, index: number, matches: unknown) => boolean>
  }
  uuid: number
}
