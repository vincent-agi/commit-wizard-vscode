/** Values collected from the "new issue" form. */
export interface IssueFormInput {
  type: string;
  scope?: string;
  /** The short description that follows `type(scope): ` in the issue title. */
  title: string;
  context?: string;
  goal?: string;
  /** One scope item per line. */
  scopeItems?: string;
  /** One acceptance criterion per line. */
  acceptanceCriteria?: string;
  notes?: string;
  labels: string[];
  /** Milestone number, as GitHub identifies it. */
  milestone?: number;
  /** GitHub logins separated by spaces or commas; a leading `@` is accepted. */
  assignees?: string;
}

/** Values collected from the "new milestone" form. */
export interface MilestoneFormInput {
  title: string;
  description?: string;
  /** Due date as `YYYY-MM-DD`. */
  dueOn?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Splits free text into trimmed, non-empty lines, dropping a leading list marker. */
export function toLines(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*]\s+(?:\[[ xX]\]\s+)?)/, ''))
    .filter(Boolean);
}

/** Parses the assignees field into GitHub logins. */
export function parseAssignees(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[\s,]+/)
    .map((login) => login.replace(/^@/, ''))
    .filter(Boolean);
}

/** Formats the Conventional-Commits-style issue title: `type(scope): title`. */
export function formatIssueTitle(input: Pick<IssueFormInput, 'type' | 'scope' | 'title'>): string {
  const scope = input.scope?.trim();
  return `${input.type.trim()}${scope ? `(${scope})` : ''}: ${input.title.trim()}`;
}

/** Returns the reasons why the issue form cannot be submitted yet (empty when valid). */
export function validateIssue(input: IssueFormInput): string[] {
  const errors: string[] = [];
  if (!input.type.trim()) {
    errors.push('Pick a type.');
  }
  if (!input.title.trim()) {
    errors.push('Enter a title.');
  }
  return errors;
}

function bullets(text: string | undefined, checkbox: boolean): string {
  return toLines(text)
    .map((line) => (checkbox ? `- [ ] ${line}` : `- ${line}`))
    .join('\n');
}

function section(heading: string, content: string): string {
  return content ? `## ${heading}\n${content}` : '';
}

/** Placeholders a custom issue template can use. */
export const ISSUE_TEMPLATE_PLACEHOLDERS = [
  'title',
  'context',
  'goal',
  'scope',
  'acceptanceCriteria',
  'notes',
] as const;

/**
 * Renders the Markdown body of an issue.
 *
 * Without `template`, the standard layout is used: `## Context`, `## Goal`, `## Scope`
 * (bullets), `## Acceptance criteria` (checkboxes) and `## Notes`, each omitted when empty.
 *
 * With `template`, the placeholders `{{title}}`, `{{context}}`, `{{goal}}`, `{{scope}}`,
 * `{{acceptanceCriteria}}` and `{{notes}}` are replaced by the matching content (no heading
 * added; the template owns its structure). Unknown placeholders are left untouched.
 */
export function renderIssueBody(input: IssueFormInput, template?: string): string {
  const parts = {
    title: input.title.trim(),
    context: input.context?.trim() ?? '',
    goal: input.goal?.trim() ?? '',
    scope: bullets(input.scopeItems, false),
    acceptanceCriteria: bullets(input.acceptanceCriteria, true),
    notes: input.notes?.trim() ?? '',
  };

  if (template) {
    return template
      .replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
        name in parts ? parts[name as keyof typeof parts] : placeholder,
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return [
    section('Context', parts.context),
    section('Goal', parts.goal),
    section('Scope', parts.scope),
    section('Acceptance criteria', parts.acceptanceCriteria),
    section('Notes', parts.notes),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Returns the reasons why the milestone form cannot be submitted yet (empty when valid). */
export function validateMilestone(input: MilestoneFormInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) {
    errors.push('Enter a title.');
  }
  const due = input.dueOn?.trim();
  if (due) {
    const parsed = new Date(`${due}T00:00:00Z`);
    if (
      !DATE_ONLY.test(due) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== due
    ) {
      errors.push('The due date must be a valid YYYY-MM-DD date.');
    }
  }
  return errors;
}

/** GitHub API payload for a milestone. Assumes {@link validateMilestone} passed. */
export function milestonePayload(input: MilestoneFormInput): {
  title: string;
  description?: string;
  due_on?: string;
} {
  const description = input.description?.trim();
  const due = input.dueOn?.trim();
  return {
    title: input.title.trim(),
    ...(description ? { description } : {}),
    ...(due ? { due_on: `${due}T00:00:00Z` } : {}),
  };
}
