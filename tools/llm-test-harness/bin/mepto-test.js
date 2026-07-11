#!/usr/bin/env node

/**
 * CLI entry point for LLM Test Harness
 * Usage: mepto-test --code="$('.test').addClass('active')" --html="<div class='test'></div>"
 */

const { program } = require('commander')
const path = require('path')
const fs = require('fs')

// Load the compiled harness
const harnessPath = path.join(__dirname, '../dist/index.js')
let LLMTestHarness

try {
  ;({ LLMTestHarness } = require(harnessPath))
} catch (e) {
  console.error('Error: Harness not built. Run `npm run build` first.')
  process.exit(1)
}

program.name('mepto-test').description('LLM Test Harness for Mepto.js').version('1.0.0')

program
  .option('-c, --code <code>', 'JavaScript code to execute')
  .option('-f, --file <file>', 'Path to JavaScript file to execute')
  .option(
    '-b, --batch <file>',
    'JSON file of cases: { "cases": [{ name, code, html?, timeout? }] } or a bare array'
  )
  .option('--html <html>', 'HTML fixture to load')
  .option('--html-file <file>', 'Path to HTML file to load')
  .option('-u, --url <url>', 'URL to navigate to')
  .option('-p, --port <port>', 'Port for Vite dev server', '3000')
  .option('-t, --timeout <ms>', 'Execution timeout in milliseconds', '5000')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in visible mode')
  .option('--width <px>', 'Browser viewport width', '1280')
  .option('--height <px>', 'Browser viewport height', '720')
  .option('-j, --json', 'Output results as JSON')
  .option('-v, --validate', 'Only validate code, do not execute')
  .option('--no-server', 'Do not start Vite server (assume running)')
  .option('--wait-for-server', 'Wait for server to be ready', true)
  .option('--no-wait-for-server', 'Do not wait for server')

program.parse()

const options = program.opts()

async function main() {
  // Get code from file or argument
  let code = options.code
  if (options.file) {
    if (!fs.existsSync(options.file)) {
      console.error(`Error: File not found: ${options.file}`)
      process.exit(1)
    }
    code = fs.readFileSync(options.file, 'utf-8')
  }

  if (!code && !options.validate && !options.batch) {
    console.error('Error: No code provided. Use --code, --file, or --batch')
    program.help()
  }

  // Batch mode: run many cases in one browser session, then exit.
  if (options.batch) {
    if (!fs.existsSync(options.batch)) {
      console.error(`Error: Batch file not found: ${options.batch}`)
      process.exit(1)
    }
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(options.batch, 'utf-8'))
    } catch (e) {
      console.error(`Error: Failed to parse batch JSON: ${e.message}`)
      process.exit(1)
    }
    const cases = Array.isArray(parsed) ? parsed : parsed.cases
    if (!Array.isArray(cases) || cases.length === 0) {
      console.error('Error: Batch file must contain a non-empty "cases" array')
      process.exit(1)
    }

    const harness = new LLMTestHarness(parseInt(options.port))
    try {
      const result = await harness.runBatch(cases, {
        timeout: parseInt(options.timeout),
        headless: options.headless,
        width: parseInt(options.width),
        height: parseInt(options.height),
        startServer: options.server,
        waitForServer: options.waitForServer,
        serverTimeout: 30000,
      })

      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        const s = result.summary
        console.log('\n=== Batch Results ===\n')
        console.log(
          `Total: ${s.total}   Passed: ${s.passed}   Failed: ${s.failed}   Errored: ${s.errored}   Duration: ${s.duration}ms\n`
        )
        for (const r of result.results) {
          // ✓ passed, ✗ errored (threw), ≈ assertion failed (executed but checks didn't hold)
          const mark = r.passed ? '✓' : r.success ? '≈' : '✗'
          const detail = r.error
            ? `  error: ${r.error}`
            : r.assertions && r.assertions.failed > 0
              ? `  failed: ${r.assertions.failures.join('; ')}`
              : ''
          console.log(`  ${mark} ${r.name}${detail}`)
        }
      }

      process.exit(result.summary.passed === result.summary.total ? 0 : 1)
    } catch (e) {
      console.error('Fatal error:', e.message)
      process.exit(1)
    }
  }

  // Get HTML from file or argument
  let html = options.html
  if (options.htmlFile) {
    if (!fs.existsSync(options.htmlFile)) {
      console.error(`Error: HTML file not found: ${options.htmlFile}`)
      process.exit(1)
    }
    html = fs.readFileSync(options.htmlFile, 'utf-8')
  }

  // Validate-only mode
  if (options.validate && code) {
    const harness = new LLMTestHarness()
    const result = harness.validate(code)

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      if (result.safe) {
        console.log('\u2713 Code is safe to execute')
        if (result.warnings.length > 0) {
          console.log('\nWarnings:')
          result.warnings.forEach(w => console.log(`  - ${w}`))
        }
      } else {
        console.log('\u2717 Security violations detected:')
        result.violations.forEach(v => console.log(`  - ${v}`))
      }
    }
    process.exit(result.safe ? 0 : 1)
  }

  // Run test
  const harness = new LLMTestHarness(parseInt(options.port))

  try {
    const result = await harness.run({
      code,
      html,
      url: options.url,
      timeout: parseInt(options.timeout),
      headless: options.headless,
      width: parseInt(options.width),
      height: parseInt(options.height),
      // --no-server sets options.server to false; --no-wait-for-server
      // sets options.waitForServer to false. Both are respected.
      startServer: options.server,
      waitForServer: options.waitForServer,
      serverTimeout: 30000,
    })

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('\n=== Test Results ===\n')
      // Distinguish "did it run" (success) from "did assertions hold" (passed).
      // With no assertions, passed === success.
      console.log(`Executed: ${result.success}`)
      if (result.assertions) {
        console.log(
          `Passed:   ${result.passed}  (${result.assertions.passed} passed, ${result.assertions.failed} failed)`
        )
      } else {
        console.log(`Passed:   ${result.passed}`)
      }
      console.log(`Duration: ${result.timing.duration}ms`)
      console.log(`Safe: ${result.security.safe}`)

      if (result.result !== undefined) {
        console.log(`\nResult: ${JSON.stringify(result.result, null, 2)}`)
      }

      if (result.assertions && result.assertions.failures.length > 0) {
        console.log('\nAssertion Failures:')
        result.assertions.failures.forEach(f => console.log(`  - ${f}`))
      }

      if (result.error) {
        console.log(`\nError: ${result.error}`)
        if (result.stack) {
          console.log(`\nStack:\n${result.stack}`)
        }
      }

      if (result.security.violations.length > 0) {
        console.log('\nSecurity Violations:')
        result.security.violations.forEach(v => console.log(`  - ${v}`))
      }

      if (result.security.warnings.length > 0) {
        console.log('\nWarnings:')
        result.security.warnings.forEach(w => console.log(`  - ${w}`))
      }

      if (result.console.length > 0) {
        console.log('\nConsole Output:')
        result.console.forEach(entry => {
          console.log(`  [${entry.type}] ${entry.message}`)
        })
      }
    }

    // Exit code driven by `passed`: 0 only when code executed AND assertions
    // held (or no assertions were used). A non-zero exit means either an
    // execution error, an assertion failure, or a security block — the JSON
    // output distinguishes which.
    process.exit(result.passed ? 0 : 1)
  } catch (e) {
    console.error('Fatal error:', e.message)
    process.exit(1)
  }
}

main()
