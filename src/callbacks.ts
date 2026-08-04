//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import { type MeptoStatic, type CallbacksOptions } from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  type Callback = (...args: unknown[]) => unknown
  type FireData = [unknown, unknown[]]

  // Returned by $.Callbacks(). Method return types are the object itself
  // for chaining; add/remove accept any callable, has/disabled/locked/fired
  // are booleans.
  interface CallbacksObject {
    add(...callbacks: Callback[]): CallbacksObject
    remove(...callbacks: Callback[]): CallbacksObject
    has(fn?: Callback): boolean
    empty(): CallbacksObject
    disable(): CallbacksObject
    disabled(): boolean
    lock(): CallbacksObject
    locked(): boolean
    fireWith(context: unknown, args?: unknown[]): CallbacksObject
    fire(...args: unknown[]): CallbacksObject
    fired(): boolean
  }

  $.Callbacks = function (options?: CallbacksOptions): CallbacksObject {
    const opts: CallbacksOptions = $.extend({}, options)

    let memory: FireData | false | undefined
    let fired = false
    let firing = false
    let firingStart = 0
    let firingLength = 0
    let firingIndex = 0
    let list: Callback[] = []
    let stack: FireData[] | undefined = !opts.once ? [] : undefined

    const fire = function (data: FireData): void {
      memory = opts.memory && data
      fired = true
      firingIndex = firingStart || 0
      firingStart = 0
      firingLength = list.length
      firing = true
      for (; list && firingIndex < firingLength; ++firingIndex) {
        if (list[firingIndex].apply(data[0], data[1]) === false && opts.stopOnFalse) {
          memory = false
          break
        }
      }
      firing = false
      if (list) {
        // The `if (stack) ...` check intentionally uses truthiness, not
        // `!== undefined`: stack can be an empty array (when `once` is not
        // set), and an empty array is truthy. The inner `stack.length &&`
        // then gates the recursive call, so we never recurse into an empty
        // stack. Critically, this branch also STOPS the call to
        // `Callbacks.disable()` — which is the whole point of having
        // stack initialised to `[]` in the first place.
        if (stack) {
          if (stack.length) fire(stack.shift() as FireData)
        } else if (memory) {
          list.length = 0
        } else {
          Callbacks.disable()
        }
      }
    }

    const add = function (args: Callback[]): void {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (typeof arg === 'function') {
          if (!opts.unique || !Callbacks.has(arg)) list.push(arg)
        } else if (arg && typeof arg !== 'string' && (arg as Callback[]).length) {
          add(arg as unknown as Callback[])
        }
      }
    }

    const Callbacks: CallbacksObject = {
      add: function (...callbacks: Callback[]): CallbacksObject {
        if (list) {
          const start = list.length
          add(callbacks)
          if (firing) firingLength = list.length
          else if (memory) {
            firingStart = start
            fire(memory)
          }
        }
        return this
      },
      remove: function (...callbacks: Callback[]): CallbacksObject {
        if (list) {
          for (let i = 0; i < callbacks.length; i++) {
            const arg = callbacks[i]
            let index = 0
            while ((index = $.inArray(arg, list, index)) > -1) {
              list.splice(index, 1)
              if (firing) {
                if (index <= firingLength) --firingLength
                if (index <= firingIndex) --firingIndex
              }
            }
          }
        }
        return this
      },
      has: function (fn?: Callback): boolean {
        return !!(list && (fn ? $.inArray(fn, list) > -1 : list.length))
      },
      empty: function (): CallbacksObject {
        firingLength = list.length = 0
        return this
      },
      disable: function (): CallbacksObject {
        list = undefined as unknown as Callback[]
        stack = undefined
        memory = undefined
        return this
      },
      disabled: function (): boolean {
        return !list
      },
      lock: function (): CallbacksObject {
        stack = undefined
        if (!memory) Callbacks.disable()
        return this
      },
      locked: function (): boolean {
        return !stack
      },
      fireWith: function (context: unknown, args?: unknown[]): CallbacksObject {
        if (list && (!fired || stack)) {
          const argArray = args ? [...args] : []
          const data: FireData = [context, argArray]
          if (firing) (stack as FireData[]).push(data)
          else fire(data)
        }
        return this
      },
      fire: function (...args: unknown[]): CallbacksObject {
        return Callbacks.fireWith(this, args)
      },
      fired: function (): boolean {
        return !!fired
      },
    }

    return Callbacks
  }
})(mepto)
