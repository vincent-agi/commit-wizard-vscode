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
  it('formats a minimal commit as the title alone', () => {
    expect(formatCommitMessage(base)).toBe('✨ feat: add live preview');
  });

  it('includes the scope in parens when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview' })).toBe(
      '✨ feat(webview): add live preview',
    );
  });

  it('appends a "Refs: <issue>" footer, not part of the title, when present', () => {
    expect(formatCommitMessage({ ...base, scope: 'webview', issue: '123' })).toBe(
      '✨ feat(webview): add live preview\n\nRefs: #123',
    );
  });

  it('puts the body and the issue footer in separate paragraphs', () => {
    expect(formatCommitMessage({ ...base, body: 'Some detailed explanation.', issue: '123' })).toBe(
      '✨ feat: add live preview\n\nSome detailed explanation.\n\nRefs: #123',
    );
  });

  it('leaves an already-hashed issue value untouched (avoids a double "##")', () => {
    expect(formatCommitMessage({ ...base, issue: '#456' })).toBe(
      '✨ feat: add live preview\n\nRefs: #456',
    );
  });

  it('prepends "#" to a purely numeric issue value, for GitHub/GitLab autolinking', () => {
    expect(formatCommitMessage({ ...base, issue: '456' })).toBe(
      '✨ feat: add live preview\n\nRefs: #456',
    );
  });

  it('does not prepend "#" to a non-numeric, Jira-style issue key', () => {
    expect(formatCommitMessage({ ...base, issue: 'PROJ-123' })).toBe(
      '✨ feat: add live preview\n\nRefs: PROJ-123',
    );
  });

  it('emits one footer line per issue when several are given', () => {
    expect(formatCommitMessage({ ...base, issue: '12, PROJ-3 #45', issueKeyword: 'closes' })).toBe(
      '✨ feat: add live preview\n\nCloses #12\nCloses PROJ-3\nCloses #45',
    );
  });

  it('renders "Closes"/"Fixes"/"Resolves" with no colon, per GitHub/GitLab auto-close syntax', () => {
    expect(formatCommitMessage({ ...base, issue: '123', issueKeyword: 'closes' })).toBe(
      '✨ feat: add live preview\n\nCloses #123',
    );
    expect(formatCommitMessage({ ...base, issue: '123', issueKeyword: 'fixes' })).toBe(
      '✨ feat: add live preview\n\nFixes #123',
    );
    expect(formatCommitMessage({ ...base, issue: '123', issueKeyword: 'resolves' })).toBe(
      '✨ feat: add live preview\n\nResolves #123',
    );
  });

  it('renders "See also" with a colon, like "Refs"', () => {
    expect(formatCommitMessage({ ...base, issue: '456', issueKeyword: 'seeAlso' })).toBe(
      '✨ feat: add live preview\n\nSee also: #456',
    );
  });

  it('uses whichever gitmoji is selected in input.gitmoji, independently of the type', () => {
    expect(formatCommitMessage({ ...base, type: 'fix', gitmoji: '🐛' })).toBe(
      '🐛 fix: add live preview',
    );
    expect(formatCommitMessage({ ...base, type: 'chore', gitmoji: '🔥' })).toBe(
      '🔥 chore: add live preview',
    );
  });

  it('omits the emoji prefix entirely when gitmoji is empty', () => {
    expect(formatCommitMessage({ ...base, gitmoji: '', scope: 'api' })).toBe(
      'feat(api): add live preview',
    );
  });

  it('accepts a custom, non-default type', () => {
    expect(formatCommitMessage({ ...base, type: 'deps', gitmoji: '' })).toBe(
      'deps: add live preview',
    );
  });

  it('appends the body as its own blank-line-separated paragraph', () => {
    expect(formatCommitMessage({ ...base, body: 'Some detailed explanation.' })).toBe(
      '✨ feat: add live preview\n\nSome detailed explanation.',
    );
  });

  it('preserves line breaks inside a multiline body', () => {
    expect(formatCommitMessage({ ...base, body: 'Line one.\nLine two.' })).toBe(
      '✨ feat: add live preview\n\nLine one.\nLine two.',
    );
  });

  it('adds no body paragraph when body is empty or whitespace-only', () => {
    expect(formatCommitMessage({ ...base, body: '' })).toBe('✨ feat: add live preview');
    expect(formatCommitMessage({ ...base, body: '   ' })).toBe('✨ feat: add live preview');
  });

  it('adds "!" after the type and a BREAKING CHANGE footer when breaking with a description', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
      }),
    ).toBe('✨ feat!: add live preview\n\nBREAKING CHANGE: removes the old API');
  });

  it('puts "!" after the scope when both are present', () => {
    expect(
      formatCommitMessage({
        ...base,
        scope: 'api',
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
      }),
    ).toBe('✨ feat(api)!: add live preview\n\nBREAKING CHANGE: removes the old API');
  });

  it('still adds "!" but no footer when breaking with an empty description', () => {
    expect(
      formatCommitMessage({ ...base, breakingChange: true, breakingChangeDescription: '' }),
    ).toBe('✨ feat!: add live preview');
  });

  it('adds neither "!" nor footer when the flag is false, even if a description is set', () => {
    expect(
      formatCommitMessage({
        ...base,
        breakingChange: false,
        breakingChangeDescription: 'ignored',
      }),
    ).toBe('✨ feat: add live preview');
  });

  it('emits one Co-authored-by footer per co-author', () => {
    expect(
      formatCommitMessage({
        ...base,
        coAuthors: ['Ada Lovelace <ada@example.com>', 'Alan Turing <alan@example.com>'],
      }),
    ).toBe(
      '✨ feat: add live preview\n\nCo-authored-by: Ada Lovelace <ada@example.com>\nCo-authored-by: Alan Turing <alan@example.com>',
    );
  });

  it('groups all footers in one block: BREAKING CHANGE, issues, then co-authors', () => {
    expect(
      formatCommitMessage({
        ...base,
        body: 'Some detailed explanation.',
        issue: '123',
        issueKeyword: 'closes',
        breakingChange: true,
        breakingChangeDescription: 'removes the old API',
        coAuthors: ['Ada Lovelace <ada@example.com>'],
      }),
    ).toBe(
      [
        '✨ feat!: add live preview',
        'Some detailed explanation.',
        [
          'BREAKING CHANGE: removes the old API',
          'Closes #123',
          'Co-authored-by: Ada Lovelace <ada@example.com>',
        ].join('\n'),
      ].join('\n\n'),
    );
  });

  it('trims whitespace-only scope and issue to omit them', () => {
    expect(formatCommitMessage({ ...base, scope: '   ', issue: '  ' })).toBe(
      '✨ feat: add live preview',
    );
  });
});
