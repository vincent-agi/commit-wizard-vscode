# Local Installation Guide

This guide covers installing **Conventional Gitmoji Commit** locally, from source, without
publishing to the Marketplace. Two paths are covered:

- **Path A — Install the packaged `.vsix`** into your regular VS Code, so it behaves like any
  installed extension (persists across restarts, shows in the Extensions list).
- **Path B — Run it in an Extension Development Host** (`F5`), for iterating on the code without
  installing anything.

Use Path A to just use the extension day-to-day. Use Path B while developing it (see
`docs/playbook-runbook.md` for the full dev loop, debugging, and troubleshooting).

## Prerequisites

- Node.js 18+ and npm.
- VS Code 1.85+.
- The `code` CLI on your `PATH` (recommended, not required — see the troubleshooting note below
  if `code` is not found).

## Path A: Build and install the `.vsix`

### 1. Install dependencies

```bash
npm install
```

### 2. Build and package

```bash
npm run compile   # type-check + bundle to dist/
npm run package    # runs vsce package --allow-missing-repository
```

This produces `conventional-gitmoji-commit-0.1.0.vsix` in the project root (the version number
matches `version` in `package.json`).

### 3. Install the `.vsix`

Pick one:

**CLI:**

```bash
code --install-extension conventional-gitmoji-commit-0.1.0.vsix
```

**UI:** Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`) → `...` menu (top-right) → **Install
from VSIX...** → select the file.

**Drag and drop:** drag the `.vsix` file onto the VS Code window.

### 4. Verify

Reload VS Code if prompted. Open any folder containing a Git repository — a new icon appears in
the Activity Bar; clicking it opens the **Commit Builder** sidebar view. Confirm it's active:
Extensions view → search "Conventional Gitmoji Commit" → should show as installed and enabled.

### 5. Updating after a code change

VS Code does not hot-reload installed (non-dev) extensions. After changing source:

```bash
npm run compile
npm run package
code --install-extension conventional-gitmoji-commit-0.1.0.vsix --force
```

`--force` re-installs over the existing version even though the version number hasn't changed.
(Bump `version` in `package.json` first if you want the Extensions view to show it as an update
rather than a silent reinstall.)

### 6. Uninstalling

```bash
code --uninstall-extension vincent-agi.conventional-gitmoji-commit
```

or Extensions view → find it → gear icon → **Uninstall**.

## Path B: Run without installing (Extension Development Host)

For active development, skip packaging entirely:

1. `npm install`
2. Open the project folder in VS Code.
3. Press `F5` (runs `npm: watch` automatically as the `preLaunchTask`, then launches a new
   **Extension Development Host** window with the extension loaded — nothing is installed into
   your main VS Code).
4. Open a Git repository in that new window to use the sidebar.

Closing the Extension Development Host removes it completely; nothing persists. See
`docs/playbook-runbook.md` for reload/debugging details.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `code: command not found` | Open VS Code → Command Palette → **Shell Command: Install 'code' command in PATH**. Or call the CLI by full path: macOS `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"`, then the same `--install-extension ...` argument. |
| `vsce package` errors about a missing/undetected repository | Already handled: `npm run package` passes `--allow-missing-repository`. If you add a `repository` field to `package.json` later, this flag becomes unnecessary. |
| Installed extension doesn't reflect recent source changes | You installed an old `.vsix`, or skipped `--force` on reinstall with an unchanged version number — see step 5 above. |
| Sidebar icon missing after install | Reload the window (Command Palette → **Developer: Reload Window**), or fully restart VS Code. |
| Want both: an always-on daily copy and a dev copy | They coexist without conflict — Path A installs into your normal profile; Path B's Extension Development Host runs an isolated instance regardless of what's installed. |
