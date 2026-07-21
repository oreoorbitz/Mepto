//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const origShow = $.fn.show as any
  const origHide = $.fn.hide as any
  const origToggle = $.fn.toggle as any

  type Speed = number | string | ((...args: any[]) => any) | undefined

  function anim(
    el: MeptoCollection,
    speed: Speed,
    opacity: number,
    scale: string | null,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    if (typeof speed == 'function' && !callback) ((callback = speed), (speed = undefined))
    const props: Record<string, any> = { opacity: opacity }
    if (scale) {
      props.scale = scale
      el.css('transform-origin', '0 0')
    }
    return (el as any).animate(props, speed, null, callback)
  }

  function hide(
    el: MeptoCollection,
    speed: Speed,
    scale: string | null,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    return anim(el, speed, 0, scale, function (this: any): void {
      origHide.call($(this))
      callback && callback.call(this)
    })
  }

  const fnRecord = $.fn as unknown as Record<string, any>

  fnRecord.show = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    origShow.call(this)
    if (speed === undefined) speed = 0
    else this.css('opacity', 0)
    return anim(this, speed, 1, '1,1', callback)
  }

  fnRecord.hide = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    if (speed === undefined) return origHide.call(this)
    else return hide(this, speed, '0,0', callback)
  }

  fnRecord.toggle = function (
    this: MeptoCollection,
    speed?: Speed | boolean,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    if (speed === undefined || typeof speed == 'boolean') return origToggle.call(this, speed)
    else
      return this.each(function (this: any): void {
        const el = $(this)
        ;(el as any)[el.css('display') == 'none' ? 'show' : 'hide'](speed, callback)
      })
  }

  fnRecord.fadeTo = function (
    this: MeptoCollection,
    speed: Speed,
    opacity: number,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    return anim(this, speed, opacity, null, callback)
  }

  fnRecord.fadeIn = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    let target: number | string = this.css('opacity')
    if (Number(target) > 0) this.css('opacity', 0)
    else target = 1
    return (origShow.call(this) as any).fadeTo(speed, target, callback)
  }

  fnRecord.fadeOut = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    return hide(this, speed, null, callback)
  }

  fnRecord.fadeToggle = function (
    this: MeptoCollection,
    speed?: Speed,
    callback?: (...args: any[]) => any
  ): MeptoCollection {
    return this.each(function (this: any): void {
      const el = $(this)
      ;(el as any)[
        Number(el.css('opacity')) == 0 || el.css('display') == 'none' ? 'fadeIn' : 'fadeOut'
      ](speed, callback)
    })
  }
})(mepto)
