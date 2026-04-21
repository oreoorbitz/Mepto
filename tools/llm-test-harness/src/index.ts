/**
 * Main entry point for LLM Test Harness
 * Orchestrates Vite server and Puppeteer runner
 */

import { spawn, ChildProcess } from 'child_process';
import { TestRunner, TestOptions, TestResult } from './runner';
import { sanitize } from './security/sanitizer';

export interface HarnessOptions extends TestOptions {
  port?: number;
  /** Whether to auto-start the Vite dev server (default: true). Set false when a server is already running. */
  startServer?: boolean;
  waitForServer?: boolean;
  serverTimeout?: number;
}

export class LLMTestHarness {
  private viteProcess: ChildProcess | null = null;
  private runner: TestRunner;
  private port: number;
  /** The actual port Vite bound to (may differ from requested port due to conflicts). */
  private actualPort: number;

  constructor(port = 3000) {
    this.runner = new TestRunner();
    this.port = port;
    this.actualPort = port;
  }

  /**
   * Start Vite dev server and detect the actual port it bound to.
   * Vite may pick a different port if the requested one is occupied.
   */
  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting Vite dev server on port ${this.port}...`);

      this.viteProcess = spawn('npm', ['run', 'dev', '--', '--port', String(this.port)], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      let output = '';
      let resolved = false;

      this.viteProcess.stdout?.on('data', (data) => {
        const str = data.toString();
        output += str;
        console.log(str.trim());

        // Detect the actual port from Vite's "Local:" output line.
        // Example: "➜  Local:   http://localhost:3001/"
        const portMatch = str.match(/Local:\s*https?:\/\/[^/]*:(\d+)/);
        if (portMatch) {
          this.actualPort = parseInt(portMatch[1], 10);
        }

        // Check if server is ready
        if (!resolved && (str.includes('Local:') || str.includes('ready') || str.includes('➜'))) {
          resolved = true;
          // Give it a moment to fully start and compile
          setTimeout(() => resolve(), 3000);
        }
      });

      this.viteProcess.stderr?.on('data', (data) => {
        const str = data.toString();
        console.error(str.trim());
      });

      this.viteProcess.on('error', (error) => {
        reject(new Error(`Failed to start Vite: ${error.message}`));
      });

      this.viteProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Vite server exited with code ${code}`));
        }
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!resolved) {
          reject(new Error('Vite server failed to start within timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Stop Vite server gracefully.
   * Sends SIGTERM and waits briefly for the process to drain connections
   * before force-killing, preventing ECONNRESET errors in the runner.
   */
  async stopServer(): Promise<void> {
    if (this.viteProcess) {
      console.log('Stopping Vite server...');
      const proc = this.viteProcess;
      this.viteProcess = null;

      // Give in-flight requests a moment to complete before killing the process
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 1500);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        proc.kill('SIGTERM');
      });
    }
  }

  /**
   * Run a test with automatic server management.
   *
   * Server behaviour is controlled by two flags:
   * - `startServer` (default true) — whether to launch a Vite dev server.
   *   Maps to the `--no-server` CLI flag which sets this to `false`.
   * - `waitForServer` (default true) — legacy alias kept for backward
   *   compatibility; when set to `false` the server is also skipped.
   */
  async run(options: HarnessOptions): Promise<TestResult> {
    // Respect both the new `startServer` option and the legacy `waitForServer`
    const shouldStartServer =
      options.startServer !== false && options.waitForServer !== false;

    try {
      // Start server if requested
      if (shouldStartServer) {
        await this.startServer();
      }

      // Initialize Puppeteer
      await this.runner.init(options.headless);

      // Run the test — pass the actual detected port so the runner builds
      // correct script URLs even when Vite fell back to a different port.
      const result = await this.runner.runTest({
        ...options,
        port: this.actualPort,
        url: options.url || `http://localhost:${this.actualPort}/test/blank.html`,
      });

      return result;
    } finally {
      // Cleanup — close browser first, then stop server to avoid ECONNRESET
      await this.runner.close();
      if (shouldStartServer) {
        await this.stopServer();
      }
    }
  }

  /**
   * Validate code without executing
   */
  validate(code: string): ReturnType<typeof sanitize> {
    return sanitize(code);
  }
}

// Convenience function for quick tests
export async function quickTest(
  code: string,
  html?: string,
  options: Partial<HarnessOptions> = {}
): Promise<TestResult> {
  const harness = new LLMTestHarness(options.port);
  return harness.run({
    code,
    html,
    headless: true,
    ...options,
  });
}

export { TestRunner, TestOptions, TestResult };
export { sanitize, wrapInContext } from './security/sanitizer';
