import { parseCommitMessage } from './parseCommit';

export type ConformityStatus = 'conforming' | 'non-conforming' | 'merge';

export interface Conformity {
  status: ConformityStatus;
  /** Why a commit does not conform; empty otherwise. */
  reason: string;
}

const MERGE_HEADER = /^Merge (branch|pull request|remote-tracking branch|tag)\b/;
const TYPE_WORD = /^(?:\p{Extended_Pictographic}\S*\s+)?([A-Za-z][\w-]*)(?:\([^)]*\))?!?:/u;

/**
 * Checks a commit message against the Conventional Commits header (emoji before the type or
 * after the colon) and the configured type list.
 *
 * @param message - Full commit message.
 * @param types - Allowed type names.
 * @param isMerge - Whether the commit has several parents (merges are reported separately).
 */
export function checkCommitConformity(
  message: string,
  types: readonly string[],
  isMerge = false,
): Conformity {
  const header = message.split('\n')[0].trim();
  if (isMerge || MERGE_HEADER.test(header)) {
    return { status: 'merge', reason: '' };
  }

  const parsed = parseCommitMessage(message);
  if (!parsed) {
    const typeWord = header.match(TYPE_WORD);
    return {
      status: 'non-conforming',
      reason: typeWord
        ? 'The description after the colon is empty.'
        : 'The header is not "type(scope): description" (emoji optional).',
    };
  }
  if (!types.includes(parsed.type)) {
    return {
      status: 'non-conforming',
      reason: `Unknown type "${parsed.type}" (allowed: ${types.join(', ')}).`,
    };
  }
  return { status: 'conforming', reason: '' };
}
