//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection, type MeptoElement } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const slice = Array.prototype.slice
  const isFunction = $.isFunction
  const isString = function (obj: unknown): obj is string {
    return typeof obj == 'string'
  }

  interface Handler {
    e: string
    ns: string
    fn: (...args: unknown[]) => unknown
    sel?: string
    del?: ((...args: unknown[]) => unknown) | undefined
    proxy: EventListener
    i: number
  }

  const elementHandlers = new WeakMap<EventTarget, Handler[]>()
  let _fnId = 1
  const fnIds = new WeakMap<Function, number>()

  function fnZid(fn: (...args: unknown[]) => unknown): number {
    let id = fnIds.get(fn)
    if (id === undefined) {
      id = _fnId++
      fnIds.set(fn, id)
    }
    return id
  }

  const focus: Record<string, string> = { focus: 'focusin', blur: 'focusout' }
  const hover: Record<string, string> = { mouseenter: 'mouseover', mouseleave: 'mouseout' }

  function findHandlers(
    element: Element,
    event: string,
    fn?: (...args: unknown[]) => unknown,
    selector?: string
  ): Handler[] {
    const stored = elementHandlers.get(element)
    if (!stored || stored.length === 0) return []

    const parsed = parse(event)
    const matcher = parsed.ns ? matcherFor(parsed.ns) : null
    const targetFnId = fn ? fnZid(fn) : null

    return stored.filter(
      handler =>
        handler &&
        (!parsed.e || handler.e === parsed.e) &&
        (!parsed.ns || matcher!.test(handler.ns)) &&
        (!fn || fnZid(handler.fn) === targetFnId) &&
        (!selector || handler.sel === selector)
    )
  }

  function parse(event: string): { e: string; ns: string } {
    const parts = ('' + event).split('.')
    return { e: parts[0], ns: parts.slice(1).sort().join(' ') }
  }

  function matcherFor(ns: string): RegExp {
    return new RegExp('(?:^| )' + ns.replace(' ', ' .* ?') + '(?: |$)')
  }

  function eventCapture(captureSetting?: boolean): boolean {
    return !!captureSetting
  }

  function realEvent(type: string): string {
    return hover[type] || focus[type] || type
  }

  function add(
    element: Element,
    events: string,
    fn: (...args: unknown[]) => unknown,
    data?: unknown,
    selector?: string,
    delegator?: (...args: unknown[]) => unknown,
    capture?: boolean
  ): void {
    let set = elementHandlers.get(element)
    if (!set) {
      set = []
      elementHandlers.set(element, set)
    }
    ;(events.match(/\S+/g) || []).forEach((event: string): void => {
      if (event == 'ready') {
        $(document).ready(fn as unknown as () => void)
        return
      }
      const parsed = parse(event)
      const handler: Handler = {
        e: parsed.e,
        ns: parsed.ns,
        fn,
        sel: selector,
        del: undefined,
        proxy: (): void => {},
        i: set.length,
      }
      // emulate mouseenter, mouseleave
      let callback = fn
      if (handler.e in hover)
        callback = function (this: Element, ...args: unknown[]) {
          const e = args[0] as MouseEvent
          const related = e.relatedTarget
          if (!related || (related !== this && !$.contains(this, related as Element)))
            return handler.fn.apply(this, args)
        }
      handler.del = delegator
      const cb = delegator || callback
      handler.proxy = (e: Event): unknown => {
        e = compatible(e)
        if (
          (
            e as Event & { isImmediatePropagationStopped(): boolean }
          ).isImmediatePropagationStopped()
        )
          return
        ;(e as Event & { data?: unknown }).data = data
        const args = (e as Event & { _args?: unknown[] })._args
        const result = cb.apply(element, args == undefined ? [e] : [e].concat(args as Event[]))
        if (result === false) (e.preventDefault(), e.stopPropagation())
        return result
      }
      set.push(handler)
      if ('addEventListener' in element)
        element.addEventListener(realEvent(handler.e), handler.proxy, eventCapture(capture))
    })
  }

  function remove(
    element: Element,
    events?: string,
    fn?: (...args: unknown[]) => unknown,
    selector?: string,
    capture?: boolean
  ): void {
    const stored = elementHandlers.get(element)
    if (!stored) return

    const eventNames = (events || '').match(/\S+/g) || ['']

    eventNames.forEach(event => {
      findHandlers(element, event, fn, selector).forEach(handler => {
        delete stored[handler.i]
        element.removeEventListener(realEvent(handler.e), handler.proxy, eventCapture(capture))
      })
    })
  }

  $.event = { add: add, remove: remove }

  $.proxy = function (
    fn: (...args: unknown[]) => unknown,
    context: unknown,
    ...presetArgs: unknown[]
  ) {
    const args = 2 in arguments ? presetArgs : undefined
    if (isFunction(fn)) {
      const proxyFn = function () {
        return fn.apply(
          context,
          (args
            ? args.concat(slice.call(arguments) as unknown[])
            : Array.from(arguments)) as unknown[]
        )
      }
      fnIds.set(proxyFn, fnZid(fn))
      return proxyFn
    } else if (isString(context)) {
      const obj = fn as Record<string, (...args: unknown[]) => unknown>
      if (args) {
        return $.proxy.apply(
          null,
          ([obj[context], fn] as unknown[]).concat(args) as [
            (...args: unknown[]) => unknown,
            unknown,
          ]
        )
      } else {
        return $.proxy(obj[context], fn)
      }
    } else {
      throw new TypeError('expected function')
    }
  }
  ;($.fn as unknown as Record<string, any>).bind = function (event: any, data: any, callback: any) {
    return this.on(event, data, callback)
  }
  ;($.fn as unknown as Record<string, any>).unbind = function (event: any, callback: any) {
    return this.off(event, callback)
  }
  ;($.fn as unknown as Record<string, any>).one = function (
    event: any,
    selector: any,
    data: any,
    callback: any,
    one: any
  ) {
    return this.on(event, selector, data, callback, 1)
  }

  const returnTrue = function () {
    return true
  }
  const returnFalse = function () {
    return false
  }
  const ignoreProperties = /^([A-Z]|returnValue$|layer[XY]$|webkitMovement[XY]$)/
  const eventMethods: Record<string, string> = {
    preventDefault: 'isDefaultPrevented',
    stopImmediatePropagation: 'isImmediatePropagationStopped',
    stopPropagation: 'isPropagationStopped',
  }

  function compatible(event: Event, source?: Event): Event {
    const evt = event as Event & Record<string, unknown>
    if (source || !(evt as Event & { isDefaultPrevented?: () => boolean }).isDefaultPrevented) {
      source || (source = event)

      $.each(eventMethods, (name: string, predicate: string): void => {
        const src = source as unknown as Record<string, (...args: unknown[]) => unknown>
        const sourceMethod = src[name]
        evt[name] = function (this: Record<string, () => boolean>, ...args: unknown[]): unknown {
          this[predicate] = returnTrue
          return sourceMethod ? sourceMethod.apply(source, args) : undefined
        }
        ;(evt as Record<string, () => boolean>)[predicate] = returnFalse
      })

      if ((source as Event).defaultPrevented)
        (evt as Event & { isDefaultPrevented?: () => boolean }).isDefaultPrevented = returnTrue
    }
    return event
  }

  function createProxy(event: Event): Event {
    let key: string
    const proxy: Record<string, unknown> & { originalEvent: Event } = {
      originalEvent: event,
    }
    for (key in event)
      if (
        !ignoreProperties.test(key) &&
        (event as unknown as Record<string, unknown>)[key] !== undefined
      )
        proxy[key] = (event as unknown as Record<string, unknown>)[key]

    return compatible(proxy as unknown as Event, event)
  }

  ;($.fn as unknown as Record<string, any>).delegate = function (
    selector: any,
    event: any,
    callback: any
  ) {
    return this.on(event, selector, callback)
  }
  ;($.fn as unknown as Record<string, any>).undelegate = function (
    selector: any,
    event: any,
    callback: any
  ) {
    return this.off(event, selector, callback)
  }
  ;($.fn as unknown as Record<string, any>).on = function (
    this: MeptoCollection,
    event: any,
    selector: any,
    data: any,
    callback: any,
    one: any
  ): MeptoCollection {
    const $this = this
    if (event && !isString(event)) {
      $.each(
        event as Record<string, (...args: unknown[]) => unknown>,
        (type: string, fn: unknown): void => {
          ;(this as any).on(type, selector, data, fn, one)
        }
      )
      return this
    }

    if (!isString(selector) && !isFunction(callback) && callback !== false)
      ((callback = data as (...args: unknown[]) => unknown),
        (data = selector),
        (selector = undefined))

    if (callback === undefined || data === false)
      ((callback = data as (...args: unknown[]) => unknown), (data = undefined))

    if (callback === false) callback = returnFalse as (...args: unknown[]) => unknown

    return $this.each((_: number, element: Element): void => {
      let autoRemove: ((...args: unknown[]) => unknown) | undefined,
        delegator: ((...args: unknown[]) => unknown) | undefined

      if (one)
        autoRemove = function (this: Element, ...args: unknown[]) {
          const e = args[0] as Event
          remove(element, e.type, callback)
          return (callback as (...args: unknown[]) => unknown).apply(this, args)
        }

      if (selector)
        delegator = function (this: Element, ...args: unknown[]) {
          const e = args[0] as Event
          const match = $(e.target as Element)
            .closest(selector as string, element)
            .get(0)
          if (match && match !== element) {
            const evt = $.extend(createProxy(e), {
              currentTarget: match,
              liveFired: element,
            })
            return (autoRemove || callback).apply(match, [evt, ...args.slice(1)])
          }
        }

      add(
        element,
        event as string,
        callback as (...args: unknown[]) => unknown,
        data,
        selector as string | undefined,
        delegator || autoRemove
      )
    })
  }
  ;($.fn as unknown as Record<string, any>).off = function (
    this: MeptoCollection,
    event: any,
    selector: any,
    callback: any
  ): MeptoCollection {
    const $this = this
    if (event && !isString(event)) {
      $.each(
        event as Record<string, (...args: unknown[]) => unknown>,
        (type: string, fn: unknown): void => {
          $this.off(type, selector as string, fn as (...args: unknown[]) => unknown)
        }
      )
      return $this
    }

    if (!isString(selector) && !isFunction(callback) && callback !== false)
      ((callback = selector as (...args: unknown[]) => unknown), (selector = undefined))

    if (callback === false) callback = returnFalse as (...args: unknown[]) => unknown

    return $this.each(function () {
      remove(
        this as Element,
        event as string | undefined,
        callback as ((...args: unknown[]) => unknown) | undefined,
        selector as string | undefined
      )
    })
  }
  ;($.fn as unknown as Record<string, any>).trigger = function (event: any, args: any): void {
    const evt =
      isString(event) || $.isPlainObject(event)
        ? $.Event(event as string)
        : compatible(event as Event)
    ;(evt as Event & { _args?: unknown[] })._args = args
    return this.each(function () {
      // handle focus(), blur() by calling them directly
      if (
        evt.type in focus &&
        typeof (this as unknown as Record<string, unknown>)[evt.type] === 'function'
      )
        (this as unknown as Record<string, () => void>)[evt.type]()
      // items in the collection might not be DOM elements
      else if ('dispatchEvent' in this) (this as EventTarget).dispatchEvent(evt)
      else $(this).triggerHandler(evt, args)
    })
  }

  // triggers event handlers on current element just as if an event occurred,
  // doesn't trigger an actual event, doesn't bubble
  ;($.fn as unknown as Record<string, any>).triggerHandler = function (
    this: { each: (callback: (index: number, element: Element) => void) => void },
    event: Event | string,
    args?: unknown[]
  ): unknown {
    let e: Event, result: unknown
    this.each((_: number, element: Element): void => {
      e = createProxy(isString(event) ? $.Event(event) : (event as Event))
      ;(e as Event & { _args?: unknown[] })._args = args
      ;(e as Event & { target?: EventTarget }).target = element
      $.each(
        findHandlers(element, (event as Event).type || (event as string)),
        (_: number, handler: Handler): boolean | void => {
          result = handler.proxy(e)
          if (
            (
              e as Event & { isImmediatePropagationStopped(): boolean }
            ).isImmediatePropagationStopped()
          )
            return false
        }
      )
    })
    return result
  }

  // shortcut methods for `.bind(event, fn)` for each event type
  ;(
    'focusin focusout focus blur load resize scroll unload click dblclick ' +
    'mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave ' +
    'change select keydown keypress keyup error'
  )
    .split(' ')
    .forEach((event: string): void => {
      const $fn = $.fn as unknown as Record<
        string,
        (callback?: (...args: unknown[]) => unknown) => unknown
      >
      $fn[event] = function (
        this: { bind: (e: string, cb: unknown) => unknown; trigger: (e: string) => unknown },
        ...args: [((...args: unknown[]) => unknown)?]
      ): unknown {
        return args.length > 0 ? this.bind(event, args[0]) : this.trigger(event)
      }
    })
  ;($.Event as unknown as (type: any, props?: any) => Event) = function (
    type: any,
    props?: any
  ): Event {
    if (!isString(type))
      ((props = type as Record<string, unknown>), (type = (props as Record<string, string>).type))
    let bubbles = true
    if (props)
      for (const name in props)
        if (name === 'bubbles') bubbles = !!(props as Record<string, unknown>)[name]
    const event = new Event(type as string, { bubbles, cancelable: true })
    if (props)
      for (const name in props)
        if (name !== 'bubbles')
          (event as unknown as Record<string, unknown>)[name] = (props as Record<string, unknown>)[
            name
          ]
    return compatible(event)
  }
})(mepto)
