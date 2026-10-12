import { COMMIT_HEADER_PATTERN } from './hookPresets';
import type { IssueKeyword } from './types';

/** A commit message split back into the fields of the Commit Builder form. */
export interface ParsedCommit {
  /** Leading or post-colon emoji, `''` when there is none. */
  gitmoji: string;
  type: string;
  scope?: string;
  breaking: boolean;
  description: string;
  body?: string;
  /** Issue references joined with `, ` (as the form's issue field accepts them). */
  issue?: string;
  issueKeyword: IssueKeyword;
  breakingChangeDescription?: string;
  coAuthors: string[];
  /** Every issue footer with its own keyword (the form only keeps the first keyword). */
  references: { keyword: IssueKeyword; id: string }[];
}

const HEADER_EMOJI_FIRST = new RegExp(COMMIT_HEADER_PATTERN, 'u');
const LEADING_EMOJI = /^(\p{Extended_Pictographic}\S*)\s+(.*)$/u;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: (.+)$/;
const CLOSING_FOOTER = /^(Closes|Fixes|Resolves) (\S+)$/i;
const LINKING_FOOTER = /^(Refs|See also): (\S+)$/i;
const CO_AUTHOR_FOOTER = /^Co-authored-by: (.+)$/i;

const KEYWORDS: Record<string, IssueKeyword> = {
  closes: 'closes',
  fixes: 'fixes',
  resolves: 'resolves',
  refs: 'refs',
  'see also': 'seeAlso',
};

function isFooterLine(line: string): boolean {
  return [BREAKING_FOOTER, CLOSING_FOOTER, LINKING_FOOTER, CO_AUTHOR_FOOTER].some((pattern) =>
    pattern.test(line),
  );
}

/**
 * Parses a Conventional Commits message, with the emoji either before the type
 * (`✨ feat(x): y`, Commit Wizard's own output) or after the colon (`feat(x): ✨ y`).
 *
 * Footers recognised: `BREAKING CHANGE`, `Closes`/`Fixes`/`Resolves`, `Refs`/`See also` and
 * `Co-authored-by`. A trailing paragraph only counts as footers when every line is one of
 * those; otherwise it stays part of the body.
 *
 * @returns `undefined` when the first line is not a Conventional Commits header.
 */
export function parseCommitMessage(message: string): ParsedCommit | undefined {
  const paragraphs = message
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/);
  const header = paragraphs[0].split('\n')[0].trim();

  const match = header.match(HEADER_EMOJI_FIRST);
  if (!match) {
    return undefined;
  }

  const emojiPrefix = header.match(/^(\p{Extended_Pictographic}\S*)\s+/u)?.[1] ?? '';
  let description = match[4].trim();
  let gitmoji = emojiPrefix;
  if (!gitmoji) {
    const trailing = description.match(LEADING_EMOJI);
    if (trailing) {
      gitmoji = trailing[1];
      description = trailing[2].trim();
    }
  }
  if (!description) {
    return undefined;
  }

  // Remaining header lines (rare) belong to the body.
  const rest = paragraphs.slice(1);
  const extraHeaderLines = paragraphs[0].split('\n').slice(1).join('\n').trim();
  if (extraHeaderLines) {
    rest.unshift(extraHeaderLines);
  }

  const footerLines: string[] = [];
  while (rest.length > 0) {
    const lines = rest[rest.length - 1].split('\n').map((line) => line.trim());
    if (!lines.every(isFooterLine)) {
      break;
    }
    footerLines.unshift(...lines);
    rest.pop();
  }

  const issues: string[] = [];
  const references: { keyword: IssueKeyword; id: string }[] = [];
  const coAuthors: string[] = [];
  let issueKeyword: IssueKeyword = 'refs';
  let breakingChangeDescription: string | undefined;

  for (const line of footerLines) {
    const breaking = line.match(BREAKING_FOOTER);
    const issue = line.match(CLOSING_FOOTER) ?? line.match(LINKING_FOOTER);
    const author = line.match(CO_AUTHOR_FOOTER);
    if (breaking) {
      breakingChangeDescription = breaking[1];
    } else if (issue) {
      if (issues.length === 0) {
        issueKeyword = KEYWORDS[issue[1].toLowerCase()];
      }
      issues.push(issue[2]);
      references.push({ keyword: KEYWORDS[issue[1].toLowerCase()], id: issue[2] });
    } else if (author) {
      coAuthors.push(author[1].trim());
    }
  }

  const body = rest.join('\n\n').trim();
  return {
    gitmoji,
    type: match[1],
    scope: match[2] || undefined,
    breaking: Boolean(match[3]) || breakingChangeDescription !== undefined,
    description,
    body: body || undefined,
    issue: issues.length > 0 ? issues.join(', ') : undefined,
    issueKeyword,
    breakingChangeDescription,
    coAuthors,
    references,
  };
}
