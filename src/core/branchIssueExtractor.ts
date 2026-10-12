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
 * @param branchName - The current branch name (e.g. `feature/123-login`).
 * @param issuePattern - Optional custom regular expression source. When it matches, its first
 * capture group (or the whole match when it has none) is returned instead of the built-in
 * heuristics. An invalid pattern is ignored.
 * @returns The normalized issue token (`123` or `#123`), or `undefined` when none is found.
 */
export function extractIssueFromBranch(
  branchName: string,
  issuePattern?: string,
): string | undefined {
  if (issuePattern) {
    try {
      const custom = branchName.match(new RegExp(issuePattern));
      if (custom) {
        return custom[1] ?? custom[0];
      }
    } catch {
      // Invalid user-provided pattern: fall through to the built-in heuristics.
    }
  }

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
