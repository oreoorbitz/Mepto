//     zepto.js
//     (c) 2010-2016 Thomas Fuchs
//     zepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type MeptoCollection, type EventHandler } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  // `form.elements` is an HTMLFormControlsCollection. The items are runtime
  // subtypes (HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement,
  // HTMLButtonElement, HTMLFieldSetElement) but TS only sees Element. The
  // fields read here are common to every form-associated element.
  type FormField = Element & {
    type: string
    name: string
    disabled: boolean
    checked?: boolean
  }

  $.fn.serializeArray = function (this: MeptoCollection): { name: string; value: string }[] {
    const result: { name: string; value: string }[] = []
    // `name` and `type` are closure-shared between the `add` helper and the
    // `$.each` callback below: `add` is invoked per field and reads the
    // current field's name from the outer scope.
    let name = ''
    let type = ''
    const add = function (value: string | string[]): void {
      if (Array.isArray(value)) {
        value.forEach(v => add(v))
        return
      }
      result.push({ name, value })
    }
    if (this[0]) {
      const form = this[0] as HTMLFormElement
      $.each(Array.from(form.elements), function (_: number, field: Element) {
        const f = field as FormField
        name = f.name
        type = f.type
        if (
          name &&
          f.nodeName.toLowerCase() != 'fieldset' &&
          !f.disabled &&
          type != 'submit' &&
          type != 'reset' &&
          type != 'button' &&
          type != 'file' &&
          ((type != 'radio' && type != 'checkbox') || f.checked)
        ) {
          add($(f).val() as string | string[])
        }
      })
    }
    return result
  }

  $.fn.serialize = function (this: MeptoCollection): string {
    const result: string[] = []
    this.serializeArray().forEach(function (elm: { name: string; value: string }) {
      result.push(encodeURIComponent(elm.name) + '=' + encodeURIComponent(elm.value))
    })
    return result.join('&')
  }

  $.fn.submit = function (this: MeptoCollection, callback?: EventHandler): MeptoCollection {
    if (callback !== undefined) {
      this.bind('submit', callback)
    } else if (this.length) {
      const event = $.Event('submit')
      this.eq(0).trigger(event)
      const form = this.get(0) as HTMLFormElement
      if (!(event as Event & { isDefaultPrevented(): boolean }).isDefaultPrevented()) form.submit()
    }
    return this
  }
})(mepto)
