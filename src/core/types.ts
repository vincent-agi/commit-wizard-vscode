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

/** Maps each {@link CommitType} to its corresponding Gitmoji glyph. */
export const GITMOJI_MAP: Record<CommitType, string> = {
  feat: '✨',
  fix: '🐛',
  docs: '📝',
  style: '🎨',
  refactor: '♻️',
  perf: '⚡',
  test: '🧪',
  chore: '🔧',
  build: '🏗️',
  ci: '💚',
};

/** All fields collected from the commit builder form. */
export interface CommitFormInput {
  type: CommitType;
  scope?: string;
  issue?: string;
  description: string;
  body?: string;
  breakingChange: boolean;
  breakingChangeDescription?: string;
}
