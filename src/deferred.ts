//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.
//
//     Some code (c) 2005, 2013 jQuery Foundation, Inc. and other contributors

;(function($: any){
  const slice = Array.prototype.slice

  function Deferred(func?: (deferred: any) => void): any {
    const tuples: [string, string, any, string?][] = [
      [ "resolve", "done", $.Callbacks({once:1, memory:1}), "resolved" ],
      [ "reject", "fail", $.Callbacks({once:1, memory:1}), "rejected" ],
      [ "notify", "progress", $.Callbacks({memory:1}) ]
    ]
    let state = "pending"
    const deferred: Record<string, any> = {}

    const promise: Record<string, any> = {
      state: function(): string {
        return state
      },
      always: function(): any {
        deferred.done(arguments).fail(arguments)
        return this
      },
      then: function(): any {
        const fns = arguments
        return Deferred(function(defer: any){
          $.each(tuples, function(i: number, tuple: [string, string, any, string?]){
            const fn = $.isFunction(fns[i]) && fns[i]
            deferred[tuple[1]](function(){
              const returned = fn && fn.apply(this, arguments)
              if (returned && $.isFunction(returned.promise)) {
                returned.promise()
                  .done(defer.resolve)
                  .fail(defer.reject)
                  .progress(defer.notify)
              } else {
                const context = this === promise ? defer.promise() : this
                const values = fn ? [returned] : arguments
                defer[tuple[0] + "With"](context, values)
              }
            })
          })
        }).promise()
      },
      promise: function(obj?: any): any {
        return obj != null ? $.extend(obj, promise) : promise
      }
    }

    $.each(tuples, function(i: number, tuple: [string, string, any, string?]){
      const list = tuple[2]
      const stateString = tuple[3]

      promise[tuple[1]] = list.add

      if (stateString) {
        list.add(function(){
          state = stateString
        }, tuples[i^1][2].disable, tuples[2][2].lock)
      }

      deferred[tuple[0]] = function(){
        deferred[tuple[0] + "With"](this === deferred ? promise : this, arguments)
        return this
      }
      deferred[tuple[0] + "With"] = list.fireWith
    })

    promise.promise(deferred)
    if (func) func.call(deferred, deferred)
    return deferred
  }

  $.when = function(sub?: any): any {
    const resolveValues = slice.call(arguments)
    const len = resolveValues.length
    let remain = len !== 1 || (sub && $.isFunction(sub.promise)) ? len : 0
    const deferred = remain === 1 ? sub : Deferred()
    let progressValues: any[], progressContexts: any[], resolveContexts: any[]

    const updateFn = function(i: number, ctx: any[], val: any[]): (value: any) => void {
      return function(value: any){
        ctx[i] = this
        val[i] = arguments.length > 1 ? slice.call(arguments) : value
        if (val === progressValues) {
          deferred.notifyWith(ctx, val)
        } else if (!(--remain)) {
          deferred.resolveWith(ctx, val)
        }
      }
    }

    if (len > 1) {
      progressValues = new Array(len)
      progressContexts = new Array(len)
      resolveContexts = new Array(len)
      for (let i = 0; i < len; ++i) {
        if (resolveValues[i] && $.isFunction(resolveValues[i].promise)) {
          resolveValues[i].promise()
            .done(updateFn(i, resolveContexts, resolveValues))
            .fail(deferred.reject)
            .progress(updateFn(i, progressContexts, progressValues))
        } else {
          --remain
        }
      }
    }
    if (!remain) deferred.resolveWith(resolveContexts, resolveValues)
    return deferred.promise()
  }

  $.Deferred = Deferred
})(mepto)
