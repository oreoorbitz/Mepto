//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  $.fn.end = function (this: MeptoCollection): MeptoCollection {
    return (this as any).prevObject || $()
  }

  const methods: string[] = [
    'filter',
    'add',
    'not',
    'eq',
    'first',
    'last',
    'find',
    'closest',
    'parents',
    'parent',
    'children',
    'siblings',
  ]
  const fnRecord = $.fn as unknown as Record<string, (...args: any[]) => MeptoCollection>
  methods.forEach(property => {
    const fn = fnRecord[property]
    fnRecord[property] = function (this: MeptoCollection, ...args: any[]): MeptoCollection {
      const ret = fn.apply(this, args) as MeptoCollection
      ;(ret as any).prevObject = this
      return ret
    }
  })
})(mepto)
