import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import {
  formatIssueTitle,
  milestonePayload,
  parseAssignees,
  renderIssueBody,
  validateIssue,
  validateMilestone,
} from '../core/issueTemplate';
import type { GitHubRepo } from '../core/githubRemote';
import type { IssueFormInput, MilestoneFormInput } from '../core/issueTemplate';
import { getGitHubRepository } from '../git/gitExtension';
import { GitHubError, createGitHubClient } from '../github/githubClient';
import { generateIssueFormHtml } from './html';
import type { HostToIssueFormMessage, IssueFormToHostMessage } from './messages';

export const NEW_ISSUE_COMMAND = 'gitmojiCommit.newIssue';

const GITHUB_AUTH_PROVIDER = 'github';
const GITHUB_SCOPES = ['repo'];
const ALLOWED_URL_PREFIX = 'https://github.com/';

/**
 * The "New Issue or Milestone" panel: a form that renders a standardized issue body (or a
 * milestone) and creates it on GitHub with the user's VS Code GitHub sign-in. Nothing is sent
 * until the user clicks the submit button.
 */
export class IssueFormPanel {
  private static current: IssueFormPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private repo: GitHubRepo | undefined;

  private constructor(
    extensionUri: vscode.Uri,
    private readonly configLoader: ConfigLoader,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'gitmojiCommit.issueForm',
      'New Issue or Milestone',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    this.panel.webview.html = generateIssueFormHtml(this.panel.webview, extensionUri);
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: IssueFormToHostMessage) =>
        this.handleMessage(message),
      ),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  /** Opens the panel, or reveals it when already open. */
  public static show(extensionUri: vscode.Uri, configLoader: ConfigLoader): void {
    if (IssueFormPanel.current) {
      IssueFormPanel.current.panel.reveal();
      return;
    }
    IssueFormPanel.current = new IssueFormPanel(extensionUri, configLoader);
  }

  /** Development only: re-renders the open panel with the freshly built bundle. */
  public static reload(extensionUri: vscode.Uri): void {
    const current = IssueFormPanel.current;
    if (current) {
      current.panel.webview.html = generateIssueFormHtml(current.panel.webview, extensionUri);
    }
  }

  private dispose(): void {
    IssueFormPanel.current = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private post(message: HostToIssueFormMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async handleMessage(message: IssueFormToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.sendInit();
        return;
      case 'signIn':
        await this.loadMeta(true);
        return;
      case 'submitIssue':
        await this.submitIssue(message.input);
        return;
      case 'submitMilestone':
        await this.submitMilestone(message.input);
        return;
      case 'openUrl':
        // Only ever open GitHub links, whatever the webview asks for.
        if (message.url.startsWith(ALLOWED_URL_PREFIX)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        return;
    }
  }

  private async sendInit(): Promise<void> {
    const { config } = await this.configLoader.load();
    this.repo = getGitHubRepository();
    this.post({
      type: 'init',
      config: { types: config.types, scopes: config.scopes, issueTemplate: config.issueTemplate },
      repo: this.repo ? `${this.repo.owner}/${this.repo.repo}` : undefined,
    });
    await this.loadMeta(false);
  }

  private async session(createIfNone: boolean): Promise<vscode.AuthenticationSession | undefined> {
    try {
      return await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER, GITHUB_SCOPES, {
        createIfNone,
      });
    } catch {
      return undefined;
    }
  }

  /** Loads the repository's milestones and labels once the user is signed in. */
  private async loadMeta(createIfNone: boolean): Promise<void> {
    const session = this.repo ? await this.session(createIfNone) : undefined;
    if (!this.repo || !session) {
      this.post({ type: 'meta', signedIn: false, milestones: [], labels: [] });
      return;
    }

    try {
      const client = createGitHubClient(session.accessToken, this.repo);
      const [milestones, labels] = await Promise.all([
        client.listOpenMilestones(),
        client.listLabels(),
      ]);
      this.post({ type: 'meta', signedIn: true, milestones, labels });
    } catch (error) {
      this.post({ type: 'meta', signedIn: true, milestones: [], labels: [] });
      this.post({ type: 'failed', message: this.describe(error) });
    }
  }

  private describe(error: unknown): string {
    return error instanceof GitHubError
      ? error.message
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  }

  /** Common guard for both submit paths: a repo, a valid form, and a GitHub session. */
  private async prepare(errors: string[]) {
    if (!this.repo) {
      this.post({
        type: 'failed',
        message:
          'No GitHub remote found. Open a folder whose Git repository has a github.com remote.',
      });
      return undefined;
    }
    if (errors.length > 0) {
      this.post({ type: 'failed', message: errors.join(' ') });
      return undefined;
    }
    const session = await this.session(true);
    if (!session) {
      this.post({ type: 'failed', message: 'GitHub sign-in is required to create it.' });
      return undefined;
    }
    return createGitHubClient(session.accessToken, this.repo);
  }

  private async submitIssue(input: IssueFormInput): Promise<void> {
    const client = await this.prepare(validateIssue(input));
    if (!client) {
      return;
    }
    this.post({ type: 'busy' });

    try {
      const { config } = await this.configLoader.load();
      const created = await client.createIssue({
        title: formatIssueTitle(input),
        body: renderIssueBody(input, config.issueTemplate),
        labels: input.labels,
        milestone: input.milestone,
        assignees: parseAssignees(input.assignees),
      });
      this.post({ type: 'created', kind: 'issue', ...created });
    } catch (error) {
      this.post({ type: 'failed', message: this.describe(error) });
    }
  }

  private async submitMilestone(input: MilestoneFormInput): Promise<void> {
    const client = await this.prepare(validateMilestone(input));
    if (!client) {
      return;
    }
    this.post({ type: 'busy' });

    try {
      const created = await client.createMilestone(milestonePayload(input));
      this.post({ type: 'created', kind: 'milestone', ...created });
      await this.loadMeta(false);
    } catch (error) {
      this.post({ type: 'failed', message: this.describe(error) });
    }
  }
}
