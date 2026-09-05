import { defineConfig } from 'vitest/config';

// passWithNoTests because packages get filled in across phases. The quality bar
// for the core is the coverage thresholds below, not the presence of a file.
export const baseTestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/**/*.types.ts', 'src/**/fixtures.ts'],
    },
  },
});

// engine and scoring hold all the logic and need no infrastructure to test, so
// they're held at 100%.
//
// Coverage is enabled here rather than behind a --coverage flag — a threshold
// that only runs when someone remembers the flag isn't enforced.
//
// *.types.ts holds only types, which TypeScript erases, so v8 scores the file 0%
// and drags the threshold down. fixtures.ts is test scaffolding that lives in
// src so the typechecker sees it.
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
