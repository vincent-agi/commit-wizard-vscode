# Conventional Gitmoji Commit

Build [Conventional Commits](https://www.conventionalcommits.org/) with matching
[Gitmoji](https://gitmoji.dev/) from a sidebar form in VS Code, with a live preview and
one-click injection into the Source Control input box.

In the source repository, see `docs/user-guide.md` for usage, `docs/technical-docs.md` for
architecture, `docs/adr/` for design decisions, and `docs/playbook-runbook.md` for setup,
debugging, and packaging.

## Features

- Sidebar **Commit Builder** view (Webview View API) with native VS Code styling.
- Fixed `type` + Gitmoji dropdown (`feat` ✨, `fix` 🐛, `docs` 📝, `style` 🎨, `refactor` ♻️,
  `perf` ⚡, `test` 🧪, `chore` 🔧, `build` 🏗️, `ci` 💚).
- Project-specific, team-shareable **scopes** (`gitmojiCommit.scopes` in
  `.vscode/settings.json`), extendable from the UI.
- **Issue/ticket auto-detection** from the current Git branch name.
- Live **character counter** with 50/72-character warnings on the title.
- **Live preview** of the formatted commit message.
- One click **Fill Commit** injects the message into the active repository's commit input box.

## Quick start

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. See `docs/playbook-runbook.md`
in the source repository for the full workflow.
