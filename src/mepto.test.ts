import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { $ } from './meptos'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

let fixture: HTMLElement

beforeEach(() => {
  fixture = document.createElement('div')
  fixture.id = 'fixture'
  fixture.innerHTML = `
    <div id="fix-id" class="fix-class other-class" data-val="hello" data-num="42" data-obj='{"a":1}'>text content</div>
    <div id="fix-parent" class="parent-el">
      <div id="fix-child1" class="child box">First</div>
      <div id="fix-child2" class="child box">Second</div>
      <div id="fix-sibling" class="sibling">Third</div>
    </div>
    <div id="fix-ancestor"><div id="fix-mid"><div id="fix-deep"></div></div></div>
    <input id="fix-input" type="text" value="initial" />
    <select id="fix-select">
      <option value="a">A</option>
      <option value="b" selected>B</option>
    </select>
    <form id="fix-form">
      <input name="username" value="alice" />
      <input name="age" type="number" value="30" />
      <input name="active" type="checkbox" value="yes" checked />
      <input name="skip" type="submit" value="Submit" />
    </form>
    <div id="fix-visible" style="display:block">visible</div>
    <div id="fix-hidden" style="display:none">hidden</div>
    <div id="fix-css" style="font-size:16px;color:rgb(255,0,0)">styled</div>
    <label id="fix-label" for="fix-input2"></label>
    <input id="fix-input2" type="text" tabindex="5" maxlength="20" readonly />
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  fixture.remove()
})

function q(id: string): Element {
  return document.getElementById(id)!
}

// ─── Type utilities ───────────────────────────────────────────────────────────

describe('$.type', () => {
  it.each([
    ['hello', 'string'],
    [42, 'number'],
    [true, 'boolean'],
    [[], 'array'],
    [{}, 'object'],
    [null, 'null'],
    [undefined, 'undefined'],
    [() => {}, 'function'],
    [/x/, 'regexp'],
    [new Date(), 'date'],
  ])('$.type(%o) === %s', (val, expected) => {
    expect($.type(val)).toBe(expected)
  })
})

describe('type predicates', () => {
  it('$.isFunction', () => {
    expect($.isFunction(() => {})).toBe(true)
    expect($.isFunction({})).toBe(false)
  })

  it('$.isWindow', () => {
    // jsdom's window fails `instanceof Window`, so only test the negative case here.
    // The positive case ($.isWindow(window) === true) is covered by the browser suite.
    expect($.isWindow({})).toBe(false)
    expect($.isWindow(null)).toBe(false)
  })

  it('$.isArray', () => {
    expect($.isArray([])).toBe(true)
    expect($.isArray({})).toBe(false)
  })

  it('$.isPlainObject', () => {
    expect($.isPlainObject({})).toBe(true)
    expect($.isPlainObject([])).toBe(false)
    expect($.isPlainObject(window)).toBe(false)
  })

  it('$.isEmptyObject', () => {
    expect($.isEmptyObject({})).toBe(true)
    expect($.isEmptyObject({ a: 1 })).toBe(false)
  })

  it('$.isNumeric', () => {
    expect($.isNumeric(42)).toBe(true)
    expect($.isNumeric('42')).toBe(true)
    expect($.isNumeric('3.14')).toBe(true)
    expect($.isNumeric(NaN)).toBe(false)
    expect($.isNumeric('abc')).toBe(false)
    expect($.isNumeric(null)).toBe(false)
  })
})

// ─── String utilities ─────────────────────────────────────────────────────────

describe('string utilities', () => {
  it('$.trim', () => {
    expect($.trim('  hello  ')).toBe('hello')
    expect($.trim('')).toBe('')
    expect($.trim(null)).toBe('')
  })

  it('$.camelCase', () => {
    expect($.camelCase('background-color')).toBe('backgroundColor')
    expect($.camelCase('border-top-width')).toBe('borderTopWidth')
    expect($.camelCase('color')).toBe('color')
  })
})

// ─── Array / object utilities ─────────────────────────────────────────────────

describe('array / object utilities', () => {
  it('$.inArray', () => {
    expect($.inArray(2, [1, 2, 3])).toBe(1)
    expect($.inArray(5, [1, 2, 3])).toBe(-1)
    expect($.inArray(1, [1, 2, 1], 1)).toBe(2)
  })

  it('$.map', () => {
    expect($.map([1, 2, 3], (x: number) => x * 2)).toEqual([2, 4, 6])
    expect($.map([1, 2, 3], (x: number) => (x > 1 ? x : null))).toEqual([2, 3])
  })

  it('$.each array', () => {
    let sum = 0
    $.each([10, 20, 30], (_i: number, v: number) => {
      sum += v
    })
    expect(sum).toBe(60)
  })

  it('$.each object', () => {
    const keys: string[] = []
    $.each({ a: 1, b: 2 }, (k: string) => {
      keys.push(k)
    })
    expect(keys.length).toBe(2)
  })

  it('$.each early exit', () => {
    let stopped = 0
    $.each([1, 2, 3], (i: number) => {
      stopped = i
      if (i === 1) return false
    })
    expect(stopped).toBe(1)
  })

  it('$.grep', () => {
    expect($.grep([1, 2, 3, 4], (x: number) => x % 2 === 0)).toEqual([2, 4])
  })

  it('$.extend shallow', () => {
    expect($.extend({}, { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('$.extend deep', () => {
    const r = $.extend(true, { a: { x: 1 } }, { a: { y: 2 } })
    expect((r as any).a).toEqual({ x: 1, y: 2 })
  })

  it('$.noop', () => {
    expect($.noop()).toBeUndefined()
  })

  it('$.parseJSON', () => {
    expect($.parseJSON('{"a":1}')).toEqual({ a: 1 })
    expect($.parseJSON('[1,2,3]')).toEqual([1, 2, 3])
  })
})

// ─── DOM utilities ────────────────────────────────────────────────────────────

describe('DOM utilities', () => {
  it('$.contains', () => {
    const parent = q('fix-parent')
    const child = q('fix-child1')
    expect($.contains(parent, child)).toBe(true)
    expect($.contains(child, parent)).toBe(false)
    expect($.contains(parent, parent)).toBe(false)
  })

  it('$.mepto.matches', () => {
    expect($.mepto.matches(q('fix-id'), '.fix-class')).toBe(true)
    expect($.mepto.matches(q('fix-id'), '#fix-id')).toBe(true)
    expect($.mepto.matches(q('fix-id'), '.nonexistent')).toBe(false)
  })

  it('$.mepto.isZ', () => {
    expect($.mepto.isZ($('#fix-id'))).toBe(true)
    expect($.mepto.isZ({})).toBe(false)
  })
})

// ─── Selectors ────────────────────────────────────────────────────────────────

describe('selectors', () => {
  it('$(#id)', () => expect($('#fix-id').length).toBe(1))
  it('$(.class)', () => expect($('.child').length).toBe(2))
  it('$() empty', () => expect($().length).toBe(0))
  it('$(null) empty', () => expect($(null).length).toBe(0))

  it('$(element)', () => {
    expect($(q('fix-id'))[0]).toBe(q('fix-id'))
  })

  it('$(html fragment)', () => {
    const frag = $('<div class="dynamic"><span></span></div>')
    expect(frag.length).toBe(1)
    expect(frag.hasClass('dynamic')).toBe(true)
    expect(frag.find('span').length).toBe(1)
  })

  it('$(collection) identity', () => {
    const c = $('#fix-id')
    expect($(c)).toBe(c)
  })
})

// ─── Collection core ──────────────────────────────────────────────────────────

describe('collection core', () => {
  it('.length / .size()', () => {
    expect($('.child').length).toBe(2)
    expect($('.child').size()).toBe(2)
  })

  it('.get()', () => {
    expect($('.child').get(0)).toBe(q('fix-child1'))
    expect($('.child').get(-1)).toBe(q('fix-child2'))
    expect(Array.isArray($('.child').get())).toBe(true)
  })

  it('.each()', () => {
    const ids: string[] = []
    $('.child').each((_i: number, el: Element) => {
      ids.push(el.id)
    })
    expect(ids).toEqual(['fix-child1', 'fix-child2'])
  })

  it('.map()', () => {
    const result = $('.child').map(function (this: Element) {
      return this.id
    })
    expect(result[0]).toBe('fix-child1')
    expect(result[1]).toBe('fix-child2')
  })

  it('.filter()', () => {
    expect(
      $('.child').filter(function (this: Element) {
        return this.id === 'fix-child1'
      }).length
    ).toBe(1)
  })

  it('.is() / .not()', () => {
    expect($('#fix-id').is('.fix-class')).toBe(true)
    expect($('#fix-id').is('.nonexistent')).toBe(false)
    expect($('.child').not('#fix-child1').length).toBe(1)
  })

  it('.eq() / .first() / .last()', () => {
    expect($('.child').eq(0)[0]).toBe(q('fix-child1'))
    expect($('.child').eq(-1)[0]).toBe(q('fix-child2'))
    expect($('.child').first()[0]).toBe(q('fix-child1'))
    expect($('.child').last()[0]).toBe(q('fix-child2'))
  })

  it('.pluck()', () => {
    expect($('.child').pluck('id')).toEqual(['fix-child1', 'fix-child2'])
  })
})

// ─── Traversal ────────────────────────────────────────────────────────────────

describe('traversal', () => {
  it('.find()', () => {
    expect($('#fix-parent').find('.child').length).toBe(2)
    expect($('#fix-parent').find('.nonexistent').length).toBe(0)
  })

  it('.closest()', () => {
    expect($('#fix-child1').closest('.child')[0]).toBe(q('fix-child1'))
    expect($('#fix-deep').closest('#fix-ancestor')[0]).toBe(q('fix-ancestor'))
    expect($('#fix-deep').closest('.nonexistent').length).toBe(0)
  })

  it('.parent()', () => {
    expect($('#fix-child1').parent()[0]).toBe(q('fix-parent'))
    expect($('#fix-child1').parent('.nonexistent').length).toBe(0)
  })

  it('.children()', () => {
    expect($('#fix-parent').children().length).toBe(3)
    expect($('#fix-parent').children('.child').length).toBe(2)
  })

  it('.siblings()', () => {
    expect($('#fix-child1').siblings().length).toBe(2)
    expect($('#fix-child1').siblings('.child').length).toBe(1)
  })

  it('.next() / .prev()', () => {
    expect($('#fix-child1').next()[0]).toBe(q('fix-child2'))
    expect($('#fix-child2').prev()[0]).toBe(q('fix-child1'))
  })
})

// ─── DOM content ─────────────────────────────────────────────────────────────

describe('DOM content', () => {
  it('.html() get/set', () => {
    const d = $('<div><b>bold</b></div>').appendTo(fixture)
    expect(d.html()).toBe('<b>bold</b>')
    d.html('<i>italic</i>')
    expect(d.html()).toBe('<i>italic</i>')
  })

  it('.text() get/set', () => {
    const d = $('<div>hello <b>world</b></div>').appendTo(fixture)
    expect(d.text()).toBe('hello world')
    d.text('plain')
    expect(d.text()).toBe('plain')
  })

  it('.empty()', () => {
    const d = $('<div><span></span></div>').appendTo(fixture)
    d.empty()
    expect(d.html()).toBe('')
  })

  it('.clone()', () => {
    const d = $('<div><span>hi</span></div>').appendTo(fixture)
    const c = d.clone()
    expect($.mepto.isZ(c)).toBe(true)
    expect(c.find('span').length).toBe(1)
    expect(c[0]).not.toBe(d[0])
  })

  it('.remove()', () => {
    const d = $('<div id="remove-test"></div>').appendTo(fixture)
    expect(document.getElementById('remove-test')).not.toBeNull()
    d.remove()
    expect(document.getElementById('remove-test')).toBeNull()
  })
})

// ─── Insertion ────────────────────────────────────────────────────────────────

describe('insertion', () => {
  it('.append() / .prepend()', () => {
    const c = $('<div></div>').appendTo(fixture)
    c.append('<span class="app">A</span>')
    expect(c.children().length).toBe(1)
    c.prepend('<span class="pre">P</span>')
    expect(c.children().first().text()).toBe('P')
  })

  it('.appendTo() / .prependTo()', () => {
    const c = $('<div></div>').appendTo(fixture)
    $('<span>AT</span>').appendTo(c)
    expect(c.children().last().text()).toBe('AT')
    $('<span>PT</span>').prependTo(c)
    expect(c.children().first().text()).toBe('PT')
  })

  it('.append() accepts a DocumentFragment', () => {
    const c = $('<div></div>').appendTo(fixture)
    const frag = document.createDocumentFragment()
    frag.appendChild(document.createElement('span'))
    frag.appendChild(document.createElement('b'))
    c.append(frag)
    expect(c.children().length).toBe(2)
    expect(c.children().last().prop('tagName')).toBe('B')
  })
})

// ─── Attributes ───────────────────────────────────────────────────────────────

describe('attributes', () => {
  it('.attr() get/set/remove', () => {
    expect($('#fix-id').attr('data-val')).toBe('hello')
    expect($('#fix-id').attr('data-missing')).toBeUndefined()

    const d = $('<div>').appendTo(fixture)
    d.attr('data-test', 'v1')
    expect(d.attr('data-test')).toBe('v1')
    d.removeAttr('data-test')
    expect(d.attr('data-test')).toBeUndefined()
  })
})

// ─── Properties ───────────────────────────────────────────────────────────────

describe('properties', () => {
  it('.prop() get', () => {
    const inp = q('fix-input2') as HTMLInputElement
    expect($(inp).prop('tabindex')).toBe(5)
    expect($(inp).prop('maxlength')).toBe(20)
    expect($(inp).prop('readonly')).toBe(true)
  })

  it('.prop() set / .removeProp()', () => {
    const d = $('<input type="checkbox">').appendTo(fixture)
    d.prop('checked', true)
    expect((d[0] as HTMLInputElement).checked).toBe(true)
    d.prop('_custom', 'test')
    expect(d.prop('_custom')).toBe('test')
    d.removeProp('_custom')
    expect(d.prop('_custom')).toBeUndefined()
  })
})

// ─── Data ─────────────────────────────────────────────────────────────────────

describe('data', () => {
  it('.data() from attributes', () => {
    expect($('#fix-id').data('val')).toBe('hello')
    expect($('#fix-id').data('num')).toBe(42)
    expect($('#fix-id').data('obj')).toEqual({ a: 1 })
  })

  it('.data() set/get', () => {
    const d = $('<div>').appendTo(fixture)
    d.data('myKey', 'myVal')
    expect(d.data('myKey')).toBe('myVal')
  })
})

// ─── Values ───────────────────────────────────────────────────────────────────

describe('values', () => {
  it('.val() text input', () => {
    expect($('#fix-input').val()).toBe('initial')
    const inp = $('<input type="text">').appendTo(fixture)
    inp.val('changed')
    expect(inp.val()).toBe('changed')
  })

  it('.val() select', () => {
    expect($('#fix-select').val()).toBe('b')
  })
})

// ─── CSS ─────────────────────────────────────────────────────────────────────

describe('CSS', () => {
  it('.css() get/set', () => {
    const d = $('<div>').appendTo(fixture)
    d.css('background-color', 'blue')
    const got = d.css('background-color')
    expect(got === 'blue' || got === 'rgb(0, 0, 255)').toBe(true)
    d.css({ fontSize: '20px' })
    expect(d.css('font-size')).toBe('20px')
  })
})

// ─── Classes ─────────────────────────────────────────────────────────────────

describe('classes', () => {
  it('.hasClass / .addClass / .removeClass / .toggleClass', () => {
    const d = $('<div class="a b">').appendTo(fixture)
    expect(d.hasClass('a')).toBe(true)
    expect(d.hasClass('c')).toBe(false)

    d.addClass('c')
    expect(d.hasClass('c')).toBe(true)

    d.removeClass('b')
    expect(d.hasClass('b')).toBe(false)

    d.toggleClass('a')
    expect(d.hasClass('a')).toBe(false)
    d.toggleClass('a')
    expect(d.hasClass('a')).toBe(true)

    d.toggleClass('z', true)
    expect(d.hasClass('z')).toBe(true)
    d.toggleClass('z', false)
    expect(d.hasClass('z')).toBe(false)
  })
})

// ─── Display ─────────────────────────────────────────────────────────────────

describe('display', () => {
  it('.show() / .hide() / .toggle()', () => {
    const visible = $('<div style="display:block">').appendTo(fixture)
    const hidden = $('<div style="display:none">').appendTo(fixture)

    visible.hide()
    expect(visible.css('display')).toBe('none')

    hidden.show()
    expect(hidden.css('display')).not.toBe('none')

    visible.toggle()
    expect(visible.css('display')).not.toBe('none')
    visible.toggle(false)
    expect(visible.css('display')).toBe('none')
  })
})

// ─── Dimensions ──────────────────────────────────────────────────────────────

describe('dimensions', () => {
  // jsdom has no layout engine: offsetWidth/offsetHeight are always 0, so only
  // the margin logic of outerWidth/outerHeight is exercised here. Real
  // border-box sizes are covered by the Playwright suite.
  it('.outerWidth() / .outerHeight() return border-box size without margins', () => {
    const d = $('<div style="width:100px;height:50px">').appendTo(fixture)
    expect(d.outerWidth()).toBe(0)
    expect(d.outerHeight()).toBe(0)
  })

  it('.outerWidth(true) / .outerHeight(true) include margins', () => {
    const d = $('<div style="margin:10px 20px 30px 40px">').appendTo(fixture)
    expect(d.outerWidth(true)).toBe(60) // 20 + 40
    expect(d.outerHeight(true)).toBe(40) // 10 + 30
  })

  it('.outerWidth() on an empty collection returns 0', () => {
    expect($('#does-not-exist').outerWidth()).toBe(0)
  })
})

// ─── Events ──────────────────────────────────────────────────────────────────

describe('events', () => {
  it('.on() / .off() / .trigger()', () => {
    const d = $('<button>').appendTo(fixture)
    let count = 0
    const handler = () => {
      count++
    }
    d.on('click', handler)
    d.trigger('click')
    expect(count).toBe(1)
    d.off('click', handler)
    d.trigger('click')
    expect(count).toBe(1)
  })

  it('.one()', () => {
    const d = $('<div>').appendTo(fixture)
    let count = 0
    d.one('click', () => {
      count++
    })
    d.trigger('click')
    d.trigger('click')
    expect(count).toBe(1)
  })

  it('event delegation', () => {
    const d = $('<ul><li class="item">A</li><li class="item">B</li></ul>').appendTo(fixture)
    let count = 0
    d.on('click', '.item', () => {
      count++
    })
    d.find('.item').eq(0).trigger('click')
    expect(count).toBe(1)
    d.off('click')
    d.find('.item').eq(0).trigger('click')
    expect(count).toBe(1)
  })

  it('namespaced .on / .off', () => {
    const d = $('<div>').appendTo(fixture)
    let count = 0
    d.on('click.foo', () => {
      count++
    })
    d.trigger('click')
    expect(count).toBe(1)
    d.off('click.foo')
    d.trigger('click')
    expect(count).toBe(1)
  })

  it('multiple handlers fire independently', () => {
    const d = $('<div>').appendTo(fixture)
    let count = 0
    d.on('click', () => {
      count++
    })
    d.on('click', () => {
      count++
    })
    d.trigger('click')
    expect(count).toBe(2)
    d.off('click')
    d.trigger('click')
    expect(count).toBe(2)
  })

  it('.bind() / .unbind()', () => {
    const d = $('<div>').appendTo(fixture)
    let count = 0
    d.bind('click', () => {
      count++
    })
    d.trigger('click')
    expect(count).toBe(1)
    d.unbind('click')
    d.trigger('click')
    expect(count).toBe(1)
  })

  it('.delegate() / .undelegate()', () => {
    const parent = $('<div><span class="item"></span></div>').appendTo(fixture)
    let count = 0
    parent.delegate('.item', 'click', () => {
      count++
    })
    parent.find('.item').trigger('click')
    expect(count).toBe(1)
    parent.undelegate('.item', 'click')
    parent.find('.item').trigger('click')
    expect(count).toBe(1)
  })

  it('.triggerHandler() returns value and does not bubble', () => {
    const d = $('<div>').appendTo(fixture)
    const child = $('<span>').appendTo(d)
    let bubbled = false
    d.on('custom', () => {
      bubbled = true
    })
    child.on('custom', () => {
      return 'retval'
    })
    const ret = child.triggerHandler('custom')
    expect(ret).toBe('retval')
    expect(bubbled).toBe(false)
  })

  it('.trigger() passes extra arguments', () => {
    const d = $('<div>').appendTo(fixture)
    let received: unknown[] | null = null
    d.on('custom', (_e: Event, a: unknown, b: unknown) => {
      received = [a, b]
    })
    d.trigger('custom', ['x', 'y'])
    expect(received).toEqual(['x', 'y'])
  })

  it('event map object', () => {
    const d = $('<div>').appendTo(fixture)
    let clicks = 0,
      keys = 0
    d.on({
      click: () => {
        clicks++
      },
      keydown: () => {
        keys++
      },
    })
    d.trigger('click')
    d.trigger('keydown')
    expect(clicks).toBe(1)
    expect(keys).toBe(1)
  })

  it('$.proxy binds context and preset args', () => {
    const ctx = { val: 42 }
    function fn(this: { val: number }) {
      return this.val
    }
    const proxied = $.proxy(fn, ctx)
    expect(proxied()).toBe(42)
  })

  it('$.proxy with preset args', () => {
    function fn(a: number, b: number) {
      return a + b
    }
    const proxied = $.proxy(fn, null, 5)
    expect(proxied(3)).toBe(8)
  })

  it('$.proxy string method', () => {
    const obj = {
      val: 10,
      getVal() {
        return this.val
      },
    }
    const proxied = $.proxy(obj, 'getVal')
    expect(proxied()).toBe(10)
  })

  it('$.proxy throws on non-function', () => {
    expect(() => $.proxy(null as unknown as () => void, {})).toThrow()
  })

  it('$.Event creates event with type and properties', () => {
    const e = $.Event('click')
    expect(e instanceof Event).toBe(true)
    expect(e.type).toBe('click')
    expect(e.bubbles).toBe(true)
  })

  it('$.Event with bubbles false', () => {
    const e = $.Event('custom', { bubbles: false })
    expect(e.bubbles).toBe(false)
  })

  it('$.Event with custom property', () => {
    const e = $.Event('custom', { detail: 42 } as Record<string, unknown>)
    expect((e as Event & { detail: number }).detail).toBe(42)
  })

  it('preventDefault + isDefaultPrevented', () => {
    const d = $('<div>').appendTo(fixture)
    let prevented = false
    d.on('click', (e: Event) => {
      e.preventDefault()
      prevented = (e as Event & { isDefaultPrevented(): boolean }).isDefaultPrevented()
    })
    d.trigger('click')
    expect(prevented).toBe(true)
  })

  it('stopPropagation + isPropagationStopped', () => {
    const d = $('<div>').appendTo(fixture)
    let stopped = false
    d.on('click', (e: Event) => {
      e.stopPropagation()
      stopped = (e as Event & { isPropagationStopped(): boolean }).isPropagationStopped()
    })
    d.trigger('click')
    expect(stopped).toBe(true)
  })

  it('stopImmediatePropagation + isImmediatePropagationStopped', () => {
    const d = $('<div>').appendTo(fixture)
    let stopped = false
    d.on('click', (e: Event) => {
      e.stopImmediatePropagation()
      stopped = (
        e as Event & { isImmediatePropagationStopped(): boolean }
      ).isImmediatePropagationStopped()
    })
    d.trigger('click')
    expect(stopped).toBe(true)
  })

  it('stopImmediatePropagation prevents other handlers', () => {
    const d = $('<div>').appendTo(fixture)
    let count = 0
    d.on('click', (e: Event) => {
      e.stopImmediatePropagation()
      count++
    })
    d.on('click', () => {
      count++
    })
    d.trigger('click')
    expect(count).toBe(1)
  })

  it('handler returning false prevents default and stops propagation', () => {
    const d = $('<div>').appendTo(fixture)
    let prevented = false,
      stopped = false
    d.on('click', () => {
      return false
    })
    d.on('click', (e: Event) => {
      prevented = (e as Event & { isDefaultPrevented(): boolean }).isDefaultPrevented()
      stopped = (e as Event & { isPropagationStopped(): boolean }).isPropagationStopped()
    })
    d.trigger('click')
    expect(prevented).toBe(true)
    expect(stopped).toBe(true)
  })

  it('mouseenter / mouseleave emulation', () => {
    const d = $('<div>').appendTo(fixture)
    let fired = false
    d.on('mouseenter', () => {
      fired = true
    })
    d.trigger('mouseover')
    expect(fired).toBe(true)
  })

  it('shortcut .click() binds and triggers', () => {
    const d = $('<div>').appendTo(fixture)
    let fired = false
    d.click(() => {
      fired = true
    })
    d.click()
    expect(fired).toBe(true)
  })

  it('shortcut .dblclick() binds and triggers', () => {
    const d = $('<div>').appendTo(fixture)
    let fired = false
    d.dblclick(() => {
      fired = true
    })
    d.dblclick()
    expect(fired).toBe(true)
  })

  it('$.event.add and $.event.remove exist', () => {
    expect(typeof $.event.add).toBe('function')
    expect(typeof $.event.remove).toBe('function')
  })
})

// ─── Forms ───────────────────────────────────────────────────────────────────

describe('forms', () => {
  it('.serializeArray() / .serialize()', () => {
    const arr = $('#fix-form').serializeArray()
    expect(Array.isArray(arr)).toBe(true)
    expect(arr.some((f: any) => f.name === 'username' && f.value === 'alice')).toBe(true)
    expect(arr.some((f: any) => f.name === 'skip')).toBe(false)

    const str = $('#fix-form').serialize()
    expect(typeof str).toBe('string')
    expect(str).toContain('username=alice')
  })
})
