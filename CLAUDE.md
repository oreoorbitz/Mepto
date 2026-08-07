# Claude — Project Instructions

This file is for Claude Code only. For the shared overview and router, read `AGENTS.md` first — this file only adds Claude-specific details.

## What Claude reads

- `AGENTS.md` — shared router (all agents). Follow the router table to the focused skill for your task.
- `skills/*/SKILL.md` — detailed procedures (verify, migrate, perf, harness, workflow). Shared across agents.
- `.claude/settings.json` / `.claude/settings.local.json` — permission allow-list for this repo.
- `.claude/skills/playwright-cli/SKILL.md` — browser automation skill (plus references under `.claude/skills/playwright-cli/references/`).

## Permissions

Committed `.claude/settings.json` allows only safe, read-only/local commands (`git status/log/diff`, `gh pr view/list`, etc.). Mutating commands (`git push`, `gh pr create/merge`, `git reset --hard`, `gh release`) are intentionally in **neither** `allow` nor `deny` — they fall through to the per-command prompt, which is the confirmation gate. See `skills/workflow/SKILL.md` for the full gate and the `deny`-vs-prompt rationale.

Do not add `push`/`merge`/`release` to `allow`. Do not edit `.claude/settings.local.json` (personal, gitignored per `AGENTS.md`).

## Tools and skills

- **Browser / Playwright** — use the `playwright-cli` skill at `.claude/skills/playwright-cli/SKILL.md` for `playwright-cli open/goto/click/fill/eval/snapshot` workflows. For the Mepto test suites, prefer `npx playwright test test/e2e/unit-suite.spec.ts --project=chromium` as described in `skills/verify/SKILL.md`.
- **LLM test harness** — `skills/harness/SKILL.md` (`tools/llm-test-harness/bin/mepto-test.js`). Prefer batch mode for multiple cases.
- **Migration** — `skills/jquery-to-mepto/SKILL.md` (jQuery→Mepto) and `skills/mepto-to-vanilla/SKILL.md` (Mepto→vanilla) for LLM-driven ports. Load one at a time.
- **Git / GitHub** — `skills/workflow/SKILL.md` for branch naming, commit style, PR flow, and `gh` patterns. Use `qwen review fetch-pr` for PR review (see workflow skill).

## Workflow

Follow `AGENTS.md` → router → skill. Notify before any push/PR/release (workflow skill's confirmation gate). After opening a PR, wait for the user to say CodeRabbit is ready before addressing review comments.

## Where skills live

New focused skills are under `skills/` (verify, migrate, perf, harness, workflow). Root `SKILL.md` is retained as a legacy index but the `skills/*/SKILL.md` files are canonical.
