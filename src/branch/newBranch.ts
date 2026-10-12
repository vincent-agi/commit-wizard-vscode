import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import type { Telemetry } from '../telemetry/telemetry';
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
import { t } from '../i18n';

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
    vscode.window.showWarningMessage(t('branch.noRepo'));
    return undefined;
  }

  const { config } = await configLoader.load();
  const type = await vscode.window.showQuickPick(
    config.types.map((entry) => ({
      label: entry.name,
      description: entry.description,
    })),
    { title: t('branch.typeTitle'), placeHolder: t('branch.typePlaceholder') },
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
    title: t('branch.issueTitle'),
    prompt: t('branch.issuePrompt'),
    value: '',
    placeHolder: suggestedIssue ? t('branch.issuePlaceholder', suggestedIssue) : '123',
  });
  if (issue === undefined) {
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    title: t('branch.descTitle'),
    prompt: t('branch.descPrompt'),
    validateInput: (value) => (value.trim() ? undefined : t('branch.descRequired')),
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
    vscode.window.showErrorMessage(t('branch.invalid', name, problem));
    return undefined;
  }
  if (await branchExists(repo, name)) {
    vscode.window.showErrorMessage(t('branch.exists', name));
    return undefined;
  }

  if (hasUncommittedChanges(repo)) {
    const choice = await vscode.window.showWarningMessage(
      t('branch.dirty', name),
      { modal: true },
      t('branch.create'),
    );
    if (choice !== t('branch.create')) {
      return undefined;
    }
  }

  try {
    await createAndCheckoutBranch(repo, name);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(t('branch.failed', name, reason));
    return undefined;
  }
  vscode.window.showInformationMessage(t('branch.switched', name));
  return name;
}

/** Registers the "New Branch" command. */
export function registerNewBranch(
  configLoader: ConfigLoader,
  telemetry: Pick<Telemetry, 'track'>,
): vscode.Disposable {
  return vscode.commands.registerCommand(NEW_BRANCH_COMMAND, () => {
    telemetry.track('command', { name: 'new-branch' });
    return createConformingBranch(configLoader);
  });
}
