'use strict'
// Puppeteer runner: loads bench.html in headless Chromium, waits, extracts results.
const path = require('path')
const fs = require('fs')
const puppeteer = require('puppeteer-core')

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
  })
  const page = await browser.newPage()
  const version = await browser.version()
  console.error('Browser:', version)

  page.on('pageerror', err => console.error('PAGE ERROR:', err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE:', msg.text())
  })

  await page.goto('file://' + path.resolve(__dirname, 'bench.html'))

  // Progress logger
  let last = ''
  const timer = setInterval(async () => {
    try {
      const p = await page.evaluate(() => window.__progress)
      if (p !== last) {
        console.error('[progress]', p)
        last = p
      }
    } catch (e) {
      /* page busy */
    }
  }, 2000)

  await page.waitForFunction('window.__done === true', { timeout: 900000, polling: 1000 })
  clearInterval(timer)

  const results = await page.evaluate(() => window.__results)
  results.meta.browserVersion = version

  fs.writeFileSync(path.resolve(__dirname, 'results.json'), JSON.stringify(results, null, 2))
  console.error('Wrote results.json')

  await browser.close()
})().catch(e => {
  console.error(e)
  process.exit(1)
})
