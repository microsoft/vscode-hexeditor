import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "**/*.d.ts", "**/*.js"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.commonjs,
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-var": "warn",
      "no-case-declarations": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "(^_)|(^h$)" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "object-curly-spacing": ["error", "always"],
    },
  },
);
