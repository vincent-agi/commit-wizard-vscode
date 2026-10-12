/** Default pattern of the "New Branch" command. */
export const DEFAULT_BRANCH_PATTERN = '{type}/{issue}-{slug}';

const MAX_SLUG_LENGTH = 50;

/**
 * Turns free text into a lowercase ASCII slug: accents removed, anything else non
 * alphanumeric collapsed to single hyphens, cut at a word boundary when too long.
 */
export function slugify(text: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) {
    return slug;
  }
  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > maxLength / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

/** Keeps the characters that are safe in a branch name from a ticket reference (`#12`, `PROJ-3`). */
function cleanIssue(issue: string | undefined): string {
  return (issue ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Renders a branch name from a pattern with the placeholders `{type}`, `{issue}` and `{slug}`.
 * When there is no ticket, `{issue}` disappears together with the separator next to it
 * (`feat/add-x` instead of `feat/-add-x`).
 */
export function renderBranchName(
  pattern: string,
  parts: { type: string; issue?: string; description: string },
): string {
  const issue = cleanIssue(parts.issue);
  let withIssue = pattern;
  if (issue) {
    withIssue = pattern.replace(/\{issue\}/g, issue);
  } else if (pattern.includes('{issue}')) {
    // Drop the placeholder with the separator that was attached to it: `{issue}-` or `-{issue}`.
    withIssue = pattern.replace(/\{issue\}[-_/.]?/g, '').replace(/[-_.]$/, '');
    if (pattern.indexOf('{issue}') > pattern.indexOf('{slug}')) {
      withIssue = pattern.replace(/[-_.]\{issue\}/g, '').replace(/\{issue\}/g, '');
    }
  }

  return withIssue
    .replace(/\{type\}/g, slugify(parts.type))
    .replace(/\{slug\}/g, slugify(parts.description))
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/[-/_.]+$/g, '');
}

// eslint-disable-next-line no-control-regex -- git forbids control characters in ref names
const FORBIDDEN_CHARS = /[\s~^:?*[\\\u0000-\u001f\u007f]/;

/**
 * Checks a name against the rules of `git check-ref-format --branch`.
 *
 * @returns The reason it is invalid, or `undefined` when it is acceptable.
 */
export function branchNameProblem(name: string): string | undefined {
  if (!name) return 'The branch name is empty.';
  if (name === '@') return 'A branch cannot be named "@".';
  if (FORBIDDEN_CHARS.test(name)) {
    return 'A branch name cannot contain spaces or any of ~ ^ : ? * [ \\.';
  }
  if (name.startsWith('-')) return 'A branch name cannot start with "-".';
  if (name.startsWith('/') || name.endsWith('/'))
    return 'A branch name cannot start or end with "/".';
  if (name.includes('//')) return 'A branch name cannot contain "//".';
  if (name.includes('..')) return 'A branch name cannot contain "..".';
  if (name.includes('@{')) return 'A branch name cannot contain "@{".';
  if (name.endsWith('.')) return 'A branch name cannot end with ".".';
  if (name.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))) {
    return 'A branch name component cannot start with "." or end with ".lock".';
  }
  return undefined;
}
