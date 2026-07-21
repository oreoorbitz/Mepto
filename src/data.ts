//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

// The following code is heavily inspired by jQuery's $.fn.data()
// Uses WeakMap for element-associated data so GC can collect removed nodes.

;(function ($: any) {
  const dataMap = new WeakMap<object, Record<string, unknown>>()
  const dataAttr = $.fn.data
  const camelize = $.camelCase

  function getData(node: any, name?: string): unknown {
    const store = dataMap.get(node)
    if (name === undefined) return store || setData(node)
    if (store) {
      if (name in store) return store[name]
      const camelName = camelize(name)
      if (camelName in store) return store[camelName]
    }
    return dataAttr.call($(node), name)
  }

  function setData(node: any, name?: string, value?: unknown): Record<string, unknown> {
    let store = dataMap.get(node)
    if (!store) {
      store = attributeData(node)
      dataMap.set(node, store)
    }
    if (name !== undefined) store[camelize(name)] = value
    return store
  }

  function attributeData(node: Element): Record<string, unknown> {
    const store: Record<string, unknown> = {}
    const attrs = node.attributes
    if (!attrs) return store
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]
      if (attr.name.indexOf('data-') === 0) {
        store[camelize(attr.name.replace('data-', ''))] = $.mepto.deserializeValue(attr.value)
      }
    }
    return store
  }

  $.fn.data = function (name?: string | Record<string, unknown>, value?: unknown): unknown {
    return value === undefined
      ? $.isPlainObject(name)
        ? this.each(function (_i: number, node: Element) {
            $.each(name, function (key: string, val: unknown) {
              setData(node, key, val)
            })
          })
        : 0 in this
          ? getData(this[0], name as string)
          : undefined
      : this.each(function () {
          setData(this, name as string, value)
        })
  }

  $.data = function (elem: Element, name?: string, value?: unknown): unknown {
    return $(elem).data(name, value)
  }

  $.hasData = function (elem: any): boolean {
    const store = dataMap.get(elem)
    return store ? !$.isEmptyObject(store) : false
  }

  $.fn.removeData = function (names?: string | string[]): any {
    if (typeof names == 'string') names = names.split(/\s+/)
    return this.each(function () {
      const store = dataMap.get(this)
      if (!store) return
      if (names) {
        ;(names as string[]).forEach(function (key: string) {
          delete store[camelize(key)]
        })
      } else {
        dataMap.delete(this)
      }
    })
  }
  ;['remove', 'empty'].forEach(function (methodName: 'remove' | 'empty') {
    const origFn = $.fn[methodName]
    $.fn[methodName] = function (): any {
      let elements = this.find('*')
      if (methodName === 'remove') elements = elements.add(this)
      elements.removeData()
      return origFn.call(this)
    }
  })
})(mepto)
