import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, filterDiff, parseDraft } from './aiDraft';

const fileDiff = (path: string, body = '+line\n') =>
  `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}`;

describe('filterDiff', () => {
  it('keeps regular files and reports them', () => {
    const result = filterDiff(fileDiff('src/a.ts') + fileDiff('src/b.ts'), { maxChars: 10000 });
    expect(result.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.excluded).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('src/b.ts');
  });

  it('excludes lockfiles, build output, source maps and binary files', () => {
    const binary = `diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n`;
    const result = filterDiff(
      [
        fileDiff('src/a.ts'),
        fileDiff('package-lock.json'),
        fileDiff('dist/extension.js'),
        fileDiff('dist/x.js.map'),
        binary,
      ].join(''),
      { maxChars: 10000 },
    );
    expect(result.files).toEqual(['src/a.ts']);
    expect(result.excluded).toEqual([
      'package-lock.json',
      'dist/extension.js',
      'dist/x.js.map',
      'logo.png',
    ]);
    expect(result.text).not.toContain('package-lock');
  });

  it('truncates a section that does not fit and drops the rest', () => {
    const big = fileDiff('src/big.ts', '+x\n'.repeat(500));
    const result = filterDiff(big + fileDiff('src/after.ts'), { maxChars: 300 });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(300);
    expect(result.text.endsWith('[diff truncated]\n')).toBe(true);
    expect(result.files).toEqual(['src/big.ts']);
  });

  it('flags truncation when later files are dropped entirely', () => {
    const first = fileDiff('src/a.ts');
    const result = filterDiff(first + fileDiff('src/b.ts'), { maxChars: first.length + 5 });
    expect(result.truncated).toBe(true);
    expect(result.files).toEqual(['src/a.ts']);
  });

  it('returns an empty result for an empty diff', () => {
    expect(filterDiff('', { maxChars: 100 })).toEqual({
      text: '',
      files: [],
      excluded: [],
      truncated: false,
    });
  });
});

describe('buildDraftPrompt', () => {
  it('lists the allowed types and scopes and includes the diff', () => {
    const prompt = buildDraftPrompt({
      diff: 'DIFF-BODY',
      types: [
        { name: 'feat', description: 'A feature' },
        { name: 'fix', description: '' },
      ],
      scopes: ['core', 'webview'],
    });
    expect(prompt).toContain('- feat: A feature');
    expect(prompt).toContain('- fix\n');
    expect(prompt).toContain('core, webview');
    expect(prompt.endsWith('DIFF-BODY')).toBe(true);
  });

  it('tells the model to omit the scope when none is configured', () => {
    expect(buildDraftPrompt({ diff: '', types: [], scopes: [] })).toContain('omit the scope');
  });
});

describe('parseDraft', () => {
  const allowed = { types: ['feat', 'fix'], scopes: ['core'] };

  it('parses a bare JSON answer', () => {
    expect(
      parseDraft(
        '{"type":"fix","scope":"core","description":"stop crash.","body":"Why."}',
        allowed,
      ),
    ).toEqual({
      ok: true,
      draft: { type: 'fix', scope: 'core', description: 'stop crash', body: 'Why.' },
    });
  });

  it('extracts JSON from fences and prose', () => {
    const result = parseDraft(
      'Sure!\n```json\n{"type":"feat","description":"add x"}\n```',
      allowed,
    );
    expect(result).toEqual({ ok: true, draft: { type: 'feat', description: 'add x' } });
  });

  it('drops a type or scope that is not configured, and null fields', () => {
    expect(
      parseDraft('{"type":"wizardry","scope":"nope","description":"d","body":null}', allowed),
    ).toEqual({ ok: true, draft: { description: 'd' } });
  });

  it('keeps only the first line of the description', () => {
    expect(parseDraft('{"description":"one\\ntwo"}', allowed)).toEqual({
      ok: true,
      draft: { description: 'one' },
    });
  });

  it.each([
    ['no json here', 'did not return a JSON object'],
    ['{not json}', 'invalid JSON'],
    ['{"type":"feat"}', 'no description'],
    ['{"description":"   "}', 'no description'],
    ['[1,2]', 'did not return a JSON object'],
  ])('rejects %j', (answer, fragment) => {
    const result = parseDraft(answer, allowed);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain(fragment);
  });
});
