//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic } from './types'

declare const mepto: MeptoStatic

// `$.mepto` is the private namespace mepto.ts attaches to the public
// MeptoStatic (`$.mepto = mepto`). selector.ts extends its `qsa` /
// `matches` to plug in pseudo-selectors (:visible, :eq, ...) — we type
// just the surface we touch here.
interface MeptoNamespace {
  qsa(element: ParentNode, selector: string): Element[]
  matches(element: Element, selector: string): boolean
  uniq<T>(array: ArrayLike<T>): T[]
}
interface MeptoExpr {
  ':': Record<string, unknown>
}

;(function ($: MeptoStatic) {
  const innerMepto = ($ as unknown as { mepto: MeptoNamespace }).mepto
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
    parent: function (this: Element): Element | null {
      return this.parentNode as Element | null
    },
    first: function (this: Element, idx: number): Element | undefined {
      if (idx === 0) return this
    },
    last: function (this: Element, idx: number, nodes: Element[]): Element | undefined {
      if (idx === nodes.length - 1) return this
    },
    eq: function (
      this: Element,
      idx: number,
      _nodes: Element[],
      value: string | number | undefined
    ): Element | undefined {
      if (typeof value === 'number' && idx === value) return this
    },
    contains: function (
      this: Element,
      _idx: number,
      _nodes: Element[],
      text: string | number | undefined
    ): Element | undefined {
      if (typeof text === 'string' && $(this).text().indexOf(text) > -1) return this
    },
    has: function (
      this: Element,
      _idx: number,
      _nodes: Element[],
      sel: string | number | undefined
    ): Element | undefined {
      if (typeof sel === 'string' && innerMepto.qsa(this, sel).length) return this
    },
  }
  ;($ as unknown as { expr: MeptoExpr }).expr[':'] = filters

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
    let arg: string | number | undefined
    const match: RegExpMatchArray | null = filterRe.exec(sel)
    if (match && match[2] in filters) {
      filter = filters[match[2]]
      arg = match[3]
      sel = match[1]
      if (arg) {
        const num: number = Number(arg)
        if (isNaN(num)) arg = arg.replace(/^["']|["']$/g, '')
        else arg = num
      }
    }
    return fn(sel, filter || null, arg)
  }

  innerMepto.qsa = function (this: MeptoNamespace, node: ParentNode, selector: string): Element[] {
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
                return (filter as FilterFn).call(n, i, nodes, arg) || null
              })
            )
      }
    )
  }

  innerMepto.matches = function (this: MeptoNamespace, node: Element, selector: string): boolean {
    return process(
      selector,
      function (sel: string, filter: FilterFn | null, arg: string | number | undefined): boolean {
        // Base selector check first. An invalid `sel` (e.g. the user passed
        // `:lt(1)` and the regex couldn't split it because `lt` isn't a
        // recognised pseudo, so `sel` keeps the whole thing) would throw
        // here. Catch and return false — `.is()` shouldn't be able to
        // crash the caller's code on an unrecognised selector.
        if (sel) {
          try {
            if (!oldMatches(node, sel)) return false
          } catch {
            return false
          }
        }
        if (!filter) return true
        // Index-based filters (`:first`, `:last`, `:eq`, `:lt`, `:gt`, and
        // any future nth-* filter) need to know the element's position
        // among its parent's matching children — jQuery semantics for
        // `.is(':eq(N)')` is "is this element the Nth match of sel in its
        // parent". A detached element has no parent and no position, so
        // it can never satisfy an index-based filter.
        const parent = node.parentNode as ParentNode | null
        if (!parent) return false
        const siblings = sel ? oldQsa(parent, sel) : (Array.from(parent.children) as Element[])
        const idx = siblings.indexOf(node)
        if (idx < 0) return false
        return filter.call(node, idx, siblings, arg) === node
      }
    )
  }
})(mepto)
