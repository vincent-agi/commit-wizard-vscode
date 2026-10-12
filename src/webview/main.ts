import { parseCoAuthors } from '../core/coAuthors';
import { DEFAULT_CONFIG } from '../core/commitConfig';
import type { CommitConfig } from '../core/commitConfig';
import type { ChangeList, ChangedFile } from '../core/changes';
import type { DraftFields } from '../core/aiDraft';
import { formatCommitMessage } from '../core/formatCommit';
import { buildIssueLinks, githubIssueNumber } from '../core/issueTracker';
import { parseCommitMessage } from '../core/parseCommit';
import { isProtectedBranch } from '../core/protectedBranch';
import { suggestFromPaths } from '../core/suggest';
import type { Suggestion } from '../core/suggest';
import { titleLengthStatus } from '../core/titleLength';
import type { CommitFormInput, IssueKeyword, Scope } from '../core/types';
import type { CommitFailure } from '../core/commitError';
import { restoreControls, snapshotControls } from './persist';
import type { PersistedControl } from './persist';
import type { HostToWebviewMessage, RepositoryState, WebviewToHostMessage } from './messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
// Read before the first render, which would overwrite it with the blank form.
const savedState = vscode.getState();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const typeSelect = $<HTMLSelectElement>('type');
const configWarnings = $<HTMLDivElement>('configWarnings');
const protectedBanner = $<HTMLDivElement>('protectedBanner');
const gitmojiRow = $<HTMLDivElement>('gitmojiRow');
const gitmojiSelect = $<HTMLSelectElement>('gitmoji');
const scopeSelect = $<HTMLSelectElement>('scope');
const addScopeButton = $<HTMLButtonElement>('addScope');
const issueKeywordSelect = $<HTMLSelectElement>('issueKeyword');
const issueInput = $<HTMLInputElement>('issue');
const descriptionInput = $<HTMLInputElement>('description');
const charCounter = $<HTMLDivElement>('charCounter');
const bodyTextarea = $<HTMLTextAreaElement>('body');
const breakingChangeCheckbox = $<HTMLInputElement>('breakingChange');
const breakingChangeDescriptionRow = $<HTMLDivElement>('breakingChangeDescriptionRow');
const breakingChangeDescriptionTextarea = $<HTMLTextAreaElement>('breakingChangeDescription');
const coAuthorsTextarea = $<HTMLTextAreaElement>('coAuthors');
const coAuthorsError = $<HTMLDivElement>('coAuthorsError');
const commitStatus = $<HTMLDivElement>('commitStatus');
const commitError = $<HTMLDivElement>('commitError');
const commitErrorSummary = $<HTMLDivElement>('commitErrorSummary');
const commitErrorDetails = $<HTMLDetailsElement>('commitErrorDetails');
const commitErrorOutput = $<HTMLPreElement>('commitErrorOutput');
const previewBox = $<HTMLDivElement>('preview');
const commitNowButton = $<HTMLButtonElement>('commitNow');
const commitPushButton = $<HTMLButtonElement>('commitPush');
const amendCheckbox = $<HTMLInputElement>('amend');
const aiDraftButton = $<HTMLButtonElement>('aiDraft');
const recentSelect = $<HTMLSelectElement>('recent');
const clearFormButton = $<HTMLButtonElement>('clearForm');
const changesCount = $<HTMLSpanElement>('changesCount');
const stagedList = $<HTMLUListElement>('stagedList');
const unstagedList = $<HTMLUListElement>('unstagedList');
const stageAllButton = $<HTMLButtonElement>('stageAll');
const unstageAllButton = $<HTMLButtonElement>('unstageAll');
const changesHint = $<HTMLDivElement>('changesHint');
const suggestionRow = $<HTMLDivElement>('suggestionRow');
const suggestionText = $<HTMLSpanElement>('suggestionText');
const applySuggestionButton = $<HTMLButtonElement>('applySuggestion');
const branchLabel = $<HTMLSpanElement>('branchLabel');
const newBranchButton = $<HTMLButtonElement>('newBranch');
const issueLinks = $<HTMLDivElement>('issueLinks');

let config: CommitConfig = DEFAULT_CONFIG;
let changes: ChangeList = { staged: [], unstaged: [] };
let branch: string | undefined;
let detectedIssue: string | undefined;
let issueUrlTemplate: string | undefined;
let issueTitles: Record<string, string> = {};
let lookupTimer: number | undefined;
let recent: string[] = [];
let suggestion: Suggestion | undefined;
let committing = false;
let drafting = false;
// Nothing is reported to the host before it has sent the initial state: a blank form posted
// too early would erase the saved draft.
let hostReady = false;

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

/** Adds `value` to a select when it is missing, so a saved value is never silently lost. */
function ensureOption(select: HTMLSelectElement, value: string, text = value): void {
  if (!Array.from(select.options).some((option) => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }
}

/** Fills the form from a message (draft, recent commit, amended commit). */
function applyInput(input: CommitFormInput): void {
  ensureOption(typeSelect, input.type);
  typeSelect.value = input.type;
  if (config.emojis && input.gitmoji) {
    selectGitmoji(input.gitmoji);
  }
  scopeSelect.value = input.scope ?? '';
  issueKeywordSelect.value = input.issueKeyword;
  issueInput.value = input.issue ?? '';
  descriptionInput.value = input.description;
  bodyTextarea.value = input.body ?? '';
  breakingChangeCheckbox.checked = input.breakingChange;
  breakingChangeDescriptionTextarea.value = input.breakingChangeDescription ?? '';
  coAuthorsTextarea.value = (input.coAuthors ?? []).join('\n');
}

function renderFileList(list: HTMLUListElement, files: ChangedFile[], staged: boolean): void {
  list.textContent = '';
  for (const file of files) {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = staged;
    box.addEventListener('change', () =>
      vscode.postMessage({ type: box.checked ? 'stage' : 'unstage', paths: [file.path] }),
    );
    const status = document.createElement('span');
    status.className = 'file-status';
    status.textContent = file.status;
    label.append(box, status, document.createTextNode(file.path));
    item.appendChild(label);
    list.appendChild(item);
  }
}

function renderChanges(): void {
  renderFileList(stagedList, changes.staged, true);
  renderFileList(unstagedList, changes.unstaged, false);
  changesCount.textContent = `(${changes.staged.length} staged, ${changes.unstaged.length} not staged)`;
  stageAllButton.disabled = changes.unstaged.length === 0;
  unstageAllButton.disabled = changes.staged.length === 0;
  $('stagedTitle').hidden = changes.staged.length === 0;
  $('unstagedTitle').hidden = changes.unstaged.length === 0;
}

function renderSuggestion(): void {
  suggestion = suggestFromPaths(
    changes.staged.map((file) => file.path),
    {
      types: config.types.map((type) => type.name),
      scopes: config.scopes.map((scope) => scope.name),
      rules: config.suggestionRules,
    },
  );
  // Only worth showing when it would change something the user has not already chosen.
  const differs =
    suggestion !== undefined &&
    ((suggestion.type !== undefined && suggestion.type !== typeSelect.value) ||
      (suggestion.scope !== undefined && suggestion.scope !== scopeSelect.value));
  suggestionRow.classList.toggle('visible', differs);
  if (differs && suggestion) {
    const parts = [suggestion.type, suggestion.scope ? `(${suggestion.scope})` : ''];
    suggestionText.textContent = `Suggested: ${parts.join('')}`;
  }
}

function renderActions(): void {
  const amend = amendCheckbox.checked;
  const nothingStaged = !amend && changes.staged.length === 0;
  commitNowButton.textContent = amend ? 'Amend commit' : 'Commit now';
  commitNowButton.disabled = committing || nothingStaged;
  commitPushButton.disabled = committing || nothingStaged;
  commitPushButton.hidden = false;
  aiDraftButton.hidden = !config.aiDraft;
  aiDraftButton.disabled = drafting || changes.staged.length === 0;
  changesHint.textContent = nothingStaged ? 'Stage some changes to commit them.' : '';
}

function renderIssueLinks(): void {
  issueLinks.textContent = '';
  for (const link of buildIssueLinks(issueInput.value, issueUrlTemplate)) {
    const anchor = document.createElement('a');
    anchor.textContent = link.label;
    anchor.dataset.url = link.url;
    anchor.tabIndex = 0;
    anchor.setAttribute('role', 'link');
    issueLinks.appendChild(anchor);
    const title = issueTitles[link.label];
    if (title) {
      const text = document.createElement('span');
      text.className = 'issue-title';
      text.textContent = ` ${title}`;
      issueLinks.appendChild(text);
    }
    issueLinks.appendChild(document.createTextNode('  '));
  }
}

/** Asks the host for GitHub issue titles of the numeric references, once typing pauses. */
function scheduleIssueLookup(): void {
  window.clearTimeout(lookupTimer);
  lookupTimer = window.setTimeout(() => {
    const references = issueInput.value
      .split(/[\s,]+/)
      .filter((reference) => githubIssueNumber(reference) !== undefined);
    if (hostReady && issueUrlTemplate && references.length > 0) {
      vscode.postMessage({ type: 'lookupIssues', references });
    }
  }, 500);
}

function renderBranch(): void {
  branchLabel.textContent = branch ? `Branch: ${branch}` : 'No branch';
  const protectedNow = isProtectedBranch(branch, config.protectedBranches);
  protectedBanner.classList.toggle('visible', protectedNow);
  protectedBanner.textContent = protectedNow
    ? `You are on the protected branch "${branch}". Committing here asks for confirmation.`
    : '';
}

function renderRecent(): void {
  recentSelect.length = 1;
  recent.forEach((message, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = message.split('\n')[0];
    option.title = message;
    recentSelect.appendChild(option);
  });
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

  renderSuggestion();
  renderActions();
  renderIssueLinks();

  vscode.setState(snapshotControls(persistedControls));
  if (hostReady) {
    vscode.postMessage({ type: 'formChanged', input });
  }
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
  ensureOption(gitmojiSelect, emoji, `${emoji} custom`);
  gitmojiSelect.value = emoji;
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

function applyConfig(next: CommitConfig, warnings: string[]): void {
  config = next;
  setTypes(next.types);
  setScopes(next.scopes);
  gitmojiRow.hidden = !next.emojis;
  configWarnings.textContent = warnings.join('\n');
  configWarnings.classList.toggle('visible', warnings.length > 0);
  renderBranch();
}

function applyRepository(state: RepositoryState): void {
  branch = state.branch;
  detectedIssue = state.detectedIssue;
  recent = state.recent;
  changes = state.changes;
  issueUrlTemplate = state.issueUrlTemplate;
  issueTitles = {};
  renderChanges();
  renderRecent();
  renderBranch();
}

function clearMessageFields(): void {
  descriptionInput.value = '';
  bodyTextarea.value = '';
  breakingChangeCheckbox.checked = false;
  breakingChangeDescriptionTextarea.value = '';
  coAuthorsTextarea.value = '';
  amendCheckbox.checked = false;
}

function showFailure(failure: CommitFailure): void {
  commitErrorSummary.textContent = failure.summary;
  commitErrorOutput.textContent = failure.details;
  commitErrorDetails.hidden = !failure.details;
  commitErrorDetails.open = failure.kind === 'hook';
  commitError.classList.add('visible');
}

function hideCommitError(): void {
  commitError.classList.remove('visible');
  commitErrorSummary.textContent = '';
  commitErrorOutput.textContent = '';
}

function setCommitting(value: boolean): void {
  committing = value;
  commitStatus.textContent = value ? 'Committing… Git hooks may take a moment.' : '';
  renderActions();
}

function submit(push: boolean): void {
  vscode.postMessage({
    type: 'commitNow',
    input: currentInput(),
    amend: amendCheckbox.checked,
    push,
  });
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

newBranchButton.addEventListener('click', () => vscode.postMessage({ type: 'newBranch' }));
issueInput.addEventListener('input', scheduleIssueLookup);
issueLinks.addEventListener('click', (event) => {
  const url = (event.target as HTMLElement).closest('a')?.dataset.url;
  if (url) vscode.postMessage({ type: 'openUrl', url });
});
issueLinks.addEventListener('keydown', (event) => {
  const url = (event.target as HTMLElement).closest('a')?.dataset.url;
  if (url && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    vscode.postMessage({ type: 'openUrl', url });
  }
});

addScopeButton.addEventListener('click', () => vscode.postMessage({ type: 'addScope' }));
stageAllButton.addEventListener('click', () => vscode.postMessage({ type: 'stageAll' }));
unstageAllButton.addEventListener('click', () => vscode.postMessage({ type: 'unstageAll' }));
commitNowButton.addEventListener('click', () => submit(false));
commitPushButton.addEventListener('click', () => submit(true));

applySuggestionButton.addEventListener('click', () => {
  if (suggestion?.type) typeSelect.value = suggestion.type;
  if (suggestion?.scope) scopeSelect.value = suggestion.scope;
  typeSelect.dispatchEvent(new Event('change'));
  render();
});

amendCheckbox.addEventListener('change', () => {
  if (amendCheckbox.checked) {
    vscode.postMessage({ type: 'setAmend', amend: true });
  }
  render();
});

recentSelect.addEventListener('change', () => {
  const message = recent[Number(recentSelect.value)];
  recentSelect.value = '';
  if (message === undefined) return;

  const parsed = parseCommitMessage(message);
  applyInput(
    parsed
      ? {
          type: parsed.type,
          gitmoji: parsed.gitmoji,
          scope: parsed.scope,
          issue: parsed.issue,
          issueKeyword: parsed.issueKeyword,
          description: parsed.description,
          body: parsed.body,
          breakingChange: parsed.breaking,
          breakingChangeDescription: parsed.breakingChangeDescription,
          coAuthors: parsed.coAuthors,
        }
      : {
          type: typeSelect.value,
          gitmoji: gitmojiSelect.value,
          issueKeyword: 'refs',
          description: message.split('\n')[0].trim(),
          body: message.split('\n').slice(1).join('\n').trim() || undefined,
          breakingChange: false,
        },
  );
  render();
});

clearFormButton.addEventListener('click', () => {
  clearMessageFields();
  issueInput.value = detectedIssue ?? '';
  hideCommitError();
  vscode.postMessage({ type: 'clearDraft' });
  render();
});

aiDraftButton.addEventListener('click', () => {
  drafting = true;
  commitStatus.textContent = 'Waiting for the language model…';
  hideCommitError();
  renderActions();
  vscode.postMessage({ type: 'draftWithAi' });
});

function applyAiDraft(draft: DraftFields): void {
  if (draft.type) typeSelect.value = draft.type;
  if (draft.scope) scopeSelect.value = draft.scope;
  descriptionInput.value = draft.description;
  bodyTextarea.value = draft.body ?? '';
  typeSelect.dispatchEvent(new Event('change'));
  render();
}

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      applyConfig(message.config, message.warnings);
      applyRepository(message);
      if (message.draft) {
        applyInput(message.draft);
      } else {
        // Controls survive a webview reload (hot reload, or the view being recreated).
        restoreControls(persistedControls, savedState);
      }
      if (message.detectedIssue && !issueInput.value) {
        issueInput.value = message.detectedIssue;
      }
      hostReady = true;
      render();
      scheduleIssueLookup();
      break;
    case 'configUpdated':
      applyConfig(message.config, message.warnings);
      render();
      break;
    case 'branchChanged':
      // Another branch has its own draft: swap the whole message, keep the dropdown choices.
      clearMessageFields();
      issueInput.value = '';
      applyRepository(message);
      if (message.draft) {
        applyInput(message.draft);
      } else if (message.detectedIssue) {
        issueInput.value = message.detectedIssue;
      }
      render();
      break;
    case 'changes':
      changes = message.changes;
      renderChanges();
      render();
      break;
    case 'commitStarted':
      hideCommitError();
      setCommitting(true);
      break;
    case 'commitSucceeded':
      setCommitting(false);
      clearMessageFields();
      recent = message.recent;
      renderRecent();
      render();
      break;
    case 'commitFailed':
      // Form content is deliberately left untouched so the user can fix the problem and retry.
      setCommitting(false);
      showFailure(message.failure);
      break;
    case 'prefill':
      applyInput(message.input);
      render();
      break;
    case 'aiResult':
      drafting = false;
      commitStatus.textContent = '';
      applyAiDraft(message.draft);
      break;
    case 'issueTitles':
      issueTitles = { ...issueTitles, ...message.titles };
      renderIssueLinks();
      break;
    case 'aiFailed':
      drafting = false;
      commitStatus.textContent = '';
      showFailure({ kind: 'other', summary: message.message, details: '' });
      renderActions();
      break;
  }
});

applyConfig(DEFAULT_CONFIG, []);
renderChanges();
render();
vscode.postMessage({ type: 'ready' });
