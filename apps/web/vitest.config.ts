import { baseTestConfig } from '@scholis/config/vitest';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      // apps/web has no `src/`; layers sit at the app root.
<<<<<<< HEAD
      include: ['{app,data,server,lib,components,test}/**/*.test.ts'],
=======
      include: ['{app,lib,components}/**/*.test.ts'],
      // Playwright owns e2e/; vitest would try to run those specs.
      exclude: ['e2e/**', 'node_modules/**'],
>>>>>>> master
      // Integration tests boot a database per file, so the default 5s is tight
      // on a cold PGlite start.
      testTimeout: 20_000,
      hookTimeout: 30_000,
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    },
  }),
);
