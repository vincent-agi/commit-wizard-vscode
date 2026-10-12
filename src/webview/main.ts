import { parseCoAuthors } from '../core/coAuthors';
import { DEFAULT_CONFIG } from '../core/commitConfig';
import type { CommitConfig } from '../core/commitConfig';
import { restoreControls, snapshotControls } from './persist';
import type { PersistedControl } from './persist';
import { formatCommitMessage } from '../core/formatCommit';
import { titleLengthStatus } from '../core/titleLength';
import type { CommitFormInput, IssueKeyword, Scope } from '../core/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from './messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
// Read before the first render, which would overwrite it with the blank form.
const savedState = vscode.getState();

const typeSelect = document.getElementById('type') as HTMLSelectElement;
const configWarnings = document.getElementById('configWarnings') as HTMLDivElement;
const gitmojiRow = document.getElementById('gitmojiRow') as HTMLDivElement;
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
const coAuthorsTextarea = document.getElementById('coAuthors') as HTMLTextAreaElement;
const coAuthorsError = document.getElementById('coAuthorsError') as HTMLDivElement;
const commitStatus = document.getElementById('commitStatus') as HTMLDivElement;
const commitError = document.getElementById('commitError') as HTMLDivElement;
const commitErrorSummary = document.getElementById('commitErrorSummary') as HTMLDivElement;
const commitErrorDetails = document.getElementById('commitErrorDetails') as HTMLDetailsElement;
const commitErrorOutput = document.getElementById('commitErrorOutput') as HTMLPreElement;
const previewBox = document.getElementById('preview') as HTMLDivElement;
const commitNowButton = document.getElementById('commitNow') as HTMLButtonElement;

let config: CommitConfig = DEFAULT_CONFIG;

const persistedControls: PersistedControl[] = [
  typeSelect,
  gitmojiSelect,
  scopeSelect,
  issueKeywordSelect,
  issueInput,
  descriptionInput,
  bodyTextarea,
  breakingChangeCheckbox,
  breakingChangeDescriptionTextarea,
  coAuthorsTextarea,
];

function currentInput(): CommitFormInput {
  return {
    type: typeSelect.value,
    gitmoji: config.emojis ? gitmojiSelect.value : '',
    scope: scopeSelect.value || undefined,
    issue: issueInput.value || undefined,
    issueKeyword: issueKeywordSelect.value as IssueKeyword,
    description: descriptionInput.value,
    body: bodyTextarea.value || undefined,
    breakingChange: breakingChangeCheckbox.checked,
    breakingChangeDescription: breakingChangeDescriptionTextarea.value || undefined,
    coAuthors: parseCoAuthors(coAuthorsTextarea.value).valid,
  };
}

function render(): void {
  const input = currentInput();

  const length = descriptionInput.value.length;
  const status = titleLengthStatus(
    descriptionInput.value,
    config.titleWarningLength,
    config.titleMaxLength,
  );
  charCounter.textContent = `${length} characters`;
  charCounter.classList.toggle('warn', status === 'warn');
  charCounter.classList.toggle('over', status === 'over');

  breakingChangeDescriptionRow.classList.toggle('visible', breakingChangeCheckbox.checked);

  const { invalid } = parseCoAuthors(coAuthorsTextarea.value);
  coAuthorsError.textContent =
    invalid.length > 0 ? `Ignored (expected "Name <email>"): ${invalid.join('; ')}` : '';

  previewBox.textContent = input.description ? formatCommitMessage(input) : '';

  vscode.setState(snapshotControls(persistedControls));
  vscode.postMessage({ type: 'formChanged', input });
}

function setTypes(types: CommitConfig['types']): void {
  const previouslySelected = typeSelect.value;
  typeSelect.innerHTML = '';
  for (const type of types) {
    const option = document.createElement('option');
    option.value = type.name;
    option.title = type.description;
    option.textContent = type.description ? `${type.name} — ${type.description}` : type.name;
    typeSelect.appendChild(option);
  }
  if (types.some((type) => type.name === previouslySelected)) {
    typeSelect.value = previouslySelected;
  }
}

/** Selects `emoji` in the Gitmoji dropdown, adding it as a custom entry when absent. */
function selectGitmoji(emoji: string): void {
  const exists = Array.from(gitmojiSelect.options).some((option) => option.value === emoji);
  if (!exists) {
    const option = document.createElement('option');
    option.value = emoji;
    option.textContent = `${emoji} custom`;
    gitmojiSelect.appendChild(option);
  }
  gitmojiSelect.value = emoji;
}

function applyConfig(next: CommitConfig, warnings: string[]): void {
  config = next;
  setTypes(next.types);
  setScopes(next.scopes);
  gitmojiRow.hidden = !next.emojis;
  configWarnings.textContent = warnings.join('\n');
  configWarnings.classList.toggle('visible', warnings.length > 0);
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
  coAuthorsTextarea,
]) {
  element.addEventListener('input', render);
  element.addEventListener('change', render);
}

typeSelect.addEventListener('change', () => {
  const emoji = config.types.find((type) => type.name === typeSelect.value)?.emoji;
  if (emoji && config.emojis) {
    selectGitmoji(emoji);
    render();
  }
});

addScopeButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'addScope' });
});

function hideCommitError(): void {
  commitError.classList.remove('visible');
  commitErrorSummary.textContent = '';
  commitErrorOutput.textContent = '';
}

function setCommitting(committing: boolean): void {
  commitNowButton.disabled = committing;
  commitStatus.textContent = committing ? 'Committing… Git hooks may take a moment.' : '';
}

function clearMessageFields(): void {
  descriptionInput.value = '';
  bodyTextarea.value = '';
  breakingChangeCheckbox.checked = false;
  breakingChangeDescriptionTextarea.value = '';
  coAuthorsTextarea.value = '';
}

commitNowButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'commitNow', input: currentInput() });
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    applyConfig(message.config, message.warnings);
    // Controls survive a webview reload (hot reload, or the view being recreated).
    restoreControls(persistedControls, savedState);
    if (message.detectedIssue && !issueInput.value) {
      issueInput.value = message.detectedIssue;
    }
    render();
  } else if (message.type === 'configUpdated') {
    applyConfig(message.config, message.warnings);
    render();
  } else if (message.type === 'commitStarted') {
    hideCommitError();
    setCommitting(true);
  } else if (message.type === 'commitSucceeded') {
    setCommitting(false);
    clearMessageFields();
    render();
  } else if (message.type === 'commitFailed') {
    // Form content is deliberately left untouched so the user can fix the problem and retry.
    setCommitting(false);
    commitErrorSummary.textContent = message.failure.summary;
    commitErrorOutput.textContent = message.failure.details;
    commitErrorDetails.hidden = !message.failure.details;
    commitErrorDetails.open = message.failure.kind === 'hook';
    commitError.classList.add('visible');
  }
});

applyConfig(DEFAULT_CONFIG, []);
render();
vscode.postMessage({ type: 'ready' });
