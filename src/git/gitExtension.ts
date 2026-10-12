import * as vscode from 'vscode';
import { parseGitHubRemote } from '../core/githubRemote';
import type { GitHubRepo } from '../core/githubRemote';

/** Minimal shape of the built-in `vscode.git` extension's exported API (version 1). */
interface GitApi {
  repositories: GitRepository[];
}

interface GitRepository {
  state: {
    HEAD?: { name?: string };
    remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
  };
  commit(message: string): Promise<void>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

/**
 * Returns the active Git repository from the built-in `vscode.git` extension, or
 * `undefined` when the extension is missing/disabled or no repository is open.
 */
export function getActiveRepository(): GitRepository | undefined {
  const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  const api = extension?.exports.getAPI(1);
  return api?.repositories[0];
}

/**
 * Stages the active repository's changes and commits them with `message`.
 *
 * @returns `true` when a repository was found and the commit succeeded, `false` when no
 * repository is open. Errors from the underlying `commit` call (failing hook, nothing staged)
 * propagate to the caller. The commit never skips hooks: no `noVerify` option is ever passed.
 */
export async function commitActiveRepository(message: string): Promise<boolean> {
  const repo = getActiveRepository();
  if (!repo) {
    return false;
  }

  await repo.commit(message);
  return true;
}

/** Returns the active repository's current branch name, or `undefined` if unavailable. */
export function getCurrentBranchName(): string | undefined {
  return getActiveRepository()?.state.HEAD?.name;
}

/**
 * Returns the GitHub repository the active Git repository points at, preferring the `origin`
 * remote, or `undefined` when there is no repository or no github.com remote.
 */
export function getGitHubRepository(): GitHubRepo | undefined {
  const remotes = getActiveRepository()?.state.remotes ?? [];
  const ordered = [...remotes].sort(
    (a, b) => Number(b.name === 'origin') - Number(a.name === 'origin'),
  );
  for (const remote of ordered) {
    const parsed = parseGitHubRemote(remote.fetchUrl ?? remote.pushUrl ?? '');
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}
