/** What to do when the user wants to fix the message of a commit. */
export type RewordPlan =
  /** The latest, unpublished commit: amend it from the Commit Builder. */
  | 'amend'
  /** The latest commit but already on the remote: amending rewrites shared history. */
  | 'confirm-pushed'
  /** An older commit: needs an interactive rebase, which is explained rather than attempted. */
  | 'rebase-guidance';

/**
 * Decides how a reword is offered. Only the latest commit gets a one-click path; the tool never
 * rewrites older history by itself.
 */
export function planReword(options: { isHead: boolean; pushed: boolean }): RewordPlan {
  if (!options.isHead) {
    return 'rebase-guidance';
  }
  return options.pushed ? 'confirm-pushed' : 'amend';
}

/** Shell command that opens an interactive rebase on the commit `index` positions below HEAD. */
export function rebaseCommand(index: number): string {
  return `git rebase -i HEAD~${index + 1}`;
}
