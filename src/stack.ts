//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  // Augment the public MeptoCollection type to include `prevObject` — set
  // by stack.ts on every traversal return so .end() can pop the chain.
  interface MeptoCollectionWithPrev extends MeptoCollection {
    prevObject?: MeptoCollection
  }

  $.fn.end = function (this: MeptoCollection): MeptoCollection {
    return (this as MeptoCollectionWithPrev).prevObject || $()
  }

  // Methods whose return value should expose the chain's previous collection
  // for .end() to pop. Anything else (mutating ops like .add, terminal ops
  // like .first/.last) intentionally doesn't get a prevObject.
  const methods: readonly string[] = [
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
  const fnRecord = $.fn as unknown as Record<
    string,
    (this: MeptoCollection, ...args: unknown[]) => MeptoCollection
  >
  methods.forEach(property => {
    const fn = fnRecord[property] as (this: MeptoCollection, ...args: unknown[]) => MeptoCollection
    fnRecord[property] = function (this: MeptoCollection, ...args: unknown[]): MeptoCollection {
      const ret = fn.apply(this, args) as MeptoCollectionWithPrev
      ret.prevObject = this
      return ret
    }
  })
})(mepto)
