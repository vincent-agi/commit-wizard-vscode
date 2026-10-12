import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfigLayer, resolveConfig } from './commitConfig';

describe('DEFAULT_CONFIG', () => {
  it('keeps the ten built-in types in their historical order', () => {
    expect(DEFAULT_CONFIG.types.map((type) => type.name)).toEqual([
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'chore',
      'build',
      'ci',
    ]);
    expect(DEFAULT_CONFIG.types.every((type) => type.description)).toBe(true);
    expect(DEFAULT_CONFIG.emojis).toBe(true);
    expect([DEFAULT_CONFIG.titleWarningLength, DEFAULT_CONFIG.titleMaxLength]).toEqual([50, 72]);
  });
});

describe('parseConfigLayer', () => {
  it('parses a complete valid configuration', () => {
    const { layer, errors } = parseConfigLayer({
      $schema: './schemas/commit-wizard.schema.json',
      types: [{ name: 'deps', description: 'Dependency bumps', emoji: '⬆️' }, { name: 'wip' }],
      scopes: [{ name: 'api', description: 'HTTP API' }],
      emojis: false,
      titleWarningLength: 40,
      titleMaxLength: 60,
      issuePattern: '(ENG-\\d+)',
    });
    expect(errors).toEqual([]);
    expect(layer).toEqual({
      types: [
        { name: 'deps', description: 'Dependency bumps', emoji: '⬆️' },
        { name: 'wip', description: '' },
      ],
      scopes: [{ name: 'api', description: 'HTTP API' }],
      emojis: false,
      titleWarningLength: 40,
      titleMaxLength: 60,
      issuePattern: '(ENG-\\d+)',
    });
  });

  it('rejects a non-object root', () => {
    expect(parseConfigLayer([]).errors).toHaveLength(1);
    expect(parseConfigLayer('x').layer).toEqual({});
  });

  it('treats empty types and scopes arrays as unset, without error', () => {
    expect(parseConfigLayer({ types: [], scopes: [] })).toEqual({ layer: {}, errors: [] });
  });

  it('rejects empty, invalid and duplicate type names but keeps the valid ones', () => {
    const { layer, errors } = parseConfigLayer({
      types: [{ name: 'ok' }, { name: '' }, { name: 'bad name' }, { name: 'ok' }, 'nope'],
    });
    expect(layer.types).toEqual([{ name: 'ok', description: '' }]);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toContain('duplicate type "ok"');
  });

  it('drops scopes missing a name or description', () => {
    const { layer, errors } = parseConfigLayer({
      scopes: [{ name: 'a', description: 'A' }, { name: 'b' }],
    });
    expect(layer.scopes).toEqual([{ name: 'a', description: 'A' }]);
    expect(errors).toHaveLength(1);
  });

  it('rejects non-positive or non-integer lengths and wrong types, field by field', () => {
    const { layer, errors } = parseConfigLayer({
      titleWarningLength: 0,
      titleMaxLength: 80.5,
      emojis: 'no',
    });
    expect(layer).toEqual({});
    expect(errors).toHaveLength(3);
  });

  it('accepts a non-empty issueTemplate and rejects an empty one', () => {
    expect(parseConfigLayer({ issueTemplate: '## Why\n{{context}}' }).layer.issueTemplate).toBe(
      '## Why\n{{context}}',
    );
    const { layer, errors } = parseConfigLayer({ issueTemplate: '  ' });
    expect(layer).toEqual({});
    expect(errors).toHaveLength(1);
  });

  it('rejects an invalid issue pattern but keeps other valid fields', () => {
    const { layer, errors } = parseConfigLayer({ issuePattern: '(', emojis: false });
    expect(layer).toEqual({ emojis: false });
    expect(errors[0]).toContain('not a valid regular expression');
  });
});

describe('parseConfigLayer (assistance options)', () => {
  it('accepts protected branches, including an explicit empty list', () => {
    expect(parseConfigLayer({ protectedBranches: ['main', 'release/*', ' '] }).layer).toEqual({
      protectedBranches: ['main', 'release/*'],
    });
    expect(parseConfigLayer({ protectedBranches: [] })).toEqual({
      layer: { protectedBranches: [] },
      errors: [],
    });
    expect(parseConfigLayer({ protectedBranches: 'main' }).errors).toHaveLength(1);
    expect(parseConfigLayer({ protectedBranches: [1] }).errors).toHaveLength(1);
  });

  it('validates suggestion rules one by one', () => {
    const { layer, errors } = parseConfigLayer({
      suggestionRules: [
        { glob: 'docs/**', type: 'docs' },
        { glob: 'src/api/**', scope: 'api' },
        { glob: 'x/**' },
        { type: 'fix' },
      ],
    });
    expect(layer.suggestionRules).toEqual([
      { glob: 'docs/**', type: 'docs' },
      { glob: 'src/api/**', scope: 'api' },
    ]);
    expect(errors).toHaveLength(2);
  });

  it('accepts a boolean aiDraft only', () => {
    expect(parseConfigLayer({ aiDraft: true }).layer).toEqual({ aiDraft: true });
    expect(parseConfigLayer({ aiDraft: 'yes' }).errors).toHaveLength(1);
  });

  it('defaults protect main and master, and keep AI off', () => {
    expect(DEFAULT_CONFIG.protectedBranches).toEqual(['main', 'master']);
    expect(DEFAULT_CONFIG.aiDraft).toBe(false);
  });
});

describe('parseConfigLayer (workflow options)', () => {
  it('accepts a tracker preset with an http(s) base URL', () => {
    expect(
      parseConfigLayer({ issueTracker: { preset: 'jira', baseUrl: 'https://acme.atlassian.net' } })
        .layer.issueTracker,
    ).toEqual({ preset: 'jira', baseUrl: 'https://acme.atlassian.net' });
    expect(parseConfigLayer({ issueTracker: { preset: 'github' } }).layer.issueTracker).toEqual({
      preset: 'github',
    });
  });

  it('rejects unknown presets and non http base URLs', () => {
    expect(parseConfigLayer({ issueTracker: { preset: 'trello' } }).errors).toHaveLength(1);
    expect(parseConfigLayer({ issueTracker: 'jira' }).errors).toHaveLength(1);
    expect(
      parseConfigLayer({ issueTracker: { preset: 'jira', baseUrl: 'ftp://x' } }).errors,
    ).toHaveLength(1);
  });

  it('requires an http(s) issueUrlTemplate with {id}', () => {
    expect(
      parseConfigLayer({ issueUrlTemplate: 'https://t.example/{id}' }).layer.issueUrlTemplate,
    ).toBe('https://t.example/{id}');
    expect(parseConfigLayer({ issueUrlTemplate: 'https://t.example/' }).errors).toHaveLength(1);
    expect(parseConfigLayer({ issueUrlTemplate: 'javascript:{id}' }).errors).toHaveLength(1);
  });

  it('requires {slug} in a branch pattern and a non-empty PR template', () => {
    expect(parseConfigLayer({ branchPattern: '{type}/{slug}' }).layer.branchPattern).toBe(
      '{type}/{slug}',
    );
    expect(parseConfigLayer({ branchPattern: '{type}' }).errors).toHaveLength(1);
    expect(parseConfigLayer({ prTemplate: '{{changes}}' }).layer.prTemplate).toBe('{{changes}}');
    expect(parseConfigLayer({ prTemplate: ' ' }).errors).toHaveLength(1);
  });
});

describe('resolveConfig', () => {
  it('returns the defaults when no layer defines anything', () => {
    expect(resolveConfig([{}, {}])).toEqual({ config: DEFAULT_CONFIG, errors: [] });
  });

  it('applies precedence: later layers override earlier ones, field by field', () => {
    const { config } = resolveConfig([
      { emojis: true, titleMaxLength: 100, titleWarningLength: 60 },
      { emojis: false, titleMaxLength: 80 },
    ]);
    expect(config.emojis).toBe(false);
    expect(config.titleMaxLength).toBe(80);
    expect(config.titleWarningLength).toBe(60);
  });

  it('replaces the type list wholesale rather than merging it', () => {
    const { config } = resolveConfig([{ types: [{ name: 'a', description: '' }] }]);
    expect(config.types).toEqual([{ name: 'a', description: '' }]);
  });

  it('merges scopes by name, higher layer winning, sorted', () => {
    const { config } = resolveConfig([
      {
        scopes: [
          { name: 'web', description: 'old' },
          { name: 'core', description: 'Core' },
        ],
      },
      {
        scopes: [
          { name: 'web', description: 'new' },
          { name: 'api', description: 'API' },
        ],
      },
    ]);
    expect(config.scopes).toEqual([
      { name: 'api', description: 'API' },
      { name: 'core', description: 'Core' },
      { name: 'web', description: 'new' },
    ]);
  });

  it('lets a higher layer override the issue template', () => {
    const { config } = resolveConfig([{ issueTemplate: 'a' }, { issueTemplate: 'b' }]);
    expect(config.issueTemplate).toBe('b');
  });

  it('falls back to default thresholds and reports when warning exceeds maximum', () => {
    const { config, errors } = resolveConfig([{ titleWarningLength: 90, titleMaxLength: 60 }]);
    expect([config.titleWarningLength, config.titleMaxLength]).toEqual([50, 72]);
    expect(errors).toHaveLength(1);
  });
});
