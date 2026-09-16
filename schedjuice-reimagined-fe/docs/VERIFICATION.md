# Verification gates (Schedjuice frontend)

Run from repository root after `npm install --legacy-peer-deps`.

| Gate | Command | Expected |
| --- | --- | --- |
| Lint | `npm run lint` | Exit 0; the five pinned baseline warnings remain visible until assigned to a dedicated cleanup plan |
| Typecheck | `npm run typecheck` | Exit 0, no output |
| Unit tests | `npm run test:unit` | All files pass |
| Production build | `npm run build` | Exit 0 |
| Browser smoke | `npm run test:browser` | All specs pass with zero skipped tests (requires pre-started `npm run dev`, backend, auth, and unique payment fixture text; see `e2e/README.md`) |
| Full gate | `npm run verify` | Runs all of the above (probes `PLAYWRIGHT_BASE_URL` before browser tests) |

## Environment

- `NEXT_PUBLIC_BASE_API_URL` must be set (see `.env.example`).
- Browser tests additionally require `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_TEST_EMAIL`, `PLAYWRIGHT_TEST_PASSWORD`, `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT`, and usually `PLAYWRIGHT_PAYMENT_FIXTURE_COURSE_ID` + `PLAYWRIGHT_PAYMENT_FIXTURE_DATE` (see `e2e/README.md`).
- Browser tests default to Playwright’s **bundled Chromium**. Set `PLAYWRIGHT_CHANNEL=chrome` (or another Playwright channel) only when you intentionally want a system browser.
- Browser tests require the Next.js dev server and Django backend to be running before `npm run test:browser` (Playwright global setup runs before the config webServer starts). `npm run verify` fails fast if `PLAYWRIGHT_BASE_URL` is unreachable.

## Policy

Existing failures must be fixed, not skipped or excluded. Later remediation waves may not weaken these gates.
