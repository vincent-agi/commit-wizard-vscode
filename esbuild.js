const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
};

async function run() {
  if (watch) {
    const contexts = await Promise.all(
      [extensionOptions, webviewOptions].map((options) => esbuild.context(options)),
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('esbuild watching...');
  } else {
    await Promise.all([esbuild.build(extensionOptions), esbuild.build(webviewOptions)]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
