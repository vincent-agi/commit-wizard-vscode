import { describe, expect, it } from 'vitest';
import { formatCommitMessage } from './formatCommit';
import { parseCommitMessage } from './parseCommit';
import type { CommitFormInput } from './types';

describe('parseCommitMessage', () => {
  it('parses a header with the emoji before the type', () => {
    expect(parseCommitMessage('✨ feat(webview)!: add preview')).toMatchObject({
      gitmoji: '✨',
      type: 'feat',
      scope: 'webview',
      breaking: true,
      description: 'add preview',
    });
  });

  it('parses a header with the emoji after the colon', () => {
    expect(parseCommitMessage('fix(core): 🐛 handle empty body')).toMatchObject({
      gitmoji: '🐛',
      type: 'fix',
      scope: 'core',
      description: 'handle empty body',
    });
  });

  it('parses a plain header without emoji or scope', () => {
    expect(parseCommitMessage('chore: bump deps')).toMatchObject({
      gitmoji: '',
      type: 'chore',
      scope: undefined,
      breaking: false,
      description: 'bump deps',
    });
  });

  it('returns undefined for non conforming headers', () => {
    for (const message of ['added stuff', '✨ add thing', 'feat add thing', '', 'feat:']) {
      expect(parseCommitMessage(message)).toBeUndefined();
    }
  });

  it('extracts body and all footer kinds', () => {
    const parsed = parseCommitMessage(
      [
        '✨ feat!: add x',
        'Explains why.\n\nSecond paragraph.',
        [
          'BREAKING CHANGE: removes y',
          'Closes #12',
          'Closes PROJ-3',
          'Co-authored-by: Ada <ada@example.com>',
        ].join('\n'),
      ].join('\n\n'),
    );
    expect(parsed).toMatchObject({
      body: 'Explains why.\n\nSecond paragraph.',
      issue: '#12, PROJ-3',
      issueKeyword: 'closes',
      breakingChangeDescription: 'removes y',
      coAuthors: ['Ada <ada@example.com>'],
    });
  });

  it('keeps the keyword of every issue footer in references', () => {
    expect(parseCommitMessage('feat: a\n\nCloses #1\nRefs: PROJ-2')?.references).toEqual([
      { keyword: 'closes', id: '#1' },
      { keyword: 'refs', id: 'PROJ-2' },
    ]);
  });

  it('maps Refs and See also keywords', () => {
    expect(parseCommitMessage('feat: a\n\nRefs: #1')?.issueKeyword).toBe('refs');
    expect(parseCommitMessage('feat: a\n\nSee also: #1')?.issueKeyword).toBe('seeAlso');
  });

  it('keeps an unrecognised trailer block in the body', () => {
    const parsed = parseCommitMessage('feat: a\n\nbody\n\nSigned-off-by: Me <m@e.com>');
    expect(parsed?.body).toBe('body\n\nSigned-off-by: Me <m@e.com>');
    expect(parsed?.coAuthors).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCommitMessage('feat: a\r\n\r\nbody')?.body).toBe('body');
  });

  it('round-trips what formatCommitMessage produces', () => {
    const input: CommitFormInput = {
      type: 'fix',
      gitmoji: '🐛',
      scope: 'api',
      issue: '#7, PROJ-9',
      issueKeyword: 'fixes',
      description: 'stop crashing',
      body: 'Details here.',
      breakingChange: true,
      breakingChangeDescription: 'changes the format',
      coAuthors: ['Ada <ada@example.com>'],
    };
    const parsed = parseCommitMessage(formatCommitMessage(input));
    expect(parsed).toMatchObject({
      gitmoji: '🐛',
      type: 'fix',
      scope: 'api',
      issue: '#7, PROJ-9',
      issueKeyword: 'fixes',
      description: 'stop crashing',
      body: 'Details here.',
      breaking: true,
      breakingChangeDescription: 'changes the format',
      coAuthors: ['Ada <ada@example.com>'],
    });
  });
});
