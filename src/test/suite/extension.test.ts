import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('registers the commit builder webview view', async () => {
    const extension = vscode.extensions.getExtension('vincent-agi.commit-wizard-vscode');
    assert.ok(extension, 'extension should be discoverable by its id');

    await extension?.activate();
    assert.strictEqual(extension?.isActive, true);
  });

  test('exposes the gitmojiCommit.scopes configuration with an empty default', () => {
    const scopes = vscode.workspace.getConfiguration('gitmojiCommit').get('scopes');
    assert.deepStrictEqual(scopes, []);
  });
});
