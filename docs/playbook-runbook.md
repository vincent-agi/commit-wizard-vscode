# Playbook / Runbook

## Prerequisites

- Node.js 18+ and npm.
- VS Code 1.85+ (matches `engines.vscode` in `package.json`).

## Setup

```bash
npm install
```

## Local development (F5)

1. Open the project root in VS Code.
2. Run `npm run watch` in a terminal (esbuild watch mode; keep it running), or just press `F5` —
   the default `Run Extension` launch config runs `npm: watch` as its `preLaunchTask`.
3. Press `F5` (or **Run > Start Debugging**). A new **Extension Development Host** window opens
   with the extension loaded.
4. Open a Git repository in that host window, click the Activity Bar icon to open **Commit
   Builder**, and exercise the form.
5. Edit source, save — esbuild watch rebuilds `dist/extension.js`; reload the Extension
   Development Host window (`Cmd+R` / `Ctrl+R` inside it, or the **Developer: Reload Window**
   command) to pick up changes.

`.vscode/launch.json` and `.vscode/tasks.json` provide this out of the box (see below).

## Running tests

```bash
npm test            # Vitest, single run — core/* unit tests
npm run test:watch  # Vitest watch mode
```

Unit tests cover `src/core/*` only — no VS Code runtime required, so they run in plain Node and
are fast enough for a pre-commit loop.

Integration/E2E tests that need the real Extension Host use `@vscode/test-electron`
(`src/test/runTest.ts`, not wired into `npm test` to keep the default loop fast). Run them with:

```bash
npm run test:e2e   # compiles, downloads/launches a real VS Code, runs src/test/suite/*.test.ts
```

This downloads a full VS Code build on first run and spawns its Electron binary directly — it
needs a normal desktop session and will not run inside a locked-down sandbox/CI container
without Electron/GUI support (spawn fails with `ENOENT`/`code -2` there). Run it on a local
machine or a CI runner with `xvfb`/headless display support.

## Linting & formatting

```bash
npm run lint     # ESLint over src/**/*.ts
npm run format   # Prettier --write
```

## Building

```bash
npm run compile  # tsc typecheck + esbuild bundle -> dist/extension.js
```

## Packaging

```bash
npx vsce package
```

Produces `conventional-gitmoji-commit-<version>.vsix` in the project root. Sanity-check the
package contents first if `.vscodeignore` changes:

```bash
npx vsce ls
```

Install the packaged `.vsix` locally to verify: Extensions view -> `...` -> **Install from
VSIX...**.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Sidebar icon missing | Extension not activated / `dist/extension.js` missing | Run `npm run compile`, reload window |
| Webview shows blank panel | CSP nonce mismatch or JS error in `clientScript.ts` | Open **Developer: Toggle Developer Tools** in the Extension Development Host, check the Console tab scoped to the webview |
| "No Git repository found" warning on Fill Commit | No folder open, or `vscode.git` extension disabled | Open a folder containing a Git repo; check Extensions view that "Git" (`vscode.git`) is enabled |
| "+" add-scope does nothing | No workspace folder open | Open a folder — `ConfigurationTarget.Workspace` writes require one |
| Issue field not auto-filled | Branch name has no ticket-like token | Expected — see `docs/technical-docs.md` matching rules; edit manually |
| `vsce package` fails on missing `README.md`/`LICENSE` | `vsce` requires these by default | Add a `README.md` (and `LICENSE` if publishing) at the project root |
| Vitest can't resolve `vscode` in a `core/*.spec.ts` | A `core/*` module accidentally imports `vscode` | `core/*` must stay VS Code-free by design (ADR 0001) — move the VS Code-dependent code to `webview/` or `git/` |
