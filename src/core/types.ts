/** One of the ten supported Conventional Commit types. */
export type CommitType =
  | 'feat'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'chore'
  | 'build'
  | 'ci';

/**
 * Maps each {@link CommitType} to its default Gitmoji glyph. Used only to pre-fill the
 * Gitmoji dropdown when the Type changes — the actual commit message uses whichever gitmoji
 * is selected in {@link CommitFormInput.gitmoji}, which may differ (see the full
 * {@link GITMOJI_CATALOG "gitmoji.ts" catalog}).
 */
export const GITMOJI_MAP: Record<CommitType, string> = {
  feat: '✨',
  fix: '🐛',
  docs: '📝',
  style: '🎨',
  refactor: '♻️',
  perf: '⚡️',
  test: '🧪',
  chore: '🔧',
  build: '🏗️',
  ci: '💚',
};

/**
 * Short, one-line explanation of each {@link CommitType}, shown next to the type in the
 * dropdown to help pick the right one.
 */
export const COMMIT_TYPE_DESCRIPTIONS: Record<CommitType, string> = {
  feat: 'A new feature',
  fix: 'A bug fix',
  docs: 'Documentation only changes',
  style: 'Formatting only, no code meaning change',
  refactor: 'Code change that neither fixes a bug nor adds a feature',
  perf: 'Change that improves performance',
  test: 'Adding or correcting tests',
  chore: "Maintenance that doesn't modify src or test files",
  build: 'Changes to the build system or external dependencies',
  ci: 'Changes to CI configuration and scripts',
};

/** A project-specific commit scope, with a short description to guide its use. */
export interface Scope {
  name: string;
  description: string;
}

/** All fields collected from the commit builder form. */
export interface CommitFormInput {
  type: CommitType;
  /** The gitmoji glyph to prefix the message with, picked from the Gitmoji dropdown. */
  gitmoji: string;
  scope?: string;
  issue?: string;
  description: string;
  body?: string;
  breakingChange: boolean;
  breakingChangeDescription?: string;
}
