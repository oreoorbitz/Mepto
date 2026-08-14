'use strict'
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const DIR = '/mnt/agents/output/key-bench'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function mergeStats(reps) {
  const s = [...reps].sort((a, b) => a - b)
  const med = s[Math.floor(s.length / 2)]
  const min = s[0],
    max = s[s.length - 1]
  const mean = reps.reduce((x, y) => x + y, 0) / reps.length
  const sd = Math.sqrt(reps.reduce((x, y) => x + (y - mean) * (y - mean), 0) / reps.length)
  return { median: med, min, max, spread: max - min, cv: sd / mean, n: reps.length }
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
  })
  const version = await browser.version()
  const page = await browser.newPage()
  page.setDefaultTimeout(0)
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e.message)
  })
  await page.goto('file://' + path.join(DIR, 'bench.html'))
  await page.evaluate(() => window.__trustedTarget.blur())

  console.log('Browser:', version)
  console.log('--- full run 1 ---')
  const run1 = await page.evaluate(() => window.__runAll())
  fs.writeFileSync(
    path.join(DIR, 'results_run1.json'),
    JSON.stringify({ version, ...run1 }, null, 1)
  )
  console.log('run1 cases:', Object.keys(run1.results).length, 'sink:', run1.sink)

  console.log('--- full run 2 ---')
  const run2 = await page.evaluate(() => window.__runAll())
  fs.writeFileSync(
    path.join(DIR, 'results_run2.json'),
    JSON.stringify({ version, ...run2 }, null, 1)
  )
  console.log('run2 cases:', Object.keys(run2.results).length, 'sink:', run2.sink)

  // verify medians agree within +-10%; rerun outliers once
  const names = Object.keys(run1.results)
  const outliers = []
  for (const n of names) {
    const a = run1.results[n].median,
      b = run2.results[n].median
    const rel = Math.abs(a - b) / ((a + b) / 2)
    if (rel > 0.1) outliers.push(n)
  }
  console.log('outliers (>10% median disagreement):', outliers.length, outliers)
  let rerun = { results: {} }
  if (outliers.length) {
    rerun = await page.evaluate(names => window.__runAll(names), outliers)
    fs.writeFileSync(
      path.join(DIR, 'results_rerun.json'),
      JSON.stringify({ version, ...rerun }, null, 1)
    )
  }

  // merged results.json: pool reps from all runs available per case
  const merged = {}
  for (const n of names) {
    let reps = [...run1.results[n].reps, ...run2.results[n].reps]
    if (rerun.results[n]) reps = reps.concat(rerun.results[n].reps)
    merged[n] = mergeStats(reps)
    merged[n].agreement10 = !outliers.includes(n)
  }

  // ================= trusted layer (case 13) =================
  const trusted = {}
  for (const mode of ['empty', 'shortcut', 'preventDefault']) {
    await page.evaluate(m => {
      window.__installTrusted(m)
      window.__resetTrusted()
      window.__trustedTarget.focus()
    }, mode)
    // throughput: 200 presses wall-clock
    await sleep(100)
    const t0 = Date.now()
    for (let i = 0; i < 200; i++) await page.keyboard.press('k')
    const dt = (Date.now() - t0) / 1000
    const st1 = await page.evaluate(() => ({ ...window.__trusted }))
    // latency: 50 presses with in-page marker
    await page.evaluate(() => window.__resetTrusted())
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.__setMark())
      await page.keyboard.press('k')
    }
    const st2 = await page.evaluate(() => ({ ...window.__trusted }))
    trusted[mode] = {
      presses: 200,
      wallSec: dt,
      pressesPerSec: 200 / dt,
      keydowns: st1.downs,
      keyups: st1.ups,
      beforeinputs: st1.beforeinputs,
      inputs: st1.inputs,
      latencyMsAvg: st2.latN ? st2.latSum / st2.latN : null,
      latencyMsMax: st2.latMax,
      latencyN: st2.latN,
    }
    console.log('trusted', mode, trusted[mode])
  }
  await page.evaluate(() => {
    window.__trustedTarget.removeEventListener('keydown', window.__curTrusted)
  })

  const out = {
    version,
    node: process.version,
    date: new Date().toISOString(),
    cases: merged,
    trusted,
  }
  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(out, null, 1))
  console.log('wrote results.json')
  await browser.close()
})().catch(e => {
  console.error(e)
  process.exit(1)
})
