import { defineConfig } from 'vitest/config';

<<<<<<< HEAD
/**
 * Defaults for any package.
 *
 * `passWithNoTests` is on because packages are filled in across phases and an
 * empty package should not fail the build. The quality bar for the domain core
 * is enforced by coverage thresholds below, not by the presence of a file.
 */
=======
// passWithNoTests because packages get filled in across phases. The quality bar
// for the core is the coverage thresholds below, not the presence of a file.
>>>>>>> master
export const baseTestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
<<<<<<< HEAD
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
=======
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/**/*.types.ts', 'src/**/fixtures.ts'],
>>>>>>> master
    },
  },
});

<<<<<<< HEAD
/**
 * For `engine` and `scoring`.
 *
 * IMPLEMENTATION.md §5 sets the bar at ~100% branch coverage for the pure core,
 * on the reasoning that it holds all the logic and needs no infrastructure to
 * test.
 *
 * Coverage is `enabled` rather than left to a `--coverage` flag on purpose: a
 * threshold that only runs when someone remembers to pass a flag is a threshold
 * that is not enforced. This makes `pnpm test` the real gate.
 */
=======
// engine and scoring hold all the logic and need no infrastructure to test, so
// they're held at 100%.
//
// Coverage is enabled here rather than behind a --coverage flag — a threshold
// that only runs when someone remembers the flag isn't enforced.
//
// *.types.ts holds only types, which TypeScript erases, so v8 scores the file 0%
// and drags the threshold down. fixtures.ts is test scaffolding that lives in
// src so the typechecker sees it.
>>>>>>> master
export const pureCoreTestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
<<<<<<< HEAD
      /**
       * Two conventions, both about files that have no runtime behaviour to cover:
       *
       * - `*.types.ts` holds only types and interfaces. TypeScript erases them,
       *   so v8 sees a file that never executes and scores it 0%. Naming the
       *   file is clearer than maintaining a list of exceptions, and it signals
       *   intent to the next reader.
       * - `fixtures.ts` is test scaffolding that lives in src so the
       *   typechecker covers it. Not production code.
       */
=======
>>>>>>> master
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/**/*.types.ts', 'src/**/fixtures.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
