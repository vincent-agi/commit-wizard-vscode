import * as vscode from 'vscode';

const WATCHED_BUNDLES = ['dist/webview.js', 'dist/issueForm.js'];
const DEBOUNCE_MS = 200;

/**
 * Development only: calls `onChange` (debounced) whenever a webview bundle is rebuilt, so open
 * views can reload themselves. Returns an empty disposable outside Development mode, so nothing
 * is watched in production.
 */
export function watchWebviewBundles(
  context: vscode.ExtensionContext,
  onChange: () => void,
): vscode.Disposable {
  if (context.extensionMode !== vscode.ExtensionMode.Development) {
    return new vscode.Disposable(() => {});
  }

  let timer: NodeJS.Timeout | undefined;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, DEBOUNCE_MS);
  };

  const watchers = WATCHED_BUNDLES.map((bundle) => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(context.extensionUri, bundle),
    );
    watcher.onDidChange(trigger);
    watcher.onDidCreate(trigger);
    return watcher;
  });

  return new vscode.Disposable(() => {
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.dispose());
  });
}
