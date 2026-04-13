/**
 * Main entry point for LLM Test Harness
 * Orchestrates Vite server and Puppeteer runner
 */

import { spawn, ChildProcess } from 'child_process';
import { TestRunner, TestOptions, TestResult } from './runner';
import { sanitize } from './security/sanitizer';

export interface HarnessOptions extends TestOptions {
  port?: number;
  waitForServer?: boolean;
  serverTimeout?: number;
}

export class LLMTestHarness {
  private viteProcess: ChildProcess | null = null;
  private runner: TestRunner;
  private port: number;

  constructor(port = 3000) {
    this.runner = new TestRunner();
    this.port = port;
  }

  /**
   * Start Vite dev server
   */
  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting Vite dev server on port ${this.port}...`);

      this.viteProcess = spawn('npm', ['run', 'dev', '--', '--port', String(this.port)], {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true,
      });

      let output = '';

      this.viteProcess.stdout?.on('data', (data) => {
        const str = data.toString();
        output += str;
        console.log(str.trim());

        // Check if server is ready
        if (str.includes('Local:') || str.includes('ready')) {
          // Give it a moment to fully start
          setTimeout(() => resolve(), 2000);
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
        if (!output.includes('Local:') && !output.includes('ready')) {
          reject(new Error('Vite server failed to start within timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Stop Vite server
   */
  stopServer(): void {
    if (this.viteProcess) {
      console.log('Stopping Vite server...');
      this.viteProcess.kill('SIGTERM');
      this.viteProcess = null;
    }
  }

  /**
   * Run a test with automatic server management
   */
  async run(options: HarnessOptions): Promise<TestResult> {
    const startServer = options.waitForServer !== false;

    try {
      // Start server if requested
      if (startServer) {
        await this.startServer();
      }

      // Initialize Puppeteer
      await this.runner.init(options.headless);

      // Run the test
      const result = await this.runner.runTest({
        ...options,
        url: options.url || `http://localhost:${this.port}/test/blank.html`,
      });

      return result;
    } finally {
      // Cleanup
      await this.runner.close();
      if (startServer) {
        this.stopServer();
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
