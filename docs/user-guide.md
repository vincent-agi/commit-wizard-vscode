# User Guide

## What it does

Commit Wizard adds a **Commit Builder** panel to the Primary Sidebar. Fill in a
form, watch a live preview of the formatted commit message, then click **Fill Commit** to send
it straight into the Source Control input box — no manual typing of `type(scope): emoji ...`
required.

## Installation

1. From the `.vsix` file: open the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`) -> `...`
   menu -> **Install from VSIX...** -> select the packaged file (see
   `docs/playbook-runbook.md` for how to build it).
2. From the Marketplace (once published): search **Commit Wizard** and click
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

1. **Type**: pick one of the ten Conventional Commit types; each shows a short description
   automatically (`feat` "A new feature", `fix` "A bug fix", `docs`, `style`, `refactor`, `perf`,
   `test`, `chore`, `build`, `ci`), to help pick the right one. This dropdown carries no gitmoji
   of its own.
2. **Gitmoji**: a fully independent dropdown listing the full
   [official Gitmoji catalog](https://gitmoji.dev/) (~75 entries, each with its own
   description). It is the sole source of truth for the emoji prefixing the commit message —
   picking a Type does not change it, and picking a gitmoji does not change the Type.
3. **Scope**: optional. Pick from the dropdown or leave blank.
4. **Issue / Ticket ID**: auto-filled from the current Git branch name when it contains a
   ticket-like token — `feature/123-login` becomes `123`. Edit or clear it freely; it is only a
   starting suggestion. You can enter **several references** separated by spaces or commas
   (`12, PROJ-3`); each gets its own footer line. A dropdown next to it picks the GitHub/GitLab
   footer keyword: **Refs** (default, just links the issue), **Closes**, **Fixes**, **Resolves**
   (any of these three auto-closes the issue when the commit is merged), or **See also** (links a
   related issue without closing it). A `#` is added only to purely numeric values (`123` becomes
   `#123`); `#456` stays `#456` and Jira-style keys like `PROJ-123` are left untouched.
5. **Short description**: the one-line summary. A live character counter turns amber past 50
   characters and red past 72 (both thresholds are configurable, see below).
6. **Body**: optional multi-line details, rendered as its own paragraph after a blank line.
7. **Breaking change**: tick the checkbox to add `!` after the type/scope (`feat(api)!: …`) and
   reveal a description field; its content is emitted as a `BREAKING CHANGE:` footer.
8. **Co-authored-by**: optional, one `Name <email>` per line, each emitted as a
   `Co-authored-by:` footer. Lines that don't match the format are flagged under the field and
   left out of the message.

All footers (`BREAKING CHANGE`, issue references, `Co-authored-by`) are grouped in one block at the
end of the message, following the Git trailer format.

The **preview box** updates on every keystroke so you always see exactly what will be written.

## Sending the commit

Click **Commit now**. The message is committed to the active repository's staged changes. Your
Git hooks (`pre-commit`, `commit-msg`, …) always run — the extension never bypasses them with
`--no-verify`. The button is disabled while Git and the hooks run.

On success the description, body, breaking change and co-author fields are cleared.

If the commit fails, your input is kept and an error box appears under the button:

- **A hook rejected the commit**: the headline names the hook when it can be identified, and the
  hook's output (colors stripped, truncated if very long) is expanded below so you can fix the
  lint/test/commitlint error and retry.
- **Nothing to commit**: stage some changes first.
- **No Git repository**: open a folder that contains one.
- **Any other Git error**: the first line is shown as the headline, with the full output available.

## Configuration reference

| Setting | Default | Description |
| --- | --- | --- |
| `gitmojiCommit.scopes` | `[]` | `{ name, description }` scopes offered in the dropdown. |
| `gitmojiCommit.titleWarningLength` | `50` | Title length that triggers the amber warning. |
| `gitmojiCommit.titleMaxLength` | `72` | Title length that triggers the red warning. |
