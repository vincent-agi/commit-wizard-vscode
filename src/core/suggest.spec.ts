import { describe, expect, it } from 'vitest';
import { suggestFromPaths } from './suggest';

const types = ['feat', 'fix', 'docs', 'test', 'ci', 'build', 'chore'];
const scopes = ['core', 'webview'];
const options = { types, scopes };

describe('suggestFromPaths', () => {
  it('suggests nothing without staged files', () => {
    expect(suggestFromPaths([], options)).toBeUndefined();
  });

  it.each([
    [['docs/user-guide.md', 'docs/adr/0001.md'], 'docs'],
    [['README.md'], 'docs'],
    [['.github/workflows/ci.yml'], 'ci'],
    [['package.json', 'package-lock.json'], 'build'],
    [['tsconfig.json'], 'build'],
  ])('suggests the type for %j', (paths, type) => {
    expect(suggestFromPaths(paths, options)).toEqual({ type });
  });

  it('suggests test and the source folder as scope for a spec-only change', () => {
    expect(suggestFromPaths(['src/core/a.spec.ts', 'src/core/b.spec.ts'], options)).toEqual({
      type: 'test',
      scope: 'core',
    });
  });

  it('suggests only the scope for source changes (feat vs fix is the user call)', () => {
    expect(suggestFromPaths(['src/webview/main.ts', 'src/webview/html.ts'], options)).toEqual({
      scope: 'webview',
    });
  });

  it('does not suggest a type when only some files have one', () => {
    expect(suggestFromPaths(['docs/a.md', 'src/core/a.ts'], options)).toBeUndefined();
  });

  it('drops suggestions that do not exist in the configuration', () => {
    expect(suggestFromPaths(['src/git/a.ts'], options)).toBeUndefined();
    expect(suggestFromPaths(['docs/a.md'], { types: ['feat'], scopes: [] })).toBeUndefined();
  });

  it('lets team rules override the built-in heuristics', () => {
    expect(
      suggestFromPaths(['docs/api/openapi.yaml'], {
        types,
        scopes,
        rules: [{ glob: 'docs/api/**', type: 'feat', scope: 'core' }],
      }),
    ).toEqual({ type: 'feat', scope: 'core' });
  });
});
