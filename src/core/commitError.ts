import { t } from '../i18n';
/** How a failed commit should be presented to the user. */
export type CommitFailureKind = 'hook' | 'nothing-staged' | 'other';

/** A commit failure reduced to what the panel needs to display. */
export interface CommitFailure {
  kind: CommitFailureKind;
  /** One-line, human-readable headline. */
  summary: string;
  /** Cleaned Git/hook output, shown in a collapsible block. Empty when there is none. */
  details: string;
  /** Name of the Git hook that rejected the commit, when it could be identified. */
  hook?: string;
}

/** Subset of the error the `vscode.git` extension throws that we rely on. */
interface GitErrorLike {
  message?: unknown;
  stdout?: unknown;
  stderr?: unknown;
}

// eslint-disable-next-line no-control-regex -- matching the ESC control character is the point
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const HOOK_NAME = /\b(pre-commit|commit-msg|prepare-commit-msg|post-commit|pre-merge-commit)\b/;
const HOOK_HINT = /\bhook\b|husky|lefthook|lint-staged|commitlint/i;
const NOTHING_STAGED = /nothing (?:added )?to commit|no changes added to commit|nothing to commit/i;
const MAX_DETAILS_LENGTH = 4000;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Strips ANSI escape sequences, normalizes newlines and trims excess blank lines. */
export function sanitizeOutput(text: string): string {
  return text
    .replace(ANSI_ESCAPE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(text: string): string {
  return text.length > MAX_DETAILS_LENGTH
    ? `${text.slice(0, MAX_DETAILS_LENGTH)}\n${t('commitError.truncated')}`
    : text;
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ''
  );
}

/**
 * Classifies an error thrown by the `vscode.git` extension's `commit()` and extracts readable
 * output from it. Hook failures (pre-commit, commit-msg, …) are told apart from "nothing
 * staged" and from any other Git error.
 *
 * @param error - The caught value; anything is accepted.
 */
export function describeCommitError(error: unknown): CommitFailure {
  const git: GitErrorLike =
    typeof error === 'object' && error !== null ? (error as GitErrorLike) : {};
  const message = sanitizeOutput(asText(git.message) || (typeof error === 'string' ? error : ''));
  const stderr = sanitizeOutput(asText(git.stderr));
  const stdout = sanitizeOutput(asText(git.stdout));

  const output = [stderr, stdout].filter(Boolean).join('\n');
  const details = truncate(output || message);
  const haystack = `${message}\n${output}`;

  if (NOTHING_STAGED.test(haystack)) {
    return {
      kind: 'nothing-staged',
      summary: t('commitError.nothingStaged'),
      details: '',
    };
  }

  if (HOOK_HINT.test(haystack)) {
    const hook = haystack.match(HOOK_NAME)?.[1];
    return {
      kind: 'hook',
      summary: hook ? t('commitError.hookNamed', hook) : t('commitError.hookUnnamed'),
      details,
      hook,
    };
  }

  return {
    kind: 'other',
    summary: firstLine(message) || t('commitError.generic'),
    details,
  };
}
