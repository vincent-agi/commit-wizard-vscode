import * as vscode from 'vscode';

/** Minimal shape of the built-in `vscode.git` extension's exported API (version 1). */
interface GitApi {
  repositories: GitRepository[];
}

interface GitRepository {
  inputBox: { value: string };
  state: { HEAD?: { name?: string } };
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
 * Writes `message` into the active repository's Source Control input box.
 *
 * @returns `true` when a repository was found and updated, `false` otherwise.
 */
export function fillCommitInputBox(message: string): boolean {
  const repo = getActiveRepository();
  if (!repo) {
    return false;
  }

  repo.inputBox.value = message;
  return true;
}

/** Returns the active repository's current branch name, or `undefined` if unavailable. */
export function getCurrentBranchName(): string | undefined {
  return getActiveRepository()?.state.HEAD?.name;
}
