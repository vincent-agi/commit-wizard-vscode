import * as vscode from 'vscode';
import { GITMOJI_CATALOG } from '../core/gitmoji';
import {
  COMMIT_TYPE_DESCRIPTIONS,
  ISSUE_KEYWORD_DESCRIPTIONS,
  ISSUE_KEYWORD_LABELS,
} from '../core/types';
import type { CommitType, IssueKeyword } from '../core/types';
import { getStyles } from './styles';

const ISSUE_KEYWORD_ORDER: IssueKeyword[] = ['refs', 'closes', 'fixes', 'resolves', 'seeAlso'];

const TYPE_ORDER: CommitType[] = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'chore',
  'build',
  'ci',
];

/** Generates a 32-character random nonce for the webview's Content Security Policy. */
export function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function typeOptionsHtml(): string {
  return TYPE_ORDER.map((type) => {
    const description = COMMIT_TYPE_DESCRIPTIONS[type];
    return `<option value="${type}" title="${description}">${type} — ${description}</option>`;
  }).join('');
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
  <label for="type">Type</label>
  <select id="type">${typeOptionsHtml()}</select>

  <label for="gitmoji">Gitmoji</label>
  <select id="gitmoji">${gitmojiOptionsHtml()}</select>

  <label for="scope">Scope</label>
  <div class="row">
    <select id="scope"><option value="">(none)</option></select>
    <button type="button" class="secondary" id="addScope" title="Add scope">+</button>
  </div>

  <label for="issue">Issue / Ticket ID</label>
  <div class="row">
    <select id="issueKeyword">${issueKeywordOptionsHtml()}</select>
    <input type="text" id="issue" placeholder="123" />
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

  <label>Preview</label>
  <div id="preview"></div>

  <button type="button" id="commitNow">Commit now</button>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
