import { defineConfig } from '@playwright/test';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one shared database
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,

  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Assumes both servers and Postgres are already running. Starting them here
  // would hide which one broke when the suite fails.
  metadata: { api: API },
});
