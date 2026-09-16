# Technical Documentation

## Overview

**Conventional Gitmoji Commit** is a VS Code extension that builds
[Conventional Commits](https://www.conventionalcommits.org/) messages, each prefixed with the
matching [Gitmoji](https://gitmoji.dev/), from a form docked in the Primary Sidebar, and writes
the result into the built-in Git extension's commit input box.

## Module Layout

```
src/
  core/                     # Pure logic, zero dependency on `vscode`. 100% unit-testable.
    types.ts                # CommitType, CommitFormInput, Scope, GITMOJI_MAP, COMMIT_TYPE_DESCRIPTIONS
    formatCommit.ts         # formatCommitMessage(input) -> string
    branchIssueExtractor.ts # extractIssueFromBranch(branchName) -> string | undefined
    scopeConfig.ts          # addScope(existingScopes: Scope[], newScope: Scope) -> Scope[]
    titleLength.ts          # titleLengthStatus(title, warnAt, maxAt) -> 'ok'|'warn'|'over'
  git/
    gitExtension.ts         # Thin wrapper around the built-in `vscode.git` extension API
  webview/
    CommitViewProvider.ts   # WebviewViewProvider: wires messages <-> core logic <-> git
    html.ts                 # generateHtml(webview, extensionUri, nonce) -> string (CSP + form)
    styles.ts               # getStyles() -> string (uses VS Code theme CSS variables)
    clientScript.ts         # getClientScript() -> string (runs inside the webview sandbox)
  extension.ts              # activate()/deactivate(), registers the WebviewViewProvider
  test/
    *.spec.ts               # Vitest unit/integration specs (see docs/playbook-runbook.md)
```

The split between `core/` (pure) and `webview/` + `git/` (VS Code API-dependent) exists so that
commit formatting, branch parsing, and scope-list logic can be unit tested with Vitest without
booting the VS Code Extension Host. VS Code API-dependent code is exercised separately via
`@vscode/test-electron` integration tests.

## Core Logic

### `formatCommitMessage(input: CommitFormInput): string`

Builds the final commit message string:

```
<gitmoji> <type>(<scope>): <issue> <description>

<body>

BREAKING CHANGE: <breakingChangeDescription>
```

- `scope` is optional — when absent, the parens are omitted (`<gitmoji> <type>: ...`).
- `issue` is optional and rendered as a leading token in the title
  (e.g. `✨ feat(webview): PROJ-123 add live preview`).
- `body` is only emitted (as its own paragraph, blank-line separated) when non-empty.
- The `BREAKING CHANGE:` footer is only emitted when `breakingChange` is `true` **and**
  `breakingChangeDescription` is non-empty.
- Every `CommitType` maps to exactly one gitmoji via `GITMOJI_MAP` in `types.ts`
  (`feat`->✨, `fix`->🐛, `docs`->📝, `style`->🎨, `refactor`->♻️, `perf`->⚡, `test`->🧪,
  `chore`->🔧, `build`->🏗️, `ci`->💚).

### `extractIssueFromBranch(branchName: string): string | undefined`

Scans a branch name for the first ticket-like token and returns it normalized:

- `feature/PROJ-123-login` -> `PROJ-123`
- `bugfix/issue-456` -> `#456` (no project-key prefix, falls back to `#<number>`)
- `main`, `develop`, or a branch with no numeric/ticket token -> `undefined`

Matching rules, in order of precedence:

1. `[A-Z][A-Z0-9]+-\d+` (Jira-style project key, e.g. `PROJ-123`, `ABC12-7`).
2. `#(\d+)` (an explicit issue-hash token already in the branch name).
3. A bare `\d+` following the words `issue`, `bug`, `gh`, or `fix` (case-insensitive), returned
   as `#<number>`.

If none match, returns `undefined` — the extension leaves the Issue field blank rather than
guessing.

### `addScope(existingScopes: Scope[], newScope: Scope): Scope[]`

A `Scope` is `{ name, description }`; both fields are mandatory. Returns a new array with
`newScope` added, with `name` and `description` trimmed, sorted alphabetically by `name`. Never
mutates the input array. When `newScope.name` matches an existing entry, that entry's
`description` is replaced instead of creating a duplicate. Rejects (returns an unchanged copy)
when `name` or `description` is empty after trimming — enforced here so the "add scope" UI flow
can rely on this as the single source of truth for what counts as a valid scope.

### `titleLengthStatus(title, warnAt, maxAt): 'ok' | 'warn' | 'over'`

Pure classification used to drive the character-counter's visual state in the webview.

## VS Code API Interactions

### `vscode.workspace.getConfiguration`

`gitmojiCommit.scopes` (an array of `{ name, description }`) is read on webview load and written
(via `ConfigurationTarget.Workspace`) whenever the user adds a scope through the "+" button,
which prompts for both fields — see [ADR 0002](adr/0002-state-management-and-persistence.md).

### `vscode.git` extension API

`src/git/gitExtension.ts` wraps access to the built-in Git extension:

```ts
const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
const git = gitExtension?.getAPI(1);
const repo = git?.repositories[0];
repo?.inputBox.value = message; // "Fill Commit" action
const branchName = repo?.state.HEAD?.name; // used by extractIssueFromBranch
```

If the `vscode.git` extension is not installed/enabled, or no repository is open, the wrapper
returns `undefined` and `CommitViewProvider` shows a `vscode.window.showWarningMessage` instead
of throwing.

### Webview Communication

Messages are a small, explicit, typed protocol (`src/webview/types.ts` shares the message shape
with `clientScript.ts`):

| Direction        | Message type      | Payload                                  |
| ----------------- | ------------------ | ----------------------------------------- |
| webview -> host   | `formChanged`      | full `CommitFormInput` snapshot           |
| webview -> host   | `addScope`         | none (host shows an input box)            |
| webview -> host   | `fillCommit`       | full `CommitFormInput` snapshot           |
| host -> webview   | `init`             | `{ scopes: Scope[], detectedIssue }`      |
| host -> webview   | `scopesUpdated`    | `{ scopes: Scope[] }`                     |

The host never `eval`s or otherwise trusts webview content as executable; it only reads
plain-data fields off the `CommitFormInput` shape before passing them to `formatCommitMessage`.

### Content Security Policy

`html.ts` generates a CSP meta tag scoped to the webview's own resource URI plus a per-render
nonce:

```
default-src 'none';
style-src ${webview.cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}';
```

Only the single `<script nonce="...">` tag emitted by `html.ts` may execute; no remote scripts,
no inline `onclick=` handlers, no `eval`.

## Error Handling

- No workspace folder open when adding a scope -> `showWarningMessage`, write skipped.
- No Git repository detected on "Fill Commit" -> `showWarningMessage`, message is not lost (stays
  in the webview form).
- `vscode.git` extension missing/disabled -> same warning path, extension continues to function
  for message composition (just not injection).
