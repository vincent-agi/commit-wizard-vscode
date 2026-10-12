import * as vscode from 'vscode';
import { DEFAULT_BUMP_OPTIONS, parseBumpOptions, previewRelease } from '../core/releasePreview';
import type { PreviewCommit, ReleasePreview } from '../core/releasePreview';
import { findReleasePr, versionFromReleaseTitle } from '../core/releasePr';
import type { CheckRunSummary, ReleasePrCandidate } from '../core/releasePr';
import {
  getActiveRepository,
  getCommitsSince,
  getGitHubRepository,
  getLatestTag,
} from '../git/gitExtension';
import { GitHubError, createGitHubClient } from '../github/githubClient';

export const RELEASE_VIEW_ID = 'gitmojiCommit.release';
const REFRESH_INTERVAL_MS = 120_000;

interface Node {
  label: string;
  description?: string;
  tooltip?: string;
  icon?: vscode.ThemeIcon;
  children?: Node[];
  expanded?: boolean;
  command?: vscode.Command;
}

type PrState =
  | { kind: 'found'; pr: ReleasePrCandidate; checks: CheckRunSummary | undefined }
  | { kind: 'none' }
  | { kind: 'signed-out' }
  | { kind: 'no-github' }
  | { kind: 'error'; message: string };

async function readJson(uri: vscode.Uri): Promise<unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
  } catch {
    return undefined;
  }
}

/** The released version Release Please bases the next bump on: its manifest, else package.json. */
async function readCurrentVersion(root: vscode.Uri, tag: string | undefined): Promise<string> {
  const manifest = (await readJson(vscode.Uri.joinPath(root, '.release-please-manifest.json'))) as
    Record<string, string> | undefined;
  const pkg = (await readJson(vscode.Uri.joinPath(root, 'package.json'))) as
    { version?: string } | undefined;
  return manifest?.['.'] ?? pkg?.version ?? tag?.replace(/^v/, '') ?? '0.0.0';
}

function bumpLabel(preview: ReleasePreview): string {
  return preview.nextVersion
    ? `Next version: ${preview.nextVersion} (${preview.bump})`
    : 'No release: nothing releasable since the last one';
}

function commitNodes(commits: readonly PreviewCommit[]): Node[] {
  return commits.map((commit) => ({
    label: commit.message.split('\n')[0],
    description: commit.hash.slice(0, 7),
    tooltip: commit.message,
  }));
}

function previewNodes(preview: ReleasePreview): Node[] {
  const nodes: Node[] = [
    {
      label: bumpLabel(preview),
      description: `from ${preview.currentVersion}`,
      icon: new vscode.ThemeIcon('tag'),
    },
  ];

  if (preview.sections.length > 0) {
    nodes.push({
      label: 'Changelog preview',
      icon: new vscode.ThemeIcon('list-flat'),
      expanded: true,
      children: preview.sections.map((section) => ({
        label: section.heading,
        expanded: true,
        children: section.items.map((item) => ({ label: item })),
      })),
    });
  }
  if (preview.hidden.length > 0) {
    nodes.push({
      label: `Not in the changelog (${preview.hidden.length})`,
      description: 'docs, chore, ci, ...',
      icon: new vscode.ThemeIcon('eye-closed'),
      children: commitNodes(preview.hidden),
    });
  }
  if (preview.invisible.length > 0) {
    nodes.push({
      label: `Invisible to Release Please (${preview.invisible.length})`,
      description: 'not "type: description"',
      tooltip:
        'Release Please only reads headers that start with the type. Commits not following Conventional Commits, or with an emoji before the type, are ignored. Set emojiPosition to "after" to keep the emoji.',
      icon: new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground')),
      children: commitNodes(preview.invisible),
    });
  }
  return nodes;
}

function checksText(checks: CheckRunSummary | undefined): { text: string; icon: string } {
  switch (checks?.state) {
    case 'success':
      return { text: 'checks passing', icon: 'pass' };
    case 'failure':
      return { text: `${checks.failed} check(s) failing`, icon: 'error' };
    case 'pending':
      return { text: `${checks.pending} check(s) running`, icon: 'sync' };
    default:
      return { text: 'no checks reported', icon: 'circle-outline' };
  }
}

function prNode(state: PrState): Node {
  switch (state.kind) {
    case 'found': {
      const version = versionFromReleaseTitle(state.pr.title);
      const checks = checksText(state.checks);
      return {
        label: `Release PR #${state.pr.number}${version ? `: ${version}` : ''}`,
        description: checks.text,
        tooltip: `${state.pr.title}\nClick to open on GitHub.`,
        icon: new vscode.ThemeIcon(checks.icon),
        command: {
          command: 'gitmojiCommit.release.openPr',
          title: 'Open release PR',
          arguments: [state.pr.url],
        },
      };
    }
    case 'none':
      return {
        label: 'No open release pull request',
        icon: new vscode.ThemeIcon('git-pull-request'),
      };
    case 'signed-out':
      return {
        label: 'Sign in to GitHub to see the release pull request',
        icon: new vscode.ThemeIcon('account'),
        command: { command: 'gitmojiCommit.release.signIn', title: 'Sign in' },
      };
    case 'no-github':
      return { label: 'No github.com remote: release pull request unavailable' };
    case 'error':
      return {
        label: 'Release pull request unavailable',
        description: state.message,
        tooltip: state.message,
        icon: new vscode.ThemeIcon('error'),
      };
  }
}

/** Tree showing what the next release will contain and the state of the open release PR. */
export class ReleaseProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.emitter.event;
  private nodes: Node[] = [{ label: 'Loading…' }];

  public async refresh(createSession = false): Promise<void> {
    const repo = getActiveRepository();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!repo || !root) {
      this.nodes = [{ label: 'Open a folder with a Git repository' }];
      this.emitter.fire();
      return;
    }

    const nodes: Node[] = [];
    try {
      const tag = await getLatestTag(repo);
      const commits = await getCommitsSince(repo, tag);
      const options = parseBumpOptions(
        await readJson(vscode.Uri.joinPath(root, 'release-please-config.json')),
      );
      nodes.push(
        ...previewNodes(
          previewRelease(
            commits,
            await readCurrentVersion(root, tag),
            options ?? DEFAULT_BUMP_OPTIONS,
          ),
        ),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      nodes.push({ label: 'Could not compute the release preview', description: reason });
    }

    nodes.push(prNode(await this.loadReleasePr(createSession)));
    this.nodes = nodes;
    this.emitter.fire();
  }

  private async loadReleasePr(createSession: boolean): Promise<PrState> {
    const github = getGitHubRepository();
    if (!github) {
      return { kind: 'no-github' };
    }
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], {
        createIfNone: createSession,
        silent: !createSession,
      });
      if (!session) {
        return { kind: 'signed-out' };
      }
      const client = createGitHubClient(session.accessToken, github);
      const pr = findReleasePr(await client.listOpenPullRequests());
      if (!pr) {
        return { kind: 'none' };
      }
      let checks: CheckRunSummary | undefined;
      try {
        checks = await client.getCheckSummary(pr.headSha);
      } catch {
        // The PR is still worth showing without its checks.
      }
      return { kind: 'found', pr, checks };
    } catch (error) {
      return {
        kind: 'error',
        message: error instanceof GitHubError ? error.message : String(error),
      };
    }
  }

  public getChildren(node?: Node): Node[] {
    return node ? (node.children ?? []) : this.nodes;
  }

  public getTreeItem(node: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children
        ? node.expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.iconPath = node.icon;
    item.command = node.command;
    return item;
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}

/** Registers the release preview view, its commands and its light periodic refresh. */
export function registerRelease(): vscode.Disposable {
  const provider = new ReleaseProvider();
  const treeView = vscode.window.createTreeView(RELEASE_VIEW_ID, { treeDataProvider: provider });

  let timer: NodeJS.Timeout | undefined;
  const syncTimer = () => {
    clearInterval(timer);
    // Only poll while the user can see the view.
    timer = treeView.visible
      ? setInterval(() => void provider.refresh(), REFRESH_INTERVAL_MS)
      : undefined;
    if (treeView.visible) void provider.refresh();
  };

  const repo = getActiveRepository();
  let debounce: NodeJS.Timeout | undefined;
  repo?.state.onDidChange(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => treeView.visible && void provider.refresh(), 1000);
  });

  void provider.refresh();
  return vscode.Disposable.from(
    provider,
    treeView,
    treeView.onDidChangeVisibility(syncTimer),
    new vscode.Disposable(() => {
      clearInterval(timer);
      clearTimeout(debounce);
    }),
    vscode.commands.registerCommand('gitmojiCommit.release.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('gitmojiCommit.release.signIn', () => provider.refresh(true)),
    vscode.commands.registerCommand('gitmojiCommit.release.openPr', (url: string) => {
      if (/^https:\/\/github\.com\//.test(url)) {
        void vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),
  );
}
