/**
 * Numeric `Status` values of the built-in `vscode.git` extension API that matter for the file
 * list. Anything else (conflicts, ignored, ...) is shown as `?`.
 */
const STATUS_LETTERS: Readonly<Record<number, string>> = {
  0: 'M', // INDEX_MODIFIED
  1: 'A', // INDEX_ADDED
  2: 'D', // INDEX_DELETED
  3: 'R', // INDEX_RENAMED
  4: 'C', // INDEX_COPIED
  5: 'M', // MODIFIED
  6: 'D', // DELETED
  7: 'U', // UNTRACKED
  9: 'A', // INTENT_TO_ADD
};

/** A raw change as reported by the Git API: a repo-relative path and a numeric status. */
export interface RawChange {
  path: string;
  status: number;
}

/** A file shown in the Commit Builder's change list. */
export interface ChangedFile {
  path: string;
  /** One-letter status: M(odified), A(dded), D(eleted), R(enamed), C(opied), U(ntracked). */
  status: string;
}

export interface ChangeList {
  staged: ChangedFile[];
  unstaged: ChangedFile[];
}

function toFiles(changes: readonly RawChange[]): ChangedFile[] {
  return changes
    .map((change) => ({ path: change.path, status: STATUS_LETTERS[change.status] ?? '?' }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Builds the staged/unstaged lists from the Git API's index and working-tree changes. Files
 * changed both in the index and in the working tree appear in both lists.
 */
export function toChangeList(
  indexChanges: readonly RawChange[],
  workingTreeChanges: readonly RawChange[],
): ChangeList {
  return { staged: toFiles(indexChanges), unstaged: toFiles(workingTreeChanges) };
}
