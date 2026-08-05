//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.
//
//     Some code (c) 2005, 2013 jQuery Foundation, Inc. and other contributors

import {
  type MeptoStatic,
  type CallbacksOptions,
  type DeferredObject,
  type PromiseObject,
} from './types'

declare const mepto: MeptoStatic
;(function ($: MeptoStatic) {
  const slice = Array.prototype.slice

  // The Callbacks object shape we rely on (a subset of the public type with
  // chainable return types, which the public declaration does not currently
  // expose).
  type CallbacksObj = ReturnType<MeptoStatic['Callbacks']>

  // [action, callbackListName, callbacksObject, stateString?]
  type Tuple = [string, string, CallbacksObj, string?]

  // Internal deferred shape: built up by dynamic-key assignment from the
  // tuples table, so we need an index signature; cast to DeferredObject
  // on return.
  type DeferredInternal = DeferredObject<unknown> & Record<string, (...args: unknown[]) => unknown>

  // PromiseObject in types.ts does not declare .promise() — `promise` is
  // a local object built up with the public DeferredObject's .promise
  // method, so we cast at the return boundary.
  interface PromiseInternal extends PromiseObject<unknown> {
    promise(target?: unknown): PromiseObject<unknown>
  }

  function Deferred(func?: (deferred: DeferredObject<unknown>) => void): DeferredObject<unknown> {
    const tuples: Tuple[] = [
      [
        'resolve',
        'done',
        $.Callbacks({ once: 1, memory: 1 } as unknown as CallbacksOptions),
        'resolved',
      ],
      [
        'reject',
        'fail',
        $.Callbacks({ once: 1, memory: 1 } as unknown as CallbacksOptions),
        'rejected',
      ],
      ['notify', 'progress', $.Callbacks({ memory: 1 } as unknown as CallbacksOptions)],
    ]
    let state = 'pending'
    const deferred = {} as DeferredInternal
    const promise = {
      state: function (): 'pending' | 'resolved' | 'rejected' {
        return state as 'pending' | 'resolved' | 'rejected'
      },
      always: function (...callbacks: (() => void)[]): PromiseInternal {
        ;(deferred.done as unknown as (...c: (() => void)[]) => void)(...callbacks)
        ;(deferred.fail as unknown as (...c: (() => void)[]) => void)(...callbacks)
        return this
      },
      then: function <U>(
        doneFilter: (value: unknown) => U | PromiseObject<U>,
        failFilter?: (reason: unknown) => U | PromiseObject<U>,
        progressFilter?: (value: unknown) => unknown
      ): PromiseObject<U> {
        const fns: [
          (value: unknown) => U | PromiseObject<U>,
          ((reason: unknown) => U | PromiseObject<U>) | undefined,
          ((value: unknown) => unknown) | undefined,
        ] = [doneFilter, failFilter, progressFilter]
        return Deferred(function (defer: DeferredObject<unknown>) {
          $.each(tuples, function (i: number, tuple: Tuple) {
            const fn = $.isFunction(fns[i]) && (fns[i] as (...a: unknown[]) => unknown)
            ;(deferred[tuple[1]] as (...a: unknown[]) => DeferredObject<unknown>)(function () {
              const args = slice.call(arguments) as unknown[]
              const returned = fn && fn.apply(this, args)
              if (
                returned &&
                $.isFunction((returned as { promise?: () => PromiseObject<unknown> }).promise)
              ) {
                ;(returned as { promise: () => PromiseObject<unknown> })
                  .promise()
                  .done(defer.resolve)
                  .fail(defer.reject)
                  .progress(defer.notify)
              } else {
                const context = this === promise ? defer.promise() : this
                const values = fn ? [returned] : args
                ;(defer as DeferredInternal)[tuple[0] + 'With'](
                  context,
                  values
                ) as unknown as DeferredObject<unknown>
              }
            })
          })
        }).promise() as unknown as PromiseObject<U>
      },
      promise: function (obj?: unknown): PromiseInternal {
        return obj != null
          ? ($.extend(obj, promise) as PromiseInternal)
          : (promise as PromiseInternal)
      },
    } as unknown as PromiseInternal

    $.each(tuples, function (i: number, tuple: Tuple) {
      const list = tuple[2]
      const stateString = tuple[3]

      ;(promise as unknown as Record<string, CallbacksObj['add']>)[tuple[1]] = list.add

      if (stateString) {
        list.add(
          function () {
            state = stateString
          },
          tuples[i ^ 1][2].disable,
          tuples[2][2].lock
        )
      }

      deferred[tuple[0]] = function (this: unknown): DeferredObject<unknown> {
        ;(deferred[tuple[0] + 'With'] as (ctx: unknown, args: unknown) => DeferredObject<unknown>)(
          this === deferred ? promise : this,
          arguments
        )
        return deferred
      }
      deferred[tuple[0] + 'With'] = list.fireWith as (
        ctx: unknown,
        args: unknown
      ) => DeferredObject<unknown>
    })
    ;(promise.promise as (target: unknown) => DeferredObject<unknown>)(deferred)
    if (func) func.call(deferred, deferred)
    return deferred
  }

  $.when = function (...subs: unknown[]): PromiseObject<unknown[]> {
    const resolveValues = subs
    const len = resolveValues.length
    let remain =
      len !== 1 || (subs[0] && $.isFunction((subs[0] as { promise?: () => unknown }).promise))
        ? len
        : 0
    const deferred: DeferredObject<unknown> =
      remain === 1 ? (subs[0] as DeferredObject<unknown>) : Deferred()
    let progressValues: unknown[] = []
    let progressContexts: unknown[] = []
    let resolveContexts: unknown[] = []

    const updateFn = function (
      i: number,
      ctx: unknown[],
      val: unknown[]
    ): (value: unknown) => void {
      return function (value: unknown): void {
        ctx[i] = this
        val[i] = arguments.length > 1 ? slice.call(arguments) : value
        if (val === progressValues) {
          ;(
            deferred as unknown as {
              notifyWith: (c: unknown, a: unknown[]) => void
            }
          ).notifyWith(ctx, val)
        } else if (!--remain) {
          // Wrap the resolve values array in an outer array so the
          // deferred's resolveWith — which spreads its second arg as
          // the callback's arguments — delivers the whole array to the
          // done handler. Matches jQuery 3.x semantics where the done
          // callback receives one array value, not a spread.
          ;(
            deferred as unknown as {
              resolveWith: (c: unknown, a: unknown[]) => void
            }
          ).resolveWith(ctx, [val])
        }
      }
    }

    if (len > 1) {
      progressValues = new Array(len)
      progressContexts = new Array(len)
      resolveContexts = new Array(len)
      for (let i = 0; i < len; ++i) {
        if (
          resolveValues[i] &&
          $.isFunction((resolveValues[i] as { promise?: () => unknown }).promise)
        ) {
          ;(resolveValues[i] as { promise: () => PromiseObject<unknown> })
            .promise()
            .done(updateFn(i, resolveContexts, resolveValues))
            .fail(deferred.reject)
            .progress(updateFn(i, progressContexts, progressValues))
        } else {
          --remain
        }
      }
    }
    // The "if (!remain)" branch is the resolve path for the case when no
    // deferreds were provided to $.when: either len === 0, or every
    // input is a plain value (not a thenable). The main resolve path
    // lives in `updateFn` above, which fires when the LAST remaining
    // deferred settles and wraps its values in `[val]` so the done
    // handler receives the whole array as one value (mepto convention).
    //
    // Here, since no deferreds are waiting, the values are already known
    // and should be delivered to the done callback the same way jQuery
    // 3.x does it: spread as individual args. So `$.when(5)` delivers 5,
    // `$.when(5, 10)` delivers (5, 10), and `$.when()` delivers nothing.
    // Wrapping in `[resolveValues]` (as this branch used to do) would
    // hand the done callback an extra array level.
    if (!remain) {
      ;(
        deferred as unknown as {
          resolveWith: (c: unknown, a: unknown[]) => void
        }
      ).resolveWith(resolveContexts, resolveValues)
    }
    return deferred.promise() as unknown as PromiseObject<unknown[]>
  } as MeptoStatic['when']

  $.Deferred = Deferred as MeptoStatic['Deferred']
})(mepto)
