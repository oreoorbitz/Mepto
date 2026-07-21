//     mepto.js
//     (c) 2010-2016 Thomas Fuchs
//     mepto.js may be freely distributed under the MIT license.

import {
  type MeptoStatic,
  type AjaxSettings,
  type AjaxSuccessCallback,
  type DeferredObject,
  type MeptoCollection,
  type PlainObject,
  type MeptoElement,
} from './types'

declare const mepto: MeptoStatic

// Internal ajax settings — extends the public AjaxSettings with fields
// the implementation uses but types.ts doesn't declare yet.
interface FullAjaxSettings extends AjaxSettings {
  dataFilter: (data: unknown, type: string) => unknown
  xhr: () => XMLHttpRequest
  username?: string
  password?: string
}

// Augmented MeptoStatic with the ajaxSettings defaults property
type AjaxStatic = MeptoStatic & { ajaxSettings: FullAjaxSettings }

// Deferred augmented with resolveWith/rejectWith (not yet on DeferredObject in types.ts)
type AjaxDeferred = DeferredObject<unknown> & {
  resolveWith(context: unknown, args: unknown[]): unknown
  rejectWith(context: unknown, args: unknown[]): unknown
}

// JSONP's lightweight XHR stand-in
interface JsonpXhr {
  abort: (errorType?: string) => void
}

// Union of real XMLHttpRequest and JSONP's stand-in
type AnyXhr = XMLHttpRequest | JsonpXhr

// Array with a monkey-patched add() method, used by $.param serialization
interface SerialParams extends Array<string> {
  add(key: string, value: unknown): void
}

;(function ($: MeptoStatic) {
  let jsonpID: number = Date.now(),
    rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    scriptTypeRE = /^(?:text|application)\/javascript/i,
    xmlTypeRE = /^(?:text|application)\/xml/i,
    jsonType = 'application/json',
    htmlType = 'text/html',
    blankRE = /^\s*$/

  // trigger a custom event and return false if it was cancelled
  function triggerAndReturn(context: unknown, eventName: string, data: unknown): boolean {
    const event = $.Event(eventName) as Event & { isDefaultPrevented(): boolean }
    const target = (context || document) as MeptoElement
    $(target).trigger(event, data)
    return !event.isDefaultPrevented()
  }

  // trigger an Ajax "global" event
  function triggerGlobal(
    settings: AjaxSettings,
    context: unknown,
    eventName: string,
    data: unknown
  ): boolean | undefined {
    if (settings.global) return triggerAndReturn(context || document, eventName, data)
  }

  // Number of active Ajax requests
  $.active = 0

  function ajaxStart(settings: AjaxSettings): void {
    if (settings.global && $.active++ === 0) triggerGlobal(settings, null, 'ajaxStart')
  }
  function ajaxStop(settings: AjaxSettings): void {
    if (settings.global && !--$.active) triggerGlobal(settings, null, 'ajaxStop')
  }

  // triggers an extra global event "ajaxBeforeSend" that's like "ajaxSend" but cancelable
  function ajaxBeforeSend(xhr: AnyXhr, settings: AjaxSettings): boolean | undefined {
    const context = settings.context
    if (
      settings.beforeSend.call(context, xhr as XMLHttpRequest, settings) === false ||
      triggerGlobal(settings, context, 'ajaxBeforeSend', [xhr, settings]) === false
    )
      return false

    triggerGlobal(settings, context, 'ajaxSend', [xhr, settings])
  }
  function ajaxSuccess(
    data: unknown,
    xhr: AnyXhr,
    settings: AjaxSettings,
    deferred?: AjaxDeferred
  ): void {
    const context = settings.context,
      status = 'success'
    settings.success.call(context, data, status, xhr as XMLHttpRequest)
    if (deferred) deferred.resolveWith(context, [data, status, xhr])
    triggerGlobal(settings, context, 'ajaxSuccess', [xhr, settings, data])
    ajaxComplete(status, xhr, settings)
  }
  // type: "timeout", "error", "abort", "parsererror"
  function ajaxError(
    error: unknown,
    type: string,
    xhr: AnyXhr,
    settings: AjaxSettings,
    deferred?: AjaxDeferred
  ): void {
    const context = settings.context
    settings.error.call(context, xhr as XMLHttpRequest, type, error as Error)
    if (deferred) deferred.rejectWith(context, [xhr, type, error])
    triggerGlobal(settings, context, 'ajaxError', [xhr, settings, error || type])
    ajaxComplete(type, xhr, settings)
  }
  // status: "success", "notmodified", "error", "timeout", "abort", "parsererror"
  function ajaxComplete(status: string, xhr: AnyXhr, settings: AjaxSettings): void {
    const context = settings.context
    settings.complete.call(context, xhr as XMLHttpRequest, status)
    triggerGlobal(settings, context, 'ajaxComplete', [xhr, settings])
    ajaxStop(settings)
  }

  function ajaxDataFilter(data: unknown, type: string, settings: FullAjaxSettings): unknown {
    if (settings.dataFilter == empty) return data
    const context = settings.context
    return settings.dataFilter.call(context, data, type)
  }

  // Empty function, used as default callback
  function empty(): void {}

  $.ajaxJSONP = function (options: AjaxSettings, deferred?: AjaxDeferred): unknown {
    if (!('type' in options)) return $.ajax(options)

    const _callbackName = options.jsonpCallback,
      callbackName =
        ($.isFunction(_callbackName) ? _callbackName() : _callbackName) || 'mepto' + jsonpID++,
      script = document.createElement('script'),
      abort = function (errorType?: string): void {
        $(script).triggerHandler('error', errorType || 'abort')
      },
      xhr: JsonpXhr = { abort: abort }
    let originalCallback = (window as unknown as Record<string, unknown>)[callbackName] as
        | ((...args: unknown[]) => unknown)
        | undefined,
      responseData: unknown[] | undefined,
      abortTimeout: ReturnType<typeof setTimeout> | undefined

    if (deferred) deferred.promise(xhr)

    $(script).on('load error', (e: Event, errorType?: string): void => {
      clearTimeout(abortTimeout)
      $(script).off().remove()

      if (e.type == 'error' || !responseData) {
        ajaxError(null, errorType || 'error', xhr, options, deferred)
      } else {
        ajaxSuccess(responseData[0], xhr, options, deferred)
      }

      ;(window as unknown as Record<string, unknown>)[callbackName] = originalCallback
      if (responseData && originalCallback) originalCallback(responseData[0])

      originalCallback = undefined
      responseData = undefined
    })

    if (ajaxBeforeSend(xhr, options) === false) {
      abort('abort')
      return xhr
    }

    ;(window as unknown as Record<string, unknown>)[callbackName] = (...args: unknown[]): void => {
      responseData = args
    }

    script.src = options.url.replace(/\?(.+)=\?/, '?$1=' + callbackName)
    document.head.appendChild(script)

    if (options.timeout > 0)
      abortTimeout = setTimeout((): void => {
        abort('timeout')
      }, options.timeout)

    return xhr
  }

  $.ajaxSettings = {
    // Default type of request
    type: 'GET',
    // Callback that is executed before request
    beforeSend: empty,
    // Callback that is executed if the request succeeds
    success: empty,
    // Callback that is executed the the server drops error
    error: empty,
    // Callback that is executed on request complete (both: error and success)
    complete: empty,
    // The context for the callbacks
    context: null,
    // Whether to trigger "global" Ajax events
    global: true,
    // Transport
    xhr: function (): XMLHttpRequest {
      return new window.XMLHttpRequest()
    },
    // MIME types mapping
    // IIS returns Javascript as "application/x-javascript"
    accepts: {
      script: 'text/javascript, application/javascript, application/x-javascript',
      json: jsonType,
      xml: 'application/xml, text/xml',
      html: htmlType,
      text: 'text/plain',
    },
    // Whether the request is to another domain
    crossDomain: false,
    // Default timeout
    timeout: 0,
    // Whether data should be serialized to string
    processData: true,
    // Whether the browser should be allowed to cache GET responses
    cache: true,
    //Used to handle the raw response data of XMLHttpRequest.
    //This is a pre-filtering function to sanitize the response.
    //The sanitized response should be returned
    dataFilter: empty,
  }

  function mimeToDataType(mime: string | null): string {
    let m: string | null = mime
    if (m) m = m.split(';', 2)[0]
    return (
      (m &&
        (m == htmlType
          ? 'html'
          : m == jsonType
            ? 'json'
            : scriptTypeRE.test(m)
              ? 'script'
              : xmlTypeRE.test(m) && 'xml')) ||
      'text'
    )
  }

  function appendQuery(url: string, query: string): string {
    if (query == '') return url
    return (url + '&' + query).replace(/[&?]{1,2}/, '?')
  }

  // serialize payload and append it to the URL for GET requests
  function serializeData(options: FullAjaxSettings): void {
    if (options.processData && options.data && $.type(options.data) != 'string')
      options.data = $.param(options.data as PlainObject, options.traditional)
    if (
      options.data &&
      (!options.type || options.type.toUpperCase() == 'GET' || 'jsonp' == options.dataType)
    ) {
      options.url = appendQuery(options.url as string, options.data as string)
      options.data = undefined
    }
  }

  $.ajax = function (options: AjaxSettings): XMLHttpRequest {
    const settings = $.extend({}, options || {}) as FullAjaxSettings
    const deferred = $.Deferred() as AjaxDeferred
    let hashIndex: number
    const defaults = ($ as unknown as AjaxStatic).ajaxSettings
    const s = settings as Record<string, unknown>
    const d = defaults as Record<string, unknown>
    for (const key in defaults) if (s[key] === undefined) s[key] = d[key]

    ajaxStart(settings)

    if (!settings.crossDomain) {
      const urlAnchor = new URL(settings.url as string, window.location.href)
      settings.crossDomain =
        window.location.protocol + '//' + window.location.host !==
        urlAnchor.protocol + '//' + urlAnchor.host
    }

    if (!settings.url) settings.url = window.location.toString()
    if ((hashIndex = settings.url.indexOf('#')) > -1)
      settings.url = settings.url.slice(0, hashIndex)
    serializeData(settings)

    let dataType = settings.dataType
    const hasPlaceholder = /\?.+=\?/.test(settings.url)
    if (hasPlaceholder) dataType = 'jsonp'

    if (
      settings.cache === false ||
      ((!options || options.cache !== true) && ('script' == dataType || 'jsonp' == dataType))
    )
      settings.url = appendQuery(settings.url, '_=' + Date.now())

    if ('jsonp' == dataType) {
      if (!hasPlaceholder)
        settings.url = appendQuery(
          settings.url,
          settings.jsonp ? settings.jsonp + '=?' : settings.jsonp === false ? '' : 'callback=?'
        )
      return $.ajaxJSONP(settings, deferred) as XMLHttpRequest
    }

    let mime = settings.accepts[dataType as string]
    const headers: Record<string, string> = {}
    const setHeader = function (name: string, value: string): void {
      headers[name] = value
    }

    if (!settings.crossDomain) setHeader('X-Requested-With', 'XMLHttpRequest')
    setHeader('Accept', mime || '*/*')

    if (
      settings.contentType ||
      (settings.contentType !== false && settings.data && settings.type.toUpperCase() != 'GET')
    )
      setHeader('Content-Type', settings.contentType || 'application/x-www-form-urlencoded')

    if (settings.headers)
      for (const name in settings.headers) setHeader(name, settings.headers[name])

    // --- fetch-based transport ---
    const protocolMatch = /^([\w-]+):\/\//.exec(settings.url)
    const protocol = protocolMatch ? protocolMatch[1] : window.location.protocol
    const abortController = new AbortController()
    const fetchMethod = (settings.type || 'GET').toUpperCase()
    const fetchHeaders = new Headers(headers)
    const fetchBody: BodyInit | undefined =
      fetchMethod === 'GET' || fetchMethod === 'HEAD'
        ? undefined
        : settings.data != null
          ? String(settings.data)
          : undefined

    const fetchInit: RequestInit = {
      method: fetchMethod,
      headers: fetchHeaders,
      body: fetchBody,
      signal: abortController.signal,
    }
    if (settings.xhrFields && (settings.xhrFields as Record<string, unknown>).withCredentials)
      fetchInit.credentials = 'include'

    // XHR-shaped shim returned to callers — populated when the fetch resolves
    let _status = 0,
      _statusText = '',
      _responseText = ''
    const _responseHeaders = new Map<string, string>()

    const xhr = {
      get readyState() {
        return _status !== 0 || _responseText ? 4 : 0
      },
      get status() {
        return _status
      },
      get statusText() {
        return _statusText
      },
      get responseText() {
        return _responseText
      },
      getResponseHeader(name: string): string | null {
        return _responseHeaders.get(name.toLowerCase()) || null
      },
      getAllResponseHeaders(): string {
        let s = ''
        _responseHeaders.forEach((v, k) => {
          s += `${k}: ${v}\r\n`
        })
        return s
      },
      abort(): void {
        abortController.abort()
      },
      setRequestHeader(): void {},
    }

    if (deferred) deferred.promise(xhr)

    let abortTimeout: ReturnType<typeof setTimeout> | undefined

    if (ajaxBeforeSend(xhr, settings) === false) {
      abortController.abort()
      ajaxError(null, 'abort', xhr, settings, deferred)
      return xhr as XMLHttpRequest
    }

    if (settings.timeout > 0)
      abortTimeout = setTimeout((): void => {
        abortController.abort()
        ajaxError(null, 'timeout', xhr, settings, deferred)
      }, settings.timeout)

    fetch(settings.url, fetchInit)
      .then(async (response): Promise<void> => {
        clearTimeout(abortTimeout)
        _status = response.status
        _statusText = response.statusText
        response.headers.forEach((v, k) => _responseHeaders.set(k.toLowerCase(), v))

        let result: unknown
        let resolvedDataType: string | undefined = dataType
        resolvedDataType = resolvedDataType || mimeToDataType(response.headers.get('content-type'))

        const xhrResponseType = (settings.xhrFields as Record<string, string> | undefined)
          ?.responseType
        if (xhrResponseType === 'arraybuffer') result = await response.arrayBuffer()
        else if (xhrResponseType === 'blob') result = await response.blob()
        else {
          _responseText = await response.text()
          result = _responseText

          try {
            result = ajaxDataFilter(result, resolvedDataType, settings)
            if (resolvedDataType === 'script') (1, eval)(result as string)
            else if (resolvedDataType === 'xml')
              result = new DOMParser().parseFromString(result as string, 'application/xml')
            else if (resolvedDataType === 'json')
              result = blankRE.test(result as string) ? null : $.parseJSON(result as string)
          } catch (e) {
            ajaxError(e, 'parsererror', xhr, settings, deferred)
            return
          }
        }

        if (
          response.ok ||
          response.status === 304 ||
          (response.status === 0 && protocol === 'file:')
        ) {
          ajaxSuccess(result, xhr, settings, deferred)
        } else {
          ajaxError(
            response.statusText || null,
            response.status ? 'error' : 'abort',
            xhr,
            settings,
            deferred
          )
        }
      })
      .catch((err: Error): void => {
        clearTimeout(abortTimeout)
        if (err.name === 'AbortError') {
          ajaxError(null, 'abort', xhr, settings, deferred)
        } else {
          ajaxError(err, 'error', xhr, settings, deferred)
        }
      })

    return xhr as XMLHttpRequest
  }

  // handle optional data/success arguments
  function parseArguments(
    url: string,
    data?: unknown,
    success?: unknown,
    dataType?: unknown
  ): AjaxSettings {
    let d = data,
      s = success,
      dt = dataType
    if ($.isFunction(d)) {
      dt = s
      s = d
      d = undefined
    }
    if (!$.isFunction(s)) {
      dt = s
      s = undefined
    }
    return {
      url: url,
      data: d as PlainObject | string | FormData,
      success: s as AjaxSuccessCallback,
      dataType: dt as AjaxSettings['dataType'],
    }
  }

  $.get = function (
    url: string,
    data?: PlainObject | string,
    success?: AjaxSuccessCallback,
    dataType?: string
  ): XMLHttpRequest {
    return $.ajax(parseArguments(url, data, success, dataType))
  }

  $.post = function (
    url: string,
    data?: PlainObject | string,
    success?: AjaxSuccessCallback,
    dataType?: string
  ): XMLHttpRequest {
    const options = parseArguments(url, data, success, dataType)
    options.type = 'POST'
    return $.ajax(options)
  }

  $.getJSON = function (
    url: string,
    data?: PlainObject | string,
    success?: AjaxSuccessCallback
  ): XMLHttpRequest {
    const options = parseArguments(url, data, success)
    options.dataType = 'json'
    return $.ajax(options)
  }

  $.fn.load = function (
    this: MeptoCollection,
    url: string,
    data?: unknown,
    success?: unknown
  ): MeptoCollection {
    if (!this.length) return this
    const self = this,
      parts = url.split(/\s/),
      options = parseArguments(url, data, success),
      callback = options.success
    let selector: string | undefined
    if (parts.length > 1) {
      options.url = parts[0]
      selector = parts[1]
    }
    options.success = function (response: unknown): void {
      self.html(
        selector
          ? $('<div>')
              .html((response as string).replace(rscript, ''))
              .find(selector)
          : (response as string)
      )
      if (callback) callback.apply(self, arguments as unknown as [unknown, string, XMLHttpRequest])
    }
    $.ajax(options)
    return this
  }

  const escape = encodeURIComponent

  function serialize(
    params: SerialParams,
    obj: unknown,
    traditional: boolean,
    scope: string | undefined
  ): void {
    const array = $.isArray(obj),
      hash = $.isPlainObject(obj)
    let type: string
    $.each(obj as Record<string, unknown>, (key: string | number, value: unknown): void => {
      type = $.type(value)
      let name = String(key)
      if (scope)
        name = traditional
          ? scope
          : scope + '[' + (hash || type == 'object' || type == 'array' ? key : '') + ']'
      // handle data in serializeArray() format
      if (!scope && array)
        params.add((value as { name: string }).name, (value as { value: unknown }).value)
      // recurse into nested objects
      else if (type == 'array' || (!traditional && type == 'object'))
        serialize(params, value, traditional, name)
      else params.add(name, value)
    })
  }

  $.param = function (obj: PlainObject | unknown[], traditional?: boolean): string {
    const params = [] as unknown as SerialParams
    params.add = function (key: string, value: unknown): void {
      let v = value
      if ($.isFunction(v)) v = (v as (...args: unknown[]) => unknown)()
      if (v == null) v = ''
      this.push(escape(key) + '=' + escape(v as string))
    }
    serialize(params, obj, traditional, undefined)
    return params.join('&').replace(/%20/g, '+')
  }
})(mepto)
