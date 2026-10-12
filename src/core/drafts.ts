import type { CommitFormInput, IssueKeyword } from './types';

/** The part of VS Code's `Memento` the draft store relies on. */
export interface DraftStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

const KEYWORDS: readonly IssueKeyword[] = ['closes', 'fixes', 'resolves', 'refs', 'seeAlso'];

/** Storage key for the draft of one branch in one repository. */
export function draftKey(repositoryRoot: string, branch: string): string {
  return `draft:${repositoryRoot}::${branch}`;
}

/** A draft is worth keeping once the user typed something beyond picking dropdown values. */
export function isEmptyDraft(input: CommitFormInput): boolean {
  return (
    !input.description.trim() &&
    !input.body?.trim() &&
    !input.issue?.trim() &&
    !input.breakingChange &&
    !input.breakingChangeDescription?.trim() &&
    (input.coAuthors ?? []).length === 0
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Validates data read back from storage, which may be from an older version or corrupted.
 *
 * @returns A well-formed input, or `undefined` when the shape is unusable.
 */
export function sanitizeDraft(raw: unknown): CommitFormInput | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.type !== 'string' || typeof value.description !== 'string') {
    return undefined;
  }

  const coAuthors = Array.isArray(value.coAuthors)
    ? value.coAuthors.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    type: value.type,
    gitmoji: typeof value.gitmoji === 'string' ? value.gitmoji : '',
    scope: optionalString(value.scope),
    issue: optionalString(value.issue),
    issueKeyword: KEYWORDS.includes(value.issueKeyword as IssueKeyword)
      ? (value.issueKeyword as IssueKeyword)
      : 'refs',
    description: value.description,
    body: optionalString(value.body),
    breakingChange: value.breakingChange === true,
    breakingChangeDescription: optionalString(value.breakingChangeDescription),
    coAuthors,
  };
}

/** Reads the draft for `key`, or `undefined` when absent or unusable. */
export function loadDraft(storage: DraftStorage, key: string): CommitFormInput | undefined {
  return sanitizeDraft(storage.get<unknown>(key));
}

/** Stores the draft for `key`; an empty draft removes the stored one instead. */
export async function saveDraft(
  storage: DraftStorage,
  key: string,
  input: CommitFormInput,
): Promise<void> {
  await storage.update(key, isEmptyDraft(input) ? undefined : input);
}

/** Removes the draft for `key`. */
export async function clearDraft(storage: DraftStorage, key: string): Promise<void> {
  await storage.update(key, undefined);
}
