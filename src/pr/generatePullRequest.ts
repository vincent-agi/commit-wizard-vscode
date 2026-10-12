import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import type { Telemetry } from '../telemetry/telemetry';
import { buildPrDescription, splitPrDocument } from '../core/prDescription';
import {
  getActiveRepository,
  getBranchCommits,
  getDefaultBaseBranch,
  getGitHubRepository,
} from '../git/gitExtension';
import { GitHubError, createGitHubClient } from '../github/githubClient';
import { t } from '../i18n';

export const GENERATE_PR_COMMAND = 'gitmojiCommit.generatePullRequest';

const GITHUB_SCOPES = ['repo'];

/**
 * "Generate Pull Request Description" flow: builds a title and body from the branch's commits,
 * opens them in an editable Markdown document, then lets the user copy them or create the
 * pull request on GitHub. Nothing is sent before an explicit click.
 */
async function generatePullRequest(configLoader: ConfigLoader): Promise<void> {
  const repo = getActiveRepository();
  const branch = repo?.state.HEAD?.name;
  if (!repo || !branch) {
    vscode.window.showWarningMessage(t('pr.needBranch'));
    return;
  }

  const base = await getDefaultBaseBranch(repo);
  if (!base) {
    vscode.window.showWarningMessage(t('pr.noBase'));
    return;
  }

  let commits;
  try {
    commits = await getBranchCommits(repo, base.ref);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(t('pr.readFailed', reason));
    return;
  }

  const { config } = await configLoader.load();
  const description = buildPrDescription(commits, { branch, template: config.prTemplate });
  if (!description) {
    vscode.window.showInformationMessage(t('pr.none', branch, base.ref));
    return;
  }

  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# ${description.title}\n\n${description.body}\n`,
  });
  await vscode.window.showTextDocument(document, { preview: false });

  const choice = await vscode.window.showInformationMessage(
    t('pr.review', branch, base.name, commits.length),
    t('pr.create'),
    t('pr.copy'),
  );
  const edited = splitPrDocument(document.getText());

  if (choice === t('pr.copy')) {
    await vscode.env.clipboard.writeText(`${edited.title}\n\n${edited.body}`);
    vscode.window.showInformationMessage(t('pr.copied'));
    return;
  }
  if (choice !== t('pr.create')) {
    return;
  }

  const github = getGitHubRepository();
  if (!github) {
    vscode.window.showErrorMessage(t('pr.noRemote'));
    return;
  }
  if (!edited.title) {
    vscode.window.showErrorMessage(t('pr.needTitle'));
    return;
  }
  if (!repo.state.HEAD?.upstream) {
    vscode.window.showWarningMessage(t('pr.notPushed', branch));
    return;
  }

  try {
    const session = await vscode.authentication.getSession('github', GITHUB_SCOPES, {
      createIfNone: true,
    });
    const created = await createGitHubClient(session.accessToken, github).createPullRequest({
      title: edited.title,
      body: edited.body,
      head: branch,
      base: base.name,
    });
    const open = await vscode.window.showInformationMessage(
      t('pr.created', created.number),
      t('pr.open'),
    );
    if (open) {
      await vscode.env.openExternal(vscode.Uri.parse(created.url));
    }
  } catch (error) {
    const reason =
      error instanceof GitHubError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    vscode.window.showErrorMessage(t('pr.createFailed', reason));
  }
}

/** Registers the "Generate Pull Request Description" command. */
export function registerGeneratePullRequest(
  configLoader: ConfigLoader,
  telemetry: Pick<Telemetry, 'track'>,
): vscode.Disposable {
  return vscode.commands.registerCommand(GENERATE_PR_COMMAND, () => {
    telemetry.track('command', { name: 'generate-pr' });
    return generatePullRequest(configLoader);
  });
}
