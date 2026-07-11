/**
 * Main entry point for LLM Test Harness
 * Orchestrates Vite server and Puppeteer runner
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import {
  TestRunner,
  TestOptions,
  TestResult,
  BatchCase,
  BatchResult,
  BatchCaseResult,
  CompareResult,
} from './runner'
import { sanitize } from './security/sanitizer'

export interface HarnessOptions extends TestOptions {
  port?: number
  /** Whether to auto-start the Vite dev server (default: true). Set false when a server is already running. */
  startServer?: boolean
  waitForServer?: boolean
  serverTimeout?: number
}

/** Options for a batch run. Defaults applied to every case unless overridden. */
export interface BatchHarnessOptions {
  port?: number
  headless?: boolean
  width?: number
  height?: number
  timeout?: number
  startServer?: boolean
  waitForServer?: boolean
  serverTimeout?: number
}

// Probe whether a Mepto dev server is alive on a given port.
// Returns true only when /test/blank.html responds with HTTP 200.
// ECONNREFUSED resolves instantly on localhost so no long wait on dead ports.
function probeServer(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${port}/test/blank.html`, res => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.setTimeout(500, () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

// Port scan range — MUST match vite.config.ts (PORT_RANGE_START/END), which
// picks the dev server's port from the same range. If these drift, the harness
// can fail to find a server Vite bound to a high port (e.g. 3015).
const PORT_RANGE_START = 3000
const PORT_RANGE_END = 3099

// Scan for a live Mepto dev server.
// Checks the .port hint first (written by Vite's write-port plugin), then
// probes the full range concurrently. ECONNREFUSED is near-instant on
// localhost so this entire scan typically completes in well under 100ms.
async function detectRunningServer(): Promise<number | null> {
  const candidates: number[] = []

  try {
    const hint = parseInt(fs.readFileSync('.port', 'utf8').trim(), 10)
    if (!isNaN(hint)) candidates.push(hint)
  } catch {
    /* .port missing */
  }

  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!candidates.includes(p)) candidates.push(p)
  }

  const results = await Promise.all(
    candidates.map(async p => ({ port: p, alive: await probeServer(p) }))
  )
  return results.find(r => r.alive)?.port ?? null
}

export class LLMTestHarness {
  private viteProcess: ChildProcess | null = null
  private runner: TestRunner
  private port: number
  /** The actual port Vite bound to — detected from its stdout. */
  private actualPort: number
  /** True only when this instance started Vite — controls whether we stop it on cleanup. */
  private serverOwned = false

  constructor(port = 3000) {
    this.runner = new TestRunner()
    this.port = port
    this.actualPort = port
  }

  /**
   * Start Vite dev server.
   * Does NOT pass --port — lets vite.config.ts pick a free port via its own
   * findAvailablePort() scan. The actual port is detected from the "Local:" line.
   */
  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('Starting Vite dev server...')

      // No --port arg: let vite.config.ts run findAvailablePort() and choose.
      // --no-open: suppress the browser-open side-effect.
      this.viteProcess = spawn('npm', ['run', 'dev', '--', '--no-open'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      })

      let resolved = false

      this.viteProcess.stdout?.on('data', data => {
        const str = data.toString()
        console.log(str.trim())

        // Detect the actual port from Vite's "Local:" output line.
        // Example: "➜  Local:   http://localhost:3001/"
        const portMatch = str.match(/Local:\s*https?:\/\/[^/]*:(\d+)/)
        if (portMatch) {
          this.actualPort = parseInt(portMatch[1], 10)
        }

        // Once Vite announces ready, poll until /test/blank.html responds.
        if (!resolved && (str.includes('Local:') || str.includes('ready') || str.includes('➜'))) {
          const poll = () => {
            http
              .get(`http://localhost:${this.actualPort}/test/blank.html`, res => {
                res.resume()
                if (!resolved) {
                  resolved = true
                  resolve()
                }
              })
              .on('error', () => setTimeout(poll, 200))
          }
          poll()
        }
      })

      this.viteProcess.stderr?.on('data', data => {
        console.error(data.toString().trim())
      })

      this.viteProcess.on('error', error => {
        reject(new Error(`Failed to start Vite: ${error.message}`))
      })

      this.viteProcess.on('exit', code => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Vite server exited with code ${code}`))
        }
      })

      setTimeout(() => {
        if (!resolved) reject(new Error('Vite server failed to start within timeout'))
      }, 30000)
    })
  }

  /**
   * Stop Vite server gracefully.
   * Sends SIGTERM and waits briefly for the process to drain connections
   * before force-killing, preventing ECONNRESET errors in the runner.
   */
  async stopServer(): Promise<void> {
    if (this.viteProcess) {
      console.log('Stopping Vite server...')
      const proc = this.viteProcess
      this.viteProcess = null

      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          proc.kill('SIGKILL')
          resolve()
        }, 1500)

        proc.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })

        proc.kill('SIGTERM')
      })
    }
  }

  /**
   * Run a test with automatic server management.
   *
   * Server detection order when startServer is true (the default):
   *   1. Probe .port hint + scan 3000–3099 — reuse any live Mepto server found.
   *   2. Otherwise start a fresh Vite instance (it picks its own free port).
   *
   * Pass --no-server to skip detection entirely.
   */
  async run(options: HarnessOptions): Promise<TestResult> {
    const shouldStartServer = options.startServer !== false && options.waitForServer !== false

    try {
      if (shouldStartServer) {
        const existing = await detectRunningServer()
        if (existing !== null) {
          console.log(`Reusing Mepto dev server on port ${existing}`)
          this.actualPort = existing
        } else {
          await this.startServer()
          this.serverOwned = true
        }
      }

      await this.runner.init(options.headless)

      const result = await this.runner.runTest({
        ...options,
        port: this.actualPort,
        url: options.url || `http://localhost:${this.actualPort}/test/blank.html`,
      })

      return result
    } finally {
      // Close browser first, then only stop the server if we started it.
      await this.runner.close()
      if (this.serverOwned) {
        await this.stopServer()
        this.serverOwned = false
      }
    }
  }

  /**
   * Run many cases in a single browser+server session.
   *
   * Like `run()`, this detects/reuses a running dev server (or starts one) and
   * initializes the browser ONCE for the whole batch. Each case then runs in a
   * fresh page inside `TestRunner.runBatch`. This is the fast path for an agent
   * that wants to check several hypotheses: one cold start instead of N.
   */
  async runBatch(cases: BatchCase[], options: BatchHarnessOptions = {}): Promise<BatchResult> {
    const shouldStartServer = options.startServer !== false && options.waitForServer !== false

    try {
      if (shouldStartServer) {
        const existing = await detectRunningServer()
        if (existing !== null) {
          console.log(`Reusing Mepto dev server on port ${existing}`)
          this.actualPort = existing
        } else {
          await this.startServer()
          this.serverOwned = true
        }
      }

      await this.runner.init(options.headless)

      return await this.runner.runBatch(cases, {
        port: this.actualPort,
        width: options.width,
        height: options.height,
        timeout: options.timeout,
      })
    } finally {
      await this.runner.close()
      if (this.serverOwned) {
        await this.stopServer()
        this.serverOwned = false
      }
    }
  }

  /**
   * Run each case against BOTH Mepto and jQuery (each as `$`) and diff.
   * Shares the single browser+server session across all cases. jQuery is
   * injected from the harness's bundled copy; throws if not installed.
   */
  async runCompare(cases: BatchCase[], options: BatchHarnessOptions = {}): Promise<CompareResult> {
    const shouldStartServer = options.startServer !== false && options.waitForServer !== false

    try {
      if (shouldStartServer) {
        const existing = await detectRunningServer()
        if (existing !== null) {
          console.log(`Reusing Mepto dev server on port ${existing}`)
          this.actualPort = existing
        } else {
          await this.startServer()
          this.serverOwned = true
        }
      }

      await this.runner.init(options.headless)

      return await this.runner.runCompare(cases, {
        port: this.actualPort,
        width: options.width,
        height: options.height,
        timeout: options.timeout,
      })
    } finally {
      await this.runner.close()
      if (this.serverOwned) {
        await this.stopServer()
        this.serverOwned = false
      }
    }
  }

  /**
   * Validate code without executing
   */
  validate(code: string): ReturnType<typeof sanitize> {
    return sanitize(code)
  }
}

// Convenience function for quick tests
export async function quickTest(
  code: string,
  html?: string,
  options: Partial<HarnessOptions> = {}
): Promise<TestResult> {
  const harness = new LLMTestHarness(options.port)
  return harness.run({
    code,
    html,
    headless: true,
    ...options,
  })
}

export {
  TestRunner,
  TestOptions,
  TestResult,
  BatchCase,
  BatchResult,
  BatchCaseResult,
  CompareResult,
}
export { sanitize, wrapInContext } from './security/sanitizer'
