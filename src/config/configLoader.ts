import * as vscode from 'vscode';
import { parseConfigLayer, resolveConfig } from '../core/commitConfig';
import type { CommitConfig, ConfigLayer } from '../core/commitConfig';

/** Name of the team configuration file, looked up at the root of the first workspace folder. */
export const TEAM_CONFIG_FILE = '.commit-wizard.json';

const SETTINGS_SECTION = 'gitmojiCommit';
const SETTING_KEYS = [
  'types',
  'scopes',
  'emojis',
  'emojiPosition',
  'titleWarningLength',
  'titleMaxLength',
  'issuePattern',
  'protectedBranches',
  'issueUrlTemplate',
  'branchPattern',
] as const;

/** Resolved configuration plus human-readable problems found while reading it. */
export interface LoadedConfig {
  config: CommitConfig;
  warnings: string[];
}

function readSettingsLayer(): { layer: ConfigLayer; warnings: string[] } {
  const settings = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const raw: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = settings.get(key);
    // An empty issuePattern means "not configured" (the setting defaults to '').
    if (value !== undefined && value !== '') {
      raw[key] = value;
    }
  }
  const { layer, errors } = parseConfigLayer(raw);
  const trackerPreset = settings.get<string>('issueTracker.preset');
  if (trackerPreset) {
    const parsedTracker = parseConfigLayer({
      issueTracker: {
        preset: trackerPreset,
        baseUrl: settings.get('issueTracker.baseUrl') || undefined,
      },
    });
    Object.assign(layer, parsedTracker.layer);
    errors.push(...parsedTracker.errors);
  }
  const aiEnabled = settings.get<boolean>('ai.enabled');
  if (aiEnabled !== undefined) {
    layer.aiDraft = aiEnabled;
  }
  return { layer, warnings: errors.map((error) => `VS Code settings: ${error}`) };
}

async function readTeamLayer(): Promise<{ layer: ConfigLayer; warnings: string[] }> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return { layer: {}, warnings: [] };
  }

  let text: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, TEAM_CONFIG_FILE),
    );
    text = new TextDecoder().decode(bytes);
  } catch {
    // No team file (or unreadable): not an error, the other layers apply.
    return { layer: {}, warnings: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { layer: {}, warnings: [`${TEAM_CONFIG_FILE}: invalid JSON (${reason}).`] };
  }

  const { layer, errors } = parseConfigLayer(raw);
  // Sending code to a model is a personal decision a shared file must not make for others.
  delete layer.aiDraft;
  return { layer, warnings: errors.map((error) => `${TEAM_CONFIG_FILE}: ${error}`) };
}

/**
 * Resolves the commit builder configuration from VS Code settings and the optional team file
 * (`.commit-wizard.json`; the file takes precedence), and fires {@link onDidChange} whenever
 * either source changes so views can refresh without a window reload.
 */
export class ConfigLoader implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];

  /** Fires after the settings or the team file changed on disk. */
  public readonly onDidChange = this.emitter.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${TEAM_CONFIG_FILE}`);
    this.disposables.push(
      watcher,
      watcher.onDidCreate(() => this.emitter.fire()),
      watcher.onDidChange(() => this.emitter.fire()),
      watcher.onDidDelete(() => this.emitter.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTINGS_SECTION)) {
          this.emitter.fire();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.emitter.fire()),
    );
  }

  /** Reads and merges every configuration source. Never throws. */
  public async load(): Promise<LoadedConfig> {
    const settings = readSettingsLayer();
    const team = await readTeamLayer();
    const { config, errors } = resolveConfig([settings.layer, team.layer]);
    return { config, warnings: [...settings.warnings, ...team.warnings, ...errors] };
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
