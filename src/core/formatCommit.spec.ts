import { describe, expect, it } from 'vitest';
import { formatCommitMessage } from './formatCommit';
import type { CommitFormInput } from './types';

const base: CommitFormInput = {
  type: 'feat',
  description: 'add live preview',
  breakingChange: false,
};

describe('formatCommitMessage', () => {
  it('formats a minimal commit with no scope, issue, or body', () => {
    expect(formatCommitMessage(base)).toBe('✨ feat: add live preview');
  });

  it('includes the scope in parens when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview' })).toBe(
      '✨ feat(webview): add live preview',
    );
  });

  it('includes the issue token before the description when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview', issue: 'PROJ-123' })).toBe(
      '✨ feat(webview): PROJ-123 add live preview',
    );
  });

  it('uses the correct gitmoji for each commit type', () => {
    expect(formatCommitMessage({ ...base, type: 'fix' })).toBe('🐛 fix: add live preview');
    expect(formatCommitMessage({ ...base, type: 'docs' })).toBe('📝 docs: add live preview');
    expect(formatCommitMessage({ ...base, type: 'style' })).toBe('🎨 style: add live preview');
    expect(formatCommitMessage({ ...base, type: 'refactor' })).toBe(
      '♻️ refactor: add live preview',
    );
    expect(formatCommitMessage({ ...base, type: 'perf' })).toBe('⚡ perf: add live preview');
    expect(formatCommitMessage({ ...base, type: 'test' })).toBe('🧪 test: add live preview');
    expect(formatCommitMessage({ ...base, type: 'chore' })).toBe('🔧 chore: add live preview');
    expect(formatCommitMessage({ ...base, type: 'build' })).toBe('🏗️ build: add live preview');
    expect(formatCommitMessage({ ...base, type: 'ci' })).toBe('💚 ci: add live preview');
  });

  it('appends the body as its own blank-line-separated paragraph', () => {
    expect(formatCommitMessage({ ...base, body: 'Some detailed explanation.' })).toBe(
      '✨ feat: add live preview\n\nSome detailed explanation.',
    );
  });

  it('omits the body paragraph when body is empty or whitespace-only', () => {
    expect(formatCommitMessage({ ...base, body: '' })).toBe('✨ feat: add live preview');
    expect(formatCommitMessage({ ...base, body: '   ' })).toBe('✨ feat: add live preview');
  });

  it('appends a BREAKING CHANGE footer when breakingChange is true and description is set', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
      }),
    ).toBe('✨ feat: add live preview\n\nBREAKING CHANGE: removes the old API');
  });

  it('includes both body and BREAKING CHANGE footer, in order, when both present', () => {
    expect(
      formatCommitMessage({
        ...base,
        body: 'Some detailed explanation.',
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
      }),
    ).toBe(
      '✨ feat: add live preview\n\nSome detailed explanation.\n\nBREAKING CHANGE: removes the old API',
    );
  });

  it('omits the BREAKING CHANGE footer when the flag is true but the description is empty', () => {
    expect(
      formatCommitMessage({ ...base, breakingChange: true, breakingChangeDescription: '' }),
    ).toBe('✨ feat: add live preview');
  });

  it('omits the BREAKING CHANGE footer when the flag is false, even if a description is set', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: false,
        breakingChangeDescription: 'ignored',
      }),
    ).toBe('✨ feat: add live preview');
  });

  it('trims whitespace-only scope and issue to omit them', () => {
    expect(formatCommitMessage({ ...base, scope: '   ', issue: '  ' })).toBe(
      '✨ feat: add live preview',
    );
  });
});
