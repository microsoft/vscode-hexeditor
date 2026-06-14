const esbuild = require("esbuild");
const { transform } = require("@svgr/core");
const svgrPluginJsx = require("@svgr/plugin-jsx");
const css = require("esbuild-css-modules-plugin");
const fs = require("node:fs/promises");

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

const svgr = {
	name: "svgr",
	setup(build) {
		build.onLoad({ filter: /\.svg$/ }, async args => ({
			contents: await transform(await fs.readFile(args.path, "utf8"), { plugins: [svgrPluginJsx] }, { filePath: args.path }),
			loader: "jsx",
		}));
	},
};

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
	external: ["vscode", "fs", "worker_threads"],
	minify,
	platform: "browser",
	outfile: "dist/web/extension.js",
});

build({
	entryPoints: ["shared/diffWorker.ts"],
	tsconfig: "./tsconfig.json",
	bundle: true,
	format: "cjs",
	external: ["vscode", "worker_threads"],
	minify,
	platform: "browser",
	outfile: "dist/diffWorker.js",
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
	plugins: [svgr, css({ v2: true, filter: /\.css$/i })],
});
