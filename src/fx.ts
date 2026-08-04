//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

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

  const fnRecord = $.fn as unknown as Record<string, any>

  fnRecord.animate = function (
    properties: Record<string, string | number> | string,
    duration: any,
    ease: any,
    callback: any,
    delay: any
  ): MeptoCollection {
    // Shorthand: (properties, [duration,] [easing,] [complete]). Only swap
    // a function-shaped duration/ease into the callback slot when the
    // caller hasn't already supplied a callback — otherwise the
    // shorthand swallows an explicit callback. This matters for
    // $.fn.fadeIn/fadeOut/fadeToggle, which build a wrapped callback
    // (calls origShow/origHide/origToggle + the user's cb) and pass it
    // alongside the user's function-shaped "duration" arg.
    if ($.isFunction(duration) && !callback)
      ((callback = duration), (ease = undefined), (duration = undefined))
    if ($.isFunction(ease) && !callback) ((callback = ease), (ease = undefined))
    if ($.isPlainObject(duration))
      ((ease = (duration as any).easing),
        (callback = (duration as any).complete),
        (delay = (duration as any).delay),
        (duration = (duration as any).duration))
    if (duration)
      duration =
        (typeof duration == 'number'
          ? duration
          : ($.fx.speeds as any)[duration] || $.fx.speeds._default) / 1000
    if (delay) delay = parseFloat(delay) / 1000
    return (this as any).anim(properties, duration, ease, callback, delay)
  }

  fnRecord.anim = function (
    this: MeptoCollection,
    properties: Record<string, string | number> | string,
    duration?: number,
    ease?: string,
    callback?: (...args: any[]) => any,
    delay?: number
  ): MeptoCollection {
    let key: string
    const cssValues: Record<string, string | number> = {}
    let cssProperties: string[] | undefined
    let transforms = ''
    const that = this
    let wrappedCallback: (this: any, event?: any) => void
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

    wrappedCallback = function (this: any, event?: any): void {
      if (typeof event !== 'undefined') {
        if (event.target !== event.currentTarget) return // makes sure the event didn't bubble from "below"
        $(event.target).unbind(endEvent, wrappedCallback)
      } else $(this).unbind(endEvent, wrappedCallback) // triggered by setTimeout

      fired = true
      $(this).css(cssReset)
      callback && callback.call(this)
    }
    if (duration > 0) {
      this.bind(endEvent, wrappedCallback as any)
      // transitionEnd is not always firing on older Android phones
      // so make sure it gets fired
      setTimeout(
        function (): void {
          if (fired) return
          wrappedCallback.call(that)
        },
        (duration + delay) * 1000 + 25
      )
    }

    // trigger page reflow so new elements can animate
    this.size() && (this.get(0) as any).clientLeft

    this.css(cssValues)

    if (duration <= 0)
      setTimeout(function (): void {
        that.each(function (this: any): void {
          wrappedCallback.call(this)
        })
      }, 0)

    return this
  }
})(mepto)
