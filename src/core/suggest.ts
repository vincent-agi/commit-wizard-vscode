import { globToRegExp } from './glob';

/** A team-defined mapping from changed paths to a suggested type and/or scope. */
export interface SuggestionRule {
  glob: string;
  type?: string;
  scope?: string;
}

export interface Suggestion {
  type?: string;
  scope?: string;
}

interface Candidate {
  type?: string;
  scope?: string;
}

const BUILTIN_TYPE_RULES: readonly { test: RegExp; type: string }[] = [
  { test: /^\.github\/workflows\//, type: 'ci' },
  { test: /^(\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.ya?ml)/, type: 'ci' },
  { test: /\.(spec|test)\.[cm]?[jt]sx?$/, type: 'test' },
  { test: /(^|\/)(__tests__|tests?)\//, type: 'test' },
  { test: /^docs\//, type: 'docs' },
  { test: /\.(md|mdx|rst|adoc)$/i, type: 'docs' },
  {
    test: /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|esbuild\.js|webpack\.config\.[cm]?js|vite\.config\.[cm]?[jt]s)$/,
    type: 'build',
  },
];

const SOURCE_SCOPE = /^src\/([^/]+)\//;

function candidateFor(path: string, rules: readonly SuggestionRule[]): Candidate {
  const rule = rules.find((entry) => globToRegExp(entry.glob).test(path));
  if (rule) {
    return { type: rule.type, scope: rule.scope };
  }
  return {
    type: BUILTIN_TYPE_RULES.find((entry) => entry.test.test(path))?.type,
    scope: path.match(SOURCE_SCOPE)?.[1],
  };
}

/** Returns the common value when every candidate has the same defined one. */
function unanimous(values: (string | undefined)[]): string | undefined {
  const first = values[0];
  return first !== undefined && values.every((value) => value === first) ? first : undefined;
}

/**
 * Suggests a commit type and scope from the staged paths, deterministically and offline.
 *
 * Team `rules` win over the built-in heuristics (docs, tests, CI, build files; the folder under
 * `src/` as scope). A value is only suggested when **every** staged file agrees on it, so mixed
 * changes yield no suggestion, and only when it exists in the current configuration.
 *
 * @param paths - Staged paths, relative to the repository root, with `/` separators.
 * @returns `undefined` when there is nothing reliable to suggest.
 */
export function suggestFromPaths(
  paths: readonly string[],
  options: {
    types: readonly string[];
    scopes: readonly string[];
    rules?: readonly SuggestionRule[];
  },
): Suggestion | undefined {
  if (paths.length === 0) {
    return undefined;
  }

  const candidates = paths.map((path) => candidateFor(path, options.rules ?? []));
  const type = unanimous(candidates.map((candidate) => candidate.type));
  const scope = unanimous(candidates.map((candidate) => candidate.scope));

  const suggestion: Suggestion = {
    ...(type && options.types.includes(type) ? { type } : {}),
    ...(scope && options.scopes.includes(scope) ? { scope } : {}),
  };
  return suggestion.type || suggestion.scope ? suggestion : undefined;
}
