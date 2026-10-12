import * as vscode from 'vscode';
import { ConfigLoader } from './config/configLoader';
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
    vscode.window.registerWebviewViewProvider(CommitViewProvider.viewType, provider),
  );
}

/** Extension teardown. No explicit cleanup is required. */
export function deactivate(): void {}
