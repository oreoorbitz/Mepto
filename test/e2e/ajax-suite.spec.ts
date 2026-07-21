import { test, expect } from '@playwright/test'

// Helper: evaluate with a promise that resolves when the AJAX call completes
// Route interception is set up before the evaluate runs since Playwright routes
// are page-level and work across evaluate() calls.

test.describe('$.ajax', () => {
  test('basic GET request — success callback receives response text', async ({ page }) => {
    await page.route('**/api/hello', route =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'world' })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({ url: '/api/hello', success: (data: unknown) => resolve(data) })
        })
    )
    expect(result).toBe('world')
  })

  test('basic GET request — returns jqXHR-like object with .status', async ({ page }) => {
    await page.route('**/api/status', route => route.fulfill({ status: 201, body: 'created' }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          const xhr = $.ajax({
            url: '/api/status',
            success: () => resolve({ status: xhr.status, text: xhr.responseText }),
          })
        })
    )
    expect(result).toEqual({ status: 201, text: 'created' })
  })

  test('GET request sends Accept header', async ({ page }) => {
    let capturedHeaders: Record<string, string> = {}
    await page.route('**/api/headers', route => {
      capturedHeaders = route.request().headers()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({ url: '/api/headers', complete: () => resolve(undefined) })
        })
    )
    expect(capturedHeaders.accept).toBeTruthy()
  })

  test('GET request does NOT send Content-Type by default', async ({ page }) => {
    let capturedHeaders: Record<string, string> = {}
    await page.route('**/api/headers2', route => {
      capturedHeaders = route.request().headers()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({ url: '/api/headers2', complete: () => resolve(undefined) })
        })
    )
    expect(capturedHeaders['content-type']).toBeUndefined()
  })

  test('POST request sends Content-Type: application/x-www-form-urlencoded by default', async ({
    page,
  }) => {
    let capturedHeaders: Record<string, string> = {}
    await page.route('**/api/post', route => {
      capturedHeaders = route.request().headers()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            type: 'POST',
            url: '/api/post',
            data: { a: 1 },
            complete: () => resolve(undefined),
          })
        })
    )
    expect(capturedHeaders['content-type']).toBe('application/x-www-form-urlencoded')
  })

  test('custom headers are sent', async ({ page }) => {
    let capturedHeaders: Record<string, string> = {}
    await page.route('**/api/custom-headers', route => {
      capturedHeaders = route.request().headers()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/custom-headers',
            headers: { 'X-Custom': 'my-value' },
            complete: () => resolve(undefined),
          })
        })
    )
    expect(capturedHeaders['x-custom']).toBe('my-value')
  })

  test('dataType json — auto-parses JSON response', async ({ page }) => {
    await page.route('**/api/json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: 'value', num: 42 }),
      })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({ url: '/api/json', dataType: 'json', success: (data: unknown) => resolve(data) })
        })
    )
    expect(result).toEqual({ key: 'value', num: 42 })
  })

  test('dataType json — handles empty response', async ({ page }) => {
    await page.route('**/api/json-empty', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '' })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/json-empty',
            dataType: 'json',
            success: (data: unknown) => resolve(data),
          })
        })
    )
    expect(result).toBeNull()
  })

  test('error callback fires on non-2xx status', async ({ page }) => {
    await page.route('**/api/error-500', route =>
      route.fulfill({ status: 500, statusText: 'Internal Server Error', body: 'boom' })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/error-500',
            success: () => resolve('success'),
            error: (xhr: XMLHttpRequest) => resolve({ error: true, status: xhr.status }),
          })
        })
    )
    expect(result).toEqual({ error: true, status: 500 })
  })

  test('error callback fires on 404', async ({ page }) => {
    await page.route('**/api/not-found', route => route.fulfill({ status: 404 }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/not-found',
            error: () => resolve('error'),
            success: () => resolve('success'),
          })
        })
    )
    expect(result).toBe('error')
  })

  test('complete callback fires after success', async ({ page }) => {
    await page.route('**/api/complete', route => route.fulfill({ status: 200, body: 'ok' }))
    await page.goto('/')
    const order: string[] = await page.evaluate(
      () =>
        new Promise(resolve => {
          const events: string[] = []
          $.ajax({
            url: '/api/complete',
            success: () => events.push('success'),
            complete: () => {
              events.push('complete')
              resolve(events)
            },
          })
        })
    )
    expect(order).toEqual(['success', 'complete'])
  })

  test('complete callback fires after error', async ({ page }) => {
    await page.route('**/api/complete-error', route => route.fulfill({ status: 500 }))
    await page.goto('/')
    const order: string[] = await page.evaluate(
      () =>
        new Promise(resolve => {
          const events: string[] = []
          $.ajax({
            url: '/api/complete-error',
            error: () => events.push('error'),
            complete: () => {
              events.push('complete')
              resolve(events)
            },
          })
        })
    )
    expect(order).toEqual(['error', 'complete'])
  })

  test('beforeSend can cancel request by returning false', async ({ page }) => {
    await page.route('**/api/cancelled', route =>
      route.fulfill({ status: 200, body: 'should not trigger success' })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/cancelled',
            beforeSend: () => false,
            success: () => resolve('success'),
            error: () => resolve('error'),
          })
          // When beforeSend returns false, the XHR is aborted via ajaxBeforeSend.
          // The error callback fires with type 'abort'.
          setTimeout(() => resolve('timeout'), 1000)
        })
    )
    expect(result).toBe('error')
  })

  test('context binding — callbacks receive context as this', async ({ page }) => {
    await page.route('**/api/context', route => route.fulfill({ status: 200, body: 'ok' }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          const ctx = { marker: 'ctx-value' }
          $.ajax({
            url: '/api/context',
            context: ctx,
            success: function (this: unknown) {
              resolve((this as Record<string, string>).marker)
            },
          })
        })
    )
    expect(result).toBe('ctx-value')
  })

  test('cache: false appends timestamp query param', async ({ page }) => {
    let capturedUrl = ''
    await page.route('**/api/cached*', route => {
      capturedUrl = route.request().url()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({ url: '/api/cached', cache: false, complete: () => resolve(undefined) })
        })
    )
    expect(capturedUrl).toMatch(/[?&]_=\d+/)
  })
})

test.describe('$.get / $.post / $.getJSON', () => {
  test('$.get sends GET request', async ({ page }) => {
    let capturedMethod = ''
    await page.route('**/api/get-test', route => {
      capturedMethod = route.request().method()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.get('/api/get-test', () => resolve(undefined))
        })
    )
    expect(capturedMethod).toBe('GET')
  })

  test('$.get with data serializes to query string', async ({ page }) => {
    let capturedUrl = ''
    await page.route('**/api/get-query*', route => {
      capturedUrl = route.request().url()
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.get('/api/get-query', { a: 1, b: 'two' }, () => resolve(undefined))
        })
    )
    expect(capturedUrl).toContain('a=1')
    expect(capturedUrl).toContain('b=two')
  })

  test('$.get with data and success callback (argument overloading)', async ({ page }) => {
    await page.route('**/api/overloaded*', route => route.fulfill({ status: 200, body: 'got-it' }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.get('/api/overloaded', { x: 10 }, (data: unknown) => resolve(data))
        })
    )
    expect(result).toBe('got-it')
  })

  test('$.post sends POST request with serialized body', async ({ page }) => {
    let capturedMethod = ''
    let capturedBody = ''
    await page.route('**/api/post-test', route => {
      capturedMethod = route.request().method()
      capturedBody = route.request().postData() || ''
      route.fulfill({ status: 200, body: 'ok' })
    })
    await page.goto('/')
    await page.evaluate(
      () =>
        new Promise(resolve => {
          $.post('/api/post-test', { name: 'test', val: 42 }, () => resolve(undefined))
        })
    )
    expect(capturedMethod).toBe('POST')
    expect(capturedBody).toContain('name=test')
    expect(capturedBody).toContain('val=42')
  })

  test('$.getJSON parses JSON response', async ({ page }) => {
    await page.route('**/api/data.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [1, 2, 3] }),
      })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.getJSON('/api/data.json', (data: unknown) => resolve(data))
        })
    )
    expect(result).toEqual({ items: [1, 2, 3] })
  })
})

test.describe('$.param serialization', () => {
  test('serializes flat object', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ a: 1, b: 'hello', c: true }))
    expect(result).toContain('a=1')
    expect(result).toContain('b=hello')
    expect(result).toContain('c=true')
  })

  test('serializes nested objects with bracket notation', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ a: { b: 2, c: 3 } }))
    expect(result).toContain('a%5Bb%5D=2')
    expect(result).toContain('a%5Bc%5D=3')
  })

  test('serializes arrays', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ tags: ['a', 'b'] }))
    expect(result).toContain('tags%5B%5D=a')
    expect(result).toContain('tags%5B%5D=b')
  })

  test('traditional: true uses flat keys for arrays', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ tags: ['a', 'b'] }, true))
    expect(result).toBe('tags=a&tags=b')
  })

  test('spaces encoded as + not %20', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ q: 'hello world' }))
    expect(result).toBe('q=hello+world')
  })

  test('null/undefined values serialize to empty string', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ a: null, b: undefined }))
    expect(result).toBe('a=&b=')
  })

  test('function values are called and result serialized', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(() => $.param({ a: (): string => 'computed' }))
    expect(result).toBe('a=computed')
  })
})

test.describe('Global AJAX events', () => {
  test('ajaxStart fires before first request, ajaxStop after last', async ({ page }) => {
    await page.route('**/api/events1', route => route.fulfill({ status: 200, body: 'a' }))
    await page.route('**/api/events2', route => route.fulfill({ status: 200, body: 'b' }))
    await page.goto('/')
    const events: string[] = await page.evaluate(
      () =>
        new Promise(resolve => {
          const captured: string[] = []
          $(document)
            .on('ajaxStart', () => captured.push('start'))
            .on('ajaxStop', () => captured.push('stop'))

          $.ajax({ url: '/api/events1', global: true, success: () => captured.push('done1') })
          $.ajax({ url: '/api/events2', global: true, success: () => captured.push('done2') })

          // Wait for all to finish
          const check = setInterval(() => {
            if (captured.filter(e => e === 'done1' || e === 'done2').length === 2) {
              clearInterval(check)
              resolve(captured)
            }
          }, 50)
        })
    )
    // start fires exactly once (before the first request)
    expect(events.filter(e => e === 'start').length).toBe(1)
    // stop fires exactly once (after the last request)
    expect(events.filter(e => e === 'stop').length).toBe(1)
    // start is first event
    expect(events.indexOf('start')).toBe(0)
    // stop is last event
    expect(events[events.length - 1]).toBe('stop')
  })

  test('ajaxSuccess fires with data, ajaxComplete fires after', async ({ page }) => {
    await page.route('**/api/success-event', route =>
      route.fulfill({ status: 200, body: 'payload' })
    )
    await page.goto('/')
    const events = await page.evaluate(
      () =>
        new Promise(resolve => {
          const captured: string[] = []
          $(document)
            .on('ajaxSuccess', () => captured.push('success'))
            .on('ajaxComplete', () => {
              captured.push('complete')
              resolve(captured)
            })

          $.ajax({ url: '/api/success-event', global: true })
        })
    )
    expect(events).toEqual(['success', 'complete'])
  })

  test('ajaxError fires on error, ajaxComplete fires after', async ({ page }) => {
    await page.route('**/api/error-event', route => route.fulfill({ status: 500 }))
    await page.goto('/')
    const events = await page.evaluate(
      () =>
        new Promise(resolve => {
          const captured: string[] = []
          $(document)
            .on('ajaxError', () => captured.push('error'))
            .on('ajaxComplete', () => {
              captured.push('complete')
              resolve(captured)
            })

          $.ajax({ url: '/api/error-event', global: true })
        })
    )
    expect(events).toEqual(['error', 'complete'])
  })

  test('global: false suppresses global events', async ({ page }) => {
    await page.route('**/api/no-global', route => route.fulfill({ status: 200, body: 'ok' }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          let startFired = false
          $(document).on('ajaxStart', () => (startFired = true))

          $.ajax({ url: '/api/no-global', global: false, complete: () => resolve(startFired) })
        })
    )
    expect(result).toBe(false)
  })

  test('$.active counter increments and decrements', async ({ page }) => {
    await page.route('**/api/active1', route => route.fulfill({ status: 200, body: 'a' }))
    await page.route('**/api/active2', route => route.fulfill({ status: 200, body: 'b' }))
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/active1',
            success() {
              $.ajax({
                url: '/api/active2',
                success() {
                  // ajaxStop runs after success, so active hasn't hit 0 yet.
                  // Defer to the microtask queue to read final state.
                  setTimeout(() => resolve($.active), 0)
                },
              })
            },
          })
        })
    )
    expect(result).toBe(0)
  })
})

test.describe('$.fn.load', () => {
  test('loads HTML content into element', async ({ page }) => {
    await page.route('**/api/html-content', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<span class="loaded">done</span>',
      })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          const div = document.createElement('div')
          document.body.appendChild(div)
          $(div).load('/api/html-content', () => {
            resolve(div.innerHTML)
          })
        })
    )
    expect(result).toContain('<span class="loaded">done</span>')
  })

  test('load with selector extracts matching fragment', async ({ page }) => {
    await page.route('**/api/html-fragment', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<div><p class="a">A</p><p class="b">B</p></div>',
      })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          const div = document.createElement('div')
          document.body.appendChild(div)
          $(div).load('/api/html-fragment .b', () => {
            resolve(div.textContent?.trim())
          })
        })
    )
    expect(result).toBe('B')
  })
})

test.describe('Edge cases', () => {
  test('abort via xhr.abort() triggers error callback with abort type', async ({ page }) => {
    // Use a route that delays long enough for us to abort
    await page.route('**/api/slow', async route => {
      await new Promise(r => setTimeout(r, 5000))
      route.fulfill({ status: 200, body: 'too late' })
    })
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          const xhr = $.ajax({
            url: '/api/slow',
            success: () => resolve('success'),
            error: (_xhr: XMLHttpRequest, type: string) => resolve({ errorType: type }),
          })
          setTimeout(() => xhr.abort(), 100)
        })
    )
    expect(result).toEqual({ errorType: 'abort' })
  })

  test('timeout triggers error callback with timeout type', async ({ page }) => {
    // Use route.abort() to simulate a connection that hangs then fails
    await page.route('**/api/timed-out', async route => {
      await new Promise(r => setTimeout(r, 5000))
      route.abort('timedout')
    })
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/timed-out',
            timeout: 100,
            success: () => resolve('success'),
            error: (_xhr: XMLHttpRequest, type: string) => resolve({ errorType: type }),
          })
        })
    )
    expect(result).toEqual({ errorType: 'timeout' })
  })

  test('JSON parse error triggers parsererror type', async ({ page }) => {
    await page.route('**/api/bad-json', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid' })
    )
    await page.goto('/')
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            url: '/api/bad-json',
            dataType: 'json',
            error: (_xhr: XMLHttpRequest, type: string) => resolve(type),
            success: () => resolve('success'),
          })
        })
    )
    expect(result).toBe('parsererror')
  })

  test('settings.url defaults to current page URL', async ({ page }) => {
    await page.goto('/test/blank.html')
    // Intercept AFTER navigation so the page itself loaded
    await page.route('**/test/blank.html', route => {
      // Only intercept XHR/fetch, not document navigation (which already happened)
      if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
        route.fulfill({ status: 200, body: 'default-url-test' })
      } else {
        route.continue()
      }
    })
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          $.ajax({
            // no url — should default to window.location.href
            success: (data: unknown) => resolve(data),
            error: () => resolve('error'),
          })
        })
    )
    expect(result).toBe('default-url-test')
  })
})
