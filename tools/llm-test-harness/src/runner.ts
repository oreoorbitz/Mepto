/**
 * Puppeteer runner for LLM test execution
 * Manages browser instances and executes code in isolated contexts
 */

import puppeteer, { Browser, Page, ConsoleMessage, PuppeteerLaunchOptions } from 'puppeteer';
import { sanitize, wrapInContext, SanitizationResult } from './security/sanitizer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface TestOptions {
  code: string;
  html?: string;
  url?: string;
  timeout?: number;
  headless?: boolean;
  width?: number;
  height?: number;
  collectConsole?: boolean;
  /** Port the Vite dev server is listening on (used to build script URLs) */
  port?: number;
}

export interface TestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  console: ConsoleEntry[];
  timing: {
    start: string;
    end: string;
    duration: number;
  };
  security: {
    safe: boolean;
    violations: string[];
    warnings: string[];
  };
}

export interface ConsoleEntry {
  type: 'log' | 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class TestRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private consoleEntries: ConsoleEntry[] = [];

  /**
   * Initialize the browser
   */
  private findChrome(): string | undefined {
    const platform = os.platform();
    const candidates: string[] = [];

    if (platform === 'darwin') {
      candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      candidates.push('/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary');
      candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
      candidates.push(path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
    } else if (platform === 'linux') {
      candidates.push('/usr/bin/google-chrome');
      candidates.push('/usr/bin/google-chrome-stable');
      candidates.push('/usr/bin/chromium');
      candidates.push('/usr/bin/chromium-browser');
    } else if (platform === 'win32') {
      candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
      candidates.push('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe');
    }

    for (const c of candidates) {
      try {
        fs.accessSync(c, fs.constants.X_OK);
        return c;
      } catch {
        // not found or not executable
      }
    }
    return undefined;
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
    };

    const chromePath = this.findChrome();
    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }

    this.browser = await puppeteer.launch(launchOptions);
  }

  /**
   * Create a new isolated page with security settings
   */
  async createPage(width?: number, height?: number): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    this.page = await this.browser.newPage();
    this.consoleEntries = [];

    // Set viewport
    await this.page.setViewport({
      width: width || DEFAULT_VIEWPORT.width,
      height: height || DEFAULT_VIEWPORT.height,
    });

    // Disable alerts, confirms, prompts
    await this.page.evaluateOnNewDocument(() => {
      window.alert = () => {};
      window.confirm = () => false;
      window.prompt = () => null;
    });

    // Listen to console messages
    this.page.on('console', (msg: ConsoleMessage) => {
      this.consoleEntries.push({
        type: msg.type() as ConsoleEntry['type'],
        message: msg.text(),
        timestamp: new Date().toISOString(),
      });
    });

    // Block external navigation
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('http://localhost')) {
        req.continue();
      } else {
        req.abort();
      }
    });

    return this.page;
  }

  /**
   * Load HTML content into the page
   * @param html  HTML fixture string
   * @param port  Port the Vite dev server is actually listening on
   */
  async loadHTML(html: string, port = 3000): Promise<void> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.');
    }

    // Navigate to the actual Vite-hosted blank page so Mepto loads from
    // the same origin and we avoid the document.write / cross-origin
    // parser-blocking issues that plague page.setContent().
    const blankUrl = `http://localhost:${port}/test/blank.html`;
    await this.page.goto(blankUrl, { waitUntil: 'networkidle0' });

    // Inject the fixture HTML into the test container
    if (html && html.trim()) {
      await this.page.evaluate((fixtureHtml) => {
        const container = document.getElementById('test-container');
        if (container) {
          container.innerHTML = fixtureHtml;
        } else {
          // Fallback if blank.html template ever changes
          const div = document.createElement('div');
          div.innerHTML = fixtureHtml;
          document.body.appendChild(div);
        }
      }, html);
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.');
    }

    await this.page.goto(url, { waitUntil: 'networkidle0' });
  }

  /**
   * Execute code in the page context
   */
  async execute(
    code: string,
    _timeout = DEFAULT_TIMEOUT
  ): Promise<{ result?: unknown; error?: string; stack?: string }> {
    if (!this.page) {
      throw new Error('Page not created. Call createPage() first.');
    }

    try {
      const result = await this.page.evaluate(
        (js) => {
          try {
            // eslint-disable-next-line no-eval
            return { result: eval(js) };
          } catch (e) {
            return {
              error: (e as Error).message,
              stack: (e as Error).stack,
            };
          }
        },
        code
      );

      return result;
    } catch (e) {
      return {
        error: (e as Error).message,
        stack: (e as Error).stack,
      };
    }
  }

  /**
   * Run a complete test with sanitization and execution
   */
  async runTest(options: TestOptions): Promise<TestResult> {
    const startTime = Date.now();
    const startISO = new Date().toISOString();

    // Sanitize code
    const sanitization: SanitizationResult = sanitize(options.code);

    if (!sanitization.safe) {
      return {
        success: false,
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
      };
    }

    try {
      // Initialize if needed
      if (!this.browser) {
        await this.init(options.headless);
      }

      // Create page
      await this.createPage(options.width, options.height);

      // Load content
      const port = options.port || 3000;
      if (options.html) {
        await this.loadHTML(options.html, port);
      } else if (options.url) {
        await this.navigate(options.url);
      } else {
        // Default empty page with Mepto loaded
        await this.loadHTML('', port);
      }

      // Execute with timeout
      type ExecutionResult = { result?: unknown; error?: string; stack?: string };
      const executionPromise = this.execute(sanitization.code!, options.timeout);
      const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), options.timeout || DEFAULT_TIMEOUT);
      });

      const execution: ExecutionResult = await Promise.race([executionPromise, timeoutPromise]).catch((e) => ({
        error: (e as Error).message,
      }));

      const endTime = Date.now();

      if (execution.error) {
        return {
          success: false,
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
        };
      }

      return {
        success: true,
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
      };
    } catch (e) {
      return {
        success: false,
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
      };
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

// Singleton instance for reuse
let runnerInstance: TestRunner | null = null;

export function getRunner(): TestRunner {
  if (!runnerInstance) {
    runnerInstance = new TestRunner();
  }
  return runnerInstance;
}

export function resetRunner(): void {
  runnerInstance = null;
}
