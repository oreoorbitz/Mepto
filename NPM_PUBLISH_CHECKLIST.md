# npm Publish Checklist

Goal: publish **`meptos`** to the public npm registry as a clean, compliant,
lightweight package.

Current state: the package name `meptos` (and `mepto`) is **available** on npm.
Phases 1–3 are **done** — the tarball is now **231.7 KB / 56 files** (down from
10.9 MB / 3,561 files). What remains is the `prepare` script guard (2g), then
the manual steps: npm login, verification, and publish.

---

## Phase 1 — MIT license & attribution ✅ DONE

Mepto is a derivative of [Zepto.js](https://github.com/madrobby/zepto), which is
MIT-licensed by **Thomas Fuchs**. The MIT license requires that the original
copyright notice and permission notice be **included in all copies or
substantial portions of the Software**.

### 1a. Rename `MIT-LICENSE` → `LICENSE`

npm auto-includes files named `LICENSE*`, `LICENCE*`, `README*`, `NOTICE*`, and
`package.json`. The old file was named `MIT-LICENSE` — it did **not** match
`LICENSE*` and would not have been published.

- [x] Renamed `MIT-LICENSE` → `LICENSE` (`git rm MIT-LICENSE` + new `LICENSE`)
- [x] No stale references remain (grep confirmed no code references)

### 1b. Fix the copyright attribution

The old `MIT-LICENSE` read `Copyright (c) 2010-2025 Thomas Fuchs,
http://meptojs.com/` — the URL was a find-replace artifact.

- [x] Fixed the Zepto attribution URL → `http://zeptojs.com/`
- [x] Restored correct year range `2010-2016`
- [x] Added copyright line for Mepto author:
      `Copyright (c) 2024-2026 Orion Holmes (https://github.com/oreoorbitz)`
- [x] MIT permission text intact and unmodified

### 1c. Add upstream attribution to README

- [x] README now reads: "Mepto is licensed under the MIT License, like Zepto
      itself. It is a derivative of Zepto.js by Thomas Fuchs, whose original
      copyright notice is preserved in the [LICENSE](LICENSE) file."

---

## Phase 2 — `package.json` fixes (mostly done)

### 2a. Fix repo URLs

- [x] `homepage` → `"https://oreoorbitz.github.io/Mepto/"`
- [x] `repository.url` → `"https://github.com/oreoorbitz/Mepto.git"`
- [x] `bugs.url` → `"https://github.com/oreoorbitz/Mepto/issues"`

### 2b. Move `kill-port` to `devDependencies`

- [x] `kill-port` moved to `devDependencies`
- [x] `dependencies` key removed entirely (zero runtime deps)

### 2c. `engines.node` — keep at `"24.x"` (intentional)

The project **intentionally** requires Node 24. This is pinned by `.nvmrc`
(`= 24`), enforced locally by `.npmrc` (`engine-strict=true`), and documented in
`CONTRIBUTING.md` with a bash script for `nvm` auto-switching.

- [x] Confirmed `engines.node` is `"24.x"` — **do not change**

### 2d. Fix the `description`

- [x] Updated → `"Modern TypeScript rewrite of Zepto.js — jQuery-compatible DOM library for evergreen browsers"`

### 2e. Add `author` details

- [x] `author` → `"Orion Holmes (https://github.com/oreoorbitz)"`

### 2f. Add `sideEffects` for tree-shaking

- [x] `"sideEffects": false` added

### 2g. Guard the `prepare` script ✅ DONE

`"prepare": "husky install"` ran when someone installed from a git URL, but
husky wasn't in their `node_modules` so it crashed. Now guarded to only run
when `.husky/` exists locally.

- [x] Changed to:
      `"prepare": "node -e \"require('fs').existsSync('.husky') && require('child_process').execSync('npx husky install', {stdio: 'inherit'})\""`
- [x] Verified: runs locally (`husky - Git hooks installed`)
- [x] Verified: silent no-op when `.husky/` absent (git/npm consumers)

---

## Phase 3 — Package contents cleanup ✅ DONE

`npm pack --dry-run` was 10.9 MB / 54.4 MB unpacked / 3,561 files.
Now: **231.7 KB / 869.9 KB unpacked / 56 files**.

### 3a. Remove `tools` from the `files` array

- [x] `files` is now `["dist", "src", "!src/*.test.ts", "!src/*.spec.ts"]`

### 3b. Exclude test files from `src/`

- [x] Excluded via `"!src/*.test.ts"` in `files` **and** `.npmignore`

### 3c. Publish `src/` — YES (decided)

Source `.ts` files are kept in the package. They let source maps resolve in
devtools, enable "go to definition" in editors, and provide local context for
future LLM/MCP integration against installed source.

- [x] Decision: keep `src` in `files`
- [x] Test files excluded

### 3d. Rewrite `.npmignore`

The old `.npmignore` referenced deleted files (`dist/mepto.js`,
`dist/mepto.min.js`, `src/*.js`, `src/amd_layout.js`).

- [x] Rewrote `.npmignore` — clean, minimal:
      `     src/*.test.ts
    src/*.spec.ts
    dist/src/**/*.map
    .DS_Store
    *.log
    `

### 3e. Verify with `npm pack --dry-run`

- [x] 56 files (under ~50 target — close enough; all are real artifacts)
- [x] 231.7 KB compressed (well under 500 KB)
- [x] `LICENSE` IS in the tarball
- [x] `README.md` IS in the tarball
- [x] `tools/` is NOT in the tarball
- [x] `src/mepto.test.ts` is NOT in the tarball
- [x] `package-lock.json` is NOT in the tarball

---

## Phase 4 — npm account & authentication ✅ DONE

### 4a. npm account

- [x] npm account created
- [x] **Two-factor authentication** enabled (recommended)

### 4b. Login from the CLI

- [x] `npm login` completed successfully
- [x] `npm whoami` confirms the correct account

### 4c. Verify the package name is still available

- [x] `meptos` confirmed available

---

## Phase 5 — Pre-publish verification

### 5a. Full local verification

```bash
npm run verify     # typecheck + lint + vitest + build + size:check
```

- [ ] `npm run verify` passes (all green)

### 5b. Browser test suite

```bash
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium
# expect: 1 passed (234 assertions, 0 failures)
```

- [ ] Playwright unit suite passes

### 5c. Clean build

```bash
rm -rf dist && npm run build
```

- [ ] `dist/meptos.js`, `dist/meptos.umd.cjs`, `dist/meptos.d.ts` all produced
- [ ] `npm run size:check` passes (under 15 KB per bundle)

### 5d. Inspect the tarball one final time

```bash
npm pack --dry-run 2>&1 | grep "npm notice"
```

- [ ] File count, size, and contents look right (expect ~56 files, ~232 KB)

### 5e. Verify the `version` field

```bash
node -p "require('./package.json').version"
```

- [ ] Version is correct (e.g. `"2.0.0"` for a first major publish, or `"1.0.0"`
      — your choice. npm doesn't allow re-publishing the same version.)
- [ ] You have NOT already published this version (once published, it's
      permanent — can unpublish within 72 hours, but can't re-upload the same
      version number)

---

## Phase 6 — Publish

### 6a. Dry run (no upload)

```bash
npm publish --dry-run
```

- [ ] Dry run completes with no errors

### 6b. Publish for real

```bash
npm publish
# npm will prompt for your OTP code (if 2FA is enabled)
```

- [ ] Publish succeeds
- [ ] `npm view meptos` now returns the package metadata

### 6c. Verify the package is installable

In a clean temp directory:

```bash
cd /tmp && mkdir meptos-test && cd meptos-test && npm init -y
npm install meptos
node -e "const {$} = require('meptos'); console.log(typeof $)"
# should print "function"
```

- [ ] `npm install meptos` works from a clean project
- [ ] `require('meptos')` works and exposes `$` as a function
- [ ] ESM import works too: `node --input-type=module -e "import {$} from 'meptos'; console.log(typeof $)"`

---

## Phase 7 — Post-publish

### 7a. Tag the release in git

```bash
git tag v2.0.0
# Do NOT push tags without confirmation — see AGENTS.md confirmation gate
```

- [ ] Tag created locally (confirm with user before `git push --tags`)

### 7b. GitHub Release

- [ ] Created a GitHub Release from the tag (via `gh release create` or the web UI)
- [ ] Release notes describe the library and link to the docs site

### 7c. Update docs

- [ ] The docs site (`docs/site/index.html`) references `npm install meptos` —
      verify the CDN URL `https://cdn.jsdelivr.net/npm/meptos/dist/meptos.umd.cjs`
      now resolves (it will within minutes of publishing)
- [ ] README badge or install instructions are correct

### 7d. npm dist-tags (optional)

```bash
npm dist-tag add meptos@2.0.0 latest    # already done by default
```

- [ ] `npm dist-tag ls meptos` shows `latest: 2.0.0`

---

## Summary

| Phase                        | Status         | What's left              |
| ---------------------------- | -------------- | ------------------------ |
| 1 — License & attribution    | ✅ Done        | —                        |
| 2 — package.json fixes       | ✅ Done        | —                        |
| 3 — Package contents         | ✅ Done        | —                        |
| 4 — npm account & auth       | ✅ Done        | —                        |
| 5 — Pre-publish verification | 🔲 Not started | Run verify + Playwright  |
| 6 — Publish                  | 🔲 Not started | `npm publish`            |
| 7 — Post-publish             | 🔲 Not started | Tag, release, verify CDN |
