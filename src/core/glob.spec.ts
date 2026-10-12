import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAnyGlob } from './glob';

describe('globToRegExp', () => {
  it.each([
    ['docs/**', 'docs/a/b.md', true],
    ['docs/**', 'docs/', true],
    ['docs/**', 'src/docs/a.md', false],
    ['**/*.spec.ts', 'src/core/a.spec.ts', true],
    ['**/*.spec.ts', 'a.spec.ts', true],
    ['**/*.spec.ts', 'src/a.ts', false],
    ['*.md', 'README.md', true],
    ['*.md', 'docs/a.md', false],
    ['feature/*', 'feature/login', true],
    ['feature/*', 'feature/a/b', false],
    ['release-?', 'release-1', true],
    ['release-?', 'release-12', false],
    ['a.b', 'axb', false],
    ['main', 'main', true],
    ['main', 'mainline', false],
  ])('%s vs %s -> %s', (glob, value, expected) => {
    expect(globToRegExp(glob).test(value)).toBe(expected);
  });
});

describe('matchesAnyGlob', () => {
  it('matches when at least one glob matches', () => {
    expect(matchesAnyGlob('main', ['master', 'main'])).toBe(true);
    expect(matchesAnyGlob('dev', ['master', 'main'])).toBe(false);
    expect(matchesAnyGlob('dev', [])).toBe(false);
  });
});
