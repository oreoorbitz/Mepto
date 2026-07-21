//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

;(function ($) {
  const mepto = $.mepto,
    oldQsa = mepto.qsa,
    oldMatches = mepto.matches

  function visible(elem) {
    elem = $(elem)
    return !!(elem.width() || elem.height()) && elem.css('display') !== 'none'
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
  const filters = ($.expr[':'] = {
    visible: function () {
      if (visible(this)) return this
    },
    hidden: function () {
      if (!visible(this)) return this
    },
    selected: function () {
      if (this.selected) return this
    },
    checked: function () {
      if (this.checked) return this
    },
    parent: function () {
      return this.parentNode
    },
    first: function (idx) {
      if (idx === 0) return this
    },
    last: function (idx, nodes) {
      if (idx === nodes.length - 1) return this
    },
    eq: function (idx, _, value) {
      if (idx === value) return this
    },
    contains: function (idx, _, text) {
      if ($(this).text().indexOf(text) > -1) return this
    },
    has: function (idx, _, sel) {
      if (mepto.qsa(this, sel).length) return this
    },
  })

  const filterRe = /^(.*):(\w+)(?:\(([^)]+)\))?\s*$/
  const childRe = /^\s*>/

  function process(sel, fn) {
    // Fast path: skip pseudo-extension processing for plain CSS selectors
    if (sel.indexOf(':') === -1) {
      return fn(sel, null, undefined)
    }
    let filter, arg
    const match = filterRe.exec(sel)
    if (match && match[2] in filters) {
      ;((filter = filters[match[2]]), (arg = match[3]))
      sel = match[1]
      if (arg) {
        const num = Number(arg)
        if (isNaN(num)) arg = arg.replace(/^["']|["']$/g, '')
        else arg = num
      }
    }
    return fn(sel, filter, arg)
  }

  mepto.qsa = function (node, selector) {
    return process(selector, function (sel, filter, arg) {
      let nodes
      try {
        if (!sel && filter) sel = '*'
        else if (childRe.test(sel))
          // support "> *" child queries via native :scope
          sel = ':scope ' + sel

        nodes = oldQsa(node, sel)
      } catch (e) {
        console.error('error performing selector: %o', selector)
        throw e
      }
      return !filter
        ? nodes
        : mepto.uniq(
            $.map(nodes, function (n, i) {
              return filter.call(n, i, nodes, arg)
            })
          )
    })
  }

  mepto.matches = function (node, selector) {
    return process(selector, function (sel, filter, arg) {
      return (
        (!sel || oldMatches(node, sel)) && (!filter || filter.call(node, 0, [node], arg) === node)
      )
    })
  }
})(mepto)
