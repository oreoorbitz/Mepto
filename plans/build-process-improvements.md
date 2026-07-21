# Build Process Improvements

## Goals

1. **Pin Node 25** as the single source of truth across `.nvmrc`, `engines`, and CI.
2. **Upgrade to TypeScript 7.0** (the Go-native compiler) for fast type-checking, staged around a known blocker.
3. **Make the repo LLM-contributor friendly** with fast, machine-checkable feedback loops, while keeping the build performant and dev-friendly.

## Current state (as analyzed 2026-07-21)

| Area               | Current                                                                | Problem                                                         |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Node version       | `.nvmrc`=25, `engines.node`=">=18", CI matrix=20/22/24                 | Three disagreeing sources of truth                              |
| TypeScript         | `^5.3.0`                                                               | Slow type-checks; not the Go compiler                           |
| Type-checking      | `tsc --noEmit` over `src` + `tools`                                    | Works, but ~40% of modules still error (transition in progress) |
| `.d.ts` generation | `vite-plugin-dts` with `skipDiagnostics: true`                         | Depends on the TS **programmatic API**                          |
| Lint               | ESLint 8 + `@typescript-eslint` 6 + legacy `.eslintrc.json`            | Too old for TS 7; type-checked lint is slow                     |
| Legacy tooling     | `make` (CoffeeScript/phantomjs/uglify-js)                              | Dead, misleading — superseded by Vite                           |
| WSL cruft          | `mepto.ts:Zone.Identifier`, `V8_OPTIMIZATION_RULES.md:Zone.Identifier` | Junk files tracked/present in tree                              |
| Build minify       | `minify: false` (terser not installed)                                 | Ships unminified; `size-limit` measures unminified output       |

## ⚠️ Critical constraint: TypeScript 7.0 and `vite-plugin-dts`

Verified via research (2026-07-21):

- **TS 7.0 is GA** (July 8 2026). Install as plain `typescript@7`; `tsc` is the Go binary. There is **no separate `tsgo` command** in stable — that only exists in the `@typescript/native-preview` nightly.
- TS 7.0 is a **port, not a rewrite** — identical type-checking semantics, so `tsc --noEmit` behavior is unchanged.
- **TS 7.0 ships without a stable programmatic API** (Microsoft expects 7.1 to deliver a new one). `vite-plugin-dts` uses that API to emit declarations.

**Implication:** type-_checking_ can move to TS 7 immediately (huge speedup); `.d.ts` _generation_ cannot rely on TS 7 + `vite-plugin-dts` until that toolchain supports 7.x. We decouple the two.

Sources:

- https://www.theregister.com/devops/2026/07/09/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- https://www.digitalapplied.com/blog/typescript-7-0-ga-native-compiler-migration-playbook-2026

## Plan

### Phase 0 — Cleanup (no behavior change, low risk)

- Remove dead build tooling: `make` (CoffeeScript/phantomjs), and any `OPITMIZATIONS.md` typo'd artifacts left as needed.
- Remove WSL junk: `mepto.ts:Zone.Identifier`, `V8_OPTIMIZATION_RULES.md:Zone.Identifier`; add `*:Zone.Identifier` to `.gitignore`.
- Result: the tree reflects the actual (Vite) build.

### Phase 1 — Pin Node 25 (single source of truth)

- `.nvmrc` → `25` (already set; keep).
- `package.json` `engines.node` → `">=25"` (or `"25.x"` if you want to hard-pin).
- CI matrix → drop 20/22/24, run on `25` only (optionally keep one older LTS as a compat canary if desired).
- Add `"packageManager"` / `.npmrc` `engine-strict=true` so the pin is enforced locally, giving LLM contributors a fast, clear failure instead of subtle version drift.
- Update `CONTRIBUTING.md` / `AGENTS.md` to state Node 25.

### Phase 2 — TypeScript 7.0 upgrade (staged)

**2a. Type-checking on TS 7 (the fast win)**

- Bump `typescript` to `^7.0.0`.
- `npm run typecheck` (`tsc --noEmit`) now runs on the Go compiler — expect ~10x faster checks. No config change needed (semantics identical).
- Bump `@typescript-eslint/*` to the version line that supports TS 7 (v8+), and migrate ESLint to **flat config** (`eslint.config.js`) — ESLint 8's `.eslintrc.json` + typescript-eslint 6 will not support TS 7.

**2b. Keep `.d.ts` generation working (Option A — decoupled)**

- Keep a pinned devDependency `typescript@5.x` used _only_ by `vite-plugin-dts`; run type-_checking_ on TS 7. Both jobs work today.
- Pin it explicitly (e.g. an alias like `"typescript-5": "npm:typescript@^5.9.0"`, or an npm `overrides` entry scoped to `vite-plugin-dts`) so the two TS versions can't collide.
- Track migration off the dual-TS setup as a follow-up once `vite-plugin-dts` supports TS 7 / after TS 7.1's programmatic API lands.

**2c. Gate the transition**

- Keep `skipDiagnostics`/tolerant behavior only where the transition genuinely still errors; add a checklist in `AGENTS.md` of remaining unconverted modules so contributors (human or LLM) know what's expected to error.

### Phase 3 — Performant + LLM-friendly dev/build

- **Fast lint for the inner loop:** add `oxlint` (Rust) as the fast pre-commit/CI first-pass, keeping type-aware ESLint as the thorough gate. Gives LLMs sub-second lint feedback. Wire `oxlint` into `lint-staged`/pre-commit; run both in CI (oxlint first, fail fast).
- **Enable minification** for published output (`minify: 'esbuild'` — no terser dependency needed) so `size-limit`'s 15KB budget measures shipped bytes. Keep sourcemaps.
- **Speed up `size`**: `size` currently runs a full `build` first; keep, but ensure the build is incremental where possible.
- **Deterministic, documented commands** for agents:
  - Ensure every gate in `CONTRIBUTING.md`'s "Required local checks" maps to one npm script and passes on a clean checkout (removing the "first run will fail on existing debt" caveat as the transition completes).
  - Add a single `npm run verify` aggregate (typecheck + lint + test + build + size) so an LLM has one canonical "is my change good?" command.
- **CI caching:** already uses `cache: npm`; add Playwright browser caching and build-artifact reuse across jobs to cut CI wall-time.
- Keep the no-build test path (`index.html` loads source via ES modules) — it's a strong LLM-friendly feature; document it prominently.

## Suggested sequencing / PRs

1. PR1: Phase 0 cleanup + Phase 1 Node pin (small, mergeable immediately).
2. PR2: Phase 2a/2b — TS 7 typecheck + flat-config ESLint + dts strategy.
3. PR3: Phase 3 — minify, `verify` script, oxlint eval, CI caching.

## Decisions (locked 2026-07-21)

1. **Node pin:** Hard-pin `25.x`. `engines.node` = `"25.x"`, `engine-strict=true`, CI matrix collapses to node `25` only (no older-LTS canary).
2. **`.d.ts` strategy:** **Option A** — typecheck on TS 7, keep a pinned `typescript@5.x` devDependency used only by `vite-plugin-dts`. Revisit after TS 7.1's programmatic API lands.
3. **Linter:** **Add `oxlint`** as the fast first-pass (pre-commit + CI), keep type-aware ESLint (flat config + `@typescript-eslint` v8) as the thorough gate.
4. **Minification:** **Enable `minify: 'esbuild'`** for the published bundle; `size-limit` then measures real shipped bytes against the 15KB budget. Keep sourcemaps.
