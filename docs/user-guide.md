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

1. **Type**: pick a Conventional Commit type; each shows a short description to help pick the
   right one. The built-in list is `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
   `chore`, `build`, `ci`, and you can replace it with your own (see
   [Team configuration](#team-configuration)). A type only changes the Gitmoji when you gave it an
   `emoji` yourself; the built-in types don't.
2. **Gitmoji** (hidden when emojis are disabled): a dropdown listing the full
   [official Gitmoji catalog](https://gitmoji.dev/) (~75 entries, each with its own
   description). It is the sole source of truth for the emoji prefixing the commit message —
   picking a Type does not change it, and picking a gitmoji does not change the Type.
3. **Scope**: optional. Pick from the dropdown or leave blank.
4. **Issue / Ticket ID**: auto-filled from the current Git branch name when it contains a
   ticket-like token — `feature/issue-123-login` becomes `#123`, `ABC-45-fix` becomes `ABC-45`.
   A custom `issuePattern` (see below) takes precedence. Edit or clear it freely; it is only a
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

## Team configuration

Commit conventions can live in the repository so the whole team shares them. Create
`.commit-wizard.json` at the root of the workspace (the first workspace folder):

```json
{
  "types": [
    { "name": "feat", "description": "A new feature", "emoji": "✨" },
    { "name": "fix", "description": "A bug fix", "emoji": "🐛" },
    { "name": "deps", "description": "Dependency updates", "emoji": "⬆️" }
  ],
  "scopes": [{ "name": "api", "description": "HTTP API" }],
  "emojis": true,
  "titleWarningLength": 50,
  "titleMaxLength": 72,
  "issuePattern": "(ENG-\\d+)"
}
```

Every field is optional. The extension validates the file as you edit it (bundled JSON schema, with autocompletion) and reloaded
automatically when it changes — no window reload needed.

- **`types`**: replaces the built-in list when non-empty. `name` is required (letters, digits,
  `-`, `_`; no duplicates); `description` and `emoji` are optional. When a type has an `emoji`,
  picking it preselects that Gitmoji (you can still change it).
- **`emojis`**: `false` hides the Gitmoji dropdown and drops the emoji prefix, producing
  `feat(api): add endpoint`.
- **`scopes`**: merged by name with scopes from the VS Code settings; the file wins on a clash.
- **`titleWarningLength` / `titleMaxLength`**: thresholds of the character counter. The warning
  length must not exceed the maximum, otherwise both fall back to 50 / 72.
- **`issuePattern`**: regular expression applied to the branch name; the first capture group (or
  the whole match) is used. Invalid patterns are ignored.

**Precedence**: `.commit-wizard.json` > VS Code settings > built-in defaults, field by field
(only `scopes` are merged). An invalid field is ignored and reported in a warning banner at the top
of the panel; the other fields still apply, and an invalid JSON file falls back to the settings.

## Git hooks

Run **Commit Wizard: Install Git Hooks (husky / lefthook)** from the Command Palette to set up
local checks that run before commits and pushes.

1. Pick a hook manager: **husky** (scripts in `.husky/`) or **lefthook** (a single `lefthook.yml`).
2. Tick the checks to install. Only checks that can work in your project are listed; script-based
   ones depend on your `package.json` scripts.

   | Check | Hook | Needs |
   | --- | --- | --- |
   | Lint | `pre-commit` | a `lint` script |
   | Format check | `pre-commit` | a `format:check` script |
   | Type-check | `pre-commit` | a `typecheck` script |
   | No debug statements | `pre-commit` | — (blocks staged `console.log` / `debugger` in JS/TS) |
   | Secret scan | `pre-commit` | — (private keys, AWS and GitHub tokens) |
   | Large file guard | `pre-commit` | — (staged files over 1 MB) |
   | Protected branches | `pre-commit` | — (no direct commits on `main` / `master`) |
   | Tests | `pre-push` | a `test` script |
   | Build | `pre-push` | a `compile` or `build` script |
   | Conventional Commits | `commit-msg` | — (installs commitlint) |

3. If a target file already exists with different content, a modal lists it and offers **Show
   diff** and **Overwrite**. Nothing is overwritten silently, and cancelling writes nothing.
4. The files are written to the workspace root, and the extension offers to type the dependency
   install command in a terminal. It is **never executed for you**: review it and press Enter.

The package manager is detected from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, otherwise npm).
The generated files are plain, committable files: the extension is not needed to run the hooks.

The **Conventional Commits** check generates a `commitlint.config.cjs` that accepts the optional
leading Gitmoji (`✨ feat(api): …`) and restricts the type to the ones in your configuration
(see [Team configuration](#team-configuration)). Re-run the command after changing your types to
regenerate it.

**Disabling or removing the hooks**

- Skip them once: `HUSKY=0 git commit …` / `LEFTHOOK=0 git commit …`, or `git commit --no-verify`
  from a terminal (the extension itself never uses `--no-verify`).
- Remove them: delete `.husky/` or `lefthook.yml` and `commitlint.config.cjs`, uninstall the
  packages, and run `git config --unset core.hooksPath` for husky (`npx lefthook uninstall` for
  lefthook).

## Configuration reference

| Setting | Default | Description |
| --- | --- | --- |
| `gitmojiCommit.scopes` | `[]` | `{ name, description }` scopes offered in the dropdown. |
| `gitmojiCommit.types` | `[]` | `{ name, description?, emoji? }` types; empty keeps the built-in ten. |
| `gitmojiCommit.emojis` | `true` | Prefix messages with a Gitmoji; `false` hides the dropdown. |
| `gitmojiCommit.issuePattern` | `""` | Regex to detect the issue in the branch name; empty uses the built-in detection. |
| `gitmojiCommit.titleWarningLength` | `50` | Title length that triggers the amber warning. |
| `gitmojiCommit.titleMaxLength` | `72` | Title length that triggers the red warning. |

All of these can also be set in `.commit-wizard.json`, which takes precedence.
