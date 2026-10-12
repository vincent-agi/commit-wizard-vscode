import { describe, expect, it } from 'vitest';
import { describeCommitError, sanitizeOutput } from './commitError';

describe('sanitizeOutput', () => {
  it('strips ANSI color codes and normalizes newlines', () => {
    expect(sanitizeOutput('\u001b[31mfail\u001b[0m\r\nnext')).toBe('fail\nnext');
  });

  it('collapses runs of blank lines and trims', () => {
    expect(sanitizeOutput('\n\na\n\n\n\nb\n\n')).toBe('a\n\nb');
  });
});

describe('describeCommitError', () => {
  it('classifies a failing pre-commit hook and keeps its output', () => {
    const failure = describeCommitError({
      message: 'Command failed: git commit',
      stderr: 'husky - pre-commit script failed (code 1)\n\u001b[31mESLint: 2 errors\u001b[0m',
    });
    expect(failure.kind).toBe('hook');
    expect(failure.hook).toBe('pre-commit');
    expect(failure.summary).toBe('The pre-commit hook rejected the commit.');
    expect(failure.details).toBe('husky - pre-commit script failed (code 1)\nESLint: 2 errors');
  });

  it('classifies a failing commit-msg hook (e.g. commitlint)', () => {
    const failure = describeCommitError({
      message: 'Command failed',
      stdout: '✖ subject may not be empty [subject-empty]',
      stderr: 'husky - commit-msg script failed (code 1)',
    });
    expect(failure.kind).toBe('hook');
    expect(failure.hook).toBe('commit-msg');
    expect(failure.details).toContain('subject may not be empty');
  });

  it('reports a generic hook failure when the hook name is unknown', () => {
    const failure = describeCommitError({ message: 'lefthook: command failed' });
    expect(failure.kind).toBe('hook');
    expect(failure.hook).toBeUndefined();
    expect(failure.summary).toBe('A Git hook rejected the commit.');
  });

  it('classifies "nothing to commit" separately, without details', () => {
    const failure = describeCommitError({
      message: 'Command failed',
      stdout: 'On branch main\nnothing to commit, working tree clean',
    });
    expect(failure).toEqual({
      kind: 'nothing-staged',
      summary: 'Nothing to commit. Stage some changes first.',
      details: '',
    });
  });

  it('falls back to the first message line for other Git errors', () => {
    const failure = describeCommitError(new Error('fatal: unable to write new index file'));
    expect(failure.kind).toBe('other');
    expect(failure.summary).toBe('fatal: unable to write new index file');
  });

  it('copes with non-error values', () => {
    expect(describeCommitError(undefined)).toEqual({
      kind: 'other',
      summary: 'Commit failed.',
      details: '',
    });
    expect(describeCommitError('boom').summary).toBe('boom');
  });

  it('truncates very long output', () => {
    const failure = describeCommitError({ message: 'hook failed', stderr: 'x'.repeat(10000) });
    expect(failure.details.length).toBeLessThan(4100);
    expect(failure.details.endsWith('(output truncated)')).toBe(true);
  });
});
