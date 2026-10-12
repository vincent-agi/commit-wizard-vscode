import { describe, expect, it } from 'vitest';
import {
  GIT_LOG_FORMAT,
  LOG_FIELD_SEPARATOR as F,
  LOG_RECORD_SEPARATOR as R,
  buildPrDescription,
  parseGitLog,
  splitPrDocument,
} from './prDescription';
import type { BranchCommit } from './prDescription';

const commit = (hash: string, message: string): BranchCommit => ({ hash, message });

describe('parseGitLog', () => {
  it('splits records and keeps multi-line messages intact', () => {
    const output = `aaa${F}feat: one\n\nbody line${R}\nbbb${F}fix: two\n${R}\n`;
    expect(parseGitLog(output)).toEqual([
      { hash: 'aaa', message: 'feat: one\n\nbody line' },
      { hash: 'bbb', message: 'fix: two' },
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseGitLog('')).toEqual([]);
    expect(parseGitLog('\n')).toEqual([]);
  });

  it('exposes a format using the same separators', () => {
    expect(GIT_LOG_FORMAT).toBe(`%H${F}%B${R}`);
  });
});

describe('buildPrDescription', () => {
  it('returns undefined without commits', () => {
    expect(buildPrDescription([])).toBeUndefined();
  });

  it('uses the single commit header as title', () => {
    const result = buildPrDescription([commit('abcdef0123', '✨ feat(api)!: add endpoint')]);
    expect(result?.title).toBe('feat(api)!: add endpoint');
  });

  it('groups commits by type, oldest first, with scope and short hash', () => {
    const result = buildPrDescription(
      [
        commit('3333333aaa', 'fix(core): handle empty'),
        commit('2222222aaa', '✨ feat: add b'),
        commit('1111111aaa', 'feat(webview): add a'),
      ],
      { branch: 'feat/123-add-things' },
    );
    expect(result?.body).toBe(
      [
        '## Changes\n### Features\n- **webview:** add a (1111111)\n- add b (2222222)',
        '### Bug fixes\n- **core:** handle empty (3333333)',
      ].join('\n\n'),
    );
    expect(result?.title).toBe('feat: add things');
    expect(result?.conforming).toBe(3);
  });

  it('lists breaking changes first and gathers issue footers once', () => {
    const result = buildPrDescription([
      commit('bbbbbbb1', 'fix: b\n\nCloses #2'),
      commit(
        'aaaaaaa1',
        'feat!: a\n\nBREAKING CHANGE: removes the old API\nCloses #1\nRefs: PROJ-9',
      ),
      commit('ccccccc1', 'chore: c\n\nCloses #2'),
    ]);
    expect(result?.body.startsWith('## Breaking changes\n- removes the old API')).toBe(true);
    expect(result?.body).toContain('## Related issues\n- Closes #2\n- Closes #1\n- Refs PROJ-9');
    expect(result?.body.match(/Closes #2/g)).toHaveLength(1);
  });

  it('puts non conforming commits under "Other changes"', () => {
    const result = buildPrDescription([
      commit('2222222a', 'Merge stuff'),
      commit('1111111a', 'feat: real'),
    ]);
    expect(result?.body).toContain('### Other changes\n- Merge stuff (2222222)');
    expect(result?.conforming).toBe(1);
  });

  it('falls back to the first message line as title when no branch is given', () => {
    expect(buildPrDescription([commit('b', 'fix: two'), commit('a', 'feat: one')])?.title).toBe(
      'fix: two',
    );
  });

  it('applies a custom template, collapsing blank gaps', () => {
    const result = buildPrDescription([commit('abcdef012', 'feat: a\n\nCloses #4')], {
      template: '# {{title}}\n\n{{breaking}}\n\n\n{{changes}}\n\n{{issues}}\n{{unknown}}',
    });
    expect(result?.body).toBe(
      '# feat: a\n\n### Features\n- a (abcdef0)\n\n- Closes #4\n{{unknown}}',
    );
  });
});

describe('splitPrDocument', () => {
  it('takes the first non-empty line as title, stripping a Markdown heading marker', () => {
    expect(splitPrDocument('\n# feat: add x\n\n## Changes\n- a\n')).toEqual({
      title: 'feat: add x',
      body: '## Changes\n- a',
    });
  });

  it('works without a heading marker and with CRLF', () => {
    expect(splitPrDocument('fix: y\r\n\r\nbody')).toEqual({ title: 'fix: y', body: 'body' });
  });

  it('returns empty parts for an empty document', () => {
    expect(splitPrDocument('  \n ')).toEqual({ title: '', body: '' });
  });
});
