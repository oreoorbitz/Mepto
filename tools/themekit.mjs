#!/usr/bin/env node
// Mepto — bundled ThemeKit fork wrapper (oreoorbitz/themekit)
// For Timber 1.0 themes (Mimber) where `shopify theme` 2.0 CLI is incompatible.
// Usage in Mepto repo: node tools/themekit.mjs --help  (prefers vendor/themekit/bin/theme)
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  path.join(ROOT, 'vendor/themekit/bin/theme'),
  path.join(ROOT, 'node_modules/@shopify/themekit/bin/theme'),
  'theme',
]
const bin = candidates.find(c => c.includes('/') ? fs.existsSync(c) : true) || 'theme'
const child = spawn(bin, process.argv.slice(2), { stdio: 'inherit', cwd: ROOT })
child.on('exit', c => process.exit(c ?? 1))
