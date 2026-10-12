import * as vscode from 'vscode';
import { ConfigLoader } from './config/configLoader';
import { watchWebviewBundles } from './dev/hotReload';
import { registerHistory } from './history/historyView';
import { registerRelease } from './release/releaseView';
import { registerNewBranch } from './branch/newBranch';
import { registerGeneratePullRequest } from './pr/generatePullRequest';
import { registerInstallHooks } from './hooks/installHooks';
import { IssueFormPanel, NEW_ISSUE_COMMAND } from './issueForm/IssueFormPanel';
import { Telemetry } from './telemetry/telemetry';
import { CommitViewProvider } from './webview/CommitViewProvider';
import { setLocale } from './i18n';

/**
 * Extension entry point. Registers the "Commit Builder" sidebar {@link CommitViewProvider}.
 *
 * @param context - The extension's activation context, used to scope subscriptions.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Before anything creates a view or a message: the language is fixed for the session.
  setLocale(vscode.env.language);

  const telemetry = new Telemetry(String(context.extension.packageJSON.version));
  const configLoader = new ConfigLoader();
  const provider = new CommitViewProvider(
    context.extensionUri,
    configLoader,
    context.workspaceState,
    telemetry,
  );

  context.subscriptions.push(
    telemetry,
    configLoader,
    watchWebviewBundles(context, () => {
      provider.reload();
      IssueFormPanel.reload(context.extensionUri);
    }),
    registerInstallHooks(configLoader, telemetry),
    vscode.commands.registerCommand('gitmojiCommit.focus', () =>
      vscode.commands.executeCommand(`${CommitViewProvider.viewType}.focus`),
    ),
    registerNewBranch(configLoader, telemetry),
    registerHistory(configLoader, () => provider.beginAmend(), telemetry),
    registerRelease(),
    registerGeneratePullRequest(configLoader, telemetry),
    vscode.commands.registerCommand(NEW_ISSUE_COMMAND, () => {
      telemetry.track('command', { name: 'new-issue' });
      IssueFormPanel.show(context.extensionUri, configLoader);
    }),
    vscode.window.registerWebviewViewProvider(CommitViewProvider.viewType, provider),
  );
}

/** Extension teardown. No explicit cleanup is required. */
export function deactivate(): void {}
