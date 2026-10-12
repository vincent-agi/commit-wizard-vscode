import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMMIT_HEADER_PATTERN, listPresets, planHooks } from './hookPresets';
import type { ProjectInfo } from './hookPresets';

const project: ProjectInfo = {
  packageManager: 'npm',
  scripts: { lint: 'eslint .', test: 'vitest run', compile: 'tsc' },
};
const rules = { types: ['feat', 'fix'] };

describe('listPresets', () => {
  it('flags script-based presets as unavailable when the script is missing', () => {
    const byId = Object.fromEntries(
      listPresets({ packageManager: 'npm', scripts: {} }).map((p) => [p.preset.id, p]),
    );
    expect(byId.lint.unavailableReason).toContain('"lint"');
    expect(byId.test.unavailableReason).toContain('"test"');
    expect(byId.build.unavailableReason).toContain('"compile" or "build"');
    expect(byId.secrets.unavailableReason).toBeUndefined();
    expect(byId['conventional-commit'].unavailableReason).toBeUndefined();
  });

  it('offers script-based presets when the scripts exist', () => {
    const unavailable = listPresets(project)
      .filter((p) => p.unavailableReason)
      .map((p) => p.preset.id);
    expect(unavailable).toEqual(['format', 'typecheck']);
  });
});

describe('planHooks (husky)', () => {
  const plan = planHooks({
    manager: 'husky',
    presetIds: ['lint', 'secrets', 'test', 'conventional-commit', 'format'],
    project,
    rules,
  });

  it('writes one executable script per hook, skipping unavailable presets', () => {
    expect(plan.files.map((f) => f.path)).toEqual([
      '.husky/pre-commit',
      '.husky/commit-msg',
      '.husky/pre-push',
      'commitlint.config.cjs',
    ]);
    const preCommit = plan.files[0];
    expect(preCommit.executable).toBe(true);
    expect(preCommit.content.startsWith('#!/usr/bin/env sh\nset -e\n')).toBe(true);
    expect(preCommit.content).toContain('npm run lint');
    expect(preCommit.content).not.toContain('format:check');
  });

  it('passes the commit message file to commitlint', () => {
    expect(plan.files[1].content).toContain('npx --no -- commitlint --edit "$1"');
  });

  it('builds an install command covering husky and commitlint', () => {
    expect(plan.installCommand).toBe(
      'npm install -D husky @commitlint/cli && npm pkg set scripts.prepare=husky && npx --no -- husky',
    );
  });
});

describe('planHooks (lefthook)', () => {
  it('writes a single lefthook.yml with one command per preset', () => {
    const plan = planHooks({
      manager: 'lefthook',
      presetIds: ['lint', 'conventional-commit'],
      project: { ...project, packageManager: 'pnpm' },
      rules,
    });
    expect(plan.files.map((f) => f.path)).toEqual(['lefthook.yml', 'commitlint.config.cjs']);
    const yaml = plan.files[0].content;
    expect(yaml).toContain(
      'pre-commit:\n  commands:\n    lint:\n      run: |\n        set -e\n        pnpm run lint',
    );
    expect(yaml).toContain('pnpm exec commitlint --edit {1}');
    expect(plan.installCommand).toBe(
      'pnpm add -D lefthook @commitlint/cli && pnpm exec lefthook install',
    );
  });

  it('omits commitlint files when the Conventional Commits preset is not selected', () => {
    const plan = planHooks({ manager: 'lefthook', presetIds: ['secrets'], project, rules });
    expect(plan.files.map((f) => f.path)).toEqual(['lefthook.yml']);
    expect(plan.installCommand).toBe('npm install -D lefthook && npx --no -- lefthook install');
  });

  it('ignores unknown preset ids and returns no hooks for an empty selection', () => {
    const plan = planHooks({ manager: 'husky', presetIds: ['nope'], project, rules });
    expect(plan.files).toEqual([]);
  });
});

describe('commitlint config', () => {
  const config = planHooks({
    manager: 'husky',
    presetIds: ['conventional-commit'],
    project,
    rules: { types: ['feat', 'deps'] },
  }).files.find((f) => f.path === 'commitlint.config.cjs')!.content;

  it('restricts types to the configured ones', () => {
    expect(config).toContain(`'type-enum': [2, 'always', ["feat","deps"]]`);
  });

  it('embeds a header pattern that parses and loads as valid JS', () => {
    expect(() => new Function('module', config)({ exports: {} })).not.toThrow();
  });
});

describe('COMMIT_HEADER_PATTERN', () => {
  const header = new RegExp(COMMIT_HEADER_PATTERN, 'u');

  it.each([
    '✨ feat: add live preview',
    '🐛 fix(webview): handle empty body',
    '⬆️ deps!: bump vscode engine',
    '🧑‍💻 chore(dx): tweak setup',
    'feat: no emoji at all',
  ])('accepts %s', (message) => {
    expect(header.test(message)).toBe(true);
  });

  it.each(['added some stuff', '✨ add live preview', 'feat add colon', '✨ : empty type'])(
    'rejects %s',
    (message) => {
      expect(header.test(message)).toBe(false);
    },
  );
});

describe('generated shell checks', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function repo(branch = 'feature'): string {
    const dir = mkdtempSync(join(tmpdir(), 'cw-hooks-'));
    dirs.push(dir);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init', '-q', '-b', branch);
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'Test');
    git('commit', '-q', '--allow-empty', '-m', 'init');
    return dir;
  }

  function runHook(dir: string, presetId: string): number {
    const plan = planHooks({
      manager: 'husky',
      presetIds: [presetId],
      project,
      rules,
    });
    const script = plan.files.find((f) => f.path === '.husky/pre-commit')!.content;
    const file = join(dir, 'hook.sh');
    writeFileSync(file, script);
    try {
      execFileSync('sh', [file], { cwd: dir, stdio: 'pipe' });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  }

  function stage(dir: string, name: string, content: string): void {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
    execFileSync('git', ['add', name], { cwd: dir });
  }

  it('protected-branch blocks main and allows feature branches', () => {
    expect(runHook(repo('main'), 'protected-branch')).toBe(1);
    expect(runHook(repo('feature'), 'protected-branch')).toBe(0);
  });

  it('secrets blocks a staged private key and allows clean changes', () => {
    const dirty = repo();
    stage(dirty, 'key.txt', '-----BEGIN RSA PRIVATE KEY-----\nabc\n');
    expect(runHook(dirty, 'secrets')).toBe(1);

    const clean = repo();
    stage(clean, 'notes.txt', 'hello\n');
    expect(runHook(clean, 'secrets')).toBe(0);
  });

  it('no-debug blocks a staged console.log in TS but ignores other files', () => {
    const dirty = repo();
    stage(dirty, 'a.ts', 'console.log("x");\n');
    expect(runHook(dirty, 'no-debug')).toBe(1);

    const other = repo();
    stage(other, 'a.md', 'console.log is mentioned here\n');
    expect(runHook(other, 'no-debug')).toBe(0);
  });

  it('large-files blocks a staged file over 1 MB', () => {
    const big = repo();
    stage(big, 'big.bin', 'x'.repeat(1048577));
    expect(runHook(big, 'large-files')).toBe(1);

    const small = repo();
    stage(small, 'small.bin', 'x');
    expect(runHook(small, 'large-files')).toBe(0);
  });
});
