import { chmod } from 'node:fs/promises';
import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import type { Telemetry } from '../telemetry/telemetry';
import { listPresets, planHooks } from '../core/hookPresets';
import type { HookManager, PackageManager, PlannedFile, ProjectInfo } from '../core/hookPresets';
import { t } from '../i18n';
import type { MessageKey } from '../i18n';

export const INSTALL_HOOKS_COMMAND = 'gitmojiCommit.installHooks';

const PROPOSED_SCHEME = 'commit-wizard-proposed';

/** Serves the content a file would get, so VS Code can diff it against the file on disk. */
class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();

  set(path: string, content: string): vscode.Uri {
    this.contents.set(path, content);
    return vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/${path}` });
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path.slice(1)) ?? '';
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

async function detectProject(root: vscode.Uri): Promise<ProjectInfo> {
  let packageManager: PackageManager = 'npm';
  if (await exists(vscode.Uri.joinPath(root, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (await exists(vscode.Uri.joinPath(root, 'yarn.lock'))) {
    packageManager = 'yarn';
  }

  let scripts: Record<string, string> = {};
  const manifest = await readText(vscode.Uri.joinPath(root, 'package.json'));
  if (manifest) {
    try {
      const parsed = JSON.parse(manifest) as { scripts?: Record<string, string> };
      scripts = parsed.scripts ?? {};
    } catch {
      // A broken package.json only means no script-based presets are offered.
    }
  }

  return { packageManager, scripts };
}

/** Warns when the other hook manager already has files in the project. */
async function otherManagerWarning(
  root: vscode.Uri,
  manager: HookManager,
): Promise<string | undefined> {
  const other: HookManager = manager === 'husky' ? 'lefthook' : 'husky';
  const marker = other === 'husky' ? '.husky' : 'lefthook.yml';
  return (await exists(vscode.Uri.joinPath(root, marker)))
    ? t('hooks.otherManager', other)
    : undefined;
}

async function confirmOverwrites(
  root: vscode.Uri,
  files: PlannedFile[],
  proposed: ProposedContentProvider,
): Promise<boolean> {
  const conflicts: PlannedFile[] = [];
  for (const file of files) {
    const current = await readText(vscode.Uri.joinPath(root, file.path));
    if (current !== undefined && current !== file.content) {
      conflicts.push(file);
    }
  }
  if (conflicts.length === 0) {
    return true;
  }

  const names = conflicts.map((file) => file.path).join(', ');
  for (;;) {
    const choice = await vscode.window.showWarningMessage(
      t('hooks.overwrite.ask', names),
      { modal: true },
      t('hooks.showDiff'),
      t('hooks.overwrite'),
    );
    if (choice === t('hooks.overwrite')) {
      return true;
    }
    if (choice !== t('hooks.showDiff')) {
      return false;
    }
    for (const file of conflicts) {
      await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.joinPath(root, file.path),
        proposed.set(file.path, file.content),
        t('hooks.diffTitle', file.path),
        { preview: false },
      );
    }
  }
}

async function writeFiles(root: vscode.Uri, files: PlannedFile[]): Promise<void> {
  for (const file of files) {
    const uri = vscode.Uri.joinPath(root, file.path);
    const parent = vscode.Uri.joinPath(uri, '..');
    await vscode.workspace.fs.createDirectory(parent);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(file.content));
    if (file.executable && uri.scheme === 'file') {
      try {
        await chmod(uri.fsPath, 0o755);
      } catch {
        // Not fatal: managers that source the hook do not need the executable bit.
      }
    }
  }
}

/**
 * "Install Git hooks" command: lets the user pick husky or lefthook and a set of presets,
 * previews overwrites as a diff, writes the config files, and offers to prefill (never run) the
 * dependency install command in a terminal.
 */
export async function installHooks(
  configLoader: ConfigLoader,
  proposed: ProposedContentProvider,
  telemetry: Pick<Telemetry, 'track'>,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage(t('hooks.needFolder'));
    return;
  }
  const root = folder.uri;

  const manager = await vscode.window.showQuickPick(
    [
      { label: 'husky', description: t('hooks.manager.husky'), value: 'husky' },
      { label: 'lefthook', description: t('hooks.manager.lefthook'), value: 'lefthook' },
    ] as const,
    { title: t('hooks.manager.title'), placeHolder: t('hooks.manager.placeholder') },
  );
  if (!manager) {
    return;
  }

  const warning = await otherManagerWarning(root, manager.value);
  if (warning) {
    const proceed = await vscode.window.showWarningMessage(
      warning,
      { modal: true },
      t('hooks.continue'),
    );
    if (proceed !== t('hooks.continue')) {
      return;
    }
  }

  const project = await detectProject(root);
  const presets = listPresets(project);
  const available = presets.filter((entry) => !entry.unavailableReason);
  const picked = await vscode.window.showQuickPick(
    available.map(({ preset }) => ({
      label: t(`preset.${preset.id}.label` as MessageKey),
      description: preset.hook,
      detail: t(`preset.${preset.id}.desc` as MessageKey),
      picked: preset.id !== 'protected-branch' && preset.id !== 'no-debug',
      id: preset.id,
    })),
    {
      title: t('hooks.pick.title'),
      placeHolder: t('hooks.pick.placeholder'),
      canPickMany: true,
    },
  );
  if (!picked || picked.length === 0) {
    return;
  }

  const { config } = await configLoader.load();
  const plan = planHooks({
    manager: manager.value,
    presetIds: picked.map((item) => item.id),
    project,
    rules: { types: config.types.map((type) => type.name) },
  });

  if (!(await confirmOverwrites(root, plan.files, proposed))) {
    return;
  }

  await writeFiles(root, plan.files);
  telemetry.track('hooksInstalled', {
    manager: manager.value,
    presets: picked.map((item) => item.id).join(','),
  });

  const action = await vscode.window.showInformationMessage(
    t('hooks.wrote', plan.files.map((file) => file.path).join(', ')),
    t('hooks.prepare'),
  );
  if (action === t('hooks.prepare')) {
    const terminal = vscode.window.createTerminal({ name: 'Commit Wizard', cwd: root });
    terminal.show();
    // Typed but not executed: the user reviews the command and presses Enter.
    terminal.sendText(plan.installCommand, false);
  }
}

/** Registers the "Install Git hooks" command and its diff content provider. */
export function registerInstallHooks(
  configLoader: ConfigLoader,
  telemetry: Pick<Telemetry, 'track'>,
): vscode.Disposable {
  const proposed = new ProposedContentProvider();
  return vscode.Disposable.from(
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposed),
    vscode.commands.registerCommand(INSTALL_HOOKS_COMMAND, () =>
      installHooks(configLoader, proposed, telemetry),
    ),
  );
}
