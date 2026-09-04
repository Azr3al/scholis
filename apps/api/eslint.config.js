import { base } from '@scholis/config/eslint';

export default [
  // build.mjs is the build itself, so it sits outside the TypeScript project
  // that the typed rules are configured against.
  { ignores: ['dist/**', 'build.mjs'] },
  ...base,
  {
    // CLI scripts talk to an operator through stdout. That's their interface.
    files: ['scripts/**', 'src/index.ts', 'src/migrate.ts'],
    rules: { 'no-console': 'off' },
  },
];
