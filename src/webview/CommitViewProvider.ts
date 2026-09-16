import * as vscode from 'vscode';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { formatCommitMessage } from '../core/formatCommit';
import { addScope } from '../core/scopeConfig';
import { fillCommitInputBox, getCurrentBranchName } from '../git/gitExtension';
import { generateHtml } from './html';
import type { HostToWebviewMessage, WebviewToHostMessage } from './messages';

const CONFIGURATION_SECTION = 'gitmojiCommit';

function readScopes(): string[] {
  return vscode.workspace.getConfiguration(CONFIGURATION_SECTION).get<string[]>('scopes', []);
}

async function writeScopes(scopes: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .update('scopes', scopes, vscode.ConfigurationTarget.Workspace);
}

/**
 * Registers and drives the "Commit Builder" sidebar webview: renders the form, keeps the
 * scope list in sync with workspace configuration, and injects the composed commit message
 * into the active Git repository's input box.
 */
export class CommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitmojiCommit.commitView';

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webviewView.webview.html = generateHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((message: WebviewToHostMessage) =>
      this.handleMessage(webviewView.webview, message),
    );

    const branchName = getCurrentBranchName();
    const detectedIssue = branchName ? extractIssueFromBranch(branchName) : undefined;

    this.postMessage(webviewView.webview, {
      type: 'init',
      scopes: readScopes(),
      detectedIssue,
    });
  }

  private async handleMessage(
    webview: vscode.Webview,
    message: WebviewToHostMessage,
  ): Promise<void> {
    switch (message.type) {
      case 'formChanged':
        return;
      case 'addScope':
        await this.addScope(webview);
        return;
      case 'fillCommit':
        this.fillCommit(message.input);
        return;
    }
  }

  private async addScope(webview: vscode.Webview): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage(
        'Open a workspace folder to add and persist a new scope.',
      );
      return;
    }

    const newScope = await vscode.window.showInputBox({
      prompt: 'New scope name',
      placeHolder: 'e.g. webview',
    });

    if (!newScope) {
      return;
    }

    const updatedScopes = addScope(readScopes(), newScope);
    await writeScopes(updatedScopes);
    this.postMessage(webview, { type: 'scopesUpdated', scopes: updatedScopes });
  }

  private fillCommit(input: Parameters<typeof formatCommitMessage>[0]): void {
    const message = formatCommitMessage(input);
    const filled = fillCommitInputBox(message);

    if (!filled) {
      vscode.window.showWarningMessage(
        'No active Git repository found. Open a folder with a Git repository to fill its commit message.',
      );
    }
  }

  private postMessage(webview: vscode.Webview, message: HostToWebviewMessage): void {
    webview.postMessage(message);
  }
}
