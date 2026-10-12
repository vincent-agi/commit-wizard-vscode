/** Owner and name of a GitHub repository. */
export interface GitHubRepo {
  owner: string;
  repo: string;
}

const REMOTE_PATTERNS: readonly RegExp[] = [
  // git@github.com:owner/repo(.git)
  /^[\w.-]+@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  // https://github.com/owner/repo(.git), optionally with credentials
  /^https?:\/\/(?:[^@/]+@)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  // ssh://git@github.com(:port)/owner/repo(.git)
  /^ssh:\/\/[\w.-]+@github\.com(?::\d+)?\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
];

/**
 * Extracts the GitHub owner/repository from a Git remote URL (SSH, HTTPS or `ssh://`).
 *
 * @returns `undefined` when the URL does not point at github.com.
 */
export function parseGitHubRemote(url: string): GitHubRepo | undefined {
  const trimmed = url.trim();
  for (const pattern of REMOTE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }
  return undefined;
}
