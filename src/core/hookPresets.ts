export type HookManager = 'husky' | 'lefthook';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';
export type GitHookName = 'pre-commit' | 'pre-push' | 'commit-msg';

/** What the generator needs to know about the target project. */
export interface ProjectInfo {
  packageManager: PackageManager;
  /** `scripts` of the project's `package.json`; empty when there is none. */
  scripts: Readonly<Record<string, string>>;
}

/** Commit conventions the `commit-msg` preset must enforce. */
export interface CommitRules {
  types: readonly string[];
}

interface ScriptContext {
  /** Shell command running the project script `name`, e.g. `npm run lint`. */
  runScript(name: string): string;
  /** Shell prefix executing a locally installed binary, e.g. `npx --no --`. */
  exec: string;
  /** How the manager exposes the commit message file path (`"$1"` / `{1}`). */
  messageFile: string;
}

/** A selectable check, rendered as shell for the hook it belongs to. */
export interface HookPreset {
  id: string;
  label: string;
  description: string;
  hook: GitHookName;
  /** Returns why the preset cannot be offered for this project, or `undefined` when it can. */
  unavailableReason?(project: ProjectInfo): string | undefined;
  /** POSIX shell, safe under `set -e`; a failing check must exit non-zero. */
  script(context: ScriptContext): string;
}

/** A file the installer would write, relative to the workspace root. */
export interface PlannedFile {
  path: string;
  content: string;
  /** Whether the file should get the executable bit. */
  executable: boolean;
}

export interface HookPlan {
  files: PlannedFile[];
  /** Command that installs the dependencies and activates the hooks. */
  installCommand: string;
}

/**
 * Header pattern of Commit Wizard messages: an optional emoji, then `type(scope)!: subject`.
 * Source of the regular expression (use the `u` flag), shared with the generated commitlint
 * config so Gitmoji-prefixed messages are accepted.
 */
export const COMMIT_HEADER_PATTERN =
  '^(?:\\p{Extended_Pictographic}\\S*\\s+)?([A-Za-z][\\w-]*)(?:\\(([^)]*)\\))?(!)?:\\s(.*)$';

const requireScript =
  (script: string) =>
  (project: ProjectInfo): string | undefined =>
    project.scripts[script] ? undefined : `needs a "${script}" script in package.json`;

const requireAnyScript =
  (...candidates: string[]) =>
  (project: ProjectInfo): string | undefined =>
    candidates.some((name) => project.scripts[name])
      ? undefined
      : `needs a ${candidates.map((name) => `"${name}"`).join(' or ')} script in package.json`;

/** Every preset the installer can offer, in display order. */
export const HOOK_PRESETS: readonly HookPreset[] = [
  {
    id: 'lint',
    label: 'Lint',
    description: 'Run the "lint" script before each commit.',
    hook: 'pre-commit',
    unavailableReason: requireScript('lint'),
    script: ({ runScript }) => runScript('lint'),
  },
  {
    id: 'format',
    label: 'Format check',
    description: 'Run the "format:check" script before each commit.',
    hook: 'pre-commit',
    unavailableReason: requireScript('format:check'),
    script: ({ runScript }) => runScript('format:check'),
  },
  {
    id: 'typecheck',
    label: 'Type-check',
    description: 'Run the "typecheck" script before each commit.',
    hook: 'pre-commit',
    unavailableReason: requireScript('typecheck'),
    script: ({ runScript }) => runScript('typecheck'),
  },
  {
    id: 'no-debug',
    label: 'No debug statements',
    description: 'Block staged console.log / debugger statements in JS and TS files.',
    hook: 'pre-commit',
    script:
      () => `if git diff --cached -U0 -- '*.js' '*.jsx' '*.ts' '*.tsx' | grep -v '^+++' | grep -E '^\\+.*(console\\.log|debugger)' > /dev/null; then
  echo "Commit blocked: remove console.log / debugger statements from the staged changes." >&2
  exit 1
fi`,
  },
  {
    id: 'secrets',
    label: 'Secret scan',
    description: 'Block staged private keys and well-known access-token patterns.',
    hook: 'pre-commit',
    script:
      () => `if git diff --cached -U0 | grep -E '^\\+.*(AKIA[0-9A-Z]{16}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})' > /dev/null; then
  echo "Commit blocked: the staged changes look like they contain a secret." >&2
  exit 1
fi`,
  },
  {
    id: 'large-files',
    label: 'Large file guard',
    description: 'Block staged files larger than 1 MB.',
    hook: 'pre-commit',
    script:
      () => `large=$(git diff --cached --name-only --diff-filter=ACM | while IFS= read -r file; do
  if [ -f "$file" ] && [ "$(wc -c < "$file")" -gt 1048576 ]; then echo "$file"; fi
done)
if [ -n "$large" ]; then
  echo "Commit blocked: files larger than 1 MB are staged:" >&2
  echo "$large" >&2
  exit 1
fi`,
  },
  {
    id: 'protected-branch',
    label: 'Protected branches',
    description: 'Block direct commits on main and master.',
    hook: 'pre-commit',
    script: () => `branch=$(git symbolic-ref --short HEAD 2>/dev/null || true)
case "$branch" in
  main|master)
    echo "Commit blocked: direct commits to '$branch' are not allowed. Create a branch first." >&2
    exit 1
    ;;
esac`,
  },
  {
    id: 'test',
    label: 'Tests',
    description: 'Run the "test" script before each push.',
    hook: 'pre-push',
    unavailableReason: requireScript('test'),
    script: ({ runScript }) => runScript('test'),
  },
  {
    id: 'build',
    label: 'Build',
    description: 'Run the "compile" or "build" script before each push.',
    hook: 'pre-push',
    unavailableReason: requireAnyScript('compile', 'build'),
    script: ({ runScript }) => runScript('compile'),
  },
  {
    id: 'conventional-commit',
    label: 'Conventional Commits',
    description: 'Validate the message with commitlint (Gitmoji prefix accepted).',
    hook: 'commit-msg',
    script: ({ exec, messageFile }) => `${exec} commitlint --edit ${messageFile}`,
  },
];

/** Presets with their availability for `project`, in display order. */
export function listPresets(
  project: ProjectInfo,
): { preset: HookPreset; unavailableReason?: string }[] {
  return HOOK_PRESETS.map((preset) => ({
    preset,
    unavailableReason: preset.unavailableReason?.(project),
  }));
}

function runScriptFor(packageManager: PackageManager): (name: string) => string {
  return (name) => (packageManager === 'yarn' ? `yarn ${name}` : `${packageManager} run ${name}`);
}

const EXEC_PREFIX: Record<PackageManager, string> = {
  npm: 'npx --no --',
  pnpm: 'pnpm exec',
  yarn: 'yarn',
};

const ADD_DEV: Record<PackageManager, string> = {
  npm: 'npm install -D',
  pnpm: 'pnpm add -D',
  yarn: 'yarn add -D',
};

function contextFor(manager: HookManager, project: ProjectInfo): ScriptContext {
  return {
    runScript: runScriptFor(project.packageManager),
    exec: EXEC_PREFIX[project.packageManager],
    messageFile: manager === 'husky' ? '"$1"' : '{1}',
  };
}

function commitlintConfig(rules: CommitRules): string {
  return `// Generated by Commit Wizard. Accepts an optional leading emoji (Gitmoji) before the type.
module.exports = {
  parserPreset: {
    parserOpts: {
      headerPattern: /${COMMIT_HEADER_PATTERN}/u,
      headerCorrespondence: ['type', 'scope', 'breaking', 'subject'],
    },
  },
  rules: {
    'type-empty': [2, 'never'],
    'type-enum': [2, 'always', ${JSON.stringify(rules.types)}],
    'subject-empty': [2, 'never'],
  },
};
`;
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

const HOOK_ORDER: GitHookName[] = ['pre-commit', 'commit-msg', 'pre-push'];

/**
 * Builds the files that install the chosen presets with the chosen hook manager. Pure: nothing
 * is written here.
 *
 * Unknown ids, and presets unavailable for `project`, are ignored. Husky gets one script per
 * hook under `.husky/`; lefthook gets a single `lefthook.yml`. A `commitlint.config.cjs` is
 * added when the Conventional Commits preset is selected.
 *
 * @param options.presetIds - Ids of the presets to install.
 */
export function planHooks(options: {
  manager: HookManager;
  presetIds: readonly string[];
  project: ProjectInfo;
  rules: CommitRules;
}): HookPlan {
  const { manager, project, rules } = options;
  const context = contextFor(manager, project);
  const selected = listPresets(project)
    .filter(
      ({ preset, unavailableReason }) =>
        !unavailableReason && options.presetIds.includes(preset.id),
    )
    .map(({ preset }) => preset);

  const hooks = HOOK_ORDER.map((hook) => ({
    hook,
    presets: selected.filter((preset) => preset.hook === hook),
  })).filter(({ presets }) => presets.length > 0);

  const files: PlannedFile[] = [];
  const packages: string[] = [];

  if (manager === 'husky') {
    for (const { hook, presets } of hooks) {
      const sections = presets.map((preset) => `# ${preset.label}\n${preset.script(context)}`);
      files.push({
        path: `.husky/${hook}`,
        content: `#!/usr/bin/env sh\nset -e\n\n${sections.join('\n\n')}\n`,
        executable: true,
      });
    }
    packages.push('husky');
  } else {
    const lines = ['# Generated by Commit Wizard. See https://lefthook.dev/configuration/'];
    for (const { hook, presets } of hooks) {
      lines.push('', `${hook}:`, '  commands:');
      for (const preset of presets) {
        lines.push(`    ${preset.id}:`, '      run: |', '        set -e');
        lines.push(indent(preset.script(context), 8));
      }
    }
    files.push({ path: 'lefthook.yml', content: `${lines.join('\n')}\n`, executable: false });
    packages.push('lefthook');
  }

  if (selected.some((preset) => preset.id === 'conventional-commit')) {
    files.push({
      path: 'commitlint.config.cjs',
      content: commitlintConfig(rules),
      executable: false,
    });
    packages.push('@commitlint/cli');
  }

  const install = `${ADD_DEV[project.packageManager]} ${packages.join(' ')}`;
  const activate =
    manager === 'husky'
      ? `npm pkg set scripts.prepare=husky && ${EXEC_PREFIX[project.packageManager]} husky`
      : `${EXEC_PREFIX[project.packageManager]} lefthook install`;

  return { files, installCommand: `${install} && ${activate}` };
}
