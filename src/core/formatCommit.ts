import { ISSUE_KEYWORD_LABELS } from './types';
import type { CommitFormInput, IssueKeyword } from './types';

const COLON_KEYWORDS: ReadonlySet<IssueKeyword> = new Set(['refs', 'seeAlso']);
const PURELY_NUMERIC = /^\d+$/;
const ISSUE_SEPARATOR = /[\s,]+/;

/**
 * Normalizes an issue value for GitHub/GitLab autolinking: prepends `#` only when the value is
 * purely numeric (e.g. `123` -> `#123`), since that's the literal syntax GitHub/GitLab require
 * to recognize an issue reference. Left untouched when it already has a `#` (idempotent — no
 * `##` double-hash) or when it's a non-numeric, Jira-style key (e.g. `PROJ-123`), which never
 * takes a `#`.
 */
function normalizeIssue(issue: string): string {
  return PURELY_NUMERIC.test(issue) ? `#${issue}` : issue;
}

/**
 * Formats a GitHub/GitLab issue-reference footer line for the given keyword.
 *
 * `closes`/`fixes`/`resolves` render as `"<Label> <issue>"` (no colon), matching the exact
 * syntax GitHub/GitLab require to auto-close an issue on merge. `refs`/`seeAlso` render as
 * `"<Label>: <issue>"`. `issue` is normalized via {@link normalizeIssue} first.
 */
function formatIssueLine(keyword: IssueKeyword, issue: string): string {
  const label = ISSUE_KEYWORD_LABELS[keyword];
  const separator = COLON_KEYWORDS.has(keyword) ? ': ' : ' ';
  return `${label}${separator}${normalizeIssue(issue)}`;
}

/**
 * Builds a Conventional Commits message, prefixed with the gitmoji in `input.gitmoji` (no
 * prefix when it is empty), from a {@link CommitFormInput}.
 *
 * Layout: title, then an optional body paragraph, then an optional footer block. Paragraphs are
 * separated by one blank line; footer lines are consecutive (Git trailer format), in the order
 * `BREAKING CHANGE`, issue references, `Co-authored-by`. When `breakingChange` is set, a `!` is
 * added after the type/scope.
 *
 * `input.issue` may hold several references separated by spaces or commas; each gets its own
 * footer line.
 *
 * @param input - Values collected from the commit builder form.
 * @returns The formatted commit message, ready to write into a Git commit input box.
 */
export function formatCommitMessage(input: CommitFormInput): string {
  const scope = input.scope?.trim();
  const body = input.body?.trim();
  const breakingChangeDescription = input.breakingChangeDescription?.trim();

  const scopePart = scope ? `(${scope})` : '';
  const breakingMark = input.breakingChange ? '!' : '';
  const emojiPrefix = input.gitmoji ? `${input.gitmoji} ` : '';
  const title = `${emojiPrefix}${input.type}${scopePart}${breakingMark}: ${input.description}`;

  const footers: string[] = [];

  if (input.breakingChange && breakingChangeDescription) {
    footers.push(`BREAKING CHANGE: ${breakingChangeDescription}`);
  }

  const issues = (input.issue ?? '').split(ISSUE_SEPARATOR).filter(Boolean);
  for (const issue of issues) {
    footers.push(formatIssueLine(input.issueKeyword, issue));
  }

  for (const coAuthor of input.coAuthors ?? []) {
    footers.push(`Co-authored-by: ${coAuthor}`);
  }

  const paragraphs = [title];
  if (body) {
    paragraphs.push(body);
  }
  if (footers.length > 0) {
    paragraphs.push(footers.join('\n'));
  }

  return paragraphs.join('\n\n');
}
