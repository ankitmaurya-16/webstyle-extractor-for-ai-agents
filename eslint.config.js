import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import i18next from 'eslint-plugin-i18next';

export default [
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'cli/dist/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        defineBackground: 'readonly',
        defineUnlistedScript: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // AC-F44.1: user-visible text in panel components comes from messages.json through t().
    files: ['entrypoints/sidepanel/**/*.jsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          'jsx-attributes': { include: ['^(aria-label|title|alt|placeholder|label)$'] },
          words: { exclude: ['^[\\s\\d·•—→←✓×+%:/()\\[\\].,-]*$', '^(oklch|hsl|px|A|B)$'] },
        },
      ],
    },
  },
  {
    files: ['tests/**', 'scripts/**', '*.config.js', 'cli/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Playwright fixtures take a `use` callback, which is not the React hook.
    files: ['tests/e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
];
