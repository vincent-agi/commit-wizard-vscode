import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/** Discovers and runs every `*.test.js` file under this directory via Mocha. */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  const testsRoot = path.resolve(__dirname);

  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
