import * as vscode from 'vscode';
import { ConfigLoader } from './config/configLoader';
import { watchWebviewBundles } from './dev/hotReload';
import { registerInstallHooks } from './hooks/installHooks';
import { IssueFormPanel, NEW_ISSUE_COMMAND } from './issueForm/IssueFormPanel';
import { CommitViewProvider } from './webview/CommitViewProvider';

/**
 * Extension entry point. Registers the "Commit Builder" sidebar {@link CommitViewProvider}.
 *
 * @param context - The extension's activation context, used to scope subscriptions.
 */
export function activate(context: vscode.ExtensionContext): void {
  const configLoader = new ConfigLoader();
  const provider = new CommitViewProvider(context.extensionUri, configLoader);

  context.subscriptions.push(
    configLoader,
    watchWebviewBundles(context, () => {
      provider.reload();
      IssueFormPanel.reload(context.extensionUri);
    }),
    registerInstallHooks(configLoader),
    vscode.commands.registerCommand(NEW_ISSUE_COMMAND, () =>
      IssueFormPanel.show(context.extensionUri, configLoader),
    ),
    vscode.window.registerWebviewViewProvider(CommitViewProvider.viewType, provider),
  );
}

/** Extension teardown. No explicit cleanup is required. */
export function deactivate(): void {}
