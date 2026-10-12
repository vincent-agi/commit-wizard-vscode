import { describe, expect, it } from 'vitest';
import { isProtectedBranch } from './protectedBranch';

describe('isProtectedBranch', () => {
  const patterns = ['main', 'master', 'release/*'];

  it('matches exact names and globs', () => {
    expect(isProtectedBranch('main', patterns)).toBe(true);
    expect(isProtectedBranch('release/1.2', patterns)).toBe(true);
  });

  it('does not match other branches or nested paths beyond the glob', () => {
    expect(isProtectedBranch('feature/main', patterns)).toBe(false);
    expect(isProtectedBranch('release/1/2', patterns)).toBe(false);
    expect(isProtectedBranch('mainline', patterns)).toBe(false);
  });

  it('never protects a detached HEAD or when the list is empty', () => {
    expect(isProtectedBranch(undefined, patterns)).toBe(false);
    expect(isProtectedBranch('main', [])).toBe(false);
  });
});
