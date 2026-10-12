import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { toChangeList } from '../core/changes';
import type { ChangeList, RawChange } from '../core/changes';
import { parseGitHubRemote } from '../core/githubRemote';
import type { GitHubRepo } from '../core/githubRemote';
import type { HeadInfo, PushPlan } from '../core/pushDecision';

const execFileAsync = promisify(execFile);

interface GitChange {
  uri: vscode.Uri;
  status: number;
}

interface GitCommit {
  hash: string;
  message: string;
}

/** Minimal shape of the built-in `vscode.git` extension's repository API (version 1). */
export interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      commit?: string;
      upstream?: { remote: string; name: string };
      ahead?: number;
    };
    remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
    indexChanges: GitChange[];
    workingTreeChanges: GitChange[];
    onDidChange: vscode.Event<void>;
  };
  commit(message: string, options?: { amend?: boolean }): Promise<void>;
  add(paths: string[]): Promise<void>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean): Promise<void>;
  diff(cached?: boolean): Promise<string>;
  getCommit(ref: string): Promise<GitCommit>;
  log(options?: { maxEntries?: number }): Promise<GitCommit[]>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  getBranch(name: string): Promise<unknown>;
}

interface GitApi {
  repositories: GitRepository[];
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
 * Commits the repository's staged changes with `message`, or rewrites the last commit when
 * `amend` is set.
 *
 * @returns `true` when a repository was found and the commit succeeded, `false` when no
 * repository is open. Errors from the underlying `commit` call (failing hook, nothing staged)
 * propagate to the caller. The commit never skips hooks: no `noVerify` option is ever passed.
 */
export async function commitActiveRepository(
  message: string,
  options: { amend?: boolean } = {},
): Promise<boolean> {
  const repo = getActiveRepository();
  if (!repo) {
    return false;
  }

  await repo.commit(message, options.amend ? { amend: true } : undefined);
  return true;
}

/** Returns the active repository's current branch name, or `undefined` if unavailable. */
export function getCurrentBranchName(): string | undefined {
  return getActiveRepository()?.state.HEAD?.name;
}

/** Branch facts needed by the amend / push decisions. */
export function getHeadInfo(repo: GitRepository): HeadInfo {
  const head = repo.state.HEAD;
  return { name: head?.name, upstream: head?.upstream, ahead: head?.ahead };
}

/** Pushes according to a {@link PushPlan} computed by `planPush`. Never forces. */
export async function pushWithPlan(
  repo: GitRepository,
  plan: Extract<PushPlan, { ok: true }>,
): Promise<void> {
  await repo.push(plan.remote, plan.branch, plan.setUpstream);
}

function relativePath(repo: GitRepository, uri: vscode.Uri): string {
  return path.relative(repo.rootUri.fsPath, uri.fsPath).split(path.sep).join('/');
}

function toRaw(repo: GitRepository, changes: GitChange[]): RawChange[] {
  return changes.map((change) => ({
    path: relativePath(repo, change.uri),
    status: change.status,
  }));
}

/** The staged and unstaged files of `repo`, as shown in the change list. */
export function getChangeList(repo: GitRepository): ChangeList {
  return toChangeList(
    toRaw(repo, repo.state.indexChanges),
    toRaw(repo, repo.state.workingTreeChanges),
  );
}

/** Stages the given repository-relative paths. */
export async function stagePaths(repo: GitRepository, paths: string[]): Promise<void> {
  if (paths.length > 0) {
    await repo.add(paths.map((entry) => path.join(repo.rootUri.fsPath, entry)));
  }
}

/**
 * Unstages the given repository-relative paths without touching the working tree
 * (`git restore --staged`, or `git rm --cached` before the first commit).
 */
export async function unstagePaths(repo: GitRepository, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const args = repo.state.HEAD?.commit
    ? ['restore', '--staged', '--', ...paths]
    : ['rm', '--cached', '-r', '-q', '--', ...paths];
  await execFileAsync('git', args, { cwd: repo.rootUri.fsPath });
}

/** Paths currently staged, repository-relative. */
export function getStagedPaths(repo: GitRepository): string[] {
  return getChangeList(repo).staged.map((file) => file.path);
}

/** Message of the latest commit, or `undefined` when there is none yet. */
export async function getLastCommitMessage(repo: GitRepository): Promise<string | undefined> {
  try {
    return (await repo.getCommit('HEAD')).message;
  } catch {
    return undefined;
  }
}

/** Messages of the last `count` commits of the current branch, newest first. */
export async function getRecentMessages(repo: GitRepository, count: number): Promise<string[]> {
  try {
    return (await repo.log({ maxEntries: count })).map((commit) => commit.message);
  } catch {
    return [];
  }
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
