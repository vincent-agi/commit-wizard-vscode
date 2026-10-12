import { COMMIT_TYPE_DESCRIPTIONS } from './types';
import { ISSUE_TRACKER_PRESETS } from './issueTracker';
import type { IssueTrackerConfig, IssueTrackerPreset } from './issueTracker';
import type { SuggestionRule } from './suggest';
import type { DefaultCommitType, Scope } from './types';
import { t } from '../i18n';

/** A commit type offered in the Type dropdown. */
export interface CommitTypeConfig {
  name: string;
  description: string;
  /** Gitmoji suggested when this type is picked. Never forced: the user can still change it. */
  emoji?: string;
}

/** The fully resolved configuration the commit builder works from. */
export interface CommitConfig {
  types: CommitTypeConfig[];
  scopes: Scope[];
  /** When `false`, the Gitmoji dropdown is hidden and messages carry no emoji prefix. */
  emojis: boolean;
  titleWarningLength: number;
  titleMaxLength: number;
  /** Custom regular expression source used to detect an issue in the branch name. */
  issuePattern?: string;
  /**
   * Markdown template for issues created from the "new issue" form, with `{{context}}`-style
   * placeholders. Absent: the standard layout is used.
   */
  issueTemplate?: string;
  /** Where the emoji goes in the header; `after` keeps the type first (Release Please). */
  emojiPosition: 'before' | 'after';
  /** Issue tracker preset providing branch detection and links. */
  issueTracker?: IssueTrackerConfig;
  /** URL with an `{id}` placeholder linking a reference to its ticket. */
  issueUrlTemplate?: string;
  /** Pattern of the "New Branch" command: `{type}`, `{issue}` and `{slug}` placeholders. */
  branchPattern?: string;
  /** Markdown template for generated pull request descriptions. */
  prTemplate?: string;
  /** Branch names or globs where committing asks for confirmation. */
  protectedBranches: string[];
  /** Team rules mapping changed paths to a suggested type/scope; first match wins. */
  suggestionRules: SuggestionRule[];
  /** Whether the "Draft with AI" button is offered. Personal: never read from the team file. */
  aiDraft: boolean;
}

/** One source of configuration (VS Code settings or the repository file); every field optional. */
export type ConfigLayer = Partial<CommitConfig>;

const DEFAULT_TYPE_ORDER: DefaultCommitType[] = [
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
];

/** Built-in configuration, used for every field no layer defines. */
export const DEFAULT_CONFIG: CommitConfig = {
  types: DEFAULT_TYPE_ORDER.map((name) => ({
    name,
    description: COMMIT_TYPE_DESCRIPTIONS[name],
  })),
  scopes: [],
  emojis: true,
  emojiPosition: 'before',
  titleWarningLength: 50,
  titleMaxLength: 72,
  protectedBranches: ['main', 'master'],
  suggestionRules: [],
  aiDraft: false,
};

const TYPE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseTypes(raw: unknown, errors: string[]): CommitTypeConfig[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(t('config.err.typesArray'));
    return undefined;
  }

  const types: CommitTypeConfig[] = [];
  raw.forEach((item, index) => {
    const name = isRecord(item) ? nonEmptyString(item.name) : undefined;
    if (!name) {
      errors.push(t('config.err.typeNameRequired', index));
      return;
    }
    if (!TYPE_NAME.test(name)) {
      errors.push(t('config.err.typeNameInvalid', index, name));
      return;
    }
    if (types.some((type) => type.name === name)) {
      errors.push(t('config.err.typeDuplicate', index, name));
      return;
    }
    const record = item as Record<string, unknown>;
    const emoji = nonEmptyString(record.emoji);
    types.push({
      name,
      description: typeof record.description === 'string' ? record.description.trim() : '',
      ...(emoji ? { emoji } : {}),
    });
  });

  return types.length > 0 ? types : undefined;
}

function parseScopes(raw: unknown, errors: string[]): Scope[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(t('config.err.scopesArray'));
    return undefined;
  }

  const scopes: Scope[] = [];
  raw.forEach((item, index) => {
    const name = isRecord(item) ? nonEmptyString(item.name) : undefined;
    const description = isRecord(item) ? nonEmptyString(item.description) : undefined;
    if (!name || !description) {
      errors.push(t('config.err.scopeFields', index));
      return;
    }
    if (!scopes.some((scope) => scope.name === name)) {
      scopes.push({ name, description });
    }
  });

  return scopes.length > 0 ? scopes : undefined;
}

function parseLength(raw: unknown, key: string, errors: string[]): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    errors.push(t('config.err.positiveInt', key));
    return undefined;
  }
  return raw;
}

/**
 * Validates one raw configuration object (the parsed `.commit-wizard.json`, or values read from
 * VS Code settings) into a {@link ConfigLayer}. Each invalid field is dropped on its own and
 * reported in `errors`; valid fields still apply. Unknown keys (including `$schema`) are ignored.
 * An empty `types` or `scopes` array counts as "not configured".
 *
 * @param raw - The parsed JSON value.
 */
export function parseConfigLayer(raw: unknown): { layer: ConfigLayer; errors: string[] } {
  const errors: string[] = [];
  const layer: ConfigLayer = {};

  if (!isRecord(raw)) {
    return { layer, errors: [t('config.err.notObject')] };
  }

  if (Array.isArray(raw.types) && raw.types.length === 0) {
    // Explicitly empty: behave as unset.
  } else if (raw.types !== undefined) {
    const types = parseTypes(raw.types, errors);
    if (types) {
      layer.types = types;
    }
  }

  if (Array.isArray(raw.scopes) && raw.scopes.length === 0) {
    // Explicitly empty: behave as unset.
  } else if (raw.scopes !== undefined) {
    const scopes = parseScopes(raw.scopes, errors);
    if (scopes) {
      layer.scopes = scopes;
    }
  }

  if (raw.emojis !== undefined) {
    if (typeof raw.emojis === 'boolean') {
      layer.emojis = raw.emojis;
    } else {
      errors.push(t('config.err.emojisBool'));
    }
  }

  if (raw.emojiPosition !== undefined) {
    if (raw.emojiPosition === 'before' || raw.emojiPosition === 'after') {
      layer.emojiPosition = raw.emojiPosition;
    } else {
      errors.push(t('config.err.emojiPosition'));
    }
  }

  for (const key of ['titleWarningLength', 'titleMaxLength'] as const) {
    if (raw[key] !== undefined) {
      const value = parseLength(raw[key], key, errors);
      if (value !== undefined) {
        layer[key] = value;
      }
    }
  }

  if (raw.issuePattern !== undefined) {
    const pattern = nonEmptyString(raw.issuePattern);
    if (!pattern) {
      errors.push(t('config.err.issuePatternEmpty'));
    } else {
      try {
        new RegExp(pattern);
        layer.issuePattern = pattern;
      } catch {
        errors.push(t('config.err.issuePatternRegex', pattern));
      }
    }
  }

  if (raw.protectedBranches !== undefined) {
    if (
      Array.isArray(raw.protectedBranches) &&
      raw.protectedBranches.every((entry) => typeof entry === 'string')
    ) {
      // An explicit empty list is meaningful: it turns the protection off.
      layer.protectedBranches = raw.protectedBranches
        .map((entry: string) => entry.trim())
        .filter(Boolean);
    } else {
      errors.push(t('config.err.protectedBranches'));
    }
  }

  if (raw.suggestionRules !== undefined) {
    if (!Array.isArray(raw.suggestionRules)) {
      errors.push(t('config.err.suggestionRulesArray'));
    } else {
      const rules: SuggestionRule[] = [];
      raw.suggestionRules.forEach((item, index) => {
        const glob = isRecord(item) ? nonEmptyString(item.glob) : undefined;
        const type = isRecord(item) ? nonEmptyString(item.type) : undefined;
        const scope = isRecord(item) ? nonEmptyString(item.scope) : undefined;
        if (!glob || (!type && !scope)) {
          errors.push(t('config.err.suggestionRule', index));
          return;
        }
        rules.push({ glob, ...(type ? { type } : {}), ...(scope ? { scope } : {}) });
      });
      if (rules.length > 0) {
        layer.suggestionRules = rules;
      }
    }
  }

  if (raw.issueTracker !== undefined) {
    const tracker = raw.issueTracker;
    const preset = isRecord(tracker) ? tracker.preset : undefined;
    const baseUrl = isRecord(tracker) ? nonEmptyString(tracker.baseUrl) : undefined;
    if (
      typeof preset !== 'string' ||
      !ISSUE_TRACKER_PRESETS.includes(preset as IssueTrackerPreset)
    ) {
      errors.push(t('config.err.trackerPreset', ISSUE_TRACKER_PRESETS.join(', ')));
    } else if (baseUrl !== undefined && !/^https?:\/\//i.test(baseUrl)) {
      errors.push(t('config.err.trackerBaseUrl'));
    } else {
      layer.issueTracker = {
        preset: preset as IssueTrackerPreset,
        ...(baseUrl ? { baseUrl } : {}),
      };
    }
  }

  if (raw.issueUrlTemplate !== undefined) {
    const template = nonEmptyString(raw.issueUrlTemplate);
    if (template && /^https?:\/\//i.test(template) && template.includes('{id}')) {
      layer.issueUrlTemplate = template;
    } else {
      errors.push(t('config.err.issueUrlTemplate'));
    }
  }

  if (raw.branchPattern !== undefined) {
    const pattern = nonEmptyString(raw.branchPattern);
    if (pattern && pattern.includes('{slug}')) {
      layer.branchPattern = pattern;
    } else {
      errors.push(t('config.err.branchPattern'));
    }
  }

  if (raw.prTemplate !== undefined) {
    const template = nonEmptyString(raw.prTemplate);
    if (template) {
      layer.prTemplate = template;
    } else {
      errors.push(t('config.err.prTemplate'));
    }
  }

  if (raw.aiDraft !== undefined) {
    if (typeof raw.aiDraft === 'boolean') {
      layer.aiDraft = raw.aiDraft;
    } else {
      errors.push(t('config.err.aiDraft'));
    }
  }

  if (raw.issueTemplate !== undefined) {
    const template = nonEmptyString(raw.issueTemplate);
    if (template) {
      layer.issueTemplate = template;
    } else {
      errors.push(t('config.err.issueTemplate'));
    }
  }

  return { layer, errors };
}

/**
 * Merges configuration layers, lowest precedence first (typically `[settings, teamFile]`), over
 * {@link DEFAULT_CONFIG}. A field defined by a higher layer replaces lower ones, except `scopes`
 * which are merged by name (higher layer wins on a name clash) so scopes added from the UI
 * remain visible next to the team's shared ones.
 *
 * If the merged title thresholds are inconsistent (warning above maximum), both fall back to
 * the defaults and a message is added to `errors`.
 *
 * @param layers - Layers ordered from lowest to highest precedence.
 */
export function resolveConfig(layers: readonly ConfigLayer[]): {
  config: CommitConfig;
  errors: string[];
} {
  const errors: string[] = [];
  const config: CommitConfig = { ...DEFAULT_CONFIG };
  const scopesByName = new Map<string, Scope>();

  for (const layer of layers) {
    if (layer.types) {
      config.types = layer.types;
    }
    for (const scope of layer.scopes ?? []) {
      scopesByName.set(scope.name, scope);
    }
    if (layer.emojis !== undefined) {
      config.emojis = layer.emojis;
    }
    if (layer.emojiPosition !== undefined) {
      config.emojiPosition = layer.emojiPosition;
    }
    if (layer.titleWarningLength !== undefined) {
      config.titleWarningLength = layer.titleWarningLength;
    }
    if (layer.titleMaxLength !== undefined) {
      config.titleMaxLength = layer.titleMaxLength;
    }
    if (layer.issuePattern !== undefined) {
      config.issuePattern = layer.issuePattern;
    }
    if (layer.issueTemplate !== undefined) {
      config.issueTemplate = layer.issueTemplate;
    }
    if (layer.protectedBranches !== undefined) {
      config.protectedBranches = layer.protectedBranches;
    }
    if (layer.suggestionRules !== undefined) {
      config.suggestionRules = layer.suggestionRules;
    }
    if (layer.aiDraft !== undefined) {
      config.aiDraft = layer.aiDraft;
    }
    if (layer.issueTracker !== undefined) {
      config.issueTracker = layer.issueTracker;
    }
    if (layer.issueUrlTemplate !== undefined) {
      config.issueUrlTemplate = layer.issueUrlTemplate;
    }
    if (layer.branchPattern !== undefined) {
      config.branchPattern = layer.branchPattern;
    }
    if (layer.prTemplate !== undefined) {
      config.prTemplate = layer.prTemplate;
    }
  }

  config.scopes = [...scopesByName.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (config.titleWarningLength > config.titleMaxLength) {
    errors.push(t('config.err.thresholds', config.titleWarningLength, config.titleMaxLength));
    config.titleWarningLength = DEFAULT_CONFIG.titleWarningLength;
    config.titleMaxLength = DEFAULT_CONFIG.titleMaxLength;
  }

  return { config, errors };
}
