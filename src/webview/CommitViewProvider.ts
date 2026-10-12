import * as vscode from 'vscode';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { describeCommitError } from '../core/commitError';
import { formatCommitMessage } from '../core/formatCommit';
import { addScope } from '../core/scopeConfig';
import { ConfigLoader } from '../config/configLoader';
import type { Scope } from '../core/types';
import { commitActiveRepository, getCurrentBranchName } from '../git/gitExtension';
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
 * scope list in sync with workspace configuration, and commits the composed message to the
 * active Git repository.
 */
export class CommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitmojiCommit.commitView';

  private readonly webviews = new Set<vscode.Webview>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configLoader: ConfigLoader,
  ) {
    configLoader.onDidChange(() => void this.broadcastConfig());
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webviewView.webview.html = generateHtml(webviewView.webview, this.extensionUri);

    this.webviews.add(webviewView.webview);
    webviewView.onDidDispose(() => this.webviews.delete(webviewView.webview));

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
        await this.sendInit(webview);
        return;
      case 'formChanged':
        return;
      case 'addScope':
        await this.addScope();
        return;
      case 'commitNow':
        await this.commitNow(webview, message.input);
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
  private async sendInit(webview: vscode.Webview): Promise<void> {
    const { config, warnings } = await this.configLoader.load();
    const branchName = getCurrentBranchName();
    const detectedIssue = branchName
      ? extractIssueFromBranch(branchName, config.issuePattern)
      : undefined;

    this.postMessage(webview, { type: 'init', config, warnings, detectedIssue });
  }

  /** Pushes the freshly resolved configuration to every open webview. */
  private async broadcastConfig(): Promise<void> {
    const { config, warnings } = await this.configLoader.load();
    for (const webview of this.webviews) {
      this.postMessage(webview, { type: 'configUpdated', config, warnings });
    }
  }

  private async addScope(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage('Open a workspace folder to add and persist a new scope.');
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
    // The settings change event makes the loader refresh every open webview.
    await writeScopes(updatedScopes);
  }

  private async commitNow(
    webview: vscode.Webview,
    input: Parameters<typeof formatCommitMessage>[0],
  ): Promise<void> {
    const message = formatCommitMessage(input);
    this.postMessage(webview, { type: 'commitStarted' });

    try {
      const committed = await commitActiveRepository(message);
      if (!committed) {
        this.postMessage(webview, {
          type: 'commitFailed',
          failure: {
            kind: 'other',
            summary:
              'No active Git repository found. Open a folder with a Git repository to commit.',
            details: '',
          },
        });
        return;
      }
      this.postMessage(webview, { type: 'commitSucceeded' });
    } catch (error) {
      this.postMessage(webview, { type: 'commitFailed', failure: describeCommitError(error) });
    }
  }

  private postMessage(webview: vscode.Webview, message: HostToWebviewMessage): void {
    webview.postMessage(message);
  }
}
