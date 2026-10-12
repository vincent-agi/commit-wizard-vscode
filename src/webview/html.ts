import * as vscode from 'vscode';
import { GITMOJI_CATALOG } from '../core/gitmoji';
import { ISSUE_KEYWORD_LABELS } from '../core/types';
import type { IssueKeyword } from '../core/types';
import { getLanguage, t } from '../i18n';
import type { MessageKey } from '../i18n';
import { escapeHtml } from './escape';
import { getStyles } from './styles';

/** Translated text, escaped for HTML content and attributes. */
const e = (key: MessageKey, ...args: (string | number)[]): string => escapeHtml(t(key, ...args));

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
    const description = escapeHtml(t(`keyword.${keyword}` as MessageKey));
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
<html lang="${getLanguage()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>${getStyles()}</style>
  <title>${e('ui.commitBuilder')}</title>
</head>
<body>
  <main aria-label="${e('ui.commitBuilder')}">
  <div id="configWarnings" role="alert"></div>
  <div id="protectedBanner" role="alert"></div>

  <div class="row" id="branchRow">
    <span id="branchLabel"></span>
    <button type="button" class="secondary" id="newBranch" title="${e('ui.newBranchTitle')}">${e('ui.newBranch')}</button>
  </div>

  <details id="changesSection" open>
    <summary>${e('ui.changes')} <span id="changesCount"></span></summary>
    <div class="row changes-actions">
      <button type="button" class="secondary" id="stageAll">${e('ui.stageAll')}</button>
      <button type="button" class="secondary" id="unstageAll">${e('ui.unstageAll')}</button>
    </div>
    <div id="stagedTitle" class="list-title">${e('ui.staged')}</div>
    <ul id="stagedList" class="file-list" aria-labelledby="stagedTitle"></ul>
    <div id="unstagedTitle" class="list-title">${e('ui.notStaged')}</div>
    <ul id="unstagedList" class="file-list" aria-labelledby="unstagedTitle"></ul>
    <div id="changesHint"></div>
  </details>

  <label for="recent">${e('ui.recent')}</label>
  <div class="row">
    <select id="recent"><option value="">${e('ui.recentPlaceholder')}</option></select>
    <button type="button" class="secondary" id="clearForm" title="${e('ui.clearTitle')}">${e('ui.clear')}</button>
  </div>

  <label for="type">${e('ui.type')}</label>
  <select id="type"></select>
  <div id="suggestionRow">
    <span id="suggestionText"></span>
    <button type="button" class="secondary" id="applySuggestion">${e('ui.apply')}</button>
  </div>

  <div id="gitmojiRow">
    <label for="gitmoji">${e('ui.gitmoji')}</label>
    <select id="gitmoji">${gitmojiOptionsHtml()}</select>
  </div>

  <label for="scope">${e('ui.scope')}</label>
  <div class="row">
    <select id="scope"><option value="">${e('ui.none')}</option></select>
    <button type="button" class="secondary" id="addScope" title="${e('ui.addScope')}" aria-label="${e('ui.addScope')}">+</button>
  </div>

  <label for="issue">${e('ui.issue')}</label>
  <div class="row">
    <select id="issueKeyword" aria-label="${e('ui.issueKeyword')}">${issueKeywordOptionsHtml()}</select>
    <input type="text" id="issue" placeholder="123, PROJ-45" title="${e('ui.issueTitle')}" />
  </div>
  <div id="issueLinks"></div>

  <label for="description">${e('ui.description')}</label>
  <input type="text" id="description" placeholder="${e('ui.descriptionPlaceholder')}" aria-describedby="charCounter" />
  <div id="charCounter">${e('ui.characters', 0)}</div>
  <button type="button" class="secondary" id="aiDraft" hidden title="${e('ui.aiDraftTitle')}">${e('ui.aiDraft')}</button>

  <label for="body">${e('ui.body')}</label>
  <textarea id="body" placeholder="${e('ui.bodyPlaceholder')}"></textarea>

  <div class="checkbox-row">
    <input type="checkbox" id="breakingChange" />
    <label for="breakingChange">${e('ui.breaking')}</label>
  </div>
  <div id="breakingChangeDescriptionRow">
    <label for="breakingChangeDescription">${e('ui.breakingDescription')}</label>
    <textarea id="breakingChangeDescription" placeholder="${e('ui.breakingPlaceholder')}"></textarea>
  </div>

  <label for="coAuthors">${e('ui.coAuthors')}</label>
  <textarea id="coAuthors" placeholder="${e('ui.coAuthorsPlaceholder')}" aria-describedby="coAuthorsError"></textarea>
  <div id="coAuthorsError" role="alert"></div>

  <span class="field-label" id="previewLabel">${e('ui.preview')}</span>
  <div id="preview" role="region" aria-labelledby="previewLabel" tabindex="0"></div>

  <div class="checkbox-row">
    <input type="checkbox" id="amend" />
    <label for="amend">${e('ui.amend')}</label>
  </div>

  <button type="button" id="commitNow">${e('ui.commitNow')}</button>
  <button type="button" class="secondary" id="commitPush">${e('ui.commitPush')}</button>
  <div id="commitStatus" role="status" aria-live="polite"></div>
  <div id="commitError" role="alert" tabindex="-1">
    <div id="commitErrorSummary"></div>
    <details id="commitErrorDetails">
      <summary>${e('ui.showOutput')}</summary>
      <pre id="commitErrorOutput"></pre>
    </details>
  </div>
  </main>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
