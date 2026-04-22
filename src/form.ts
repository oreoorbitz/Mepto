//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

;(function($: any){
  $.fn.serializeArray = function(): { name: string; value: string }[] {
    let name: string, type: string
    const result: { name: string; value: string }[] = []
    const add = function(value: any): void {
      if (value.forEach) return value.forEach(add)
      result.push({ name: name, value: value })
    }
    if (this[0]) $.each(this[0].elements, function(_: number, field: any){
      type = field.type, name = field.name
      if (name && field.nodeName.toLowerCase() != 'fieldset' &&
        !field.disabled && type != 'submit' && type != 'reset' && type != 'button' && type != 'file' &&
        ((type != 'radio' && type != 'checkbox') || field.checked))
          add($(field).val())
    })
    return result
  }

  $.fn.serialize = function(): string {
    const result: string[] = []
    this.serializeArray().forEach(function(elm: { name: string; value: string }){
      result.push(encodeURIComponent(elm.name) + '=' + encodeURIComponent(elm.value))
    })
    return result.join('&')
  }

  $.fn.submit = function(callback?: (e: Event) => void): any {
    if (0 in arguments) this.bind('submit', callback)
    else if (this.length) {
      const event = $.Event('submit')
      this.eq(0).trigger(event)
      if (!event.isDefaultPrevented()) this.get(0).submit()
    }
    return this
  }

})(mepto)
