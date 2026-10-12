import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import { DEFAULT_BRANCH_PATTERN, branchNameProblem, renderBranchName } from '../core/branchName';
import { extractIssueFromBranch } from '../core/branchIssueExtractor';
import { resolveTracker } from '../core/issueTracker';
import {
  branchExists,
  createAndCheckoutBranch,
  getActiveRepository,
  getGitHubRepository,
  hasUncommittedChanges,
} from '../git/gitExtension';

export const NEW_BRANCH_COMMAND = 'gitmojiCommit.newBranch';

/**
 * "New Branch" flow: asks for a type, an optional ticket and a description, builds a name from
 * the configured pattern, validates it, then creates and checks out the branch.
 *
 * @returns The created branch name, or `undefined` when cancelled or refused.
 */
export async function createConformingBranch(
  configLoader: ConfigLoader,
): Promise<string | undefined> {
  const repo = getActiveRepository();
  if (!repo) {
    vscode.window.showWarningMessage('Open a folder with a Git repository to create a branch.');
    return undefined;
  }

  const { config } = await configLoader.load();
  const type = await vscode.window.showQuickPick(
    config.types.map((entry) => ({
      label: entry.name,
      description: entry.description,
    })),
    { title: 'Branch type', placeHolder: 'What kind of change is this?' },
  );
  if (!type) {
    return undefined;
  }

  const tracker = resolveTracker(config, getGitHubRepository());
  const currentBranch = repo.state.HEAD?.name;
  const suggestedIssue = currentBranch
    ? extractIssueFromBranch(currentBranch, tracker.pattern)
    : undefined;
  const issue = await vscode.window.showInputBox({
    title: 'Ticket (optional)',
    prompt: 'Issue or ticket reference, e.g. 123 or PROJ-45. Leave empty for none.',
    value: '',
    placeHolder: suggestedIssue ? `e.g. ${suggestedIssue}` : '123',
  });
  if (issue === undefined) {
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    title: 'Short description',
    prompt: 'What is this branch about?',
    validateInput: (value) => (value.trim() ? undefined : 'A description is required.'),
  });
  if (!description) {
    return undefined;
  }

  const name = renderBranchName(config.branchPattern ?? DEFAULT_BRANCH_PATTERN, {
    type: type.label,
    issue,
    description,
  });
  const problem = branchNameProblem(name);
  if (problem) {
    vscode.window.showErrorMessage(`Cannot create "${name}": ${problem}`);
    return undefined;
  }
  if (await branchExists(repo, name)) {
    vscode.window.showErrorMessage(`The branch "${name}" already exists. Nothing was changed.`);
    return undefined;
  }

  if (hasUncommittedChanges(repo)) {
    const choice = await vscode.window.showWarningMessage(
      `You have uncommitted changes. They will come with you to the new branch "${name}".`,
      { modal: true },
      'Create branch',
    );
    if (choice !== 'Create branch') {
      return undefined;
    }
  }

  try {
    await createAndCheckoutBranch(repo, name);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not create "${name}": ${reason}`);
    return undefined;
  }
  vscode.window.showInformationMessage(`Switched to the new branch "${name}".`);
  return name;
}

/** Registers the "New Branch" command. */
export function registerNewBranch(configLoader: ConfigLoader): vscode.Disposable {
  return vscode.commands.registerCommand(NEW_BRANCH_COMMAND, () =>
    createConformingBranch(configLoader),
  );
}
