import { formatCommitMessage } from '../core/formatCommit';
import { titleLengthStatus } from '../core/titleLength';
import type { CommitFormInput, CommitType, IssueKeyword, Scope } from '../core/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from './messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
};

const vscode = acquireVsCodeApi();

const typeSelect = document.getElementById('type') as HTMLSelectElement;
const gitmojiSelect = document.getElementById('gitmoji') as HTMLSelectElement;
const scopeSelect = document.getElementById('scope') as HTMLSelectElement;
const addScopeButton = document.getElementById('addScope') as HTMLButtonElement;
const issueKeywordSelect = document.getElementById('issueKeyword') as HTMLSelectElement;
const issueInput = document.getElementById('issue') as HTMLInputElement;
const descriptionInput = document.getElementById('description') as HTMLInputElement;
const charCounter = document.getElementById('charCounter') as HTMLDivElement;
const bodyTextarea = document.getElementById('body') as HTMLTextAreaElement;
const breakingChangeCheckbox = document.getElementById('breakingChange') as HTMLInputElement;
const breakingChangeDescriptionRow = document.getElementById(
  'breakingChangeDescriptionRow',
) as HTMLDivElement;
const breakingChangeDescriptionTextarea = document.getElementById(
  'breakingChangeDescription',
) as HTMLTextAreaElement;
const previewBox = document.getElementById('preview') as HTMLDivElement;
const commitNowButton = document.getElementById('commitNow') as HTMLButtonElement;

const TITLE_WARN_AT = 50;
const TITLE_MAX_AT = 72;

function currentInput(): CommitFormInput {
  return {
    type: typeSelect.value as CommitType,
    gitmoji: gitmojiSelect.value,
    scope: scopeSelect.value || undefined,
    issue: issueInput.value || undefined,
    issueKeyword: issueKeywordSelect.value as IssueKeyword,
    description: descriptionInput.value,
    body: bodyTextarea.value || undefined,
    breakingChange: breakingChangeCheckbox.checked,
    breakingChangeDescription: breakingChangeDescriptionTextarea.value || undefined,
  };
}

function render(): void {
  const input = currentInput();

  const length = descriptionInput.value.length;
  const status = titleLengthStatus(descriptionInput.value, TITLE_WARN_AT, TITLE_MAX_AT);
  charCounter.textContent = `${length} characters`;
  charCounter.classList.toggle('warn', status === 'warn');
  charCounter.classList.toggle('over', status === 'over');

  breakingChangeDescriptionRow.classList.toggle('visible', breakingChangeCheckbox.checked);

  previewBox.textContent = input.description ? formatCommitMessage(input) : '';

  vscode.postMessage({ type: 'formChanged', input });
}

function setScopes(scopes: Scope[]): void {
  const previouslySelected = scopeSelect.value;
  scopeSelect.innerHTML = '<option value="">(none)</option>';
  for (const scope of scopes) {
    const option = document.createElement('option');
    option.value = scope.name;
    option.title = scope.description;
    option.textContent = `${scope.name} — ${scope.description}`;
    scopeSelect.appendChild(option);
  }
  if (scopes.some((scope) => scope.name === previouslySelected)) {
    scopeSelect.value = previouslySelected;
  }
}

for (const element of [
  typeSelect,
  gitmojiSelect,
  scopeSelect,
  issueKeywordSelect,
  issueInput,
  descriptionInput,
  bodyTextarea,
  breakingChangeCheckbox,
  breakingChangeDescriptionTextarea,
]) {
  element.addEventListener('input', render);
  element.addEventListener('change', render);
}

addScopeButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'addScope' });
});

commitNowButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'commitNow', input: currentInput() });
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    setScopes(message.scopes);
    if (message.detectedIssue) {
      issueInput.value = message.detectedIssue;
    }
    render();
  } else if (message.type === 'scopesUpdated') {
    setScopes(message.scopes);
    render();
  }
});

render();
vscode.postMessage({ type: 'ready' });
