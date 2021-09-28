const esbuild = require('esbuild');
const ImportGlobPlugin = require('esbuild-plugin-import-glob');

const watch = process.argv.find(a => a === '--watch') !== undefined;

// Build the editor provider
esbuild.build({
  entryPoints: ['src/extension.ts'],
	tsconfig: "./tsconfig.json",
  bundle: true,
	external: ['vscode'],
	sourcemap: watch,
	minify: !watch,
	watch,
	platform: 'node',
  outfile: 'dist/extension.js',
}).catch(() => process.exit(1))

// Build the test cases
esbuild.build({
  entryPoints: ['src/test/index.ts'],
	tsconfig: "./tsconfig.json",
  bundle: true,
	external: ['vscode', 'mocha', 'chai'],
	sourcemap: watch,
	minify: !watch,
	watch,
	platform: 'node',
  outfile: 'dist/test.js',
}).catch(() => process.exit(1))

esbuild.build({
  entryPoints: ['src/extension.ts'],
	tsconfig: "./tsconfig.json",
  bundle: true,
	format: 'cjs',
	external: ['vscode'],
	minify: !watch,
	watch,
	platform: 'browser',
  outfile: 'dist/web/extension.js',
}).catch(() => process.exit(1))

// Build the data inspector
esbuild.build({
  entryPoints: ['media/data_inspector/inspector.ts'],
	tsconfig: "./tsconfig.json",
  bundle: true,
	external: ['vscode'],
	sourcemap: 'inline',
	watch,
	platform: 'browser',
  outfile: 'dist/inspector.js',
}).catch(() => process.exit(1))

// Build the webview editors
esbuild.build({
  entryPoints: ['media/editor/hexEdit.tsx'],
	tsconfig: "./tsconfig.json",
  bundle: true,
	external: ['vscode'],
	sourcemap: 'inline',
	watch,
	platform: 'browser',
  outfile: 'dist/editor.js',
}).catch(() => process.exit(1))
