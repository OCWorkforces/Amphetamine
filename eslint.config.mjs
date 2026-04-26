import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["lib/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/main/**/*.ts", "tests/main/**/*.ts", "tests/setup.main.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Node.js globals
        process: "readonly",
        Buffer: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        URL: "readonly",
        // Vitest globals
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
        performance: "readonly",
        // Electron type namespaces
        Electron: "readonly",
      },
    },
  },
  {
    files: ["src/preload/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Node.js + browser globals (preload bridges both)
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        window: "readonly",
        document: "readonly",
      },
    },
  },
  {
    files: ["src/renderer/**/*.ts", "tests/renderer/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLSpanElement: "readonly",
        EventListener: "readonly",
        Event: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        URL: "readonly",
        console: "readonly",
        // Vitest globals
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.tests.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",

      // Code style (match existing conventions)
      "no-console": "off", // electron-log handles production; console ok in dev
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "no-throw-literal": "error",

      // Relax overly strict rules
      "@typescript-eslint/no-explicit-any": "error",

      // Security (Electron)
      "no-eval": "error",
      "no-new-func": "error",

      // Type safety / async correctness
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettier, // Prettier must be last to override formatting rules
];
