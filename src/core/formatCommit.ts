import { ISSUE_KEYWORD_LABELS } from './types';
import type { CommitFormInput, IssueKeyword } from './types';

const COLON_KEYWORDS: ReadonlySet<IssueKeyword> = new Set(['refs', 'seeAlso']);
const PURELY_NUMERIC = /^\d+$/;

/**
 * Normalizes an issue value for GitHub/GitLab autolinking: prepends `#` only when the value is
 * purely numeric (e.g. `123` -> `#123`), since that's the literal syntax GitHub/GitLab require
 * to recognize an issue reference. Left untouched when it already has a `#` (idempotent — no
 * `##` double-hash) or when it's a non-numeric, Jira-style key (e.g. `123`), which never
 * takes a `#`.
 */
function normalizeIssue(issue: string): string {
  return PURELY_NUMERIC.test(issue) ? `#${issue}` : `#${issue}`;
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
 * Builds a Conventional Commits message, prefixed with the gitmoji selected in
 * `input.gitmoji`, from a {@link CommitFormInput}.
 *
 * @param input - Values collected from the commit builder form.
 * @returns The formatted commit message, ready to write into a Git commit input box.
 */
export function formatCommitMessage(input: CommitFormInput): string {
  const gitmoji = input.gitmoji;
  const scope = input.scope?.trim();
  const issue = input.issue?.trim();
  let body = input.body?.trim();
  const breakingChangeDescription = input.breakingChangeDescription?.trim();

  const scopePart = scope ? `(${scope})` : '';
  const issuePart = issue ? `${formatIssueLine(input.issueKeyword, issue)}\n` : '';
  const title = `${gitmoji} ${input.type}${scopePart}: ${input.description}`;

  const paragraphs = [title];

  body = `${body ?? ''}\n\n${issuePart}`;
  paragraphs.push(body);

  if (input.breakingChange && breakingChangeDescription) {
    paragraphs.push(`BREAKING CHANGE: ${breakingChangeDescription}`);
  }

  return paragraphs.join('\n\n');
}
