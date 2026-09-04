import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

<<<<<<< HEAD
/**
 * Rules every Scholis package inherits.
 *
 * Cycles and cross-package boundaries are deliberately NOT checked here —
 * dependency-cruiser owns those (see `.dependency-cruiser.cjs`). Two tools
 * enforcing the same rule means two places to update and one to forget.
 */
=======
// Cycles and cross-package boundaries are dependency-cruiser's job, not this
// file's. Two tools enforcing one rule means two places to update and one to
// forget.
>>>>>>> master
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
<<<<<<< HEAD
      // §4: no `any`. Parse at the boundary, trust inside.
=======
      // Parse at the boundary, trust inside.
>>>>>>> master
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

<<<<<<< HEAD
      // Keeps type-only imports erasable, which `verbatimModuleSyntax` requires.
=======
      // Keeps type-only imports erasable, which verbatimModuleSyntax needs.
>>>>>>> master
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],

<<<<<<< HEAD
      // Question types and attempt statuses are unions; a missed case must not compile.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // §4: named exports only. Next.js files opt out explicitly.
=======
      // Question types and attempt statuses are unions — a missed case must not
      // compile.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Named exports only. Next.js files opt out explicitly.
>>>>>>> master
      'import-x/no-default-export': 'error',

      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '*.config.*'],
  },
);

<<<<<<< HEAD
/**
 * Additional rules for the pure domain core (`engine`, `scoring`).
 *
 * This is the ESLint half of principle §1: the core cannot reach I/O. The
 * dependency-cruiser rule `no-io-in-core` catches imports across packages;
 * this catches globals and node builtins, which it cannot see.
 */
=======
// The ESLint half of "no I/O in the core". depcruise catches imports across
// packages; this catches globals and node builtins, which it can't see.
>>>>>>> master
export const pure = [
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https'],
              message: 'The domain core must stay pure. Move I/O to a service in apps/web/server.',
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
