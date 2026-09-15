# ADR 0001: Webview View API over QuickPick

## Status

Accepted

## Context

The extension must collect several related fields (commit type, scope, issue ID, short
description, body, breaking-change flag) and show a live-updating preview of the resulting
commit message before it is written anywhere.

Two native VS Code UI approaches were considered:

1. **QuickPick / InputBox chains** — a sequence of `vscode.window.showQuickPick` and
   `vscode.window.showInputBox` calls, one per field.
2. **Webview View API** (`vscode.window.registerWebviewViewProvider`) — a persistent panel
   docked in the Primary Sidebar, rendering an HTML form.

## Decision

Use the **Webview View API**, docked in the Activity Bar / Primary Sidebar.

## Rationale

- **All fields visible at once.** QuickPick chains force a strictly sequential,
  one-field-at-a-time flow with no way to see or edit earlier answers without restarting the
  chain. A commit message has interdependent fields (type + scope + issue determine the title
  line the user is trying to keep under 50/72 chars), so simultaneous visibility matters.
- **Live preview requires a persistent render target.** QuickPick has no space to render a
  continuously updating formatted-commit-message preview alongside input. A webview does.
- **Native styling still achievable.** VS Code exposes CSS custom properties
  (`--vscode-input-background`, `--vscode-button-background`, `--vscode-focusBorder`, etc.) that
  let a webview form look and feel native without QuickPick's inherent step-by-step limitation.
- **Persistence across sidebar toggles.** A `WebviewViewProvider` can retain its HTML/state
  when `retainContextWhenHidden` is set, so switching away from the sidebar and back does not
  reset in-progress input — QuickPick has no equivalent notion of "in-progress state."

## Consequences

- Requires a Content Security Policy with a nonce, and explicit message-passing
  (`postMessage`/`onDidReceiveMessage`) between the webview and the extension host, instead of
  simply returning values from `showQuickPick`/`showInputBox` promises.
- The extension owns HTML/CSS/JS generation for the webview, which is more code than a QuickPick
  chain, but is isolated into dedicated generator modules (see ADR 0002 for state, and
  `docs/technical-docs.md` for the module layout) to keep it testable and maintainable.
- Core commit-formatting logic is kept in plain TypeScript modules with no dependency on
  `vscode` or the webview runtime, so it is unit-testable in isolation regardless of which UI
  surface calls it.
