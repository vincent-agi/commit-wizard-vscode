import { describe, expect, it } from 'vitest';
import { formatCommitMessage } from './formatCommit';
import type { CommitFormInput } from './types';

const base: CommitFormInput = {
  type: 'feat',
  gitmoji: '✨',
  issueKeyword: 'refs',
  description: 'add live preview',
  breakingChange: false,
};

describe('formatCommitMessage', () => {
  it('formats a minimal commit with no scope, issue, or body', () => {
    expect(formatCommitMessage(base)).toBe('✨ feat: add live preview\n\n\n\n');
  });

  it('includes the scope in parens when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview' })).toBe(
      '✨ feat(webview): add live preview\n\n\n\n',
    );
  });

  it('appends a "Refs: <issue>" line to the body, not the title, when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview', issue: 'PROJ-123' })).toBe(
      '✨ feat(webview): add live preview\n\n\n\nRefs: PROJ-123\n',
    );
  });

  it('combines an explicit body and a "Refs: <issue>" line on the same body paragraph', () => {
    expect(
      formatCommitMessage({
        ...base,
        body: 'Some detailed explanation.',
        issue: 'PROJ-123',
      }),
    ).toBe('✨ feat: add live preview\n\nSome detailed explanation.\n\nRefs: PROJ-123\n');
  });

  it('uses the issue value verbatim, without adding its own "#" (avoids a double "##")', () => {
    expect(formatCommitMessage({ ...base, issue: '#456' })).toBe(
      '✨ feat: add live preview\n\n\n\nRefs: #456\n',
    );
  });

  it('renders "Closes"/"Fixes"/"Resolves" with no colon, per GitHub/GitLab auto-close syntax', () => {
    expect(formatCommitMessage({ ...base, issue: '#123', issueKeyword: 'closes' })).toBe(
      '✨ feat: add live preview\n\n\n\nCloses #123\n',
    );
    expect(formatCommitMessage({ ...base, issue: '#123', issueKeyword: 'fixes' })).toBe(
      '✨ feat: add live preview\n\n\n\nFixes #123\n',
    );
    expect(formatCommitMessage({ ...base, issue: '#123', issueKeyword: 'resolves' })).toBe(
      '✨ feat: add live preview\n\n\n\nResolves #123\n',
    );
  });

  it('renders "See also" with a colon, like "Refs"', () => {
    expect(formatCommitMessage({ ...base, issue: 'PROJ-456', issueKeyword: 'seeAlso' })).toBe(
      '✨ feat: add live preview\n\n\n\nSee also: PROJ-456\n',
    );
  });

  it('uses whichever gitmoji is selected in input.gitmoji, independently of the type', () => {
    expect(formatCommitMessage({ ...base, type: 'fix', gitmoji: '🐛' })).toBe(
      '🐛 fix: add live preview\n\n\n\n',
    );
    expect(formatCommitMessage({ ...base, type: 'chore', gitmoji: '🔥' })).toBe(
      '🔥 chore: add live preview\n\n\n\n',
    );
  });

  it('appends the body as its own blank-line-separated paragraph', () => {
    expect(formatCommitMessage({ ...base, body: 'Some detailed explanation.' })).toBe(
      '✨ feat: add live preview\n\nSome detailed explanation.\n\n',
    );
  });

  it('still emits a (blank) body paragraph when body is empty or whitespace-only', () => {
    expect(formatCommitMessage({ ...base, body: '' })).toBe(
      '✨ feat: add live preview\n\n\n\n',
    );
    expect(formatCommitMessage({ ...base, body: '   ' })).toBe(
      '✨ feat: add live preview\n\n\n\n',
    );
  });

  it('appends a BREAKING CHANGE footer when breakingChange is true and description is set', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
      }),
    ).toBe('✨ feat: add live preview\n\n\n\n\n\nBREAKING CHANGE: removes the old API');
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
      '✨ feat: add live preview\n\nSome detailed explanation.\n\n\n\nBREAKING CHANGE: removes the old API',
    );
  });

  it('omits the BREAKING CHANGE footer when the flag is true but the description is empty', () => {
    expect(
      formatCommitMessage({ ...base, breakingChange: true, breakingChangeDescription: '' }),
    ).toBe('✨ feat: add live preview\n\n\n\n');
  });

  it('omits the BREAKING CHANGE footer when the flag is false, even if a description is set', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: false,
        breakingChangeDescription: 'ignored',
      }),
    ).toBe('✨ feat: add live preview\n\n\n\n');
  });

  it('trims whitespace-only scope and issue to omit them', () => {
    expect(formatCommitMessage({ ...base, scope: '   ', issue: '  ' })).toBe(
      '✨ feat: add live preview\n\n\n\n',
    );
  });
});
