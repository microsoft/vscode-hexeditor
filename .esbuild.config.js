const esbuild = require("esbuild");
const svgr = require("esbuild-plugin-svgr");
const css = require("esbuild-css-modules-plugin");

const watch = process.argv.includes("--watch");
const minify = !watch || process.argv.includes("--minify");
const defineProd = process.argv.includes("--defineProd");

function build(options) {
	(async () => {
		if (watch) {
			const context = await esbuild.context(options);
			await context.watch();
		} else {
			await esbuild.build(options);
		}
	})().catch(() => process.exit(1));
}

// Build the editor provider
build({
	entryPoints: ["src/extension.ts"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	external: ["vscode"],
	sourcemap: watch,
	minify,
	platform: "node",
	outfile: "dist/extension.js",
});

// Build the test cases
build({
	entryPoints: ["src/test/index.ts"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	external: ["vscode", "mocha", "chai"],
	sourcemap: watch,
	minify,
	platform: "node",
	outfile: "dist/test.js",
});

build({
	entryPoints: ["src/extension.ts"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	format: "cjs",
	external: ["vscode", "fs"],
	minify,
	platform: "browser",
	outfile: "dist/web/extension.js",
});

// Build the data inspector
build({
	entryPoints: ["media/data_inspector/inspector.ts"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	external: ["vscode"],
	sourcemap: watch ? "inline" : false,
	minify,
	platform: "browser",
	outfile: "dist/inspector.js",
});

// Build the webview editors
build({
	entryPoints: ["media/editor/hexEdit.tsx"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	external: ["vscode"],
	sourcemap: watch,
	minify,
	platform: "browser",
	outfile: "dist/editor.js",
	define: defineProd
		? {
				"process.env.NODE_ENV": defineProd ? '"production"' : '"development"',
			}
		: undefined,
	plugins: [svgr(), css({ v2: true, filter: /\.css$/i })],
});
