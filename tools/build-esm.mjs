#!/usr/bin/env node
// Build per-module ESM artifacts for treeshakable imports (Shopify apps).
// Full bundle (dist/meptos.js) stays for legacy themes (single asset_url).
// This produces dist/esm/*.js — one ESM file per src/*.ts, plus a flat `dist/esm/` for subpath exports.
// Consumer: `import 'meptos/event'` -> dist/esm/event.js (only event + core); `import { hotkey } from 'meptos/hotkey'` -> dist/esm/hotkey.js.
// Note: modules use IIFE (function($){...})(mepto) — they side-effect `window.mepto`. For true treeshaking, each file
// is transpiled standalone; downstream bundler (esbuild/rollup/vite) will include only the files actually imported.

import { build } from 'esbuild'
import { readdirSync, mkdirSync, existsSync } from 'fs'
import { join, basename } from 'path'

const srcDir = 'src'
const outDir = 'dist/esm'

// Ensure outDir exists
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// All src modules except tests and the full entry
const all = readdirSync(srcDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'meptos.ts')

// Also include meptos.ts as `dist/esm/meptos.js`? No — that's the full bundle. Per-module builds are the feature.
// But we do need core (mepto.ts) as its own ESM file.
const entries = all // e.g., mepto.ts, event.ts, ajax.ts, hotkey.ts ...

console.log(`[build:esm] Transpiling ${entries.length} modules to ${outDir}/ ...`)

for (const file of entries) {
  const entry = join(srcDir, file)
  const outFile = join(outDir, file.replace(/\.ts$/, '.js'))
  await build({
    entryPoints: [entry],
    bundle: false, // keep imports as-is (none today except types), just transpile TS->JS ESM
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile: outFile,
    sourcemap: true,
    // Keep IIFE side effects — esbuild will just strip types and emit JS.
    // No minify here: consumer bundler minifies final app bundle (Shopify app).
    loader: { '.ts': 'ts' },
  })
  console.log(`  ${entry} -> ${outFile}`)
}

// Ensure each non-core module auto-imports core (mepto.js) so `import 'meptos/event'` is self-contained.
// The IIFE pattern `(function($){...})(mepto)` expects global `mepto`; adding an explicit import makes it work
// as a proper ESM side-effect (and keeps treeshaking at file granularity: core is included only when a feature is imported).
import { readFileSync, writeFileSync } from 'fs'
for (const file of entries) {
  if (file === 'mepto.ts' || file === 'types.ts') continue
  const outFile = join(outDir, file.replace(/\.ts$/, '.js'))
  let content = readFileSync(outFile, 'utf8')
  // Prepend core import if not already present
  if (!content.includes('from "./mepto.js"') && !content.includes("from './mepto.js'")) {
    // Insert after any "use strict" header if present, else at top
    content = `import "./mepto.js";\n` + content
    writeFileSync(outFile, content)
  }
}

// Also emit a tiny barrel for `import { hotkey } from 'meptos/hotkey'` pure re-export (optional)
// The exports map already points hotkey -> dist/esm/hotkey.js which mutates window.mepto.
// For apps that want a pure import without global, they can do: `import { hotkey } from 'meptos/hotkey'` and use the exported object.
// Our hotkey.ts already mutates window.mepto; the file works both ways.

console.log('[build:esm] done. Verify with: ls -lh dist/esm/ && du -sh dist/esm/*')
