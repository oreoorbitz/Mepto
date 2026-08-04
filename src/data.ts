//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

// The following code is heavily inspired by jQuery's $.fn.data()
// Uses WeakMap for element-associated data so GC can collect removed nodes.

import { type MeptoStatic, type MeptoCollection, type MeptoElement } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const dataMap = new WeakMap<object, Record<string, unknown>>()
  const dataAttr = $.fn.data
  const camelize = $.camelCase

  function getData(node: Element, name?: string): unknown {
    const store = dataMap.get(node)
    if (name === undefined) return store || setData(node)
    if (store) {
      if (name in store) return store[name]
      const camelName = camelize(name)
      if (camelName in store) return store[camelName]
    }
    return (dataAttr as (n?: string) => unknown).call($(node), name as string)
  }

  function setData(node: Element, name?: string, value?: unknown): Record<string, unknown> {
    let store = dataMap.get(node)
    if (!store) {
      store = attributeData(node)
      dataMap.set(node, store)
    }
    if (name !== undefined) store[camelize(name)] = value
    return store
  }

  // `$.mepto` is the inner implementation namespace exposed by mepto.ts;
  // MeptoStatic does not currently declare it.
  const meptoNs = ($ as unknown as Record<string, { deserializeValue(value: string): unknown }>)
    .mepto

  function attributeData(node: Element): Record<string, unknown> {
    const store: Record<string, unknown> = {}
    const attrs = node.attributes
    if (!attrs) return store
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]
      if (attr.name.indexOf('data-') === 0) {
        store[camelize(attr.name.replace('data-', ''))] = meptoNs.deserializeValue(attr.value)
      }
    }
    return store
  }

  $.fn.data = function (
    this: MeptoCollection,
    name?: string | Record<string, unknown>,
    value?: unknown
  ): unknown {
    if (value === undefined) {
      if ($.isPlainObject(name)) {
        return this.each(function (_i: number, node: MeptoElement) {
          $.each(name as Record<string, unknown>, function (key: string, val: unknown) {
            setData(node as Element, key, val)
          })
        })
      }
      return 0 in this ? getData(this[0] as Element, name as string) : undefined
    }
    return this.each(function (_i: number, node: MeptoElement) {
      setData(node as Element, name as string, value)
    })
  } as MeptoCollection['data']

  $.data = function (elem: Element, name?: string, value?: unknown): unknown {
    return $(elem).data(name as string, value)
  } as MeptoStatic['data']

  $.hasData = function (elem: Element): boolean {
    const store = dataMap.get(elem)
    return store ? !$.isEmptyObject(store) : false
  }

  $.fn.removeData = function (this: MeptoCollection, names?: string | string[]): MeptoCollection {
    if (typeof names == 'string') names = names.split(/\s+/)
    return this.each(function (_i: number, node: MeptoElement) {
      const store = dataMap.get(node as Element)
      if (!store) return
      if (names) {
        ;(names as string[]).forEach(function (key: string) {
          delete store[camelize(key)]
        })
      } else {
        dataMap.delete(node as Element)
      }
    })
  }

  // Wrap `remove` and `empty` to also wipe dataMap entries. The wrap runs
  // once at module load (no shared mutable state — just closure capture of
  // the original method).
  ;['remove', 'empty'].forEach(function (methodName: 'remove' | 'empty') {
    const origFn = $.fn[methodName] as (this: MeptoCollection) => MeptoCollection
    ;(($ as unknown as { fn: Record<string, unknown> }).fn[methodName] = function (
      this: MeptoCollection
    ): MeptoCollection {
      let elements = this.find('*')
      if (methodName === 'remove') elements = elements.add(this as unknown as MeptoElement)
      elements.removeData()
      return origFn.call(this)
    }) as never
  })
})(mepto)
