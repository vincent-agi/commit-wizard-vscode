import { matchesAnyGlob } from './glob';

/** Files never sent to a language model: lockfiles, build output, source maps, minified code. */
export const DEFAULT_AI_EXCLUDES: readonly string[] = [
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/*.lock',
  '**/*.min.js',
  '**/*.map',
  'dist/**',
  'out/**',
];

export interface FilteredDiff {
  /** The diff text that would be sent. */
  text: string;
  /** Paths whose changes are (at least partly) in `text`. */
  files: string[];
  /** Paths removed because they are lockfiles, generated or binary. */
  excluded: string[];
  /** Whether `text` was cut, or files dropped, to respect `maxChars`. */
  truncated: boolean;
}

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/m;
const BINARY = /^(Binary files .* differ|GIT binary patch)$/m;
const TRUNCATION_MARK = '\n[diff truncated]\n';

function splitByFile(diff: string): { path: string; section: string }[] {
  const sections = diff.split(/^(?=diff --git )/m).filter((section) => section.trim());
  return sections.map((section) => ({
    path: section.match(FILE_HEADER)?.[2] ?? '(unknown)',
    section,
  }));
}

/**
 * Prepares a staged diff for a language model: drops lockfiles, generated and binary files, and
 * cuts it to `maxChars`, so the user can be told exactly what leaves their machine.
 */
export function filterDiff(
  diff: string,
  options: { maxChars: number; excludeGlobs?: readonly string[] },
): FilteredDiff {
  const globs = options.excludeGlobs ?? DEFAULT_AI_EXCLUDES;
  const excluded: string[] = [];
  const kept: { path: string; section: string }[] = [];

  for (const entry of splitByFile(diff)) {
    if (matchesAnyGlob(entry.path, globs) || BINARY.test(entry.section)) {
      excluded.push(entry.path);
    } else {
      kept.push(entry);
    }
  }

  const files: string[] = [];
  let text = '';
  let truncated = false;

  for (const entry of kept) {
    const remaining = options.maxChars - text.length;
    if (remaining <= TRUNCATION_MARK.length) {
      truncated = true;
      break;
    }
    if (entry.section.length > remaining) {
      text += entry.section.slice(0, remaining - TRUNCATION_MARK.length) + TRUNCATION_MARK;
      files.push(entry.path);
      truncated = true;
      break;
    }
    text += entry.section;
    files.push(entry.path);
  }

  return { text, files, excluded, truncated };
}

/** The fields a language model fills in for the Commit Builder. */
export interface DraftFields {
  type?: string;
  scope?: string;
  description: string;
  body?: string;
}

/** Builds the prompt asking the model for a JSON commit draft. */
export function buildDraftPrompt(input: {
  diff: string;
  types: readonly { name: string; description: string }[];
  scopes: readonly string[];
}): string {
  const types = input.types
    .map((type) => `- ${type.name}${type.description ? `: ${type.description}` : ''}`)
    .join('\n');
  const scopes = input.scopes.length > 0 ? input.scopes.join(', ') : '(none, omit the scope)';

  return `You write Conventional Commits messages.
Read the staged git diff and answer with ONE JSON object and nothing else:
{"type": string, "scope": string or null, "description": string, "body": string or null}

Rules:
- "type" must be one of:
${types}
- "scope" must be one of: ${scopes}. Use null when none fits.
- "description": imperative mood, lowercase, no trailing period, at most 60 characters.
- "body": optional, explains why the change was made, wrapped at 72 columns; null if the description is enough.
- Describe only what the diff shows. Do not invent issue numbers.

Staged diff:
${input.diff}`;
}

/**
 * Parses a model answer into draft fields. The JSON may be wrapped in prose or code fences.
 * A `type` or `scope` outside the configuration is dropped rather than rejected.
 */
export function parseDraft(
  answer: string,
  allowed: { types: readonly string[]; scopes: readonly string[] },
): { ok: true; draft: DraftFields } | { ok: false; reason: string } {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { ok: false, reason: 'The model did not return a JSON object.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return { ok: false, reason: 'The model returned invalid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'The model did not return a JSON object.' };
  }

  const fields = raw as Record<string, unknown>;
  const description =
    typeof fields.description === 'string'
      ? fields.description.split('\n')[0].trim().replace(/\.$/, '')
      : '';
  if (!description) {
    return { ok: false, reason: 'The model returned no description.' };
  }

  const type = typeof fields.type === 'string' ? fields.type.trim() : '';
  const scope = typeof fields.scope === 'string' ? fields.scope.trim() : '';
  const body = typeof fields.body === 'string' ? fields.body.trim() : '';

  return {
    ok: true,
    draft: {
      description,
      ...(allowed.types.includes(type) ? { type } : {}),
      ...(allowed.scopes.includes(scope) ? { scope } : {}),
      ...(body ? { body } : {}),
    },
  };
}
