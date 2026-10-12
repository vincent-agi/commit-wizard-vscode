import { describe, expect, it } from 'vitest';
import { checkCommitConformity } from './conformity';

const types = ['feat', 'fix', 'chore'];

describe('checkCommitConformity', () => {
  it.each([
    'feat: add x',
    'fix(core)!: y',
    '✨ feat(webview): add preview',
    'feat(webview): ✨ add preview',
    'chore: z\n\nbody',
  ])('accepts %j', (message) => {
    expect(checkCommitConformity(message, types)).toEqual({ status: 'conforming', reason: '' });
  });

  it('rejects headers that are not Conventional Commits', () => {
    const result = checkCommitConformity('Added some stuff', types);
    expect(result.status).toBe('non-conforming');
    expect(result.reason).toContain('type(scope): description');
  });

  it('rejects an empty description after the colon', () => {
    expect(checkCommitConformity('feat:', types).reason).toContain('empty');
  });

  it('rejects types outside the configured list and names the allowed ones', () => {
    const result = checkCommitConformity('wip: stuff', types);
    expect(result.status).toBe('non-conforming');
    expect(result.reason).toBe('Unknown type "wip" (allowed: feat, fix, chore).');
  });

  it('reports merge commits separately, by parents or by header', () => {
    expect(checkCommitConformity('anything', types, true).status).toBe('merge');
    expect(checkCommitConformity("Merge branch 'x' into main", types).status).toBe('merge');
    expect(checkCommitConformity('Merge pull request #3 from a/b', types).status).toBe('merge');
  });
});
