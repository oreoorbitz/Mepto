//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection, type EventHandler } from './types'

declare const mepto: MeptoStatic

interface GestureState {
  last?: number
  target?: Element | null
  e1?: number
  e2?: number
}

;(function ($: MeptoStatic) {
  if ($.os.ios) {
    let gesture: GestureState = {}

    const parentIfText = (node: Node): Element | null =>
      'tagName' in node ? (node as Element) : (node.parentNode as Element | null)

    $(document)
      .bind('gesturestart', (e: Event) => {
        const now = Date.now(),
          delta = now - (gesture.last || now)
        gesture.target = parentIfText(e.target as Node)
        gesture.e1 = (e as Event & { scale: number }).scale
        gesture.last = now
      })
      .bind('gesturechange', (e: Event) => {
        gesture.e2 = (e as Event & { scale: number }).scale
      })
      .bind('gestureend', (e: Event) => {
        if (gesture.e2! > 0) {
          if (Math.abs(gesture.e1! - gesture.e2!) !== 0) {
            $(gesture.target!).trigger('pinch')
            $(gesture.target!).trigger('pinch' + (gesture.e1! - gesture.e2! > 0 ? 'In' : 'Out'))
          }
          gesture.e1 = gesture.e2 = gesture.last = 0
        } else if ('last' in gesture) {
          gesture = {}
        }
      })
    ;['pinch', 'pinchIn', 'pinchOut'].forEach((m: string) => {
      ;($.fn as unknown as Record<string, (callback: EventHandler) => MeptoCollection>)[m] =
        function (callback: EventHandler) {
          return this.bind(m, callback)
        }
    })
  }
})(mepto)
