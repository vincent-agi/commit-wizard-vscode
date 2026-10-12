import * as vscode from 'vscode';
import { GITMOJI_CATALOG } from '../core/gitmoji';
import { ISSUE_KEYWORD_DESCRIPTIONS, ISSUE_KEYWORD_LABELS } from '../core/types';
import type { IssueKeyword } from '../core/types';
import { getStyles } from './styles';

const ISSUE_KEYWORD_ORDER: IssueKeyword[] = ['refs', 'closes', 'fixes', 'resolves', 'seeAlso'];

/** Generates a 32-character random nonce for the webview's Content Security Policy. */
export function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function issueKeywordOptionsHtml(): string {
  return ISSUE_KEYWORD_ORDER.map((keyword, index) => {
    const label = ISSUE_KEYWORD_LABELS[keyword];
    const description = ISSUE_KEYWORD_DESCRIPTIONS[keyword];
    const selected = index === 0 ? ' selected' : '';
    return `<option value="${keyword}" title="${description}"${selected}>${label} — ${description}</option>`;
  }).join('');
}

function gitmojiOptionsHtml(): string {
  return GITMOJI_CATALOG.map(
    ({ emoji, code, description }) =>
      `<option value="${emoji}" title="${description}">${emoji} ${code} — ${description}</option>`,
  ).join('');
}

/**
 * Generates the full HTML document for the commit builder webview, including a nonce-scoped
 * Content Security Policy and the bundled client script.
 *
 * @param webview - The target webview, used to resolve the script URI and CSP source.
 * @param extensionUri - The extension's root URI, used to locate `dist/webview.js`.
 */
export function generateHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = generateNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
  );
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
  <style>${getStyles()}</style>
  <title>Commit Builder</title>
</head>
<body>
  <div id="configWarnings" role="alert"></div>

  <label for="type">Type</label>
  <select id="type"></select>

  <div id="gitmojiRow">
    <label for="gitmoji">Gitmoji</label>
    <select id="gitmoji">${gitmojiOptionsHtml()}</select>
  </div>

  <label for="scope">Scope</label>
  <div class="row">
    <select id="scope"><option value="">(none)</option></select>
    <button type="button" class="secondary" id="addScope" title="Add scope">+</button>
  </div>

  <label for="issue">Issue / Ticket ID</label>
  <div class="row">
    <select id="issueKeyword">${issueKeywordOptionsHtml()}</select>
    <input type="text" id="issue" placeholder="123, PROJ-45" title="One or several references, separated by spaces or commas" />
  </div>

  <label for="description">Short description</label>
  <input type="text" id="description" placeholder="add live preview component" />
  <div id="charCounter">0 characters</div>

  <label for="body">Body</label>
  <textarea id="body" placeholder="Optional detailed explanation"></textarea>

  <div class="checkbox-row">
    <input type="checkbox" id="breakingChange" />
    <label for="breakingChange">Breaking change</label>
  </div>
  <div id="breakingChangeDescriptionRow">
    <label for="breakingChangeDescription">Breaking change description</label>
    <textarea id="breakingChangeDescription" placeholder="Describe the breaking change"></textarea>
  </div>

  <label for="coAuthors">Co-authored-by</label>
  <textarea id="coAuthors" placeholder="One per line: Name &lt;email@example.com&gt;"></textarea>
  <div id="coAuthorsError" role="alert"></div>

  <label>Preview</label>
  <div id="preview"></div>

  <button type="button" id="commitNow">Commit now</button>
  <div id="commitStatus" role="status" aria-live="polite"></div>
  <div id="commitError" role="alert">
    <div id="commitErrorSummary"></div>
    <details id="commitErrorDetails">
      <summary>Show output</summary>
      <pre id="commitErrorOutput"></pre>
    </details>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
