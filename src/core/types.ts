/** One of the ten built-in Conventional Commit types. */
export type DefaultCommitType =
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

/** A commit type name. Any string, since teams can define their own types. */
export type CommitType = string;

/**
 * Short, one-line explanation of each {@link DefaultCommitType}, shown next to the type in the
 * dropdown to help pick the right one.
 */
export const COMMIT_TYPE_DESCRIPTIONS: Record<DefaultCommitType, string> = {
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

/**
 * A GitHub/GitLab-recognized issue-reference keyword for the commit footer.
 * `closes`/`fixes`/`resolves` auto-close the referenced issue on merge; `refs`/`seeAlso` only
 * link it.
 */
export type IssueKeyword = 'closes' | 'fixes' | 'resolves' | 'refs' | 'seeAlso';

/** Display label for each {@link IssueKeyword}, as it appears in the footer line. */
export const ISSUE_KEYWORD_LABELS: Record<IssueKeyword, string> = {
  closes: 'Closes',
  fixes: 'Fixes',
  resolves: 'Resolves',
  refs: 'Refs',
  seeAlso: 'See also',
};

/** One-line explanation of each {@link IssueKeyword}, shown in the dropdown. */
export const ISSUE_KEYWORD_DESCRIPTIONS: Record<IssueKeyword, string> = {
  closes: 'Auto-closes the issue when this commit is merged (GitHub/GitLab)',
  fixes: 'Auto-closes the issue when this commit is merged (GitHub/GitLab)',
  resolves: 'Auto-closes the issue when this commit is merged (GitHub/GitLab)',
  refs: 'Links the issue without closing it',
  seeAlso: 'Links a related issue or ticket without closing it',
};

/** All fields collected from the commit builder form. */
export interface CommitFormInput {
  type: CommitType;
  /**
   * The gitmoji glyph to prefix the message with, picked from the Gitmoji dropdown. Empty when
   * emojis are disabled: the message then has no emoji prefix.
   */
  gitmoji: string;
  scope?: string;
  /** One or more issue references, separated by spaces or commas (e.g. `123, PROJ-45`). */
  issue?: string;
  /** Which footer keyword to prefix `issue` with. Only meaningful when `issue` is set. */
  issueKeyword: IssueKeyword;
  description: string;
  body?: string;
  breakingChange: boolean;
  breakingChangeDescription?: string;
  /** Co-authors in `Name <email>` form, each emitted as a `Co-authored-by` footer. */
  coAuthors?: string[];
}
