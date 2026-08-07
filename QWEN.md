# Qwen — Project Instructions

This file is for Qwen Code only. For the shared overview and router, read `AGENTS.md` first — this file only adds Qwen-specific details.

## What Qwen reads

- `AGENTS.md` — shared router (all agents). Follow the router table to the focused skill for your task.
- `skills/*/SKILL.md` — detailed procedures (verify, migrate, perf, harness, workflow). Shared across agents.
- `.qwen/settings.json` / `.qwen/skills/` — Qwen permission allow-list and Qwen-specific skills.
- `.qwen/pending-skills/` and `.zcode/plans/` — session-local scratch; gitignored/treated as ephemeral (not the canonical plan source).

## Permissions

`.qwen/settings.json` mirrors the project's allow-list approach (safe, read-only/local commands allowed; mutating `git push`/`gh pr create` require per-command confirmation). Do not add mutating commands to `allow`. See `skills/workflow/SKILL.md` for the full confirmation gate — it applies to Qwen as well.

## Tools and skills

- **LLM test harness** — `skills/harness/SKILL.md` (`tools/llm-test-harness/bin/mepto-test.js`). Batch mode (`--batch` + `--compare` for Mepto-vs-jQuery) is the fastest way to catch compatibility regressions.
- **Verification** — `skills/verify/SKILL.md` for `npm test`, Playwright unit suite, dev-server port handling, and the dual-TS build notes.
- **Contributor migration** — `skills/migrate/SKILL.md` for the 6-step TS module conversion playbook. Use before touching `src/*.ts`.
- **Consumer migration** — `skills/jquery-to-mepto/SKILL.md` and `skills/mepto-to-vanilla/SKILL.md` for LLM-driven jQuery→Mepto and Mepto→vanilla ports. Load one at a time.
- **Git / GitHub** — `skills/workflow/SKILL.md` for branch/commit conventions, `qwen review fetch-pr` (never `gh pr checkout`), and posting reviews via `gh api`.

## Session behavior

- Qwen may create session plans under `.zcode/plans/` or `.qwen/pending-skills/` during work — these are ephemeral and not committed as canonical plans. The project's progress tracker is `skills/migrate/SKILL.md` and `AGENTS.md`'s current-task note.
- After opening a PR, wait for the user to say CodeRabbit is ready before addressing review — same gate as in `skills/workflow/SKILL.md`.
- Follow `AGENTS.md` → router → skill. Do not infer detailed steps without opening the skill file.

## Where skills live

Focused skills are under `skills/` (shared). Qwen-specific automation skills live under `.qwen/skills/`. Root `SKILL.md` is a legacy index; prefer `skills/*/SKILL.md`.
