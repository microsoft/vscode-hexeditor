const esbuild = require("esbuild");
const svgr = require("esbuild-plugin-svgr");
const linaria = require("@linaria/esbuild");

const watch = process.argv.includes("--watch");
const minify = !watch || process.argv.includes("--minify");

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
		plugins: [
			svgr(),
			linaria.default({
				sourceMap: watch,
				babelOptions: {
					presets: ["@babel/preset-typescript", "@babel/preset-react"],
				},
			}),
		],
	})
	.catch(() => process.exit(1));
