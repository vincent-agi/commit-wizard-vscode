import * as vscode from 'vscode';
import { generateNonce } from '../webview/html';
import { getStyles } from '../webview/styles';

const EXTRA_STYLES = `
  #labels { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
  #labels label { margin: 0; font-weight: normal; display: flex; align-items: center; gap: 4px; }
  #labels:empty::after { content: '(sign in to load the repository labels)'; color: var(--vscode-descriptionForeground); }
  .hidden { display: none !important; }
  #banner { margin-bottom: 8px; padding: 6px 8px; border-radius: 2px; border: 1px solid var(--vscode-editorWarning-foreground); }
  #banner.error { border-color: var(--vscode-editorError-foreground); }
  #banner.success { border-color: var(--vscode-testing-iconPassed, var(--vscode-editorInfo-foreground)); }
  #banner:empty { display: none; }
  textarea { min-height: 54px; }
  #issuePreview { margin-top: 14px; }
  button { margin-top: 10px; }
`;

/** HTML of the "New Issue or Milestone" panel, with a nonce-scoped CSP. */
export function generateIssueFormHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = generateNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'issueForm.js'));
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>${getStyles()}${EXTRA_STYLES}</style>
  <title>New Issue or Milestone</title>
</head>
<body>
  <div id="repo"></div>
  <div id="banner" role="alert"></div>
  <button type="button" class="secondary hidden" id="signIn">Sign in to GitHub</button>

  <label for="mode">Create a</label>
  <select id="mode">
    <option value="issue">Issue</option>
    <option value="milestone">Milestone</option>
  </select>

  <section id="issueFields">
    <label for="type">Type</label>
    <select id="type"></select>

    <label for="scope">Scope</label>
    <select id="scope"><option value="">(none)</option></select>

    <label for="title">Title</label>
    <input type="text" id="title" placeholder="short summary of the change" />

    <label for="context">Context</label>
    <textarea id="context" placeholder="Why does this matter?"></textarea>

    <label for="goal">Goal</label>
    <textarea id="goal" placeholder="What should be true when this is done?"></textarea>

    <label for="scopeItems">Scope (one item per line)</label>
    <textarea id="scopeItems"></textarea>

    <label for="acceptanceCriteria">Acceptance criteria (one per line)</label>
    <textarea id="acceptanceCriteria"></textarea>

    <label for="notes">Notes</label>
    <textarea id="notes"></textarea>

    <label>Labels</label>
    <div id="labels"></div>

    <label for="milestone">Milestone</label>
    <select id="milestone"><option value="">(none)</option></select>

    <label for="assignees">Assignees</label>
    <input type="text" id="assignees" placeholder="github-login, other-login" />
  </section>

  <section id="milestoneFields" class="hidden">
    <label for="milestoneTitle">Title</label>
    <input type="text" id="milestoneTitle" placeholder="v1.0.0 - Release name" />

    <label for="milestoneDescription">Description</label>
    <textarea id="milestoneDescription"></textarea>

    <label for="milestoneDue">Due date</label>
    <input type="text" id="milestoneDue" placeholder="YYYY-MM-DD (optional)" />
  </section>

  <label>Preview</label>
  <div id="preview"></div>

  <button type="button" id="submit">Create issue</button>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
