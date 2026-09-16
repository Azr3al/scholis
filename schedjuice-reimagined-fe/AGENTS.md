# AGENTS.md

## Cursor Cloud specific instructions

This is the frontend for Schedjuice — a multi-tenant school management SaaS. Built with Next.js 15 (App Router + Turbopack), React 19, TanStack Query v4, Tailwind CSS v4, and TypeScript.

**Design authority:** [`DESIGN.md`](./DESIGN.md) — read before substantive UI work. Contracts and case studies: [`docs/design/`](./docs/design/README.md).

### Running

Use **pnpm** (see `packageManager` in `package.json`). Node **22.x** recommended (`nvm use 22`).

- **Install**: `pnpm install`
- **Dev server**: `pnpm run dev` (port 3000, **Turbopack**)
- **Webpack fallback**: `pnpm run dev:webpack` if Turbopack crashes or mis-renders a critical path; note the symptom in the PR/issue
- **Lint**: `pnpm run lint` (ESLint CLI)
- **Typecheck**: `pnpm run typecheck`
- **Unit tests**: `pnpm run test:unit` (Vitest)
- **Browser smoke**: `pnpm run test:browser` (Playwright; see browser prerequisites below)
- **All gates**: `pnpm run verify` (probes the frontend base URL before browser tests)
- **Build**: `pnpm run build`

### Environment

The `.env` file needs `NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1` pointing to the local backend.

The backend uses the injected `DATABASE_URL` (Railway dev database) and the `DEV_TENANT_DOMAIN` env var for tenant resolution. No local PostgreSQL setup needed.

### Browser prerequisites (`pnpm run test:browser` / `pnpm run verify`)

Playwright **globalSetup runs before** the config `webServer`, so:

1. **Start `pnpm run dev` first** so `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`) is reachable.
2. **Backend must be up** at `NEXT_PUBLIC_BASE_API_URL` (e.g. `http://localhost:8000/api/v1`).
3. Set auth + payment fixture env (see `.env.example` / `e2e/README.md`):
   - `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD`
   - `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT` (unique text on exactly one editable payment row)
   - `PLAYWRIGHT_PAYMENT_FIXTURE_COURSE_ID` / `PLAYWRIGHT_PAYMENT_FIXTURE_DATE` when filters would hide the row
4. Browser defaults to **bundled Chromium**. Opt into system Chrome with `PLAYWRIGHT_CHANNEL=chrome` if needed.
5. Zero-skip policy: missing fixtures fail the run; do not skip specs.

### Gotchas

1. **Peer deps**: React 19 vs `@azure/msal-react` — pnpm uses `auto-install-peers=true` (`.npmrc`). Do not commit `package-lock.json`; this repo is pnpm-only (`pnpm-lock.yaml`).

2. **Backend must be running**: The frontend expects the Django API at the URL in `NEXT_PUBLIC_BASE_API_URL`. Without it, pages will fail to load data.

3. **Tenant resolution**: The backend resolves tenants via the `X-Tenant` header. The frontend sends this based on the browser's `Host` header or stored tenant config. For local dev, the `DEV_TENANT_DOMAIN` env var (default: `schedjuice.thiha.net`) is used.

4. **Authentication**: Uses Microsoft MSAL for production, but local dev test accounts use email/password JWT login. Test account: `james@schedjuice.com` / `password123`.

### Pull requests (Cloud Agents)

Cloud Agents must follow these rules when opening or updating PRs:

1. **Base branch is always `dev`** — Never target `main` (or any other branch) unless a human explicitly overrides in the task. Set `base_branch: "dev"` when creating or updating PRs.
2. **Feature branches** — Branch from `dev` (or the task’s stated base), not from `main`, unless instructed otherwise.
3. **Screenshot artifacts are required** — When a task changes UI or user-facing workflows, capture finished-state screenshots (and short screen recordings when a flow is easier to show in motion) before marking the task done. Embed them in the PR description when creating or updating the PR.

#### Screenshot / artifact workflow

- Run the dev server, log in with the test account if needed, and exercise the feature end-to-end.
- Save captures under the Cloud Agent artifacts directory (e.g. `/opt/cursor/artifacts/screenshots/`).
- Reference each file in the PR body with HTML so reviewers see the result inline, for example:

  ```html
  <img alt="Assignment detail after fix" src="/opt/cursor/artifacts/screenshots/assignment-detail.png" />
  ```

- Cover the **finished** state: success paths, key screens touched, and any important edge case the task called out.
- Pure backend-only or non-visual tasks with no UI delta do not need screenshots; say so briefly in the PR body instead of attaching unrelated images.