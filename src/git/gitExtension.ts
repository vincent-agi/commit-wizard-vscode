import * as vscode from 'vscode';

/** Minimal shape of the built-in `vscode.git` extension's exported API (version 1). */
interface GitApi {
  repositories: GitRepository[];
}

interface GitRepository {
  state: { HEAD?: { name?: string } };
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
 * repository is open. Errors from the underlying `commit` call (e.g. nothing staged) propagate
 * to the caller.
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
