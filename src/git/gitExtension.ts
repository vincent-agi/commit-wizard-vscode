import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { toChangeList } from '../core/changes';
import type { ChangeList, RawChange } from '../core/changes';
import { parseGitHubRemote } from '../core/githubRemote';
import type { GitHubRepo } from '../core/githubRemote';
import { GIT_LOG_FORMAT, parseGitLog } from '../core/prDescription';
import type { BranchCommit } from '../core/prDescription';
import type { HeadInfo, PushPlan } from '../core/pushDecision';

const execFileAsync = promisify(execFile);

interface GitChange {
  uri: vscode.Uri;
  status: number;
}

export interface GitCommit {
  hash: string;
  message: string;
  parents: string[];
  authorName?: string;
  authorDate?: Date;
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

async function git(repo: GitRepository, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repo.rootUri.fsPath,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function refExists(repo: GitRepository, ref: string): Promise<boolean> {
  try {
    await git(repo, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The branch pull requests target: the remote's default (`origin/HEAD`), else the first of
 * `main` / `master` that exists, never the current branch itself.
 *
 * @returns The ref to compare against and its short branch name, or `undefined`.
 */
export async function getDefaultBaseBranch(
  repo: GitRepository,
): Promise<{ ref: string; name: string } | undefined> {
  const current = repo.state.HEAD?.name;
  const candidates: string[] = [];
  try {
    candidates.push(await git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']));
  } catch {
    // No origin/HEAD: fall back to the usual names.
  }
  candidates.push('origin/main', 'origin/master', 'main', 'master');

  for (const ref of candidates) {
    const name = ref.replace(/^origin\//, '');
    if (name !== current && (await refExists(repo, ref))) {
      return { ref, name };
    }
  }
  return undefined;
}

/** Commits on HEAD that are not on `baseRef`, newest first, merges excluded. */
export async function getBranchCommits(
  repo: GitRepository,
  baseRef: string,
): Promise<BranchCommit[]> {
  const mergeBase = await git(repo, ['merge-base', baseRef, 'HEAD']);
  const output = await execFileAsync(
    'git',
    ['log', '--no-merges', `--format=${GIT_LOG_FORMAT}`, `${mergeBase}..HEAD`],
    { cwd: repo.rootUri.fsPath, maxBuffer: 10 * 1024 * 1024 },
  );
  return parseGitLog(output.stdout);
}

/** Whether the repository has staged or unstaged changes. */
export function hasUncommittedChanges(repo: GitRepository): boolean {
  return repo.state.indexChanges.length > 0 || repo.state.workingTreeChanges.length > 0;
}

/** Whether a local branch called `name` exists. */
export async function branchExists(repo: GitRepository, name: string): Promise<boolean> {
  return refExists(repo, `refs/heads/${name}`);
}

/** Creates `name` from the current HEAD and checks it out, carrying uncommitted changes along. */
export async function createAndCheckoutBranch(repo: GitRepository, name: string): Promise<void> {
  await repo.createBranch(name, true);
}

/** The tag the latest release was cut from, or `undefined` when the repository has none. */
export async function getLatestTag(repo: GitRepository): Promise<string | undefined> {
  try {
    return (await git(repo, ['describe', '--tags', '--abbrev=0'])) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Commits made since `tag` (or all of them, capped, when there is no tag), newest first,
 * merges excluded.
 */
export async function getCommitsSince(
  repo: GitRepository,
  tag: string | undefined,
  cap = 300,
): Promise<BranchCommit[]> {
  const range = tag ? [`${tag}..HEAD`] : ['HEAD'];
  const output = await execFileAsync(
    'git',
    ['log', '--no-merges', `--max-count=${cap}`, `--format=${GIT_LOG_FORMAT}`, ...range],
    { cwd: repo.rootUri.fsPath, maxBuffer: 10 * 1024 * 1024 },
  );
  return parseGitLog(output.stdout);
}

/** Commits of the current branch with their parents, newest first. */
export async function getHistory(repo: GitRepository, count: number): Promise<GitCommit[]> {
  try {
    return await repo.log({ maxEntries: count });
  } catch {
    return [];
  }
}
