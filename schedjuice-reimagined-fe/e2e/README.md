# Playwright browser suite (R0)

## Required env

| Variable | Required value | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Next dev server (must already be reachable; globalSetup runs before webServer) |
| `PLAYWRIGHT_TEST_EMAIL` | `james@schedjuice.com` | JWT login (see AGENTS.md) |
| `PLAYWRIGHT_TEST_PASSWORD` | `password123` | JWT login |
| `NEXT_PUBLIC_BASE_API_URL` | `http://localhost:8000/api/v1` | Backend API |
| `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT` | Unique text from a seeded editable payment row | Locates exactly one row containing an editable status combobox and Delete payment control |
| `PLAYWRIGHT_PAYMENT_FIXTURE_COURSE_ID` | Course id for the fixture row (e.g. `96`) | Required when the default course/month filter does not surface the fixture |
| `PLAYWRIGHT_PAYMENT_FIXTURE_DATE` | ISO date for the fixture billing month (e.g. `2026-07-01T00:00:00.000Z`) | Required when the fixture row is outside the current calendar month |
| `PLAYWRIGHT_CHANNEL` | _(optional)_ e.g. `chrome` | System browser channel. **Default: unset** → bundled Chromium (CI-safe) |

Backend must be running. Tenant resolves via host/`DEV_TENANT_DOMAIN` per AGENTS.md.

## Browser channel

Playwright launches **bundled Chromium** by default (no `channel`). That is what CI and most local runs should use.

To opt into a system browser installed on the machine:

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

## Auth strategy

`e2e/global-setup.ts` logs in through the real `/login` UI so `persistAuthCookies()` creates the same `access`, `refresh`, `account`, role, schema, and session cookies used by production. It then validates the required **student-payments** fixture on `/finances/student-payments` (unique row text, editable status combobox, Delete payment control) before writing `e2e/.auth/admin.json`.

If the frontend base URL, backend, credentials, permissions, fixture IDs, or controls are missing, global setup throws an actionable error and Playwright runs no specs. Missing prerequisites are a STOP condition, never a skipped or passing browser run.

## Running

Start the Next.js app first (`npm run dev`), ensure the backend is up, then:

```bash
npm run test:browser
```

`npm run verify` probes `PLAYWRIGHT_BASE_URL` before invoking the browser suite for the same reason.
