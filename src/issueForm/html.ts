import * as vscode from 'vscode';
import { getLanguage, t } from '../i18n';
import type { MessageKey } from '../i18n';
import { escapeHtml } from '../webview/escape';
import { generateNonce } from '../webview/html';
import { getStyles } from '../webview/styles';

/** Built per call so the placeholder text follows the current language. */
const extraStyles = () => `
  #labels { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
  #labels label { margin: 0; font-weight: normal; display: flex; align-items: center; gap: 4px; }
  #labels:empty::after { content: '${t('form.labelsEmpty').replace(/[\\'"]/g, '')}'; color: var(--vscode-descriptionForeground); }
  .hidden { display: none !important; }
  #banner { margin-bottom: 8px; padding: 6px 8px; border-radius: 2px; border: 1px solid var(--vscode-editorWarning-foreground); }
  #banner.error { border-color: var(--vscode-editorError-foreground); }
  #banner.success { border-color: var(--vscode-testing-iconPassed, var(--vscode-editorInfo-foreground)); }
  #banner:empty { display: none; }
  textarea { min-height: 54px; }
  #issuePreview { margin-top: 14px; }
  button { margin-top: 10px; }
`;

/** Translated text, escaped for HTML content and attributes. */
const e = (key: MessageKey, ...args: (string | number)[]): string => escapeHtml(t(key, ...args));

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
<html lang="${getLanguage()}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>${getStyles()}${extraStyles()}</style>
  <title>${e('form.title')}</title>
</head>
<body>
  <main aria-label="${e('form.title')}">
  <div id="repo"></div>
  <div id="banner" role="alert"></div>
  <button type="button" class="secondary hidden" id="signIn">${e('form.signIn')}</button>

  <label for="mode">${e('form.createA')}</label>
  <select id="mode">
    <option value="issue">${e('form.modeIssue')}</option>
    <option value="milestone">${e('form.modeMilestone')}</option>
  </select>

  <section id="issueFields">
    <label for="type">${e('form.type')}</label>
    <select id="type"></select>

    <label for="scope">${e('form.scope')}</label>
    <select id="scope"><option value="">${e('ui.none')}</option></select>

    <label for="title">${e('form.titleLabel')}</label>
    <input type="text" id="title" placeholder="${e('form.titlePlaceholder')}" />

    <label for="context">${e('form.context')}</label>
    <textarea id="context" placeholder="${e('form.contextPlaceholder')}"></textarea>

    <label for="goal">${e('form.goal')}</label>
    <textarea id="goal" placeholder="${e('form.goalPlaceholder')}"></textarea>

    <label for="scopeItems">${e('form.scopeItems')}</label>
    <textarea id="scopeItems"></textarea>

    <label for="acceptanceCriteria">${e('form.criteria')}</label>
    <textarea id="acceptanceCriteria"></textarea>

    <label for="notes">${e('form.notes')}</label>
    <textarea id="notes"></textarea>

    <span class="field-label" id="labelsLabel">${e('form.labels')}</span>
    <div id="labels" role="group" aria-labelledby="labelsLabel"></div>

    <label for="milestone">${e('form.milestone')}</label>
    <select id="milestone"><option value="">${e('ui.none')}</option></select>

    <label for="assignees">${e('form.assignees')}</label>
    <input type="text" id="assignees" placeholder="${e('form.assigneesPlaceholder')}" />
  </section>

  <section id="milestoneFields" class="hidden">
    <label for="milestoneTitle">${e('form.titleLabel')}</label>
    <input type="text" id="milestoneTitle" placeholder="${e('form.milestoneTitlePlaceholder')}" />

    <label for="milestoneDescription">${e('form.milestoneDescription')}</label>
    <textarea id="milestoneDescription"></textarea>

    <label for="milestoneDue">${e('form.dueDate')}</label>
    <input type="text" id="milestoneDue" placeholder="${e('form.duePlaceholder')}" />
  </section>

  <span class="field-label" id="previewLabel">${e('form.preview')}</span>
  <div id="preview" role="region" aria-labelledby="previewLabel" tabindex="0"></div>

  <button type="button" id="submit">${e('issueForm.createIssue')}</button>
  </main>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
