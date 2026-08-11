//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection, type EventHandler } from './types'

declare const mepto: MeptoStatic

interface TouchState {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  last?: number
  el?: MeptoCollection
  isDoubleTap?: boolean
}

interface TouchEventMap {
  down: string
  up: string
  move: string
  cancel: string
}

// A "first touch" can come from either a Touch (touchstart) or a
// PointerEvent (pointerdown). Both expose `pageX`/`pageY` and `target`,
// but the broader type is a small union to make narrowing explicit.
type FirstTouch = Touch | PointerEvent
;(function ($: MeptoStatic) {
  const longTapDelay = 750

  let touch: TouchState = {},
    touchTimeout: ReturnType<typeof setTimeout> | null = null,
    tapTimeout: ReturnType<typeof setTimeout> | null = null,
    swipeTimeout: ReturnType<typeof setTimeout> | null = null,
    longTapTimeout: ReturnType<typeof setTimeout> | null = null,
    down: ((e: Event) => void) | undefined,
    up: ((e: Event) => void) | undefined,
    move: ((e: Event) => void) | undefined,
    eventMap: TouchEventMap | false = false,
    initialized = false,
    // Flipped by cancelAll so a queued swipeTimeout knows the gesture was
    // canceled by a scroll/lifecycle reset, not by a fresh touchstart.
    swipeCanceled = false

  function swipeDirection(x1: number, x2: number, y1: number, y2: number): string {
    return Math.abs(x1 - x2) >= Math.abs(y1 - y2)
      ? x1 - x2 > 0
        ? 'Left'
        : 'Right'
      : y1 - y2 > 0
        ? 'Up'
        : 'Down'
  }

  function longTap(): void {
    longTapTimeout = null
    if (touch.last) {
      touch.el!.trigger('longTap')
      touch = {}
    }
  }

  function cancelLongTap(): void {
    if (longTapTimeout) clearTimeout(longTapTimeout)
    longTapTimeout = null
  }

  function cancelAll(): void {
    if (touchTimeout) clearTimeout(touchTimeout)
    if (tapTimeout) clearTimeout(tapTimeout)
    if (swipeTimeout) clearTimeout(swipeTimeout)
    if (longTapTimeout) clearTimeout(longTapTimeout)
    touchTimeout = tapTimeout = swipeTimeout = longTapTimeout = null
    // Mark any pending swipe as canceled so its deferred trigger (which
    // captured the original target + coords at up-time) knows not to fire.
    swipeCanceled = true
    touch = {}
  }

  function isPrimaryTouch(event: PointerEvent): boolean {
    return event.pointerType == 'touch' && event.isPrimary
  }

  function isPointerEventType(e: Event, type: string): boolean {
    return e.type == 'pointer' + type
  }

  // helper function for tests, so they check for different APIs
  function unregisterTouchEvents(): void {
    if (!initialized) return
    if (!eventMap) return
    $(document)
      .off(eventMap.down, down)
      .off(eventMap.up, up)
      .off(eventMap.move, move)
      .off(eventMap.cancel, cancelAll)
    $(window).off('scroll', cancelAll)
    cancelAll()
    initialized = false
  }

  function setup(__eventMap?: TouchEventMap): void {
    let now = 0
    let delta = 0
    let deltaX = 0
    let deltaY = 0
    let firstTouch: FirstTouch
    let _isPointerType = false

    unregisterTouchEvents()

    eventMap =
      __eventMap && 'down' in __eventMap
        ? __eventMap
        : 'ontouchstart' in document
          ? { down: 'touchstart', up: 'touchend', move: 'touchmove', cancel: 'touchcancel' }
          : 'onpointerdown' in document
            ? { down: 'pointerdown', up: 'pointerup', move: 'pointermove', cancel: 'pointercancel' }
            : false

    // No API availables for touch events
    if (!eventMap) return

    down = (e: Event): void => {
      const isPointer = isPointerEventType(e, 'down')
      _isPointerType = isPointer
      if (isPointer && !isPrimaryTouch(e as PointerEvent)) return
      firstTouch = isPointer ? (e as PointerEvent) : ((e as TouchEvent).touches[0] as FirstTouch)
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length === 1 && touch.x2) {
        // Clear out touch movement data if we have it sticking around
        // This can occur if touchcancel doesn't fire due to preventDefault, etc.
        touch.x2 = undefined
        touch.y2 = undefined
      }
      now = Date.now()
      delta = now - (touch.last || now)
      touch.el = $(
        'tagName' in (firstTouch.target as Element)
          ? (firstTouch.target as Element)
          : ((firstTouch.target as Element).parentNode as Element)
      )
      if (touchTimeout) clearTimeout(touchTimeout)
      touch.x1 = firstTouch.pageX
      touch.y1 = firstTouch.pageY
      if (delta > 0 && delta <= 250) touch.isDoubleTap = true
      touch.last = now
      longTapTimeout = setTimeout(longTap, longTapDelay)
    }

    move = (e: Event): void => {
      const isPointer = isPointerEventType(e, 'move')
      _isPointerType = isPointer
      if (isPointer && !isPrimaryTouch(e as PointerEvent)) return
      firstTouch = isPointer ? (e as PointerEvent) : ((e as TouchEvent).touches[0] as FirstTouch)
      cancelLongTap()
      touch.x2 = firstTouch.pageX
      touch.y2 = firstTouch.pageY

      deltaX += Math.abs(touch.x1! - touch.x2!)
      deltaY += Math.abs(touch.y1! - touch.y2!)
    }

    up = (e: Event): void => {
      const isPointer = isPointerEventType(e, 'up')
      _isPointerType = isPointer
      if (isPointer && !isPrimaryTouch(e as PointerEvent)) return
      cancelLongTap()
      // Reset the swipe-canceled flag at the start of each new gesture
      // so a queued swipeTimeout from the previous gesture is no longer
      // affected by an old cancelAll.
      swipeCanceled = false

      // swipe
      if (
        (touch.x2 && Math.abs(touch.x1! - touch.x2) > 30) ||
        (touch.y2 && Math.abs(touch.y1! - touch.y2) > 30)
      ) {
        // Capture the target + coords at the moment of `up` so a fresh
        // touchstart that lands between here and the next macrotask (when
        // the swipeTimeout fires) doesn't overwrite the target. We still
        // honor cancelAll's "scroll beats swipe" contract via the
        // swipeCanceled flag — cancelAll flips it before the timeout
        // fires, the timeout checks it, and the swipe is correctly
        // suppressed when a scroll beat us to it.
        const el = touch.el
        const x1 = touch.x1!
        const y1 = touch.y1!
        const x2 = touch.x2!
        const y2 = touch.y2!
        swipeTimeout = setTimeout(() => {
          if (!swipeCanceled && el) {
            el.trigger('swipe')
            el.trigger('swipe' + swipeDirection(x1, x2, y1, y2))
          }
          touch = {}
        }, 0)
      }
      // normal tap
      else if ('last' in touch)
        if (deltaX < 30 && deltaY < 30) {
          // don't fire tap when delta position changed by more than 30 pixels,
          // for instance when moving to a point and back to origin
          // delay by one tick so we can cancel the 'tap' event if 'scroll' fires
          // ('tap' fires before 'scroll')
          tapTimeout = setTimeout(() => {
            // trigger universal 'tap' with the option to cancelTouch()
            // (cancelTouch cancels processing of single vs double taps for faster 'tap' response)
            const event = $.Event('tap') as Event & { cancelTouch?: () => void }
            event.cancelTouch = cancelAll
            // [by paper] fix -> "TypeError: 'undefined' is not an object (evaluating 'touch.el.trigger'), when double tap
            if (touch.el) touch.el.trigger(event)

            // trigger double tap immediately
            if (touch.isDoubleTap) {
              if (touch.el) touch.el.trigger('doubleTap')
              touch = {}
            }

            // trigger single tap after 250ms of inactivity
            else {
              touchTimeout = setTimeout(() => {
                touchTimeout = null
                if (touch.el) touch.el.trigger('singleTap')
                touch = {}
              }, 250)
            }
          }, 0)
        } else {
          touch = {}
        }
      deltaX = deltaY = 0
    }

    $(document).on(eventMap.up, up).on(eventMap.down, down).on(eventMap.move, move)

    // when the browser window loses focus,
    // for example when a modal dialog is shown,
    // cancel all ongoing events
    $(document).on(eventMap.cancel, cancelAll)

    // scrolling the window indicates intention of the user
    // to scroll, not tap or swipe, so cancel all ongoing events
    $(window).on('scroll', cancelAll)

    initialized = true
  }

  const fnRecord = $.fn as unknown as Record<string, (callback: EventHandler) => MeptoCollection>
  ;[
    'swipe',
    'swipeLeft',
    'swipeRight',
    'swipeUp',
    'swipeDown',
    'doubleTap',
    'tap',
    'singleTap',
    'longTap',
  ].forEach((eventName: string): void => {
    fnRecord[eventName] = function (callback: EventHandler): MeptoCollection {
      return this.on(eventName, callback)
    }
  })
  ;($ as unknown as MeptoStatic & { touch: { setup: typeof setup } }).touch = { setup: setup }

  $(document).ready(setup)
})(mepto)
