const esbuild = require("esbuild");
const svgr = require("esbuild-plugin-svgr");
const css = require("esbuild-css-modules-plugin");

const watch = process.argv.includes("--watch");
const minify = !watch || process.argv.includes("--minify");
const defineProd = process.argv.includes("--defineProd");

// Build the editor provider
esbuild
	.build({
		entryPoints: ["src/extension.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode"],
		sourcemap: watch,
		minify,
		watch,
		platform: "node",
		outfile: "dist/extension.js",
	})
	.catch(() => process.exit(1));

// Build the test cases
esbuild
	.build({
		entryPoints: ["src/test/index.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode", "mocha", "chai"],
		sourcemap: watch,
		minify,
		watch,
		platform: "node",
		outfile: "dist/test.js",
	})
	.catch(() => process.exit(1));

esbuild
	.build({
		entryPoints: ["src/extension.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		format: "cjs",
		external: ["vscode", "fs"],
		minify,
		watch,
		platform: "browser",
		outfile: "dist/web/extension.js",
	})
	.catch(() => process.exit(1));

// Build the data inspector
esbuild
	.build({
		entryPoints: ["media/data_inspector/inspector.ts"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode"],
		sourcemap: watch ? "inline" : false,
		minify,
		watch,
		platform: "browser",
		outfile: "dist/inspector.js",
	})
	.catch(() => process.exit(1));

// Build the webview editors
esbuild
	.build({
		entryPoints: ["media/editor/hexEdit.tsx"],
		tsconfig: "./tsconfig.json",
		bundle: true,
		external: ["vscode"],
		sourcemap: watch,
		minify,
		watch,
		platform: "browser",
		outfile: "dist/editor.js",
		define: defineProd
			? {
					"process.env.NODE_ENV": defineProd ? '"production"' : '"development"',
			  }
			: undefined,
		plugins: [svgr(), css({ v2: true, filter: /\.css$/i })],
	})
	.catch(() => process.exit(1));
