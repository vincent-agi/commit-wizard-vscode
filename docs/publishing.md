# Publishing to the VS Code Marketplace

This covers publishing **Commit Wizard** to the
[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/vscode), using `vsce`
(`@vscode/vsce`, already a devDependency — see `docs/playbook-runbook.md` for local
build/package steps this builds on).

## Gaps to close before the first publish

The project currently packages fine locally (`npm run package`, using
`--allow-missing-repository` — see `docs/playbook-runbook.md`), but three things `vsce publish`
will refuse or the Marketplace listing will look broken without:

1. **A PNG icon.** `media/icon.svg` is only the Activity Bar icon (SVG is fine there). The
   Marketplace listing icon must be set via a top-level `"icon"` field in `package.json`
   pointing at a **128×128 PNG** (SVG is not accepted for this field). Add one, e.g.
   `media/marketplace-icon.png`, and add `"icon": "media/marketplace-icon.png"` to
   `package.json`.
2. **A `repository` field**, or keep using `--allow-missing-repository` at publish time too.
   Recommended once the repo has a real remote:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/<owner>/<repo>.git"
   }
   ```
   Without it, README links that reference the repo won't resolve, and the Marketplace page
   won't show a "Repository" link.
3. **A remote for this repo.** `git remote -v` currently prints nothing — publishing itself
   doesn't require a remote, but steps 1–2 above and any CI-based publish workflow do.

None of these block a first manual `vsce publish` if you pass `--allow-missing-repository`, but
fix at least the icon before publishing — Marketplace listings without one look unfinished.

## One-time setup

### 1. Create an Azure DevOps organization

The Marketplace uses Azure DevOps for authentication. If you don't have one:
[dev.azure.com](https://dev.azure.com) → sign in with the Microsoft account you'll publish
under → create an organization (any name, it's not shown to users).

### 2. Create a Personal Access Token (PAT)

In that Azure DevOps organization: **User settings → Personal access tokens → New Token**.

- **Organization**: "All accessible organizations".
- **Scopes**: "Custom defined" → **Marketplace → Manage**.
- Copy the token immediately — it's shown once.

### 3. Create the publisher

The `publisher` field in `package.json` is already set to `vincent-agi`. Create it once (skip if
it already exists) at
[marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage), or from the
CLI:

```bash
npx vsce create-publisher vincent-agi
```

### 4. Log in with vsce

```bash
npx vsce login vincent-agi
```

Paste the PAT when prompted. This caches the token locally (`~/.vsce`) so subsequent `publish`
calls don't ask again.

## Publishing a release

### 1. Bump the version and update docs

Conventional Commits history (`git log`) is the source of truth for what changed — write it up
wherever the project keeps release notes (a `CHANGELOG.md` isn't set up yet; add one if the
Marketplace changelog tab matters to you).

### 2. Verify a clean local build first

```bash
npm install
npm run compile
npm test
npx vsce package --allow-missing-repository   # or drop the flag once `repository` is set
```

Install the resulting `.vsix` locally (see `docs/installation-local.md`) and sanity-check the
sidebar before publishing — the Marketplace has no unpublish-and-fix-forward workflow that
doesn't leave a version gap.

### 3. Publish

```bash
npx vsce publish [patch|minor|major]
```

- With a version bump keyword (`patch`/`minor`/`major`), `vsce` bumps `package.json`'s
  `version`, commits that bump, tags it, and publishes — same semver semantics as `npm version`.
  This requires a clean git working tree (commit or stash first).
- Without an argument, it publishes whatever `version` is currently in `package.json` — bump it
  yourself first if needed.
- Without a `repository` field, add `--allow-missing-repository` here too.

`vsce publish` builds via `vscode:prepublish` (`npm run compile`) before packaging, so a stale
`dist/` is never published.

### 4. Verify the listing

Check `https://marketplace.visualstudio.com/items?itemName=vincent-agi.commit-wizard-vscode`
(propagation can take a few minutes) — icon, README rendering, and the version number.

## Publishing a pre-release

To ship a build for testing without it being everyone's default install:

```bash
npx vsce publish --pre-release
```

Users see it only if they've opted into pre-release versions for the extension in VS Code.

## Unlisting or removing a version

- **Unpublish the whole extension**: `npx vsce unpublish vincent-agi.commit-wizard-vscode`
  — irreversible without republishing from scratch under the same identifier; VS Code warns
  before completing.
- There is no way to delete a single published version — ship a new one instead.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Personal Access Token verification failed` | Token expired or wrong scope — recreate it with Marketplace → Manage, then `vsce login` again. |
| `Publisher '...' not found` | `publisher` in `package.json` doesn't match a publisher you've created — run `vsce create-publisher` or fix the field. |
| Marketplace page has a broken/generic icon | Missing top-level `"icon"` in `package.json`, or it points at an SVG instead of a PNG. |
| `vsce publish` refuses with a repository warning | Add a `repository` field, or pass `--allow-missing-repository`. |
| `vsce publish patch` fails immediately | Working tree isn't clean — commit or stash pending changes first (it needs to commit the version bump). |
| Users don't see the new version | Marketplace CDN propagation lag — wait a few minutes; force-refresh the extension's page. |
