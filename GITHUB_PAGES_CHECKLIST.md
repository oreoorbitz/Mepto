# GitHub Pages Deployment Checklist

Goal: serve the documentation site at **https://oreoorbitz.github.io/Mepto/**

Current state (as investigated): the workflow, the `docs/site/` content, and the
Pages setting (`build_type: workflow`) are all in place. The only docs workflow run
**failed** because Pages was not yet enabled at the moment it ran. Re-triggering the
workflow should produce a live site.

---

## 1. Prerequisites (already done — verify)

- [x] `docs/site/` directory exists with `index.html`, `assets/main.js`,
      `assets/style.css`, `assets/meptos.umd.cjs`
- [x] `.github/workflows/docs.yml` exists, is committed, and is pushed to
      `origin/main`
- [x] Workflow builds `dist/meptos.umd.cjs` and copies it into `docs/site/assets/`
      before deploying
- [x] GitHub Pages is enabled on `oreoorbitz/Mepto` with
      **Source = GitHub Actions** (`build_type: workflow`)
- [x] `gh` CLI is authenticated (`gh auth status` → logged in as `oreoorbitz`)

> If any box above is somehow unchecked, see the "Troubleshooting" section at the
> bottom before continuing.

---

## 2. Get the site live (DONE ✓)

The docs workflow has been re-run successfully and the site is live at
**https://oreoorbitz.github.io/Mepto/** (HTTP 200).

- [x] **Re-run the failed docs workflow:**

  ```bash
  gh run rerun 30497576817 --repo oreoorbitz/Mepto --failed
  ```

- [x] **Confirm the run is green** (all steps ✓, including `deploy-pages`):

  ```bash
  gh run view 30497576817 --repo oreoorbitz/Mepto
  # → ✓ deploy in 24s
  ```

- [x] **Verify the site is live** (HTTP `200`):

  ```bash
  curl -s -o /dev/null -w "%{http_code}" -L https://oreoorbitz.github.io/Mepto/
  # → 200
  ```

- [x] **Open it in a browser:** https://oreoorbitz.github.io/Mepto/

---

## 3. Future deployments (automatic)

Once the first run succeeds, every push to `main` that changes anything under
`docs/site/**` or `.github/workflows/docs.yml` re-triggers the workflow
automatically. Nothing else to do.

- [ ] (Optional) **Update the vendored bundle locally after editing docs** so your
      local preview matches production:
  ```bash
  npm run build && cp dist/meptos.umd.cjs docs/site/assets/
  ```
  (On CI this happens automatically — the workflow runs `npm run build` then
  copies the fresh bundle into `docs/site/assets/` before uploading.)

---

## 4. Troubleshooting

**`configure-pages` fails with "Get Pages site failed / Not Found"**
This is exactly the error that caused the original failure. It means Pages was
not enabled (or not set to "GitHub Actions" source) when the run executed.
Verify in the UI: **Settings → Pages → Build and deployment → Source** must be
**GitHub Actions**. Then re-run the workflow. Verify via API:

```bash
gh api repos/oreoorbitz/Mepto/pages | jq '.build_type'   # must print "workflow"
```

**Site still 404 after a green run**
GitHub Pages can take 1–2 minutes after a successful deploy to propagate. Wait
and refresh. Check deployment status:

```bash
gh api repos/oreoorbitz/Mepto/pages | jq '.status'
```

**`gh run list` / `gh run rerun` errors with "No default remote repository"**
The repo has two remotes (`origin` and `upstream`), so `gh` can't guess which one.
Add `--repo oreoorbitz/Mepto` to every `gh` command, or run once:

```bash
gh repo set-default oreoorbitz/Mepto
```

**`npm ci` step fails on CI**
`package-lock.json` may be out of sync with `package.json`. The workflow already
falls back to `npm install` (`npm ci || npm install`), so this is non-fatal; if
you want it clean, run `npm install` locally and commit the regenerated lockfile.

**Node.js 20 deprecation warning**
Harmless for now. The workflow annotations flag that `actions/checkout@v4`,
`actions/configure-pages@v5`, and `actions/setup-node@v4` target Node 20. GitHub
is forcing them to Node 24 already. No action required; the actions will bump
their runtime in future releases.

**The workflow doesn't trigger on your push**
It only runs when files under `docs/site/**` or `.github/workflows/docs.yml`
change. If you change unrelated source, trigger it manually from the Actions tab
("Run workflow") or via:

```bash
gh workflow run docs.yml --repo oreoorbitz/Mepto
```

**`package.json` metadata points to a non-existent repo**
`homepage`, `repository.url`, and `bugs.url` all reference
`github.com/mepto/meptos` (doesn't exist). Fix to the real repo:

```json
"homepage": "https://oreoorbitz.github.io/Mepto/",
"repository": { "type": "git", "url": "https://github.com/oreoorbitz/Mepto.git" },
"bugs": { "url": "https://github.com/oreoorbitz/Mepto/issues" }
```

This doesn't block the Pages deploy, but it's wrong in npm's sidebar and the
GitHub repo's "Packages" section. Full details in `NPM_PUBLISH_CHECKLIST.md`.

**Uncommitted local changes get in the way**
The four currently-modified files (`plugins/mlick.js`, `src/mepto.test.ts`,
`src/mepto.ts`, `src/types.ts`) do not affect the docs deployment — they can be
left as-is or committed separately. The docs workflow runs from the committed
state on `origin/main`, not your working tree.
