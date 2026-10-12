import { describe, expect, it } from 'vitest';
import { bumpVersion, parseBumpOptions, previewRelease } from './releasePreview';

const c = (message: string, hash = 'abcdef0123') => ({ hash, message });

describe('bumpVersion', () => {
  it.each([
    ['1.2.3', 'major', '2.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
    ['1.2.3', 'patch', '1.2.4'],
    ['v0.1.0', 'minor', '0.2.0'],
    ['1.2.3-beta.1', 'patch', '1.2.4'],
  ] as const)('%s + %s = %s', (version, bump, expected) => {
    expect(bumpVersion(version, bump)).toBe(expected);
  });

  it('returns undefined for none or an unreadable version', () => {
    expect(bumpVersion('1.0.0', 'none')).toBeUndefined();
    expect(bumpVersion('nope', 'minor')).toBeUndefined();
  });
});

describe('parseBumpOptions', () => {
  it('reads top-level and package-level options, package winning', () => {
    expect(parseBumpOptions({ 'bump-minor-pre-major': true })).toEqual({
      bumpMinorPreMajor: true,
      bumpPatchForMinorPreMajor: false,
    });
    expect(
      parseBumpOptions({
        'bump-minor-pre-major': true,
        packages: {
          '.': { 'bump-minor-pre-major': false, 'bump-patch-for-minor-pre-major': true },
        },
      }),
    ).toEqual({ bumpMinorPreMajor: false, bumpPatchForMinorPreMajor: true });
  });

  it('defaults to false for missing or malformed config', () => {
    for (const config of [undefined, null, 'x', {}, { packages: 3 }]) {
      expect(parseBumpOptions(config)).toEqual({
        bumpMinorPreMajor: false,
        bumpPatchForMinorPreMajor: false,
      });
    }
  });
});

describe('previewRelease', () => {
  it('bumps minor for a feature, listing it under Features', () => {
    const preview = previewRelease([c('feat(core): add x', '1111111aaa')], '1.2.3');
    expect(preview.bump).toBe('minor');
    expect(preview.nextVersion).toBe('1.3.0');
    expect(preview.sections).toEqual([
      { heading: 'Features', items: ['**core:** add x (1111111)'] },
    ]);
  });

  it('bumps patch for fixes and performance only', () => {
    expect(previewRelease([c('fix: a')], '1.0.0').nextVersion).toBe('1.0.1');
    expect(previewRelease([c('perf: a')], '1.0.0').bump).toBe('patch');
  });

  it('takes the highest bump and orders sections like Release Please', () => {
    const preview = previewRelease([c('fix: b'), c('feat: a'), c('perf: p')], '1.0.0');
    expect(preview.bump).toBe('minor');
    expect(preview.sections.map((s) => s.heading)).toEqual([
      'Features',
      'Bug Fixes',
      'Performance Improvements',
    ]);
  });

  it('bumps major for breaking changes and lists them first', () => {
    const preview = previewRelease(
      [c('feat!: a\n\nBREAKING CHANGE: removes y'), c('fix: b')],
      '1.4.0',
    );
    expect(preview.bump).toBe('major');
    expect(preview.nextVersion).toBe('2.0.0');
    expect(preview.sections[0]).toEqual({ heading: '⚠ BREAKING CHANGES', items: ['removes y'] });
  });

  it('honors the pre-1.0 options', () => {
    const breaking = [c('feat!: a')];
    expect(previewRelease(breaking, '0.3.0').nextVersion).toBe('1.0.0');
    expect(
      previewRelease(breaking, '0.3.0', {
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: false,
      }).nextVersion,
    ).toBe('0.4.0');
    expect(
      previewRelease([c('feat: a')], '0.3.0', {
        bumpMinorPreMajor: false,
        bumpPatchForMinorPreMajor: true,
      }).nextVersion,
    ).toBe('0.3.1');
    // The options never apply once the major version is 1 or more.
    expect(
      previewRelease(breaking, '1.3.0', {
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      }).nextVersion,
    ).toBe('2.0.0');
  });

  it('proposes no release when only hidden types are present', () => {
    const preview = previewRelease([c('docs: a'), c('chore: b'), c('ci: c')], '1.0.0');
    expect(preview.bump).toBe('none');
    expect(preview.nextVersion).toBeUndefined();
    expect(preview.hidden).toHaveLength(3);
    expect(preview.sections).toEqual([]);
  });

  it('flags commits Release Please cannot read, including emoji before the type', () => {
    const preview = previewRelease(
      [c('✨ feat: pretty'), c('Added stuff'), c('feat: ok')],
      '1.0.0',
    );
    expect(preview.invisible.map((x) => x.message)).toEqual(['Added stuff', '✨ feat: pretty']);
    expect(preview.bump).toBe('minor');
    expect(preview.sections[0].items).toHaveLength(1);
  });

  it('accepts the emoji after the colon', () => {
    const preview = previewRelease([c('feat(webview): ✨ add preview')], '0.1.0');
    expect(preview.invisible).toEqual([]);
    expect(preview.nextVersion).toBe('0.2.0');
  });

  it('handles no commits', () => {
    expect(previewRelease([], '1.0.0')).toMatchObject({
      bump: 'none',
      nextVersion: undefined,
      sections: [],
    });
  });
});
