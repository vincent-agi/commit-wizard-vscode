# User Guide

## What it does

Conventional Gitmoji Commit adds a **Commit Builder** panel to the Primary Sidebar. Fill in a
form, watch a live preview of the formatted commit message, then click **Fill Commit** to send
it straight into the Source Control input box — no manual typing of `type(scope): emoji ...`
required.

## Installation

1. From the `.vsix` file: open the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`) -> `...`
   menu -> **Install from VSIX...** -> select the packaged file (see
   `docs/playbook-runbook.md` for how to build it).
2. From the Marketplace (once published): search **Conventional Gitmoji Commit** and click
   **Install**.

## Opening the panel

Click the icon added to the Activity Bar (a clock-face circle). The **Commit Builder** view
opens in the sidebar.

## Configuring scopes

Scopes are project-specific and stored in the workspace's `.vscode/settings.json` under
`gitmojiCommit.scopes`, so they can be committed and shared with your team.

Each scope has a **name** and a mandatory short **description**, shown together in the dropdown
(e.g. `webview — Webview UI and client script`) to help pick the right one.

- **Predefine scopes**: add them directly in `.vscode/settings.json`:
  ```json
  {
    "gitmojiCommit.scopes": [
      { "name": "webview", "description": "Webview UI and client script" },
      { "name": "parser", "description": "Commit message parsing and formatting" },
      { "name": "ci", "description": "Continuous integration" },
      { "name": "docs", "description": "Documentation" }
    ]
  }
  ```
- **Add a scope from the UI**: click the **+** button next to the Scope dropdown. You're prompted
  twice — first for the scope name, then for its description; both are required, and cancelling
  either prompt aborts without saving anything. It's saved to the workspace settings immediately
  and appears in the dropdown from then on. Adding a scope with a name that already exists
  replaces its description instead of creating a duplicate entry.

If no workspace folder is open, the **+** button shows a warning instead of saving — open a
folder first.

## Filling out a commit

1. **Type**: pick one of the ten Conventional Commit types; each carries its Gitmoji and a short
   description automatically (`feat` ✨ "A new feature", `fix` 🐛 "A bug fix", `docs` 📝, `style` 🎨,
   `refactor` ♻️, `perf` ⚡, `test` 🧪, `chore` 🔧, `build` 🏗️, `ci` 💚), to help pick the right one.
2. **Scope**: optional. Pick from the dropdown or leave blank.
3. **Issue / Ticket ID**: auto-filled from the current Git branch name when it contains a
   ticket-like token — `feature/PROJ-123-login` becomes `PROJ-123`; a plain issue number becomes
   `#123`. Edit or clear it freely; it is only ever a starting suggestion.
4. **Short description**: the one-line summary. A live character counter turns amber past 50
   characters and red past 72 (both thresholds are configurable, see below).
5. **Body**: optional multi-line details, rendered as its own paragraph.
6. **Breaking change**: tick the checkbox to reveal a description field; its content is emitted
   as a `BREAKING CHANGE:` footer.

The **preview box** updates on every keystroke so you always see exactly what will be written.

## Sending the commit

Click **Fill Commit**. The formatted message is written into the active repository's Source
Control input box, exactly as if you had typed it there. Nothing is committed automatically —
review it in the Source Control view and commit as usual.

If no Git repository is detected in the current workspace, you'll see a warning and the form
keeps your input untouched so you can fix the underlying issue (e.g. open the right folder) and
retry.

## Configuration reference

| Setting | Default | Description |
| --- | --- | --- |
| `gitmojiCommit.scopes` | `[]` | `{ name, description }` scopes offered in the dropdown. |
| `gitmojiCommit.titleWarningLength` | `50` | Title length that triggers the amber warning. |
| `gitmojiCommit.titleMaxLength` | `72` | Title length that triggers the red warning. |
