// ESLint configuration for MealDrop platform
// Focuses on catching real bugs without being a style enforcer.
// Formatting is left to editors/prettier — not enforced here.
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['react', 'react-hooks'],
  rules: {
    // ── Bugs ────────────────────────────────────────────────────────────────
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'no-constant-condition': 'warn',
    'no-debugger': 'error',
    'no-console': 'off',  // console.log/warn/error used intentionally in handlers

    // ── React ────────────────────────────────────────────────────────────────
    'react/prop-types': 'off',              // TypeScript / too noisy for this codebase
    'react/react-in-jsx-scope': 'off',      // React 17+ automatic JSX transform
    'react/display-name': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // ── Security helpers ─────────────────────────────────────────────────────
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
  },
  overrides: [
    // Deno backend functions — no browser APIs, allow Deno globals
    {
      files: ['functions/**/*.js'],
      env: { browser: false, node: false },
      globals: { Deno: 'readonly', Response: 'readonly', Request: 'readonly', URL: 'readonly', fetch: 'readonly' },
      rules: {
        // Handlers frequently use top-level await patterns and Deno idioms
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      },
    },
    // Test files — allow vitest globals
    {
      files: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/**/__tests__/**/*.{js,jsx}'],
      env: { node: true },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
      rules: {
        'no-unused-vars': 'warn',
      },
    },
    // CI/build scripts
    {
      files: ['scripts/**/*.js', 'vite.config.js', '.eslintrc.cjs'],
      env: { node: true },
    },
  ],
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.base44/',
    'public/',
    '*.min.js',
  ],
};