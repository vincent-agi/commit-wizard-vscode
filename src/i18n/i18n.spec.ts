import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EN } from './en';
import { FR } from './fr';
import { getLanguage, setLocale, t } from './index';

const ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'test' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();

afterEach(() => setLocale('en'));

describe('catalogs', () => {
  it('French defines exactly the English keys', () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
  });

  it('keeps the same placeholders in every translation', () => {
    for (const [key, english] of Object.entries(EN)) {
      expect(placeholders(FR[key as keyof typeof FR]), key).toEqual(placeholders(english));
    }
  });

  it('has no empty translation', () => {
    for (const [key, text] of Object.entries(FR)) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('uses every English key somewhere in the source', () => {
    const source = sourceFiles(join(ROOT, 'src'))
      .filter((path) => !path.includes('/i18n/'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    // Some keys are built from a prefix and a name (e.g. `preset.${id}.label`).
    const dynamicPrefixes = ['preset.', 'type.', 'keyword.'];
    const unused = Object.keys(EN).filter(
      (key) =>
        !dynamicPrefixes.some((prefix) => key.startsWith(prefix)) && !source.includes(`'${key}'`),
    );
    expect(unused).toEqual([]);
  });
});

describe('manifest localization', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  const english = read('package.nls.json') as Record<string, string>;
  const french = read('package.nls.fr.json') as Record<string, string>;

  it('has the same keys in English and French', () => {
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  });

  it('defines every %key% used by package.json and leaves none unused', () => {
    const used = new Set(
      [...readFileSync(join(ROOT, 'package.json'), 'utf8').matchAll(/"%([^%"]+)%"/g)].map(
        (m) => m[1],
      ),
    );
    expect([...used].filter((key) => !(key in english))).toEqual([]);
    expect(Object.keys(english).filter((key) => !used.has(key))).toEqual([]);
  });
});

describe('t', () => {
  it('returns English by default and substitutes arguments', () => {
    expect(t('push.detached')).toContain('detached HEAD');
    expect(t('branch.exists', 'feat/x')).toBe(
      'The branch "feat/x" already exists. Nothing was changed.',
    );
  });

  it('switches to French for fr and regional variants', () => {
    setLocale('fr');
    expect(getLanguage()).toBe('fr');
    expect(t('ui.commitNow')).toBe('Commiter maintenant');
    setLocale('fr-CA');
    expect(getLanguage()).toBe('fr');
  });

  it('falls back to English for unsupported languages', () => {
    setLocale('de');
    expect(getLanguage()).toBe('en');
    expect(t('ui.commitNow')).toBe('Commit now');
  });

  it('leaves a placeholder visible when its argument is missing', () => {
    expect(t('branch.exists')).toContain('{0}');
  });
});

describe('hardcoded user-visible strings', () => {
  const FORBIDDEN: { name: string; pattern: RegExp }[] = [
    {
      name: 'notification with a literal',
      pattern: /show(?:Information|Warning|Error)Message\(\s*['`]/,
    },
    {
      name: 'quick pick / input text literal',
      pattern: /\b(?:placeHolder|prompt):\s*['`][A-Za-z]/,
    },
    { name: 'DOM text literal', pattern: /\.textContent\s*=\s*['`][A-Za-z]/ },
    { name: 'configuration error literal', pattern: /errors\.push\(\s*['`]/ },
  ];

  it('keeps UI text in the catalog', () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(join(ROOT, 'src'))) {
      if (path.includes('/i18n/')) continue;
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const { name, pattern } of FORBIDDEN) {
          if (pattern.test(line)) offenders.push(`${path.replace(ROOT, '')}:${index + 1} ${name}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
