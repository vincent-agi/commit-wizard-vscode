# ADR 0002: State Management and Persistence via Workspace Configuration

## Status

Accepted

## Context

Users need a project-specific list of commit scopes (e.g. `webview`, `parser`, `ci`) that:

- is shared with teammates through version control,
- can be extended ad-hoc from the sidebar UI (a "+ Add scope" action) without editing JSON by
  hand,
- does not require a custom database, external file format, or `globalState`/`workspaceState`
  (which are not visible to teammates and not stored in the repo).

## Decision

Store the scope list under the `gitmojiCommit.scopes` key using
`vscode.workspace.getConfiguration('gitmojiCommit')`, written with
`ConfigurationTarget.Workspace`. This resolves to `.vscode/settings.json` in the workspace root
for single-root workspaces.

## Rationale

- **Team-shareable by default.** `.vscode/settings.json` is ordinarily committed to the repo, so
  a scope added by one contributor is available to everyone after a `git pull` — no separate
  sync mechanism needed.
- **No custom persistence layer.** `vscode.workspace.getConfiguration` already provides typed
  read/write, defaulting, and change notifications (`onDidChangeConfiguration`), so the
  extension does not need to hand-roll file I/O, locking, or schema migration.
- **Declarative defaults.** The configuration schema is declared once in `package.json`
  (`contributes.configuration`), which gives users JSON-schema validation and autocompletion in
  `settings.json` for free, and lets the "empty scopes" case degrade gracefully to `[]`.
- **Workspace scope, not global.** Scopes are almost always project-specific (a `webview` scope
  makes sense in this extension's own repo, not in an unrelated project), so
  `ConfigurationTarget.Workspace` is used rather than `Global`. `Global` would leak
  project-specific scopes into every other workspace the user opens.

## Consequences

- Adding a scope from the "+" button requires an open workspace folder; if none is open, the
  write is rejected and the user is informed (see `docs/user-guide.md`).
- Multi-root workspaces resolve `ConfigurationTarget.Workspace` to the workspace file (if any) —
  this is VS Code's own standard behavior and is not special-cased by the extension.
- Because scopes live in `settings.json`, they are visible to any other extension or tooling
  that reads workspace configuration, which is desirable for future integrations (e.g. commit
  linting) but means the key name `gitmojiCommit.scopes` must stay stable once published.
