import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import type { Telemetry } from '../telemetry/telemetry';
import { checkCommitConformity } from '../core/conformity';
import type { Conformity } from '../core/conformity';
import { isHeadPushed } from '../core/pushDecision';
import { planReword, rebaseCommand } from '../core/rewordPlan';
import { getActiveRepository, getHeadInfo, getHistory } from '../git/gitExtension';
import type { GitCommit } from '../git/gitExtension';
import { t } from '../i18n';

export const HISTORY_VIEW_ID = 'gitmojiCommit.history';
const SETTINGS = 'gitmojiCommit';
const FILTER_CONTEXT = 'gitmojiCommit.historyFiltered';

interface HistoryEntry {
  commit: GitCommit;
  conformity: Conformity;
  /** Position from HEAD: 0 is the latest commit. */
  index: number;
}

/** Tree of the latest commits, each marked as conforming to the team's conventions or not. */
export class HistoryProvider implements vscode.TreeDataProvider<HistoryEntry> {
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.emitter.event;

  private entries: HistoryEntry[] = [];
  private onlyNonConforming = false;
  public treeView: vscode.TreeView<HistoryEntry> | undefined;

  constructor(private readonly configLoader: ConfigLoader) {}

  public async refresh(): Promise<void> {
    const repo = getActiveRepository();
    const settings = vscode.workspace.getConfiguration(SETTINGS);
    const count = Math.min(Math.max(settings.get<number>('history.count', 50), 1), 500);
    const merges = settings.get<string>('history.merges', 'ignore');
    const { config } = await this.configLoader.load();
    const types = config.types.map((type) => type.name);

    const commits = repo ? await getHistory(repo, count) : [];
    this.entries = commits
      .map((commit, index) => ({
        commit,
        index,
        conformity: checkCommitConformity(commit.message, types, commit.parents.length > 1),
      }))
      .filter((entry) => merges === 'flag' || entry.conformity.status !== 'merge');

    if (this.treeView) {
      const bad = this.entries.filter((entry) => entry.conformity.status === 'non-conforming');
      this.treeView.description = repo
        ? t('history.summary', bad.length, this.entries.length)
        : undefined;
    }
    this.emitter.fire();
  }

  public async setFilter(onlyNonConforming: boolean): Promise<void> {
    this.onlyNonConforming = onlyNonConforming;
    await vscode.commands.executeCommand('setContext', FILTER_CONTEXT, onlyNonConforming);
    this.emitter.fire();
  }

  public getChildren(): HistoryEntry[] {
    return this.onlyNonConforming
      ? this.entries.filter((entry) => entry.conformity.status === 'non-conforming')
      : this.entries;
  }

  public getTreeItem(entry: HistoryEntry): vscode.TreeItem {
    const { commit, conformity } = entry;
    const item = new vscode.TreeItem(
      commit.message.split('\n')[0],
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = [commit.hash.slice(0, 7), commit.authorName].filter(Boolean).join(' · ');
    item.tooltip = new vscode.MarkdownString(
      conformity.reason
        ? `**${t('history.notConforming')}** ${conformity.reason}\n\n\`\`\`\n${commit.message}\n\`\`\``
        : `\`\`\`\n${commit.message}\n\`\`\``,
    );

    if (conformity.status === 'conforming') {
      item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      item.contextValue = 'commit';
    } else if (conformity.status === 'merge') {
      item.iconPath = new vscode.ThemeIcon('git-merge');
      item.contextValue = 'commit-merge';
    } else {
      item.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
      item.contextValue = entry.index === 0 ? 'commit-head-fixable' : 'commit-fixable';
    }

    item.command = {
      command: 'gitmojiCommit.history.show',
      title: t('history.show'),
      arguments: [entry],
    };
    return item;
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}

async function showCommit(entry: HistoryEntry): Promise<void> {
  const { commit, conformity } = entry;
  const lines = [
    `commit ${commit.hash}`,
    commit.authorName ? `Author: ${commit.authorName}` : '',
    commit.authorDate ? `Date:   ${commit.authorDate.toISOString()}` : '',
    conformity.reason ? t('history.problem', conformity.reason) : '',
    '',
    commit.message,
  ].filter((line, index) => line || index >= 4);
  const document = await vscode.workspace.openTextDocument({
    language: 'plaintext',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(document, { preview: true });
}

async function rewordCommit(entry: HistoryEntry, beginAmend: () => Promise<void>): Promise<void> {
  const repo = getActiveRepository();
  if (!repo) {
    return;
  }
  const plan = planReword({
    isHead: entry.index === 0,
    pushed: isHeadPushed(getHeadInfo(repo)),
  });

  if (plan === 'rebase-guidance') {
    const command = rebaseCommand(entry.index);
    const choice = await vscode.window.showInformationMessage(
      t('history.rebase', command, entry.commit.hash.slice(0, 7)),
      t('history.copyCommand'),
    );
    if (choice === t('history.copyCommand')) {
      await vscode.env.clipboard.writeText(command);
    }
    return;
  }

  if (plan === 'confirm-pushed') {
    const choice = await vscode.window.showWarningMessage(
      t('history.pushed'),
      { modal: true },
      t('history.rewordAnyway'),
    );
    if (choice !== t('history.rewordAnyway')) {
      return;
    }
  }

  await beginAmend();
}

/** Registers the history view and its commands. */
export function registerHistory(
  configLoader: ConfigLoader,
  beginAmend: () => Promise<void>,
  telemetry: Pick<Telemetry, 'track'>,
): vscode.Disposable {
  const provider = new HistoryProvider(configLoader);
  const treeView = vscode.window.createTreeView(HISTORY_VIEW_ID, { treeDataProvider: provider });
  provider.treeView = treeView;

  const refresh = () => void provider.refresh();
  const repo = getActiveRepository();
  const subscriptions: vscode.Disposable[] = [
    provider,
    treeView,
    configLoader.onDidChange(refresh),
    vscode.commands.registerCommand('gitmojiCommit.history.refresh', refresh),
    vscode.commands.registerCommand('gitmojiCommit.history.filter', () => provider.setFilter(true)),
    vscode.commands.registerCommand('gitmojiCommit.history.unfilter', () =>
      provider.setFilter(false),
    ),
    vscode.commands.registerCommand('gitmojiCommit.history.show', showCommit),
    vscode.commands.registerCommand('gitmojiCommit.history.reword', (entry: HistoryEntry) => {
      telemetry.track('command', { name: 'history-reword' });
      return rewordCommit(entry, beginAmend);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${SETTINGS}.history`)) refresh();
    }),
  ];
  repo?.state.onDidChange(refresh);
  void provider.setFilter(false);
  void provider.refresh();

  return vscode.Disposable.from(...subscriptions);
}
