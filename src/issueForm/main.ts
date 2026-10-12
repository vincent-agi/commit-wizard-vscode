import {
  formatIssueTitle,
  milestonePayload,
  renderIssueBody,
  validateIssue,
  validateMilestone,
} from '../core/issueTemplate';
import type { IssueFormInput, MilestoneFormInput } from '../core/issueTemplate';
import type { HostToIssueFormMessage, IssueFormToHostMessage } from './messages';

declare function acquireVsCodeApi(): { postMessage(message: IssueFormToHostMessage): void };

const vscode = acquireVsCodeApi();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const repoLabel = $<HTMLDivElement>('repo');
const banner = $<HTMLDivElement>('banner');
const signInButton = $<HTMLButtonElement>('signIn');
const modeSelect = $<HTMLSelectElement>('mode');
const issueFields = $<HTMLElement>('issueFields');
const milestoneFields = $<HTMLElement>('milestoneFields');
const typeSelect = $<HTMLSelectElement>('type');
const scopeSelect = $<HTMLSelectElement>('scope');
const titleInput = $<HTMLInputElement>('title');
const contextArea = $<HTMLTextAreaElement>('context');
const goalArea = $<HTMLTextAreaElement>('goal');
const scopeItemsArea = $<HTMLTextAreaElement>('scopeItems');
const criteriaArea = $<HTMLTextAreaElement>('acceptanceCriteria');
const notesArea = $<HTMLTextAreaElement>('notes');
const labelsBox = $<HTMLDivElement>('labels');
const milestoneSelect = $<HTMLSelectElement>('milestone');
const assigneesInput = $<HTMLInputElement>('assignees');
const milestoneTitle = $<HTMLInputElement>('milestoneTitle');
const milestoneDescription = $<HTMLTextAreaElement>('milestoneDescription');
const milestoneDue = $<HTMLInputElement>('milestoneDue');
const previewBox = $<HTMLDivElement>('preview');
const submitButton = $<HTMLButtonElement>('submit');

let issueTemplate: string | undefined;
let busy = false;

function showBanner(text: string, kind: 'error' | 'success' | 'info' = 'info'): void {
  banner.textContent = text;
  banner.className = kind === 'info' ? '' : kind;
}

function issueInput(): IssueFormInput {
  const labels = Array.from(labelsBox.querySelectorAll<HTMLInputElement>('input:checked')).map(
    (box) => box.value,
  );
  return {
    type: typeSelect.value,
    scope: scopeSelect.value || undefined,
    title: titleInput.value,
    context: contextArea.value,
    goal: goalArea.value,
    scopeItems: scopeItemsArea.value,
    acceptanceCriteria: criteriaArea.value,
    notes: notesArea.value,
    labels,
    milestone: milestoneSelect.value ? Number(milestoneSelect.value) : undefined,
    assignees: assigneesInput.value,
  };
}

function milestoneInput(): MilestoneFormInput {
  return {
    title: milestoneTitle.value,
    description: milestoneDescription.value,
    dueOn: milestoneDue.value,
  };
}

function isIssueMode(): boolean {
  return modeSelect.value === 'issue';
}

function render(): void {
  issueFields.classList.toggle('hidden', !isIssueMode());
  milestoneFields.classList.toggle('hidden', isIssueMode());
  submitButton.textContent = isIssueMode() ? 'Create issue' : 'Create milestone';
  submitButton.disabled = busy;

  if (isIssueMode()) {
    const input = issueInput();
    previewBox.textContent = input.title.trim()
      ? `${formatIssueTitle(input)}\n\n${renderIssueBody(input, issueTemplate)}`.trimEnd()
      : '';
  } else {
    const payload = milestonePayload(milestoneInput());
    previewBox.textContent = payload.title
      ? [
          payload.title,
          payload.due_on ? `Due ${payload.due_on.slice(0, 10)}` : '',
          payload.description ?? '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';
  }
}

function fillSelect(
  select: HTMLSelectElement,
  entries: { value: string; text: string; title?: string }[],
  keepFirst: boolean,
): void {
  const previous = select.value;
  if (keepFirst) {
    while (select.options.length > 1) select.remove(1);
  } else {
    select.innerHTML = '';
  }
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.text;
    if (entry.title) option.title = entry.title;
    select.appendChild(option);
  }
  if (entries.some((entry) => entry.value === previous)) {
    select.value = previous;
  }
}

function setLabels(labels: string[]): void {
  const checked = new Set(
    Array.from(labelsBox.querySelectorAll<HTMLInputElement>('input:checked')).map((b) => b.value),
  );
  labelsBox.innerHTML = '';
  for (const label of labels) {
    const wrapper = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = label;
    box.checked = checked.has(label) || (checked.size === 0 && label === 'enhancement');
    box.addEventListener('change', render);
    wrapper.append(box, document.createTextNode(label));
    labelsBox.appendChild(wrapper);
  }
}

function clearAfterCreate(kind: 'issue' | 'milestone'): void {
  if (kind === 'issue') {
    for (const field of [
      titleInput,
      contextArea,
      goalArea,
      scopeItemsArea,
      criteriaArea,
      notesArea,
      assigneesInput,
    ]) {
      field.value = '';
    }
  } else {
    milestoneTitle.value = '';
    milestoneDescription.value = '';
    milestoneDue.value = '';
  }
}

for (const element of [
  modeSelect,
  typeSelect,
  scopeSelect,
  titleInput,
  contextArea,
  goalArea,
  scopeItemsArea,
  criteriaArea,
  notesArea,
  milestoneSelect,
  assigneesInput,
  milestoneTitle,
  milestoneDescription,
  milestoneDue,
]) {
  element.addEventListener('input', render);
  element.addEventListener('change', render);
}

signInButton.addEventListener('click', () => vscode.postMessage({ type: 'signIn' }));

submitButton.addEventListener('click', () => {
  if (busy) return;
  const errors = isIssueMode() ? validateIssue(issueInput()) : validateMilestone(milestoneInput());
  if (errors.length > 0) {
    showBanner(errors.join(' '), 'error');
    return;
  }
  vscode.postMessage(
    isIssueMode()
      ? { type: 'submitIssue', input: issueInput() }
      : { type: 'submitMilestone', input: milestoneInput() },
  );
});

banner.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest('a');
  if (link?.dataset.url) {
    vscode.postMessage({ type: 'openUrl', url: link.dataset.url });
  }
});

window.addEventListener('message', (event: MessageEvent<HostToIssueFormMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      issueTemplate = message.config.issueTemplate;
      fillSelect(
        typeSelect,
        message.config.types.map((t) => ({ value: t.name, text: t.name, title: t.description })),
        false,
      );
      fillSelect(
        scopeSelect,
        message.config.scopes.map((s) => ({ value: s.name, text: `${s.name} — ${s.description}` })),
        true,
      );
      repoLabel.textContent = message.repo
        ? `Repository: ${message.repo}`
        : 'No GitHub remote found in this workspace.';
      if (!message.repo)
        showBanner('Open a folder whose Git repository has a github.com remote.', 'error');
      render();
      break;
    case 'meta':
      signInButton.classList.toggle('hidden', message.signedIn);
      fillSelect(
        milestoneSelect,
        message.milestones.map((m) => ({ value: String(m.number), text: m.title })),
        true,
      );
      setLabels(message.labels);
      render();
      break;
    case 'busy':
      busy = true;
      showBanner('Contacting GitHub…');
      render();
      break;
    case 'created': {
      busy = false;
      banner.className = 'success';
      banner.textContent = `Created ${message.kind} #${message.number}: `;
      const link = document.createElement('a');
      link.href = '#';
      link.dataset.url = message.url;
      link.textContent = message.url;
      banner.appendChild(link);
      clearAfterCreate(message.kind);
      render();
      break;
    }
    case 'failed':
      busy = false;
      showBanner(message.message, 'error');
      render();
      break;
  }
});

render();
vscode.postMessage({ type: 'ready' });
