import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import { buildPrDescription, splitPrDocument } from '../core/prDescription';
import {
  getActiveRepository,
  getBranchCommits,
  getDefaultBaseBranch,
  getGitHubRepository,
} from '../git/gitExtension';
import { GitHubError, createGitHubClient } from '../github/githubClient';

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
    vscode.window.showWarningMessage('Check out a branch of a Git repository first.');
    return;
  }

  const base = await getDefaultBaseBranch(repo);
  if (!base) {
    vscode.window.showWarningMessage(
      'Could not find the base branch (origin/HEAD, main or master) to compare with.',
    );
    return;
  }

  let commits;
  try {
    commits = await getBranchCommits(repo, base.ref);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the branch commits: ${reason}`);
    return;
  }

  const { config } = await configLoader.load();
  const description = buildPrDescription(commits, { branch, template: config.prTemplate });
  if (!description) {
    vscode.window.showInformationMessage(
      `"${branch}" has no commits ahead of ${base.ref}: there is nothing to describe.`,
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# ${description.title}\n\n${description.body}\n`,
  });
  await vscode.window.showTextDocument(document, { preview: false });

  const choice = await vscode.window.showInformationMessage(
    `Pull request description for ${branch} -> ${base.name} (${commits.length} commit(s)). Edit it, then choose an action.`,
    'Create pull request',
    'Copy to clipboard',
  );
  const edited = splitPrDocument(document.getText());

  if (choice === 'Copy to clipboard') {
    await vscode.env.clipboard.writeText(`${edited.title}\n\n${edited.body}`);
    vscode.window.showInformationMessage('Pull request description copied.');
    return;
  }
  if (choice !== 'Create pull request') {
    return;
  }

  const github = getGitHubRepository();
  if (!github) {
    vscode.window.showErrorMessage('This repository has no github.com remote.');
    return;
  }
  if (!edited.title) {
    vscode.window.showErrorMessage('The pull request needs a title (the first line).');
    return;
  }
  if (!repo.state.HEAD?.upstream) {
    vscode.window.showWarningMessage(
      `"${branch}" is not pushed yet. Push it first (for example with Commit & Push), then try again.`,
    );
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
      `Created pull request #${created.number}.`,
      'Open',
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
    vscode.window.showErrorMessage(`Could not create the pull request: ${reason}`);
  }
}

/** Registers the "Generate Pull Request Description" command. */
export function registerGeneratePullRequest(configLoader: ConfigLoader): vscode.Disposable {
  return vscode.commands.registerCommand(GENERATE_PR_COMMAND, () =>
    generatePullRequest(configLoader),
  );
}
