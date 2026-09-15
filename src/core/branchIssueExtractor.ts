const JIRA_STYLE = /\b(?!(?:ISSUE|BUG|GH|FIX)-\d+\b)([A-Z][A-Z0-9]+-\d+)\b/;
const HASH_ISSUE = /#(\d+)\b/;
const KEYWORD_NUMBER = /\b(?:issue|bug|gh|fix)-?(\d+)\b/i;

/**
 * Extracts a ticket-like token from a Git branch name, for pre-filling the
 * commit builder's Issue field.
 *
 * Precedence: Jira-style `PROJECT-123` keys, then explicit `#123` tokens,
 * then a bare number following `issue`, `bug`, `gh`, or `fix`. A key whose letter part is
 * itself one of those keywords (e.g. `GH-789`) is treated as a keyword match, not Jira.
 *
 * @param branchName - The current branch name (e.g. `feature/PROJ-123-login`).
 * @returns The normalized issue token (`PROJ-123` or `#123`), or `undefined` when none is found.
 */
export function extractIssueFromBranch(branchName: string): string | undefined {
  const jiraMatch = branchName.match(JIRA_STYLE);
  if (jiraMatch) {
    return jiraMatch[1];
  }

  const hashMatch = branchName.match(HASH_ISSUE);
  if (hashMatch) {
    return `#${hashMatch[1]}`;
  }

  const keywordMatch = branchName.match(KEYWORD_NUMBER);
  if (keywordMatch) {
    return `#${keywordMatch[1]}`;
  }

  return undefined;
}
