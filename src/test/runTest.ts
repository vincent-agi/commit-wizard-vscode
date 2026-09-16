import * as path from 'path';
import { runTests } from '@vscode/test-electron';

/**
 * Entry point for the `@vscode/test-electron` integration/E2E run. Launches a real VS Code
 * Extension Host, loads this extension, and runs the Mocha suite in `src/test/suite`.
 *
 * Not wired into `npm test` (see `docs/playbook-runbook.md`) so the default TDD loop stays
 * fast and dependency-free; run explicitly with `node ./out/test/runTest.js` after
 * `npm run compile`.
 */
async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  await runTests({ extensionDevelopmentPath, extensionTestsPath });
}

main().catch((error) => {
  console.error('Failed to run integration tests', error);
  process.exit(1);
});
