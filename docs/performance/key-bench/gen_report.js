'use strict'
// Generates RESULTS.md from results.json
const fs = require('fs')
const r = require('/mnt/agents/output/key-bench/results.json')

const bySuite = {}
for (const [full, st] of Object.entries(r.cases)) {
  const i = full.indexOf(' :: ')
  const s = full.slice(0, i),
    c = full.slice(i + 4)
  ;(bySuite[s] = bySuite[s] || []).push({ case: c, ...st })
}

function fmt(ops) {
  if (ops >= 1e6) return (ops / 1e6).toFixed(2) + ' M'
  if (ops >= 1e3) return (ops / 1e3).toFixed(1) + ' k'
  return ops.toFixed(0)
}
function ns(ops) {
  return (1e9 / ops).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

let md = ''
md += `# DOM Keyboard Event Listener Microbenchmarks — RESULTS\n\n`
md += `- Engine: **${r.version}** (real Blink + V8, headless, --no-sandbox --disable-gpu --disable-dev-shm-usage --js-flags=--expose-gc)\n`
md += `- Node driver: ${r.node} · Date: ${r.date}\n`
md += `- Harness: ~200 ms warmup per case, batches calibrated to ≥2 ms, ≥300 ms measured per rep, 5 reps per full run, alternating case order across reps, gc() between suites, DCE sink guard (all handler results accumulated into window.__sink; final sink value verified nonzero).\n`
md += `- Numbers below: **median ops/sec over 2 full runs (10 pooled reps; outliers rerun once and pooled, 15 reps)**. CV = stdev/mean across pooled reps.\n\n`

const order = Object.keys(bySuite)
for (const s of order) {
  const cases = bySuite[s]
  const fastest = Math.max(...cases.map(c => c.median))
  md += `## ${s}\n\n`
  md += `| case | median ops/s | ns/op | min | max | spread | CV | rel. to fastest |\n`
  md += `|---|---:|---:|---:|---:|---:|---:|---:|\n`
  for (const c of cases) {
    md += `| ${c.case} | ${fmt(c.median)} | ${ns(c.median)} | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.spread)} | ${(c.cv * 100).toFixed(1)}% | ${(c.median / fastest).toFixed(3)} |\n`
  }
  md += '\n'
}

md += `## 13. Trusted input layer (page.keyboard.press / CDP Input.dispatchKeyEvent)\n\n`
md += `200 keydown→keyup presses per mode (key 'k' into a focused <input>), wall-clock from Node driver; latency = performance.now() inside keydown handler (capture) minus marker set immediately before dispatch (50 presses).\n\n`
md += `| mode | presses/s (wall) | keydowns | beforeinput | input | avg latency (ms) | max latency (ms) |\n`
md += `|---|---:|---:|---:|---:|---:|---:|\n`
for (const [m, t] of Object.entries(r.trusted)) {
  md += `| ${m} | ${t.pressesPerSec.toFixed(0)} | ${t.keydowns} | ${t.beforeinputs} | ${t.inputs} | ${t.latencyMsAvg.toFixed(2)} | ${t.latencyMsMax.toFixed(1)} |\n`
}
md += '\n'

md += fs.readFileSync('/mnt/agents/output/key-bench/findings.md', 'utf8')
fs.writeFileSync('/mnt/agents/output/key-bench/RESULTS.md', md)
console.log('RESULTS.md written,', md.length, 'chars')
