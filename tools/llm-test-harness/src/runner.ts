/**
 * Puppeteer runner for LLM test execution
 * Manages browser instances and executes code in isolated contexts
 */

import puppeteer, { Browser, Page, ConsoleMessage, PuppeteerLaunchOptions } from 'puppeteer'
import { sanitize, wrapInContext, SanitizationResult } from './security/sanitizer'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface TestOptions {
  code: string
  html?: string
  url?: string
  timeout?: number
  headless?: boolean
  width?: number
  height?: number
  collectConsole?: boolean
  /** Port the Vite dev server is listening on (used to build script URLs) */
  port?: number
}

/** One case in a batch run. `html` is optional per-case; defaults are merged in. */
export interface BatchCase {
  /** Label for the case, surfaced in the results for readability. */
  name: string
  /** JavaScript code to execute. Use `return`/`assert`/`expect` as usual. */
  code: string
  /** Optional HTML fixture for this case only. */
  html?: string
  /** Optional per-case timeout override (ms). */
  timeout?: number
  /** Optional per-case viewport override (px). */
  width?: number
  /** Optional per-case viewport override (px). */
  height?: number
}

/** Roll-up of a batch run. */
export interface BatchResult {
  results: BatchCaseResult[]
  summary: {
    total: number
    passed: number
    failed: number
    /** Cases that errored (didn't execute cleanly), distinct from assert-fail. */
    errored: number
    duration: number
  }
}

/** A single case's outcome within a BatchResult. Mirrors TestResult minus the
 *  security/timing envelope, plus the case `name`. */
export interface BatchCaseResult {
  name: string
  success: boolean
  passed: boolean
  result?: unknown
  assertions: AssertionTally | null
  error?: string
  stack?: string
  console: ConsoleEntry[]
}

/** Outcome of running one case under BOTH Mepto and jQuery, with a diff flag. */
export interface ComparisonCaseResult {
  name: string
  mepto: BatchCaseResult
  jquery: BatchCaseResult
  /** True iff both libs produced the same `result` (deep-equal) and the same
   *  error/no-error. Assertion tallies are reported but do not gate `match` —
   *  assertions describe the test's expectations, not library behavior. */
  match: boolean
}

/** Roll-up of a compare run. */
export interface CompareResult {
  results: ComparisonCaseResult[]
  summary: {
    total: number
    matched: number
    differed: number
    duration: number
  }
}

export interface AssertionTally {
  passed: number
  failed: number
  failures: string[]
}

export interface TestResult {
  /** True iff the code executed without throwing. Independent of assertions. */
  success: boolean
  /** True iff `success` AND no recorded assertion failed. Equals `success`
   *  when the test used no assertions (just `return`). */
  passed: boolean
  /** The user code's return value (or resolved Promise value). */
  result?: unknown
  /** Tally from assert()/expect() calls, or null if none were used. */
  assertions: AssertionTally | null
  error?: string
  stack?: string
  console: ConsoleEntry[]
  timing: {
    start: string
    end: string
    duration: number
  }
  security: {
    safe: boolean
    violations: string[]
    warnings: string[]
  }
}

/** Internal: raw outcome from execute(). */
type ExecutionResult = {
  result?: unknown
  assertions?: AssertionTally | null
  error?: string
  stack?: string
}

export interface ConsoleEntry {
  type: 'log' | 'error' | 'warn' | 'info' | 'debug'
  message: string
  timestamp: string
}

const DEFAULT_TIMEOUT = 5000
const DEFAULT_VIEWPORT = { width: 1280, height: 720 }

/**
 * Resolve the on-disk path to the bundled jQuery build, used by the compare
 * feature to inject jQuery as `$` via page.addScriptTag. Returns null if
 * jQuery isn't installed (compare unavailable).
 */
function jqueryPath(): string | null {
  for (const candidate of [
    path.join(__dirname, '..', 'node_modules', 'jquery', 'dist', 'jquery.js'),
    path.join(__dirname, '..', '..', '..', 'node_modules', 'jquery', 'dist', 'jquery.js'),
  ]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Structural deep-equal for comparing Mepto vs jQuery results. Handles
 * primitives, plain objects, and arrays. DOM nodes and functions compare by
 * reference (effectively unequal across libs) — tests that care should return
 * serializable values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]))
  }
  const ak = Object.keys(a as object)
  const bk = Object.keys(b as object)
  if (ak.length !== bk.length) return false
  return ak.every(k =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  )
}

export class TestRunner {
  private browser: Browser | null = null
  private page: Page | null = null
  private consoleEntries: ConsoleEntry[] = []

  /**
   * Initialize the browser
   */
  private findChrome(): string | undefined {
    const platform = os.platform()
    const candidates: string[] = []

    if (platform === 'darwin') {
      candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      candidates.push('/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary')
      candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
      candidates.push(
        path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      )
    } else if (platform === 'linux') {
      candidates.push('/usr/bin/google-chrome')
      candidates.push('/usr/bin/google-chrome-stable')
      candidates.push('/usr/bin/chromium')
      candidates.push('/usr/bin/chromium-browser')
    } else if (platform === 'win32') {
      candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      candidates.push('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')
    }

    for (const c of candidates) {
      try {
        fs.accessSync(c, fs.constants.X_OK)
        return c
      } catch {
        // not found or not executable
      }
    }
    return undefined
  }

  async init(headless: boolean | 'new' = true): Promise<void> {
    const launchOptions: PuppeteerLaunchOptions = {
      headless: headless === true ? 'new' : headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security', // For local testing only
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    }

    const chromePath = this.findChrome()
    if (chromePath) {
      launchOptions.executablePath = chromePath
    }

    this.browser = await puppeteer.launch(launchOptions)
  }

  /**
   * Create a new isolated page with security settings
   */
  async createPage(width?: number, height?: number): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.')
    }

    this.page = await this.browser.newPage()
    this.consoleEntries = []

    // Set viewport
    await this.page.setViewport({
      width: width || DEFAULT_VIEWPORT.width,
      height: height || DEFAULT_VIEWPORT.height,
    })

    // Runtime sandbox: neuter storage, navigation, clipboard, and document
    // mutation APIs that the sanitizer can only flag as advisory (string-
    // matching source is bypassable, so the page is the real boundary). Each
    // override throws so a test that genuinely reaches for one gets a clear
    // message rather than silent no-op confusion. eval/Function are NOT
    // neutered here — the harness's own execution path uses eval (see execute).
    await this.page.evaluateOnNewDocument(() => {
      // Dialogs
      window.alert = () => {}
      window.confirm = () => false
      window.prompt = () => null

      const block = (name: string) => () => {
        throw new Error(`[${name}] is disabled in the test sandbox`)
      }

      // Storage / cookie exfiltration
      try {
        Object.defineProperty(window, 'localStorage', {
          get: block('localStorage'),
          configurable: true,
        })
      } catch {
        /* readonly on some embeds */
      }
      try {
        Object.defineProperty(window, 'sessionStorage', {
          get: block('sessionStorage'),
          configurable: true,
        })
      } catch {
        /* readonly */
      }
      try {
        Object.defineProperty(window, 'indexedDB', { get: block('indexedDB'), configurable: true })
      } catch {
        /* readonly */
      }
      try {
        Object.defineProperty(document, 'cookie', {
          get: block('document.cookie'),
          set: block('document.cookie'),
          configurable: true,
        })
      } catch {
        /* readonly */
      }

      // Navigation / popups (location setters would navigate away from the page)
      try {
        Object.defineProperty(window, 'open', { value: block('window.open'), configurable: true })
      } catch {
        /* */
      }
      const blockLocation = (prop: string) => {
        try {
          const desc = Object.getOwnPropertyDescriptor(window.location, prop) || {}
          Object.defineProperty(window.location, prop, {
            ...desc,
            set: block('window.location.' + prop),
            configurable: true,
          })
        } catch {
          /* location is sometimes non-configurable */
        }
      }
      blockLocation('href')
      // replace/assign are methods, not setters — override directly
      try {
        window.location.replace = block('location.replace')
      } catch {
        /* */
      }
      try {
        window.location.assign = block('location.assign')
      } catch {
        /* */
      }

      // Document mutation that rewrites the parsed DOM
      try {
        ;(document as any).write = block('document.write')
      } catch {
        /* */
      }
      try {
        ;(document as any).writeln = block('document.writeln')
      } catch {
        /* */
      }

      // Clipboard
      try {
        Object.defineProperty(navigator, 'clipboard', {
          get: block('navigator.clipboard'),
          configurable: true,
        })
      } catch {
        /* navigator.clipboard may be readonly */
      }
      try {
        navigator.sendBeacon = block('navigator.sendBeacon')
      } catch {
        /* */
      }
    })

    // Listen to console messages
    this.page.on('console', (msg: ConsoleMessage) => {
      this.consoleEntries.push({
        type: msg.type() as ConsoleEntry['type'],
        message: msg.text(),
        timestamp: new Date().toISOString(),
      })
    })

    // Block external navigation
    await this.page.setRequestInterception(true)
    this.page.on('request', req => {
      const url = req.url()
      if (url.startsWith('data:') || url.startsWith('http://localhost')) {
        req.continue()
      } else {
        req.abort()
      }
    })

    return this.page
  }

  /**
   * Load HTML content into the page
   * @param html  HTML fixture string
   * @param port  Port the Vite dev server is actually listening on
   */
  async loadHTML(html: string, port = 3000): Promise<void> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.')
    }

    // Navigate to the actual Vite-hosted blank page so Mepto loads from
    // the same origin and we avoid the document.write / cross-origin
    // parser-blocking issues that plague page.setContent().
    const blankUrl = `http://localhost:${port}/test/blank.html`
    await this.page.goto(blankUrl, { waitUntil: 'networkidle0' })

    // Inject the fixture HTML into the test container
    if (html && html.trim()) {
      await this.page.evaluate(fixtureHtml => {
        const container = document.getElementById('test-container')
        if (container) {
          container.innerHTML = fixtureHtml
        } else {
          // Fallback if blank.html template ever changes
          const div = document.createElement('div')
          div.innerHTML = fixtureHtml
          document.body.appendChild(div)
        }
      }, html)
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.')
    }

    await this.page.goto(url, { waitUntil: 'networkidle0' })
  }

  /**
   * Execute code in the page context.
   *
   * The user code runs inside an async IIFE so that:
   *   - top-level `return` works (the wrapper becomes `async function(){ ... }`),
   *   - returned/awaited Promises are awaited before serialization — async test
   *     code (AJAX, Deferreds, fadeIn, rAF) resolves to a real value instead of
   *     the empty object that Promise serializes to.
   *
   * Before running, an assertion API (assert/expect) is injected onto the page
   * so test code can record pass/fail checks. The tally is returned alongside
   * the user's value.
   */
  async execute(code: string, _timeout = DEFAULT_TIMEOUT): Promise<ExecutionResult> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.')
    }

    // Reset the assertion tally and (re)inject the API for this run.
    await this.page.evaluate(() => {
      const tally = { passed: 0, failed: 0, failures: [] as string[] }
      ;(window as any).__meptoAssertions__ = tally
      ;(window as any).assert = (cond: any, msg?: string) => {
        const label = msg ?? String(cond)
        if (cond) {
          tally.passed++
        } else {
          tally.failed++
          tally.failures.push(label)
        }
        return !!cond
      }
      ;(window as any).expect = (actual: any) => {
        const record = (cond: boolean, negated: boolean, label: string) => {
          const ok = negated ? !cond : cond
          if (ok) tally.passed++
          else {
            tally.failed++
            tally.failures.push(label)
          }
          return ok
        }
        // Build the chain. `.not` flips polarity; without it polarity is positive.
        const positive = {
          toEqual: (expected: any) =>
            record(actual === expected, false, `toEqual ${JSON.stringify(expected)}`),
          toBe: (expected: any) =>
            record(actual === expected, false, `toBe ${JSON.stringify(expected)}`),
          toBeTruthy: () => record(!!actual, false, `toBeTruthy`),
          toBeFalsy: () => record(!actual, false, `toBeFalsy`),
          get not() {
            return {
              toEqual: (expected: any) =>
                record(actual === expected, true, `not.toEqual ${JSON.stringify(expected)}`),
              toBe: (expected: any) =>
                record(actual === expected, true, `not.toBe ${JSON.stringify(expected)}`),
              toBeTruthy: () => record(!!actual, true, `not.toBeTruthy`),
              toBeFalsy: () => record(!actual, true, `not.toBeFalsy`),
            }
          },
        }
        return positive
      }
    })

    // Wrap in an ASYNC IIFE so `return` works AND awaited values resolve.
    const wrapped = `(async function() {\n${code}\n})()`

    try {
      const result = await this.page.evaluate(async js => {
        try {
          // eslint-disable-next-line no-eval
          const value = eval(js)
          // Await promises so async test code (fetch, Deferreds, animations)
          // resolves to a real value instead of serializing to {}.
          const resolved = value && typeof value.then === 'function' ? await value : value
          const tally = (window as any).__meptoAssertions__
          return {
            result: resolved,
            assertions: tally
              ? { passed: tally.passed, failed: tally.failed, failures: tally.failures }
              : null,
          }
        } catch (e) {
          const tally = (window as any).__meptoAssertions__
          return {
            error: (e as Error).message,
            stack: (e as Error).stack,
            assertions: tally
              ? { passed: tally.passed, failed: tally.failed, failures: tally.failures }
              : null,
          }
        }
      }, wrapped)

      return result
    } catch (e) {
      return {
        error: (e as Error).message,
        stack: (e as Error).stack,
      }
    }
  }

  /**
   * Run a complete test with sanitization and execution
   */
  async runTest(options: TestOptions): Promise<TestResult> {
    const startTime = Date.now()
    const startISO = new Date().toISOString()

    // Sanitize code
    const sanitization: SanitizationResult = sanitize(options.code)

    if (!sanitization.safe) {
      return {
        success: false,
        passed: false,
        assertions: null,
        error: sanitization.error,
        console: this.consoleEntries,
        timing: {
          start: startISO,
          end: new Date().toISOString(),
          duration: Date.now() - startTime,
        },
        security: {
          safe: false,
          violations: sanitization.violations,
          warnings: sanitization.warnings,
        },
      }
    }

    try {
      // Initialize if needed
      if (!this.browser) {
        await this.init(options.headless)
      }

      // Create page
      await this.createPage(options.width, options.height)

      // Load content
      const port = options.port || 3000
      if (options.html) {
        await this.loadHTML(options.html, port)
      } else if (options.url) {
        await this.navigate(options.url)
      } else {
        // Default empty page with Mepto loaded
        await this.loadHTML('', port)
      }

      // Execute with timeout
      const executionPromise = this.execute(sanitization.code!, options.timeout)
      const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), options.timeout || DEFAULT_TIMEOUT)
      })

      const execution: ExecutionResult = await Promise.race([
        executionPromise,
        timeoutPromise,
      ]).catch(e => ({
        error: (e as Error).message,
      }))

      const endTime = Date.now()
      const assertions = execution.assertions ?? null

      if (execution.error) {
        return {
          success: false,
          passed: false,
          assertions,
          error: execution.error,
          stack: execution.stack,
          console: this.consoleEntries,
          timing: {
            start: startISO,
            end: new Date().toISOString(),
            duration: endTime - startTime,
          },
          security: {
            safe: true,
            violations: [],
            warnings: sanitization.warnings,
          },
        }
      }

      // success = executed without throwing. passed = success AND no failed
      // assertions. With no assertions used, passed === success.
      const noFailedAssertions = !assertions || assertions.failed === 0

      return {
        success: true,
        passed: noFailedAssertions,
        assertions,
        result: execution.result,
        console: this.consoleEntries,
        timing: {
          start: startISO,
          end: new Date().toISOString(),
          duration: endTime - startTime,
        },
        security: {
          safe: true,
          violations: [],
          warnings: sanitization.warnings,
        },
      }
    } catch (e) {
      return {
        success: false,
        passed: false,
        assertions: null,
        error: (e as Error).message,
        stack: (e as Error).stack,
        console: this.consoleEntries,
        timing: {
          start: startISO,
          end: new Date().toISOString(),
          duration: Date.now() - startTime,
        },
        security: {
          safe: sanitization.safe,
          violations: sanitization.violations,
          warnings: sanitization.warnings,
        },
      }
    }
  }

  /**
   * Run many cases in a single browser session. The browser launches once;
   * each case gets a fresh page (isolation: a case that mutates the DOM or
   * leaves listeners cannot bleed into the next). One case's failure never
   * aborts the rest — every case runs and is reported.
   *
   * Assumes the browser is already initialized (call `init()` first, or let
   * the harness `LLMTestHarness.runBatch` handle it). Defaults for port,
   * viewport, and timeout come from `defaults` and are overridden per-case.
   */
  async runBatch(
    cases: BatchCase[],
    defaults: { port?: number; width?: number; height?: number; timeout?: number }
  ): Promise<BatchResult> {
    const results: BatchCaseResult[] = []
    const batchStart = Date.now()

    for (const c of cases) {
      const caseStart = Date.now()
      const caseConsole: ConsoleEntry[] = []

      try {
        // Close the previous case's page so each case runs in a fresh, isolated
        // page without leaking pages across the batch.
        if (this.page) {
          await this.page.close().catch(() => {
            /* page may already be gone */
          })
          this.page = null
        }
        // Fresh page per case for isolation.
        await this.createPage(c.width ?? defaults.width, c.height ?? defaults.height)

        // Redirect this case's console into its own bucket. createPage resets
        // consoleEntries to [], and the page.on('console') handler pushes into
        // this.consoleEntries, so we snapshot it after execution.
        const port = defaults.port || 3000
        if (c.html !== undefined) {
          await this.loadHTML(c.html, port)
        } else {
          await this.loadHTML('', port)
        }

        // Sanitize per case so a security violation is reported, not fatal.
        const sanitization = sanitize(c.code)
        if (!sanitization.safe) {
          results.push({
            name: c.name,
            success: false,
            passed: false,
            assertions: null,
            error: sanitization.error ?? 'Security violations detected',
            console: [...this.consoleEntries],
          })
          continue
        }

        const timeout = c.timeout ?? defaults.timeout ?? DEFAULT_TIMEOUT
        const executionPromise = this.execute(sanitization.code!, timeout)
        const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
          setTimeout(() => reject(new Error('Execution timeout')), timeout)
        })
        const execution: ExecutionResult = await Promise.race([
          executionPromise,
          timeoutPromise,
        ]).catch(e => ({ error: (e as Error).message }))

        const assertions = execution.assertions ?? null
        const noFailedAssertions = !assertions || assertions.failed === 0
        results.push({
          name: c.name,
          success: !execution.error,
          passed: !execution.error && noFailedAssertions,
          result: execution.result,
          assertions,
          error: execution.error,
          stack: execution.stack,
          console: [...this.consoleEntries],
        })
      } catch (e) {
        // A thrown error in the harness plumbing (not the test code) — record
        // and continue to the next case.
        results.push({
          name: c.name,
          success: false,
          passed: false,
          assertions: null,
          error: (e as Error).message,
          stack: (e as Error).stack,
          console: [...this.consoleEntries],
        })
      }
    }

    const passed = results.filter(r => r.passed).length
    const errored = results.filter(r => !r.success).length
    return {
      results,
      summary: {
        total: results.length,
        passed,
        failed: results.length - passed,
        errored,
        duration: Date.now() - batchStart,
      },
    }
  }

  /**
   * Run each case against BOTH Mepto and jQuery (each exposed as `$`) and diff
   * the results. Mepto runs first (it's already on `window.$` from blank.html);
   * then jQuery is injected via addScriptTag and `window.$` is reassigned, the
   * fixture HTML is re-injected so both libs see identical clean DOM, and the
   * same code runs again. Browser launches once; each case gets a fresh page.
   *
   * Throws up front if jQuery isn't installed.
   */
  async runCompare(
    cases: BatchCase[],
    defaults: { port?: number; width?: number; height?: number; timeout?: number }
  ): Promise<CompareResult> {
    const jqPath = jqueryPath()
    if (!jqPath) {
      throw new Error(
        'jQuery not found. Install it in tools/llm-test-harness: `npm install jquery`'
      )
    }

    const results: ComparisonCaseResult[] = []
    const compareStart = Date.now()
    const port = defaults.port || 3000
    const timeout = defaults.timeout ?? DEFAULT_TIMEOUT

    for (const c of cases) {
      try {
        // --- Mepto run ---
        if (this.page) {
          await this.page.close().catch(() => {})
          this.page = null
        }
        await this.createPage(c.width ?? defaults.width, c.height ?? defaults.height)
        await this.loadHTML(c.html ?? '', port)
        const sanitization = sanitize(c.code)
        const meptoResult: BatchCaseResult = !sanitization.safe
          ? {
              name: c.name,
              success: false,
              passed: false,
              assertions: null,
              error: sanitization.error ?? 'Security violations detected',
              console: [...this.consoleEntries],
            }
          : await this.runOne(c.name, sanitization.code!, timeout)

        // --- jQuery run (same page, swap the $ binding) ---
        // Clear Mepto's globals so jQuery's UMD factory doesn't interleave,
        // inject jQuery, then reassign $ to it. Re-inject fixture HTML so both
        // libs operate on identical clean DOM.
        await this.page!.addScriptTag({ path: jqPath })
        await this.page!.evaluate(fixtureHtml => {
          // jQuery's UMD binds window.jQuery and window.$. Re-point $ at jQuery
          // explicitly (Mepto's $ is already shadowed by jQuery's, but be
          // explicit to avoid ordering ambiguity).
          ;(window as any).$ = (window as any).jQuery
          // Reset the fixture container so jQuery sees the same starting DOM.
          const container = document.getElementById('test-container')
          if (container) container.innerHTML = fixtureHtml
          else {
            const div = document.createElement('div')
            div.innerHTML = fixtureHtml
            document.body.appendChild(div)
          }
          // Reset the assertion tally so jQuery's run starts clean.
          ;(window as any).__meptoAssertions__ = { passed: 0, failed: 0, failures: [] }
        }, c.html ?? '')

        const jqueryResult: BatchCaseResult = !sanitization.safe
          ? {
              name: c.name,
              success: false,
              passed: false,
              assertions: null,
              error: sanitization.error ?? 'Security violations detected',
              console: [...this.consoleEntries],
            }
          : await this.runOne(c.name, sanitization.code!, timeout)

        const match =
          meptoResult.success === jqueryResult.success &&
          !!meptoResult.error === !!jqueryResult.error &&
          (!meptoResult.error || meptoResult.error === jqueryResult.error) &&
          deepEqual(meptoResult.result, jqueryResult.result)

        results.push({ name: c.name, mepto: meptoResult, jquery: jqueryResult, match })
      } catch (e) {
        // Harness plumbing failure — record both as errored, no match.
        const err: BatchCaseResult = {
          name: c.name,
          success: false,
          passed: false,
          assertions: null,
          error: (e as Error).message,
          stack: (e as Error).stack,
          console: [],
        }
        results.push({ name: c.name, mepto: err, jquery: err, match: false })
      }
    }

    const matched = results.filter(r => r.match).length
    return {
      results,
      summary: {
        total: results.length,
        matched,
        differed: results.length - matched,
        duration: Date.now() - compareStart,
      },
    }
  }

  /**
   * Execute sanitized code and wrap the outcome as a BatchCaseResult. Shared by
   * runBatch and runCompare so both paths produce the same result shape.
   */
  private async runOne(name: string, code: string, timeout: number): Promise<BatchCaseResult> {
    const executionPromise = this.execute(code, timeout)
    const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeout)
    })
    const execution: ExecutionResult = await Promise.race([executionPromise, timeoutPromise]).catch(
      e => ({ error: (e as Error).message })
    )

    const assertions = execution.assertions ?? null
    const noFailedAssertions = !assertions || assertions.failed === 0
    return {
      name,
      success: !execution.error,
      passed: !execution.error && noFailedAssertions,
      result: execution.result,
      assertions,
      error: execution.error,
      stack: execution.stack,
      console: [...this.consoleEntries],
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}

// Singleton instance for reuse
let runnerInstance: TestRunner | null = null

export function getRunner(): TestRunner {
  if (!runnerInstance) {
    runnerInstance = new TestRunner()
  }
  return runnerInstance
}

export function resetRunner(): void {
  runnerInstance = null
}
