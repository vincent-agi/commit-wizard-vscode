import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANCH_PATTERN, branchNameProblem, renderBranchName, slugify } from './branchName';

describe('slugify', () => {
  it.each([
    ['Add live preview', 'add-live-preview'],
    ['  Éléphant  à   l’école!  ', 'elephant-a-l-ecole'],
    ['fix: crash (#12)', 'fix-crash-12'],
    ['---', ''],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('cuts long text at a word boundary', () => {
    const slug = slugify('a very long description that keeps going on and on and on forever', 30);
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith('-')).toBe(false);
    expect('a-very-long-description-that-keeps-going-on'.startsWith(slug)).toBe(true);
  });
});

describe('renderBranchName', () => {
  it('renders the default pattern with a ticket', () => {
    expect(
      renderBranchName(DEFAULT_BRANCH_PATTERN, {
        type: 'feat',
        issue: '#123',
        description: 'Add Login',
      }),
    ).toBe('feat/123-add-login');
  });

  it('keeps Jira keys as typed', () => {
    expect(
      renderBranchName(DEFAULT_BRANCH_PATTERN, {
        type: 'fix',
        issue: 'PROJ-42',
        description: 'crash',
      }),
    ).toBe('fix/PROJ-42-crash');
  });

  it('drops the ticket and its separator when there is none', () => {
    expect(
      renderBranchName(DEFAULT_BRANCH_PATTERN, { type: 'feat', description: 'Add Login' }),
    ).toBe('feat/add-login');
    expect(
      renderBranchName('{type}/{slug}-{issue}', { type: 'feat', description: 'Add Login' }),
    ).toBe('feat/add-login');
  });

  it('supports custom patterns', () => {
    expect(
      renderBranchName('users/me/{type}_{slug}', { type: 'Docs', description: 'Fix typo' }),
    ).toBe('users/me/docs_fix-typo');
  });

  it('sanitizes odd ticket text', () => {
    expect(
      renderBranchName(DEFAULT_BRANCH_PATTERN, { type: 'feat', issue: 'a b/c', description: 'x' }),
    ).toBe('feat/a-b-c-x');
  });
});

describe('branchNameProblem', () => {
  it.each(['feat/123-add-login', 'main', 'release/1.2.3', 'a_b-c'])('accepts %s', (name) => {
    expect(branchNameProblem(name)).toBeUndefined();
  });

  it.each([
    '',
    '@',
    'has space',
    'a~b',
    'a^b',
    'a:b',
    'a?b',
    'a*b',
    'a[b',
    'a\\b',
    '-lead',
    '/lead',
    'trail/',
    'a//b',
    'a..b',
    'a@{b',
    'trail.',
    '.hidden/x',
    'x/.hidden',
    'x/name.lock',
  ])('rejects %j', (name) => {
    expect(branchNameProblem(name)).toBeTypeOf('string');
  });
});
