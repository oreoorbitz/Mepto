---
name: workflow
description: Git and GitHub workflow for agents — branches, commits, confirmation gate, gh CLI patterns, and PR handling. Read before pushing, opening PRs, or reviewing.
---

# Workflow — Git & GitHub for Agents

Supplements the human-facing `CONTRIBUTING.md` (authoritative for project norms). This file governs LLM agent interaction with git/GitHub.

## Task → PR → review loop

1. **Do the task** — implement and verify (tests, lint, typecheck).
2. **Ask before publishing** — when verified, ask the user whether to commit, push, and open a PR. Do not run those steps unasked (see confirmation gate).
3. **Wait for CodeRabbit** — after PR is open, stop. Do not poll for review comments or address them preemptively. Wait until the user says CodeRabbit comments are ready, then review and fix only findings still valid.

## Repository layout

- `origin` → `oreoorbitz/Mepto` (fork this clone pushes to)
- `upstream` → `madrobby/zepto` (original zepto — read-only reference, do not push)
- Default branch: `main`. Release branches (`1.1-stable`) exist on remotes — don't touch without maintainer sign-off.

## Authentication

`gh` CLI must be authenticated before any GitHub API call. Check `gh auth status`. If it fails, the user must run `gh auth login` interactively — agents cannot complete the OAuth browser flow.

## Commit messages — Conventional Commits

```
<type>(<optional scope>): <imperative subject, lowercase, ≤72 chars>

<optional body explaining why, not what>
```

- `type` ∈ `feat | fix | refactor | chore | ci | build | docs | test | perf`
- Imperative mood (`add` not `added`), no trailing period, English only
- Scope optional (`fix(ajax):`, `feat(event):`) — use when change is confined to one module
- One logical change per commit — if you need "and also", split it
- Recent history uses `fix:`, `build:`, `ci:`, `chore:`, `refactor:` — older informal messages predate CI

## Branch naming

`<type>/<short-kebab-desc>` — e.g. `feat/ts7-typecheck`, `fix/ajax-jsonp`, `chore/deps-bump`. Match the primary commit type. Keep short but searchable.

## Squash merges and PR titles

Repo uses squash merges. The squashed commit takes its message from the **PR title**, so:

- PR title reads like a final commit subject (`fix(ajax): handle empty response`, not `fixes`)
- PR description expands on the "why" — becomes the squashed commit body

## Confirmation gate

**Always confirm with the user before running any of these**, even if the task implies it. Prior approval for one instance does not authorize future instances unless the user granted durable pre-authorization in `QWEN.md` or `AGENTS.md`.

| Command                                           | Why                          |
| ------------------------------------------------- | ---------------------------- |
| `git push` (any form)                             | Publishes; visible to others |
| `git push --force` / `--force-with-lease`         | Rewrites public history      |
| `git reset --hard <shared ref>`                   | Discards commits             |
| `git branch -D` / `git tag -d` (shared)           | Deletes work                 |
| `git rebase -i`                                   | TUI + rewrites history       |
| `gh pr create` / `merge` / `close`                | Visible, hard to reverse     |
| `gh pr review --approve/--request-changes` (post) | Public verdict               |
| `gh issue close` / `edit`                         | Mutates shared state         |
| `gh release create` / `delete`                    | Publishes artifacts          |

**Safe without confirmation** (read-only, local, or reversible):

- `git status`, `log`, `diff`, `show`, `fetch`, `blame`, `branch` (list), `remote`, `config --get/--list`, `stash list`, `stash`/`stash pop`
- `git add`, `git commit` (local only — pushing still needs confirmation), `checkout -b <new-local-branch>`, `switch`
- `gh auth status`, `gh pr view/list/checks/diff`, `gh issue view/list`, `gh repo view`, `gh api` for GET only
- `qwen review fetch-pr` / `cleanup` (worktree isolation, no main-tree mutation)

## gh CLI patterns

- **Fetch a PR for review:** use `qwen review fetch-pr`, never `gh pr checkout` (mutates working tree). See `/review` skill.
- **Post a review:** `gh api repos/{owner}/{repo}/pulls/{n}/reviews --input <file.json>`, not `gh pr review` (no inline comment support).
- **Read PR metadata:** `gh pr view <n> --json <fields>` preferred over plain view (machine-readable, no TUI).

## Permissions — `.claude/settings.json` design

Committed, shared `.claude/settings.json` lists only safe, read-only/local commands in `allow`. Dangerous/mutating commands appear in **neither** `allow` nor `deny` — so they fall through to the per-command prompt, which _is_ the confirmation gate.

- `allow` → runs without prompt (unsafe for `push`)
- `deny` → forbidden even when user approves (blocks legitimate one-off approvals)
- Neither → prompts each time (desired for `push`, `pr create/merge`, etc.)

An `_comment` field in the JSON explains the omission of `deny` to future readers.

## Do not edit

- `.claude/settings.local.json` — personal, gitignored
- `tools/llm-test-harness/` — harness source (only when improving the harness itself)
- `.zcode/plans/` / `plans/` — planning documents (archived; see `skills/migrate/SKILL.md` for current status)
