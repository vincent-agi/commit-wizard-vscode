import * as vscode from 'vscode';
import { filterDiff, buildDraftPrompt, parseDraft } from '../core/aiDraft';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { describeCommitError } from '../core/commitError';
import { clearDraft, draftKey, loadDraft, saveDraft } from '../core/drafts';
import { formatCommitMessage } from '../core/formatCommit';
import { parseCommitMessage } from '../core/parseCommit';
import { isHeadPushed, planPush } from '../core/pushDecision';
import { isProtectedBranch } from '../core/protectedBranch';
import { addScope } from '../core/scopeConfig';
import type { Scope } from '../core/types';
import type { CommitFormInput } from '../core/types';
import { ConfigLoader } from '../config/configLoader';
import {
  commitActiveRepository,
  getActiveRepository,
  getChangeList,
  getHeadInfo,
  getLastCommitMessage,
  getRecentMessages,
  getStagedPaths,
  pushWithPlan,
  stagePaths,
  unstagePaths,
} from '../git/gitExtension';
import type { GitRepository } from '../git/gitExtension';
import { generateHtml } from './html';
import type { HostToWebviewMessage, RepositoryState, WebviewToHostMessage } from './messages';

const CONFIGURATION_SECTION = 'gitmojiCommit';
const RECENT_MESSAGES = 10;
const DRAFT_SAVE_DELAY_MS = 400;
const AI_MAX_DIFF_CHARS = 12000;
const AI_TIMEOUT_MS = 60000;

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
 * scope list in sync with workspace configuration, mirrors the repository state (changes,
 * branch, drafts) and commits the composed message to the active Git repository.
 */
export class CommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitmojiCommit.commitView';

  private readonly webviews = new Set<vscode.Webview>();
  private readonly watchedRepositories = new WeakSet<object>();
  private lastBranch: string | undefined;
  private pendingDraft: { key: string; input: CommitFormInput } | undefined;
  private draftTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configLoader: ConfigLoader,
    private readonly workspaceState: vscode.Memento,
  ) {
    configLoader.onDidChange(() => void this.broadcastConfig());
  }

  /** Development only: re-renders every open Commit Builder with the freshly built bundle. */
  public reload(): void {
    for (const webview of this.webviews) {
      webview.html = generateHtml(webview, this.extensionUri);
    }
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
        this.scheduleDraftSave(message.input);
        return;
      case 'addScope':
        await this.addScope();
        return;
      case 'commitNow':
        await this.commitNow(webview, message.input, message.amend, message.push);
        return;
      case 'stage':
        await this.withRepository((repo) => stagePaths(repo, message.paths));
        return;
      case 'unstage':
        await this.withRepository((repo) => unstagePaths(repo, message.paths));
        return;
      case 'stageAll':
        await this.withRepository((repo) =>
          stagePaths(
            repo,
            getChangeList(repo).unstaged.map((file) => file.path),
          ),
        );
        return;
      case 'unstageAll':
        await this.withRepository((repo) => unstagePaths(repo, getStagedPaths(repo)));
        return;
      case 'setAmend':
        await this.prefillFromLastCommit(webview, message.amend);
        return;
      case 'draftWithAi':
        await this.draftWithAi(webview);
        return;
      case 'clearDraft':
        await this.discardDraft();
        return;
    }
  }

  private async withRepository(action: (repo: GitRepository) => Promise<void>): Promise<void> {
    const repo = getActiveRepository();
    if (!repo) {
      return;
    }
    try {
      await action(repo);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Git operation failed: ${reason}`);
    }
  }

  /** Everything the form needs that depends on the repository and its current branch. */
  private async repositoryState(issuePattern?: string): Promise<RepositoryState> {
    const repo = getActiveRepository();
    const branch = repo?.state.HEAD?.name;
    this.lastBranch = branch;
    this.watch(repo);

    return {
      branch,
      detectedIssue: branch ? extractIssueFromBranch(branch, issuePattern) : undefined,
      draft: repo && branch ? loadDraft(this.workspaceState, this.draftKeyFor(repo)) : undefined,
      recent: repo ? await getRecentMessages(repo, RECENT_MESSAGES) : [],
      changes: repo ? getChangeList(repo) : { staged: [], unstaged: [] },
    };
  }

  private draftKeyFor(repo: GitRepository): string {
    return draftKey(repo.rootUri.fsPath, repo.state.HEAD?.name ?? '(detached)');
  }

  /** Subscribes once per repository to its state changes. */
  private watch(repo: GitRepository | undefined): void {
    if (!repo || this.watchedRepositories.has(repo)) {
      return;
    }
    this.watchedRepositories.add(repo);
    repo.state.onDidChange(() => void this.onRepositoryChanged(repo));
  }

  private async onRepositoryChanged(repo: GitRepository): Promise<void> {
    if (this.webviews.size === 0) {
      return;
    }

    const branch = repo.state.HEAD?.name;
    if (branch !== this.lastBranch) {
      // Keep what was typed for the branch we are leaving before loading the next draft.
      await this.flushDraft();
      const { config } = await this.configLoader.load();
      const state = await this.repositoryState(config.issuePattern);
      this.postAll({ type: 'branchChanged', ...state });
      return;
    }

    this.postAll({ type: 'changes', changes: getChangeList(repo) });
  }

  private scheduleDraftSave(input: CommitFormInput): void {
    const repo = getActiveRepository();
    if (!repo) {
      return;
    }
    this.pendingDraft = { key: this.draftKeyFor(repo), input };
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => void this.flushDraft(), DRAFT_SAVE_DELAY_MS);
  }

  private async flushDraft(): Promise<void> {
    clearTimeout(this.draftTimer);
    const pending = this.pendingDraft;
    this.pendingDraft = undefined;
    if (pending) {
      await saveDraft(this.workspaceState, pending.key, pending.input);
    }
  }

  private async discardDraft(): Promise<void> {
    clearTimeout(this.draftTimer);
    this.pendingDraft = undefined;
    const repo = getActiveRepository();
    if (repo) {
      await clearDraft(this.workspaceState, this.draftKeyFor(repo));
    }
  }

  /**
   * Sends the initial configuration and repository state to the webview client. Only called in
   * response to the client's own 'ready' message — posting it eagerly right after setting
   * `webview.html` would race the webview's script load: VS Code drops `postMessage` calls
   * sent before the webview's message port is established rather than queuing them, so an
   * eager post is silently lost whenever the webview is recreated (e.g. after the sidebar is
   * closed and reopened).
   */
  private async sendInit(webview: vscode.Webview): Promise<void> {
    const { config, warnings } = await this.configLoader.load();
    const state = await this.repositoryState(config.issuePattern);
    this.postMessage(webview, { type: 'init', config, warnings, ...state });
  }

  /** Pushes the freshly resolved configuration to every open webview. */
  private async broadcastConfig(): Promise<void> {
    const { config, warnings } = await this.configLoader.load();
    this.postAll({ type: 'configUpdated', config, warnings });
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

  private fail(webview: vscode.Webview, summary: string, details = ''): void {
    this.postMessage(webview, {
      type: 'commitFailed',
      failure: { kind: 'other', summary, details },
    });
  }

  /** Loads the last commit into the form so it can be amended. */
  private async prefillFromLastCommit(webview: vscode.Webview, amend: boolean): Promise<void> {
    const repo = getActiveRepository();
    if (!amend || !repo) {
      return;
    }
    const message = await getLastCommitMessage(repo);
    if (!message) {
      this.fail(webview, 'There is no commit to amend yet.');
      return;
    }

    const { config } = await this.configLoader.load();
    const parsed = parseCommitMessage(message);
    const input: CommitFormInput = parsed
      ? {
          type: parsed.type,
          gitmoji: config.emojis ? parsed.gitmoji : '',
          scope: parsed.scope,
          issue: parsed.issue,
          issueKeyword: parsed.issueKeyword,
          description: parsed.description,
          body: parsed.body,
          breakingChange: parsed.breaking,
          breakingChangeDescription: parsed.breakingChangeDescription,
          coAuthors: parsed.coAuthors,
        }
      : {
          // Not a Conventional Commit: keep the text, with the first line as the description.
          type: config.types[0]?.name ?? 'chore',
          gitmoji: '',
          issueKeyword: 'refs',
          description: message.split('\n')[0].trim(),
          body: message.split('\n').slice(1).join('\n').trim() || undefined,
          breakingChange: false,
        };
    this.postMessage(webview, { type: 'prefill', input });
  }

  private async commitNow(
    webview: vscode.Webview,
    input: CommitFormInput,
    amend: boolean,
    push: boolean,
  ): Promise<void> {
    const repo = getActiveRepository();
    if (!repo) {
      this.fail(
        webview,
        'No active Git repository found. Open a folder with a Git repository to commit.',
      );
      return;
    }

    const { config } = await this.configLoader.load();
    const head = getHeadInfo(repo);

    if (isProtectedBranch(head.name, config.protectedBranches)) {
      const choice = await vscode.window.showWarningMessage(
        `"${head.name}" is a protected branch. Commit directly to it?`,
        { modal: true },
        'Commit anyway',
      );
      if (choice !== 'Commit anyway') {
        return;
      }
    }

    if (amend && isHeadPushed(head)) {
      const choice = await vscode.window.showWarningMessage(
        'The last commit is already on the remote. Amending it rewrites shared history and a later push would need a force-push.',
        { modal: true },
        'Amend anyway',
      );
      if (choice !== 'Amend anyway') {
        return;
      }
    }

    const message = formatCommitMessage(input);
    this.postMessage(webview, { type: 'commitStarted' });

    try {
      await commitActiveRepository(message, { amend });
    } catch (error) {
      this.postMessage(webview, { type: 'commitFailed', failure: describeCommitError(error) });
      return;
    }

    await this.discardDraft();
    this.postMessage(webview, {
      type: 'commitSucceeded',
      recent: await getRecentMessages(repo, RECENT_MESSAGES),
    });

    if (push) {
      await this.pushAfterCommit(webview, repo);
    }
  }

  private async pushAfterCommit(webview: vscode.Webview, repo: GitRepository): Promise<void> {
    const plan = planPush(
      getHeadInfo(repo),
      repo.state.remotes.map((remote) => remote.name),
    );
    if (!plan.ok) {
      this.fail(webview, `Committed, but not pushed: ${plan.reason}`);
      return;
    }

    try {
      await pushWithPlan(repo, plan);
    } catch (error) {
      const failure = describeCommitError(error);
      this.fail(webview, `Committed, but the push failed: ${failure.summary}`, failure.details);
    }
  }

  /** Drafts type, scope, description and body from the staged diff with a language model. */
  private async draftWithAi(webview: vscode.Webview): Promise<void> {
    const { config } = await this.configLoader.load();
    const repo = getActiveRepository();
    if (!config.aiDraft || !repo) {
      this.postMessage(webview, { type: 'aiFailed', message: 'AI drafting is not enabled.' });
      return;
    }

    const lm = (vscode as { lm?: typeof vscode.lm }).lm;
    if (!lm?.selectChatModels) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: 'This version of VS Code has no language model API. Update VS Code to use this.',
      });
      return;
    }

    const filtered = filterDiff(await repo.diff(true), { maxChars: AI_MAX_DIFF_CHARS });
    if (filtered.files.length === 0) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: 'Stage some changes first: there is nothing to describe.',
      });
      return;
    }

    const models = await lm.selectChatModels();
    if (models.length === 0) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: 'No language model is available. Sign in to a provider such as GitHub Copilot.',
      });
      return;
    }
    const model =
      models.length === 1
        ? models[0]
        : (
            await vscode.window.showQuickPick(
              models.map((candidate) => ({
                label: candidate.name,
                description: candidate.vendor,
                candidate,
              })),
              { title: 'Language model for the commit draft' },
            )
          )?.candidate;
    if (!model) {
      this.postMessage(webview, { type: 'aiFailed', message: 'No model selected.' });
      return;
    }

    const extra = [
      filtered.excluded.length > 0
        ? `${filtered.excluded.length} lock/generated/binary file(s) are left out.`
        : '',
      filtered.truncated ? 'The diff is truncated.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const choice = await vscode.window.showInformationMessage(
      `Send the staged diff (${filtered.files.length} file(s), ${filtered.text.length} characters) to ${model.name} (${model.vendor})? ${extra}`.trim(),
      { modal: true },
      'Send',
    );
    if (choice !== 'Send') {
      this.postMessage(webview, { type: 'aiFailed', message: 'Cancelled: nothing was sent.' });
      return;
    }

    const cancellation = new vscode.CancellationTokenSource();
    const timer = setTimeout(() => cancellation.cancel(), AI_TIMEOUT_MS);
    try {
      const prompt = buildDraftPrompt({
        diff: filtered.text,
        types: config.types,
        scopes: config.scopes.map((scope) => scope.name),
      });
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        cancellation.token,
      );
      let answer = '';
      for await (const fragment of response.text) {
        answer += fragment;
      }

      const parsed = parseDraft(answer, {
        types: config.types.map((type) => type.name),
        scopes: config.scopes.map((scope) => scope.name),
      });
      this.postMessage(
        webview,
        parsed.ok
          ? { type: 'aiResult', draft: parsed.draft }
          : { type: 'aiFailed', message: parsed.reason },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.postMessage(webview, {
        type: 'aiFailed',
        message: `The model request failed: ${reason}`,
      });
    } finally {
      clearTimeout(timer);
      cancellation.dispose();
    }
  }

  private postAll(message: HostToWebviewMessage): void {
    for (const webview of this.webviews) {
      this.postMessage(webview, message);
    }
  }

  private postMessage(webview: vscode.Webview, message: HostToWebviewMessage): void {
    webview.postMessage(message);
  }
}
