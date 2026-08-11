# Mepto — Agent Guide

Mepto is a lightweight, jQuery-compatible DOM library for evergreen browsers (no IE, no legacy Edge, no Safari < 14). Goal: match jQuery ergonomics while beating it on perf — fewer reflows, repaints, thrashes, and DOM queries. Teams can gradually replace jQuery and often gain performance. See `README.md` for user-facing docs, `CONTRIBUTING.md` for human contributor workflow.

**Runtime: Node 24 LTS required** (`.nvmrc` = 24, `engines.node` = `24.x`, `engine-strict`). Run `nvm use` — other versions are rejected.

---

## Router — read the focused skill for your task

| You are…                                                                                                            | Read this first                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Verifying a change, running tests, starting the dev server, dealing with ports or build noise, TypeScript toolchain | `skills/verify/SKILL.md`                                                                           |
| Converting a JS module to TypeScript, touching `src/*.ts`, or checking transition status                            | `skills/migrate/SKILL.md`                                                                          |
| Changing any DOM-heavy API, batching, caching, or animation code                                                    | `skills/perf/SKILL.md` (+ `V8_OPTIMIZATION_RULES.md` for hot paths)                                |
| Running isolated snippets against Mepto or comparing with jQuery                                                    | `skills/harness/SKILL.md` (`tools/llm-test-harness/`)                                              |
| Pushing, opening a PR, or interacting with GitHub                                                                   | `skills/workflow/SKILL.md`                                                                         |
| Migrating **jQuery → Mepto** (drop-in, known deltas)                                                                | `skills/jquery-to-mepto/SKILL.md`                                                                  |
| Migrating **Mepto → vanilla JS** (bridge APIs, phases)                                                              | `skills/mepto-to-vanilla/SKILL.md`                                                                 |
| Deploying Shopify Timber 1.0 via bundled ThemeKit fork (Mimber)                                                     | `vendor/themekit/README.md` + `tools/themekit.mjs` (`oreoorbitz/themekit`, Go, `npm run themekit`) |
| Human contributor setup, test tiers, or PR checklist                                                                | `CONTRIBUTING.md`                                                                                  |
| End-user install, usage, browser support, what's included                                                           | `README.md`                                                                                        |
| Claude-specific / Qwen-specific tooling                                                                             | `CLAUDE.md` / `QWEN.md`                                                                            |

Do not guess past the router — open the skill. Each skill is the single source of truth for its domain; `AGENTS.md` stays short by design.

---

## Minimal verify loop (no build needed)

```bash
npm test                                              # Vitest in jsdom, ~1s, 96 tests
npx playwright test test/e2e/unit-suite.spec.ts --project=chromium  # 234 tests, ~2s
```

Root `index.html` is a QA directory; the 234-test suite lives at `test/index.html` and loads Mepto from source. No build step needed for testing. Details, port handling, and build noise notes are in `skills/verify/SKILL.md`.

---

## Agent entry points

- **All agents** — this file (`AGENTS.md`) is auto-loaded by most harnesses. Start here, then follow the router.
- **Claude Code** — also reads `CLAUDE.md` at repo root (Claude-specific paths, permissions, and `playwright-cli` references under `.claude/skills/`).
- **Qwen Code** — also reads `QWEN.md` at repo root (Qwen-specific permissions and session plans under `.qwen/`).
- **Cursor** — reads `.cursor/rules/formatting.mdc` for style; otherwise follows this file.

The skill files under `skills/` are shared across all agents. Agent-specific files only contain what differs (auth, allow-lists, tooling).

---

## Do not edit

- `.claude/settings.local.json` — personal permissions (gitignored)
- `tools/llm-test-harness/` — harness source (only when improving the harness)
- `.qwen/` — local Qwen state (gitignored via `.gitignore`)
- Generated outputs: `dist/`, `.port`, `coverage/`, `playwright-report/`

For the "why" behind these exclusions and the full allow-list design, see `skills/workflow/SKILL.md`.

---

## Quick references

- **Browser target:** evergreen only. Use `WeakMap`, `WeakSet`, `queueMicrotask`, `AbortController`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, `classList`, `closest`, `dataset` freely. Remove legacy-compat code when you encounter it (`skills/migrate/SKILL.md`).
- **Current task:** TypeScript transition (~40% complete) — see `skills/migrate/SKILL.md` for per-file status and the 6-step conversion playbook.
- **Detailed procedures:** `SKILL.md` at repo root is retained as a legacy index; new focused skills under `skills/` supersede it. Prefer the `skills/*/SKILL.md` files for the most current instructions.
