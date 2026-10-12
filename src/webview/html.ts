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
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
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
  <main aria-label="Commit Builder">
  <div id="configWarnings" role="alert"></div>
  <div id="protectedBanner" role="alert"></div>

  <div class="row" id="branchRow">
    <span id="branchLabel"></span>
    <button type="button" class="secondary" id="newBranch" title="Create a branch named from a type, a ticket and a description">New branch…</button>
  </div>

  <details id="changesSection" open>
    <summary>Changes <span id="changesCount"></span></summary>
    <div class="row changes-actions">
      <button type="button" class="secondary" id="stageAll">Stage all</button>
      <button type="button" class="secondary" id="unstageAll">Unstage all</button>
    </div>
    <div id="stagedTitle" class="list-title">Staged</div>
    <ul id="stagedList" class="file-list" aria-labelledby="stagedTitle"></ul>
    <div id="unstagedTitle" class="list-title">Not staged</div>
    <ul id="unstagedList" class="file-list" aria-labelledby="unstagedTitle"></ul>
    <div id="changesHint"></div>
  </details>

  <label for="recent">Recent messages</label>
  <div class="row">
    <select id="recent"><option value="">(pick one to reuse it)</option></select>
    <button type="button" class="secondary" id="clearForm" title="Clear the form and its saved draft">Clear</button>
  </div>

  <label for="type">Type</label>
  <select id="type"></select>
  <div id="suggestionRow">
    <span id="suggestionText"></span>
    <button type="button" class="secondary" id="applySuggestion">Apply</button>
  </div>

  <div id="gitmojiRow">
    <label for="gitmoji">Gitmoji</label>
    <select id="gitmoji">${gitmojiOptionsHtml()}</select>
  </div>

  <label for="scope">Scope</label>
  <div class="row">
    <select id="scope"><option value="">(none)</option></select>
    <button type="button" class="secondary" id="addScope" title="Add scope" aria-label="Add scope">+</button>
  </div>

  <label for="issue">Issue / Ticket ID</label>
  <div class="row">
    <select id="issueKeyword" aria-label="Issue keyword">${issueKeywordOptionsHtml()}</select>
    <input type="text" id="issue" placeholder="123, PROJ-45" title="One or several references, separated by spaces or commas" />
  </div>
  <div id="issueLinks"></div>

  <label for="description">Short description</label>
  <input type="text" id="description" placeholder="add live preview component" aria-describedby="charCounter" />
  <div id="charCounter">0 characters</div>
  <button type="button" class="secondary" id="aiDraft" hidden title="Sends the staged diff to a language model you choose, after you confirm">Draft with AI</button>

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
  <textarea id="coAuthors" placeholder="One per line: Name &lt;email@example.com&gt;" aria-describedby="coAuthorsError"></textarea>
  <div id="coAuthorsError" role="alert"></div>

  <span class="field-label" id="previewLabel">Preview</span>
  <div id="preview" role="region" aria-labelledby="previewLabel" tabindex="0"></div>

  <div class="checkbox-row">
    <input type="checkbox" id="amend" />
    <label for="amend">Amend last commit</label>
  </div>

  <button type="button" id="commitNow">Commit now</button>
  <button type="button" class="secondary" id="commitPush">Commit &amp; Push</button>
  <div id="commitStatus" role="status" aria-live="polite"></div>
  <div id="commitError" role="alert" tabindex="-1">
    <div id="commitErrorSummary"></div>
    <details id="commitErrorDetails">
      <summary>Show output</summary>
      <pre id="commitErrorOutput"></pre>
    </details>
  </div>

  </main>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
