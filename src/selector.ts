//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const innerMepto = ($ as any).mepto as {
    qsa(element: ParentNode, selector: string): Element[]
    matches(element: Element, selector: string): boolean
    uniq<T>(array: ArrayLike<T>): T[]
  }
  const oldQsa = innerMepto.qsa
  const oldMatches = innerMepto.matches

  function visible(elem: Element): boolean {
    const el = $(elem)
    return !!(el.width() || el.height()) && el.css('display') !== 'none'
  }

  // Implements a subset from:
  // http://api.jquery.com/category/selectors/jquery-selector-extensions/
  //
  // Each filter function receives the current index, all nodes in the
  // considered set, and a value if there were parentheses. The value
  // of `this` is the node currently being considered. The function returns the
  // resulting node(s), null, or undefined.
  //
  // Complex selectors are not supported:
  //   li:has(label:contains("foo")) + li:has(label:contains("bar"))
  //   ul.inner:first > li

  type FilterFn = (
    this: Element,
    idx: number,
    nodes: Element[],
    value?: string | number
  ) => Element | null | undefined

  const filters: Record<string, FilterFn> = {
    visible: function (this: Element): Element | undefined {
      if (visible(this)) return this
    },
    hidden: function (this: Element): Element | undefined {
      if (!visible(this)) return this
    },
    selected: function (this: HTMLOptionElement): HTMLOptionElement | undefined {
      if (this.selected) return this
    },
    checked: function (this: HTMLInputElement): HTMLInputElement | undefined {
      if (this.checked) return this
    },
    parent: function (this: Element): ParentNode | null {
      return this.parentNode
    },
    first: function (this: Element, idx: number): Element | undefined {
      if (idx === 0) return this
    },
    last: function (this: Element, idx: number, nodes: Element[]): Element | undefined {
      if (idx === nodes.length - 1) return this
    },
    eq: function (this: Element, idx: number, _: any, value: number): Element | undefined {
      if (idx === value) return this
    },
    contains: function (this: Element, _idx: any, _nodes: any, text: string): Element | undefined {
      if ($(this).text().indexOf(text) > -1) return this
    },
    has: function (this: Element, _idx: any, _nodes: any, sel: string): Element | undefined {
      if (innerMepto.qsa(this, sel).length) return this
    },
  }
  ;(($ as any).expr[':'] as Record<string, FilterFn>) = filters

  const filterRe: RegExp = /^(.*):(\w+)(?:\(([^)]+)\))?\s*$/
  const childRe: RegExp = /^\s*>/

  function process<T>(
    sel: string,
    fn: (sel: string, filter: FilterFn | null, arg: string | number | undefined) => T
  ): T {
    // Fast path: skip pseudo-extension processing for plain CSS selectors
    if (sel.indexOf(':') === -1) {
      return fn(sel, null, undefined)
    }
    let filter: FilterFn | undefined
    let arg: string | undefined
    const match: RegExpMatchArray | null = filterRe.exec(sel)
    if (match && match[2] in filters) {
      filter = filters[match[2]]
      arg = match[3]
      sel = match[1]
      if (arg) {
        const num: number = Number(arg)
        if (isNaN(num)) arg = arg.replace(/^["']|["']$/g, '')
        else (arg as any) = num
      }
    }
    return fn(sel, filter || null, arg)
  }

  innerMepto.qsa = function (
    this: typeof innerMepto,
    node: ParentNode,
    selector: string
  ): Element[] {
    return process(
      selector,
      function (sel: string, filter: FilterFn | null, arg: string | number | undefined): Element[] {
        let nodes: Element[]
        let resolvedSel: string = sel
        try {
          if (!resolvedSel && filter) resolvedSel = '*'
          else if (childRe.test(resolvedSel))
            // support "> *" child queries via native :scope
            resolvedSel = ':scope ' + resolvedSel

          nodes = oldQsa(node, resolvedSel)
        } catch (e) {
          console.error('error performing selector: %o', selector)
          throw e
        }
        return !filter
          ? nodes
          : innerMepto.uniq(
              $.map(nodes, function (n: Element, i: number): Element | null {
                return filter!.call(n, i, nodes, arg) || null
              })
            )
      }
    )
  }

  innerMepto.matches = function (
    this: typeof innerMepto,
    node: Element,
    selector: string
  ): boolean {
    return process(
      selector,
      function (sel: string, filter: FilterFn | null, arg: string | number | undefined): boolean {
        return (
          (!sel || oldMatches(node, sel)) && (!filter || filter.call(node, 0, [node], arg) === node)
        )
      }
    )
  }
})(mepto)
