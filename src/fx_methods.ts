//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  // `show` / `hide` / `toggle` exist in the public MeptoCollection type;
  // we save the originals at module load so we can call them from the
  // wrapped versions without recursing.
  const origShow = $.fn.show as (this: MeptoCollection) => MeptoCollection
  const origHide = $.fn.hide as (this: MeptoCollection) => MeptoCollection
  const origToggle = $.fn.toggle as (this: MeptoCollection, show?: boolean) => MeptoCollection

  // Speed accepts a number, a named-speed string, OR a function. The
  // function form is shorthand for `(speed, callback) => callback(speed)`
  // — when the user calls `fadeOut(myCb)`, `myCb` arrives in the speed
  // slot and we move it into the callback slot below. The callback
  // receives whatever jQuery would pass through `animate`'s done hook.
  type Speed = number | string | ((...args: unknown[]) => unknown) | undefined
  type AnimateCallback = (this: Element, ...args: unknown[]) => unknown

  interface AnimateProperties {
    [key: string]: string | number
  }

  function anim(
    el: MeptoCollection,
    speed: Speed,
    opacity: number,
    scale: string | null,
    callback?: AnimateCallback
  ): MeptoCollection {
    if (typeof speed == 'function' && !callback) {
      callback = speed as AnimateCallback
      speed = undefined
    }
    const props: AnimateProperties = { opacity: opacity }
    if (scale) {
      props.scale = scale
      el.css('transform-origin', '0 0')
    }
    return el.animate(
      props,
      speed as number | string | undefined,
      undefined,
      callback as ((this: Element) => void) | undefined
    )
  }

  function hide(
    el: MeptoCollection,
    speed: Speed,
    scale: string | null,
    callback?: AnimateCallback
  ): MeptoCollection {
    return anim(el, speed, 0, scale, function (this: Element): void {
      origHide.call($(this))
      if (callback) callback.call(this)
    })
  }

  const fnRecord = $.fn as unknown as Record<
    string,
    (this: MeptoCollection, ...args: unknown[]) => MeptoCollection
  >

  fnRecord.show = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: AnimateCallback
  ): MeptoCollection {
    origShow.call(this)
    if (speed === undefined) speed = 0
    else this.css('opacity', 0)
    return anim(this, speed, 1, '1,1', callback)
  }

  fnRecord.hide = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: AnimateCallback
  ): MeptoCollection {
    if (speed === undefined) return origHide.call(this)
    else return hide(this, speed, '0,0', callback)
  }

  fnRecord.toggle = function (
    this: MeptoCollection,
    speed?: Speed | boolean,
    callback?: AnimateCallback
  ): MeptoCollection {
    if (speed === undefined || typeof speed == 'boolean') {
      return origToggle.call(this, speed as boolean | undefined)
    }
    return this.each(function (this: Element): void {
      const el = $(this) as MeptoCollection
      const method = el.css('display') == 'none' ? 'show' : 'hide'
      const fn = el[method] as (speed: Speed, callback: AnimateCallback) => MeptoCollection
      fn.call(el, speed, callback as AnimateCallback)
    })
  }

  fnRecord.fadeTo = function (
    this: MeptoCollection,
    speed: Speed,
    opacity: number,
    callback?: AnimateCallback
  ): MeptoCollection {
    return anim(this, speed, opacity, null, callback)
  }

  // Normalize the (speed, callback) pair so a function-shaped `speed` is
  // moved into the `callback` slot. Without this, calling e.g.
  // `$el.fadeOut(cb)` would leave the wrapped `hide` callback's captured
  // user-cb as undefined, and the user callback would never run.
  function normalizeArgs(
    speed: Speed | undefined,
    callback: AnimateCallback | undefined
  ): { speed: Speed | undefined; callback: AnimateCallback | undefined } {
    if (typeof speed === 'function' && callback === undefined) {
      return { speed: undefined, callback: speed as AnimateCallback }
    }
    return { speed, callback }
  }

  fnRecord.fadeIn = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: AnimateCallback
  ): MeptoCollection {
    const norm = normalizeArgs(speed, callback)
    let target: number | string = this.css('opacity') as string
    if (Number(target) > 0) this.css('opacity', 0)
    else target = 1
    const shown = origShow.call(this)
    return (shown as unknown as { fadeTo: (...args: unknown[]) => MeptoCollection }).fadeTo(
      norm.speed,
      target,
      norm.callback
    )
  }

  fnRecord.fadeOut = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: AnimateCallback
  ): MeptoCollection {
    const norm = normalizeArgs(speed, callback)
    return hide(this, norm.speed, null, norm.callback)
  }

  fnRecord.fadeToggle = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: AnimateCallback
  ): MeptoCollection {
    return this.each(function (this: Element): void {
      const el = $(this) as MeptoCollection
      const method =
        Number(el.css('opacity')) == 0 || el.css('display') == 'none' ? 'fadeIn' : 'fadeOut'
      const fn = el[method] as (speed: Speed, callback: AnimateCallback) => MeptoCollection
      fn.call(el, speed, callback as AnimateCallback)
    })
  }
})(mepto)
