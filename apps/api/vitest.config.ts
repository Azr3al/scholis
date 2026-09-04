import { baseTestConfig } from '@scholis/config/vitest';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      include: ['{src,server,data,http,lib,test}/**/*.test.ts'],
      // Integration tests boot a database per file; 5s is tight on a cold
      // PGlite start.
      testTimeout: 20_000,
      hookTimeout: 30_000,
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    },
  }),
);
