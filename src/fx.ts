//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const supportedTransforms =
    /^((translate|rotate|scale)(X|Y|Z|3d)?|matrix(3d)?|perspective|skew(X|Y)?)$/i

  const transform = 'transform'
  const transitionProperty = 'transition-property'
  const transitionDuration = 'transition-duration'
  const transitionDelay = 'transition-delay'
  const transitionTiming = 'transition-timing-function'
  const animationName = 'animation-name'
  const animationDuration = 'animation-duration'
  const animationDelay = 'animation-delay'
  const animationTiming = 'animation-timing-function'

  const cssReset: Record<string, string> = {
    'transition-property': '',
    'transition-duration': '',
    'transition-delay': '',
    'transition-timing-function': '',
    'animation-name': '',
    'animation-duration': '',
    'animation-delay': '',
    'animation-timing-function': '',
  }

  function dasherize(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase()
  }

  $.fx = {
    off: false,
    speeds: { _default: 400, fast: 200, slow: 600 },
    cssPrefix: '',
    transitionEnd: 'transitionend',
    animationEnd: 'animationend',
  }

  // Shorthand argument shapes for `animate`:
  // (props, [duration,] [easing,] [complete]) — each is optional and may
  // be a function (meaning "this is the callback"). A function-shaped
  // duration/ease is only swapped into the callback slot when the caller
  // hasn't already supplied a callback — otherwise the shorthand swallows
  // an explicit callback. This matters for $.fn.fadeIn/fadeOut/fadeToggle,
  // which build a wrapped callback and pass it alongside the user's
  // function-shaped "duration" arg.
  type AnimateSpeed = number | string
  type AnimateEase = string
  type AnimateCallback = (this: Element, ...args: unknown[]) => unknown
  type AnimatePropertyMap = Record<string, string | number>
  interface AnimateOptions {
    duration?: AnimateSpeed
    easing?: AnimateEase
    complete?: AnimateCallback
    delay?: AnimateSpeed
  }
  // A duration/easing arg can also be a function (caller-supplied callback
  // in shorthand) — animate() swaps it into the callback slot above.
  type ShorthandArg = AnimateSpeed | AnimateCallback

  const fnRecord = $.fn as unknown as Record<
    string,
    (this: MeptoCollection, ...args: unknown[]) => MeptoCollection
  >

  fnRecord.animate = function (
    this: MeptoCollection,
    properties: AnimatePropertyMap | string,
    duration?: ShorthandArg | AnimateOptions,
    ease?: AnimateCallback | AnimateEase,
    callback?: AnimateCallback,
    delay?: AnimateSpeed
  ): MeptoCollection {
    if ($.isFunction(duration) && !callback) {
      callback = duration as AnimateCallback
      ease = undefined
      duration = undefined
    }
    if ($.isFunction(ease) && !callback) {
      callback = ease as AnimateCallback
      ease = undefined
    }
    if ($.isPlainObject(duration)) {
      const opts = duration as AnimateOptions
      ease = opts.easing
      callback = opts.complete
      delay = opts.delay
      duration = opts.duration
    }
    if (duration) {
      duration =
        (typeof duration == 'number'
          ? duration
          : ($.fx.speeds as unknown as Record<string, number>)[duration as string] ||
            $.fx.speeds._default) / 1000
    }
    if (delay) delay = parseFloat(delay as string) / 1000
    return (
      this as unknown as {
        anim: (
          properties: AnimatePropertyMap | string,
          duration?: number,
          ease?: AnimateEase,
          callback?: AnimateCallback,
          delay?: number
        ) => MeptoCollection
      }
    ).anim(
      properties,
      duration as number | undefined,
      ease as AnimateEase | undefined,
      callback,
      delay as number | undefined
    )
  }

  fnRecord.anim = function (
    this: MeptoCollection,
    properties: AnimatePropertyMap | string,
    duration?: number,
    ease?: AnimateEase,
    callback?: AnimateCallback,
    delay?: number
  ): MeptoCollection {
    let key: string
    const cssValues: Record<string, string | number> = {}
    let cssProperties: string[] | undefined
    let transforms = ''
    const that = this
    let wrappedCallback: (this: Element, event?: Event) => void
    let endEvent = $.fx.transitionEnd
    let fired = false

    if (duration === undefined) duration = $.fx.speeds._default / 1000
    if (delay === undefined) delay = 0
    if ($.fx.off) duration = 0

    if (typeof properties == 'string') {
      // keyframe animation
      cssValues[animationName] = properties
      cssValues[animationDuration] = duration + 's'
      cssValues[animationDelay] = delay + 's'
      cssValues[animationTiming] = ease || 'linear'
      endEvent = $.fx.animationEnd
    } else {
      cssProperties = []
      // CSS transitions
      for (key in properties)
        if (supportedTransforms.test(key)) transforms += key + '(' + properties[key] + ') '
        else ((cssValues[key] = properties[key]), cssProperties.push(dasherize(key)))

      if (transforms) ((cssValues[transform] = transforms), cssProperties.push(transform))
      if (duration > 0 && typeof properties === 'object') {
        cssValues[transitionProperty] = cssProperties.join(', ')
        cssValues[transitionDuration] = duration + 's'
        cssValues[transitionDelay] = delay + 's'
        cssValues[transitionTiming] = ease || 'linear'
      }
    }

    wrappedCallback = function (this: Element, event?: Event): void {
      if (typeof event !== 'undefined') {
        if (event.target !== event.currentTarget) return // makes sure the event didn't bubble from "below"
        $(event.target as Element).unbind(endEvent, wrappedCallback as unknown as () => void)
      } else $(this).unbind(endEvent, wrappedCallback as unknown as () => void) // triggered by setTimeout

      fired = true
      $(this).css(cssReset)
      if (callback) callback.call(this)
    }
    if (duration > 0) {
      this.bind(endEvent, wrappedCallback as unknown as () => void)
      // transitionEnd is not always firing on older Android phones
      // so make sure it gets fired
      setTimeout(
        function (): void {
          if (fired) return
          wrappedCallback.call(that as unknown as Element)
        },
        (duration + delay) * 1000 + 25
      )
    }

    // trigger page reflow so new elements can animate
    const first = this.get(0) as HTMLElement | undefined
    if (this.size() && first) void first.clientLeft

    this.css(cssValues)

    if (duration <= 0)
      setTimeout(function (): void {
        that.each(function (this: Element): void {
          wrappedCallback.call(this)
        })
      }, 0)

    return this
  }
})(mepto)
