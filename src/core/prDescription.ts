import { parseCommitMessage } from './parseCommit';
import { ISSUE_KEYWORD_LABELS } from './types';
import type { ParsedCommit } from './parseCommit';

/** A commit of the branch, as read from `git log`. */
export interface BranchCommit {
  hash: string;
  message: string;
}

/** Separators used by the host's `git log --format`, so messages may contain anything else. */
export const LOG_FIELD_SEPARATOR = '\u001f';
export const LOG_RECORD_SEPARATOR = '\u001e';

/** The `--format` value matching {@link parseGitLog}. */
export const GIT_LOG_FORMAT = `%H${LOG_FIELD_SEPARATOR}%B${LOG_RECORD_SEPARATOR}`;

/** Parses the output of `git log --format=<GIT_LOG_FORMAT>` into commits, newest first. */
export function parseGitLog(output: string): BranchCommit[] {
  return output
    .split(LOG_RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim())
    .map((record) => {
      const [hash, ...rest] = record.split(LOG_FIELD_SEPARATOR);
      return { hash: hash.trim(), message: rest.join(LOG_FIELD_SEPARATOR).trim() };
    });
}

interface Group {
  types: string[];
  heading: string;
}

const GROUPS: readonly Group[] = [
  { types: ['feat'], heading: 'Features' },
  { types: ['fix'], heading: 'Bug fixes' },
  { types: ['perf'], heading: 'Performance' },
  { types: ['refactor'], heading: 'Refactoring' },
  { types: ['docs'], heading: 'Documentation' },
  { types: ['test'], heading: 'Tests' },
  { types: ['build'], heading: 'Build' },
  { types: ['ci'], heading: 'CI' },
  { types: ['style'], heading: 'Style' },
  { types: ['chore'], heading: 'Chores' },
];
const OTHER_HEADING = 'Other changes';

export interface PrDescription {
  title: string;
  body: string;
  /** Number of commits that follow Conventional Commits. */
  conforming: number;
}

function line(parsed: ParsedCommit, hash: string): string {
  const scope = parsed.scope ? `**${parsed.scope}:** ` : '';
  return `- ${scope}${parsed.description} (${hash.slice(0, 7)})`;
}

function humanize(branch: string): string {
  return branch
    .replace(/^[^/]+\//, '')
    .replace(/^[A-Za-z]*-?\d+[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/** Best title for the pull request: the only commit's header, or the branch name otherwise. */
function chooseTitle(commits: { parsed?: ParsedCommit; message: string }[], branch?: string) {
  if (commits.length === 1) {
    const only = commits[0];
    return only.parsed
      ? `${only.parsed.type}${only.parsed.scope ? `(${only.parsed.scope})` : ''}${only.parsed.breaking ? '!' : ''}: ${only.parsed.description}`
      : only.message.split('\n')[0];
  }
  const rank = GROUPS.map((group) => group.types[0]);
  const lead = commits
    .map((commit) => commit.parsed?.type)
    .filter((type): type is string => Boolean(type))
    .sort((a, b) => ((rank.indexOf(a) + 100) % 100) - ((rank.indexOf(b) + 100) % 100))[0];
  const subject = branch ? humanize(branch) : '';
  if (lead && subject) {
    return `${lead}: ${subject}`;
  }
  return subject || commits[0].message.split('\n')[0];
}

/** Placeholders a custom pull request template can use. */
export const PR_TEMPLATE_PLACEHOLDERS = ['title', 'changes', 'breaking', 'issues'] as const;

/**
 * Builds a pull request title and body from the commits of a branch (newest first).
 *
 * Standard layout: `## Changes` grouped by type, `## Breaking changes` first when any, and
 * `## Related issues` gathering the `Closes`/`Fixes`/`Refs` footers. With `template`, the
 * placeholders `{{title}}`, `{{changes}}`, `{{breaking}}` and `{{issues}}` are replaced by the
 * matching content (without headings).
 *
 * @returns `undefined` when there are no commits.
 */
export function buildPrDescription(
  commits: readonly BranchCommit[],
  options: { branch?: string; template?: string } = {},
): PrDescription | undefined {
  if (commits.length === 0) {
    return undefined;
  }

  const entries = commits.map((commit) => ({
    ...commit,
    parsed: parseCommitMessage(commit.message),
  }));

  const grouped = new Map<string, string[]>();
  const breaking: string[] = [];
  const issues: string[] = [];

  for (const entry of [...entries].reverse()) {
    const { parsed } = entry;
    const heading = parsed
      ? (GROUPS.find((group) => group.types.includes(parsed.type))?.heading ?? OTHER_HEADING)
      : OTHER_HEADING;
    const bullet = parsed
      ? line(parsed, entry.hash)
      : `- ${entry.message.split('\n')[0]} (${entry.hash.slice(0, 7)})`;
    grouped.set(heading, [...(grouped.get(heading) ?? []), bullet]);

    if (parsed?.breaking) {
      breaking.push(`- ${parsed.breakingChangeDescription ?? parsed.description}`);
    }
    for (const reference of parsed?.references ?? []) {
      const label = ISSUE_KEYWORD_LABELS[reference.keyword];
      const id = /^\d+$/.test(reference.id) ? `#${reference.id}` : reference.id;
      const text = `${label} ${id}`;
      if (!issues.includes(text)) issues.push(text);
    }
  }

  const order = [...GROUPS.map((group) => group.heading), OTHER_HEADING];
  const changes = order
    .filter((heading) => grouped.has(heading))
    .map((heading) => `### ${heading}\n${grouped.get(heading)!.join('\n')}`)
    .join('\n\n');
  const breakingText = breaking.join('\n');
  const issuesText = issues.map((issue) => `- ${issue}`).join('\n');
  const title = chooseTitle(entries, options.branch);
  const conforming = entries.filter((entry) => entry.parsed).length;

  if (options.template) {
    const values: Record<string, string> = {
      title,
      changes,
      breaking: breakingText,
      issues: issuesText,
    };
    const body = options.template
      .replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
        name in values ? values[name] : placeholder,
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { title, body, conforming };
  }

  const sections = [
    breakingText ? `## Breaking changes\n${breakingText}` : '',
    `## Changes\n${changes}`,
    issuesText ? `## Related issues\n${issuesText}` : '',
  ].filter(Boolean);
  return { title, body: sections.join('\n\n'), conforming };
}

/** Splits the edited pull request document back into a title (first line) and a body. */
export function splitPrDocument(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((entry) => entry.trim());
  if (first === -1) {
    return { title: '', body: '' };
  }
  return {
    title: lines[first].replace(/^#\s*/, '').trim(),
    body: lines
      .slice(first + 1)
      .join('\n')
      .trim(),
  };
}
