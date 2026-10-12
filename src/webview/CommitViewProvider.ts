import * as vscode from 'vscode';
import { filterDiff, buildDraftPrompt, parseDraft } from '../core/aiDraft';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { describeCommitError } from '../core/commitError';
import { clearDraft, draftKey, loadDraft, saveDraft } from '../core/drafts';
import { formatCommitMessage } from '../core/formatCommit';
import { parseCommitMessage } from '../core/parseCommit';
import { githubIssueNumber, resolveTracker } from '../core/issueTracker';
import { isHeadPushed, planPush } from '../core/pushDecision';
import { isProtectedBranch } from '../core/protectedBranch';
import { addScope } from '../core/scopeConfig';
import type { Scope } from '../core/types';
import type { CommitFormInput } from '../core/types';
import type { CommitConfig } from '../core/commitConfig';
import { ConfigLoader } from '../config/configLoader';
import { DEFAULT_CONFIG } from '../core/commitConfig';
import type { Telemetry } from '../telemetry/telemetry';
import { createConformingBranch } from '../branch/newBranch';
import { GitHubError, createGitHubClient } from '../github/githubClient';
import {
  commitActiveRepository,
  getActiveRepository,
  getChangeList,
  getHeadInfo,
  getLastCommitMessage,
  getGitHubRepository,
  getRecentMessages,
  getStagedPaths,
  pushWithPlan,
  stagePaths,
  unstagePaths,
} from '../git/gitExtension';
import type { GitRepository } from '../git/gitExtension';
import { generateHtml } from './html';
import type { HostToWebviewMessage, RepositoryState, WebviewToHostMessage } from './messages';
import { t } from '../i18n';

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
  private readonly issueTitles = new Map<number, string>();
  private readonly readyWebviews = new Set<vscode.Webview>();
  private pendingAmend = false;
  /** Whether the message being committed started from an AI draft. */
  private aiDrafted = false;
  private lastBranch: string | undefined;
  private pendingDraft: { key: string; input: CommitFormInput } | undefined;
  private draftTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configLoader: ConfigLoader,
    private readonly workspaceState: vscode.Memento,
    private readonly telemetry: Pick<Telemetry, 'track'>,
  ) {
    configLoader.onDidChange(() => void this.broadcastConfig());
  }

  /** Development only: re-renders every open Commit Builder with the freshly built bundle. */
  public reload(): void {
    for (const webview of this.webviews) {
      webview.html = generateHtml(webview, this.extensionUri);
    }
  }

  /**
   * Opens the Commit Builder with "Amend last commit" ticked and the last message loaded. If the
   * view was not open yet, the request waits until its client has received the initial state.
   */
  public async beginAmend(): Promise<void> {
    this.pendingAmend = true;
    await vscode.commands.executeCommand(`${CommitViewProvider.viewType}.focus`);
    this.flushPendingAmend();
  }

  private flushPendingAmend(): void {
    if (!this.pendingAmend || this.readyWebviews.size === 0) {
      return;
    }
    this.pendingAmend = false;
    for (const webview of this.readyWebviews) {
      this.postMessage(webview, { type: 'beginAmend' });
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webviewView.webview.html = generateHtml(webviewView.webview, this.extensionUri);

    this.webviews.add(webviewView.webview);
    webviewView.onDidDispose(() => {
      this.webviews.delete(webviewView.webview);
      this.readyWebviews.delete(webviewView.webview);
    });

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
      case 'newBranch':
        await createConformingBranch(this.configLoader);
        return;
      case 'openUrl':
        // Only web links: the webview must never be able to open arbitrary schemes.
        if (/^https?:\/\//i.test(message.url)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        return;
      case 'lookupIssues':
        await this.lookupIssues(webview, message.references);
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
      vscode.window.showErrorMessage(t('cb.gitFailed', reason));
    }
  }

  /** Everything the form needs that depends on the repository and its current branch. */
  private async repositoryState(
    config: Pick<CommitConfig, 'issuePattern' | 'issueTracker' | 'issueUrlTemplate'>,
  ): Promise<RepositoryState> {
    const tracker = resolveTracker(config, getGitHubRepository());
    const repo = getActiveRepository();
    const branch = repo?.state.HEAD?.name;
    this.lastBranch = branch;
    this.watch(repo);

    return {
      branch,
      detectedIssue: branch ? extractIssueFromBranch(branch, tracker.pattern) : undefined,
      issueUrlTemplate: tracker.urlTemplate,
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
      const state = await this.repositoryState(config);
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
    const state = await this.repositoryState(config);
    this.postMessage(webview, { type: 'init', config, warnings, ...state });
    this.readyWebviews.add(webview);
    this.flushPendingAmend();
  }

  /** Pushes the freshly resolved configuration to every open webview. */
  private async broadcastConfig(): Promise<void> {
    const { config, warnings } = await this.configLoader.load();
    this.postAll({ type: 'configUpdated', config, warnings });
  }

  private async addScope(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage(t('cb.scope.needFolder'));
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: t('cb.scope.namePrompt'),
      placeHolder: t('cb.scope.namePlaceholder'),
      validateInput: (value) => (value.trim() ? undefined : t('cb.scope.nameRequired')),
    });

    if (!name) {
      return;
    }

    const description = await vscode.window.showInputBox({
      prompt: t('cb.scope.descriptionPrompt', name),
      placeHolder: t('cb.scope.descriptionPlaceholder'),
      validateInput: (value) => (value.trim() ? undefined : t('cb.scope.descriptionRequired')),
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
      this.fail(webview, t('cb.amend.none'));
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
      this.fail(webview, t('cb.noRepo'));
      return;
    }

    const { config } = await this.configLoader.load();
    const head = getHeadInfo(repo);

    if (isProtectedBranch(head.name, config.protectedBranches)) {
      const choice = await vscode.window.showWarningMessage(
        t('cb.protected.ask', head.name ?? ''),
        { modal: true },
        t('cb.protected.commit'),
        t('cb.protected.branch'),
      );
      if (choice === t('cb.protected.branch')) {
        // Carry on with the commit on the new branch only if one was actually created.
        if (!(await createConformingBranch(this.configLoader))) {
          return;
        }
      } else if (choice !== t('cb.protected.commit')) {
        return;
      }
    }

    if (amend && isHeadPushed(head)) {
      const choice = await vscode.window.showWarningMessage(
        t('cb.amend.pushed'),
        { modal: true },
        t('cb.amend.anyway'),
      );
      if (choice !== t('cb.amend.anyway')) {
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

    this.telemetry.track('commit', {
      typeKind: DEFAULT_CONFIG.types.some((type) => type.name === input.type)
        ? 'builtin'
        : 'custom',
      amend,
      push,
      aiDraft: this.aiDrafted,
    });
    this.aiDrafted = false;
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
      this.fail(webview, t('cb.push.skipped', plan.reason));
      return;
    }

    try {
      await pushWithPlan(repo, plan);
    } catch (error) {
      const failure = describeCommitError(error);
      this.fail(webview, t('cb.push.failed', failure.summary), failure.details);
    }
  }

  /** Drafts type, scope, description and body from the staged diff with a language model. */
  private async draftWithAi(webview: vscode.Webview): Promise<void> {
    const { config } = await this.configLoader.load();
    const repo = getActiveRepository();
    if (!config.aiDraft || !repo) {
      this.postMessage(webview, { type: 'aiFailed', message: t('cb.ai.disabled') });
      return;
    }

    const lm = (vscode as { lm?: typeof vscode.lm }).lm;
    if (!lm?.selectChatModels) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: t('cb.ai.noApi'),
      });
      return;
    }

    const filtered = filterDiff(await repo.diff(true), { maxChars: AI_MAX_DIFF_CHARS });
    if (filtered.files.length === 0) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: t('cb.ai.nothingStaged'),
      });
      return;
    }

    const models = await lm.selectChatModels();
    if (models.length === 0) {
      this.postMessage(webview, {
        type: 'aiFailed',
        message: t('cb.ai.noModel'),
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
              { title: t('cb.ai.pickModel') },
            )
          )?.candidate;
    if (!model) {
      this.postMessage(webview, { type: 'aiFailed', message: t('cb.ai.noneSelected') });
      return;
    }

    const extra = [
      filtered.excluded.length > 0 ? t('cb.ai.excluded', filtered.excluded.length) : '',
      filtered.truncated ? t('cb.ai.truncated') : '',
    ]
      .filter(Boolean)
      .join(' ');
    const choice = await vscode.window.showInformationMessage(
      t(
        'cb.ai.confirm',
        filtered.files.length,
        filtered.text.length,
        model.name,
        model.vendor,
        extra,
      ).trim(),
      { modal: true },
      t('cb.ai.send'),
    );
    if (choice !== t('cb.ai.send')) {
      this.postMessage(webview, { type: 'aiFailed', message: t('cb.ai.cancelled') });
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
      this.aiDrafted = this.aiDrafted || parsed.ok;
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
        message: t('cb.ai.failed', reason),
      });
    } finally {
      clearTimeout(timer);
      cancellation.dispose();
    }
  }

  /** Looks up GitHub issue titles for the references; silent when not applicable or signed out. */
  private async lookupIssues(webview: vscode.Webview, references: string[]): Promise<void> {
    const github = getGitHubRepository();
    if (!github) {
      return;
    }
    const wanted = references
      .map((reference) => ({ reference, number: githubIssueNumber(reference) }))
      .filter(
        (entry): entry is { reference: string; number: number } => entry.number !== undefined,
      );
    if (wanted.length === 0) {
      return;
    }

    const missing = wanted.filter((entry) => !this.issueTitles.has(entry.number));
    if (missing.length > 0) {
      try {
        const session = await vscode.authentication.getSession('github', ['repo'], {
          createIfNone: false,
          silent: true,
        });
        if (session) {
          const client = createGitHubClient(session.accessToken, github);
          await Promise.all(
            missing.map(async (entry) => {
              try {
                this.issueTitles.set(entry.number, (await client.getIssue(entry.number)).title);
              } catch (error) {
                // 404 / 403 / network: the plain link stays, the title is just not shown.
                if (!(error instanceof GitHubError)) throw error;
              }
            }),
          );
        }
      } catch {
        return;
      }
    }

    const titles: Record<string, string> = {};
    for (const entry of wanted) {
      const title = this.issueTitles.get(entry.number);
      if (title) titles[entry.reference] = title;
    }
    this.postMessage(webview, { type: 'issueTitles', titles });
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
