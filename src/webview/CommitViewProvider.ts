import * as vscode from 'vscode';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { formatCommitMessage } from '../core/formatCommit';
import { addScope } from '../core/scopeConfig';
import type { Scope } from '../core/types';
import { fillCommitInputBox, getCurrentBranchName } from '../git/gitExtension';
import { generateHtml } from './html';
import type { HostToWebviewMessage, WebviewToHostMessage } from './messages';

const CONFIGURATION_SECTION = 'gitmojiCommit';

function readScopes(): Scope[] {
  return vscode.workspace.getConfiguration(CONFIGURATION_SECTION).get<Scope[]>('scopes', []);
}

async function writeScopes(scopes: Scope[]): Promise<void> {
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
  }

  private async handleMessage(
    webview: vscode.Webview,
    message: WebviewToHostMessage,
  ): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.sendInit(webview);
        return;
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

  /**
   * Sends the initial scope list and detected issue to the webview client. Only called in
   * response to the client's own 'ready' message — posting it eagerly right after setting
   * `webview.html` would race the webview's script load: VS Code drops `postMessage` calls
   * sent before the webview's message port is established rather than queuing them, so an
   * eager post is silently lost whenever the webview is recreated (e.g. after the sidebar is
   * closed and reopened).
   */
  private sendInit(webview: vscode.Webview): void {
    const branchName = getCurrentBranchName();
    const detectedIssue = branchName ? extractIssueFromBranch(branchName) : undefined;

    this.postMessage(webview, {
      type: 'init',
      scopes: readScopes(),
      detectedIssue,
    });
  }

  private async addScope(webview: vscode.Webview): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage(
        'Open a workspace folder to add and persist a new scope.',
      );
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: 'New scope name',
      placeHolder: 'e.g. webview',
      validateInput: (value) => (value.trim() ? undefined : 'Scope name is required.'),
    });

    if (!name) {
      return;
    }

    const description = await vscode.window.showInputBox({
      prompt: `Short description for scope "${name}"`,
      placeHolder: 'e.g. Webview UI and client script',
      validateInput: (value) => (value.trim() ? undefined : 'Description is required.'),
    });

    if (!description) {
      return;
    }

    const updatedScopes = addScope(readScopes(), { name, description });
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
