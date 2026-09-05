import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

// Cycles and cross-package boundaries are dependency-cruiser's job, not this
// file's. Two tools enforcing one rule means two places to update and one to
// forget.
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    plugins: { 'import-x': importX },
    rules: {
      // Parse at the boundary, trust inside.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Keeps type-only imports erasable, which verbatimModuleSyntax needs.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],

      // Question types and attempt statuses are unions — a missed case must not
      // compile.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Named exports only. Next.js files opt out explicitly.
      'import-x/no-default-export': 'error',

      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '*.config.*'],
  },
);

// The ESLint half of "no I/O in the core". depcruise catches imports across
// packages; this catches globals and node builtins, which it can't see.
export const pure = [
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https'],
              message: 'The domain core must stay pure. Move I/O to a service in apps/api/server.',
            },
            {
              group: ['react', 'react-dom', 'next', 'next/*', 'drizzle-orm', '@scholis/db'],
              message: 'The domain core must not know about the framework or the database.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The domain core must stay pure.' },
        { name: 'window', message: 'The domain core must stay pure.' },
        { name: 'document', message: 'The domain core must stay pure.' },
        { name: 'localStorage', message: 'The domain core must stay pure.' },
        { name: 'indexedDB', message: 'The domain core must stay pure.' },
      ],
    },
  },
];
