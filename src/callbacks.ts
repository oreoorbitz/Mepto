//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

;(function($: any){
  $.Callbacks = function(options: any): any {
    options = $.extend({}, options)

    let memory: any[] | false | undefined
    let fired = false
    let firing = false
    let firingStart = 0
    let firingLength = 0
    let firingIndex = 0
    let list: ((...args: unknown[]) => unknown)[] = []
    let stack: any[][] | undefined = !options.once && []

    const fire = function(data: any[]): void {
      memory = options.memory && data
      fired = true
      firingIndex = firingStart || 0
      firingStart = 0
      firingLength = list.length
      firing = true
      for ( ; list && firingIndex < firingLength ; ++firingIndex ) {
        if (list[firingIndex].apply(data[0], data[1]) === false && options.stopOnFalse) {
          memory = false
          break
        }
      }
      firing = false
      if (list) {
        if (stack) stack.length && fire(stack.shift())
        else if (memory) list.length = 0
        else Callbacks.disable()
      }
    }

    const add = function(args: IArguments | any[]): void {
      $.each(args, function(_: number, arg: any){
        if (typeof arg === "function") {
          if (!options.unique || !Callbacks.has(arg)) list.push(arg)
        }
        else if (arg && arg.length && typeof arg !== 'string') add(arg)
      })
    }

    const Callbacks = {
      add: function(): any {
        if (list) {
          const start = list.length
          add(arguments)
          if (firing) firingLength = list.length
          else if (memory) {
            firingStart = start
            fire(memory)
          }
        }
        return this
      },
      remove: function(): any {
        if (list) {
          $.each(arguments, function(_: number, arg: (...args: unknown[]) => unknown){
            let index = 0
            while ((index = $.inArray(arg, list, index)) > -1) {
              list.splice(index, 1)
              if (firing) {
                if (index <= firingLength) --firingLength
                if (index <= firingIndex) --firingIndex
              }
            }
          })
        }
        return this
      },
      has: function(fn?: (...args: unknown[]) => unknown): boolean {
        return !!(list && (fn ? $.inArray(fn, list) > -1 : list.length))
      },
      empty: function(): any {
        firingLength = list.length = 0
        return this
      },
      disable: function(): any {
        list = undefined as any
        stack = undefined
        memory = undefined
        return this
      },
      disabled: function(): boolean {
        return !list
      },
      lock: function(): any {
        stack = undefined
        if (!memory) Callbacks.disable()
        return this
      },
      locked: function(): boolean {
        return !stack
      },
      fireWith: function(context: any, args?: any[]): any {
        if (list && (!fired || stack)) {
          args = args || []
          const data = [context, args.slice ? args.slice() : args]
          if (firing) stack!.push(data)
          else fire(data)
        }
        return this
      },
      fire: function(): any {
        return Callbacks.fireWith(this, arguments)
      },
      fired: function(): boolean {
        return !!fired
      }
    }

    return Callbacks
  }
})(mepto)
