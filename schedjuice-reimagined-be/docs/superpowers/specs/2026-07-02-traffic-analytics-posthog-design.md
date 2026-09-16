# Traffic Analytics (PostHog) — Design

**Date:** 2026-07-02  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be` (Django), `schedjuice-reimagined-fe` (Next.js), PostHog Cloud (US)

## Problem

Platform operators need to know **which API routes and frontend pages are used most**, and which
requests are **slow, DB-heavy, or error-prone**, so engineering can prioritize query-flow
optimizations. Today:

- `/shortcuts/analytics` covers **business ops** (enrollments, revenue) — not HTTP traffic.
- **AI usage** is logged (`AIRequestLog`) — AI routes only.
- **Silk / QueryLogger / N+1** tooling is **dev-only** (`DEBUG`).
- No production pageview or API route ranking exists.

Past perf work (e.g. attendance marking bootstrap) was driven by known pain points, not measured
traffic.

## Goals

1. **Most visited pages** — normalized frontend paths, cross-tenant, platform-operator view.
2. **Most called API routes** — normalized route templates, cross-tenant volume ranking.
3. **Full-stack request metrics** — volume, latency (p50/p95), DB query count/time, error rate,
   response payload size.
4. **Optimization priority list** — rank routes by popularity × cost so popular services get
   engineering priority first.
5. **PostHog Cloud (US)** as the sole analytics UI (no in-app charts v1).
6. **Zero user-facing impact** — analytics must never block or slow app requests.

## Non-Goals (v1)

- Session replay
- Tenant-facing analytics (school admins see their own traffic)
- In-app `/debug` charts (link card to PostHog only)
- Alerting / Discord on traffic spikes
- Per-user identity in events (role bucket only)
- Pageviews on login, register, verify, join-course
- External APM (Datadog, Sentry Performance) — PostHog only

## Key Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Audience | Platform operators / superadmins, cross-tenant |
| Metrics | Volume, latency, DB cost, errors, payload size |
| Platform | PostHog Cloud (US) |
| UI | PostHog-only; optional link card on `/debug` |
| Approach | PostHog end-to-end (Approach 1) |
| Frontend scope | All `(internal)` routes + `/help/*` + `/platform/docs/*` |
| Frontend exclusions | `/debug/*`, `/components/*`, login/register/verify/join |
| Success sampling | **50%** of 2xx/3xx API requests |
| Always capture | 100% of 4xx/5xx, slow (≥1000 ms), heavy DB (≥20 queries) |
| Frontend pageviews | No sampling |
| Non-blocking | **Hard requirement** — PostHog network I/O never on request path |

## Breaking Changes

**None intentional.** Additive middleware and optional frontend SDK behind env flags.

| Change | Risk | Mitigation |
|--------|------|------------|
| New middleware on `/api/v1/*` | Low — must not add latency | Enqueue-only on hot path; background worker |
| PostHog SDK in FE bundle | Low — ~tens of KB gzipped | Lazy init; disabled when env unset |
| PostHog Cloud event volume | Ops — billing | 50% API sampling; monitor usage in PostHog billing |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Next.js (schedjuice-reimagined-fe)                                      │
│   PostHogProvider → $pageview on route change (async, batched)           │
│   normalized_path, tenant_schema, org_id, role_bucket                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS (async, non-blocking)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PostHog Cloud US (us.i.posthog.com)                                     │
│   Saved dashboards: pages, API volume, optimization priority, errors    │
└───────────────────────────────▲─────────────────────────────────────────┘
                                │ HTTPS (background worker only)
┌───────────────────────────────┴─────────────────────────────────────────┐
│ Django (schedjuice-reimagined-be)                                         │
│   TrafficAnalyticsMiddleware                                              │
│     1. time + DB execute_wrapper during request                           │
│     2. after response: build event dict                                   │
│     3. enqueue (non-blocking) ──► BackgroundEventQueue                    │
│                                      └── daemon thread → posthog.capture  │
│   NEVER: sync HTTP, flush(), or join() on request thread                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Non-Blocking Guarantee (Hard Requirement)

Analytics code **must not** add measurable latency to user-facing requests. PostHog HTTP calls
run **only** on a background thread. If PostHog is slow, down, or the queue is full, **drop
events silently** — never block, retry synchronously, or fail the app response.

### Backend rules

1. **Request thread does only:** measure metrics, build a plain dict, `queue.put_nowait(event)`.
2. **Never on request thread:** `posthog.capture()`, `posthog.flush()`, `requests.post()`, or any
   network I/O to PostHog.
3. **Background worker:** single daemon thread (or small pool) drains `BackgroundEventQueue`,
   calls `posthog.capture()` + periodic batch flush.
4. **Bounded queue:** default max 10_000 events. On `queue.Full`, increment a dropped counter and
   discard — do not block waiting for space.
5. **posthog-python config:** `sync_mode=False`; do not call `flush()` from middleware. Worker
   flushes on interval (e.g. every 5 s) or batch size (e.g. 100 events).
6. **Error isolation:** wrap worker loop in try/except; log at WARNING; never propagate to Django.
7. **Shutdown:** register `atexit` / Django `AppConfig` hook to best-effort flush with **timeout
   cap** (e.g. 2 s) — do not delay worker process exit indefinitely.
8. **DB metrics wrapper:** `connection.execute_wrapper` only counts queries; no SQL string logging.

### Frontend rules

1. Init PostHog **after** first paint (`requestIdleCallback` or `useEffect` — not module top-level
   blocking import side effects).
2. Rely on posthog-js default **async batched** transport (`batch_events: true`).
3. Do **not** use `posthog.capture()` with `send_instantly` / `$flush` on navigation.
4. Session replay **disabled** (`disable_session_recording: true`).
5. If PostHog host unreachable, SDK failures are swallowed — no UI errors, no retries blocking
   render.

### Verification (required before prod)

- Load test: p95 API latency with `POSTHOG_ENABLED=true` vs `false` — delta **< 2 ms**.
- Kill PostHog ingest (block `us.i.posthog.com` or revoke API key) — API responses remain 200; queue drops logged, not raised.
- Unit test: middleware returns before background worker processes queue (mock + timing assertion).

---

## Components

### 1. PostHog Cloud (US)

- Sign up at [posthog.com](https://posthog.com); select **US Cloud** hosting.
- One project: `schedjuice-production` (staging may share or use separate project).
- Env vars documented in repo `.env.example` (not secrets):
  - `POSTHOG_HOST` — `https://us.i.posthog.com` (ingest)
  - `POSTHOG_API_KEY` — project API key (backend)
  - `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_KEY` — frontend
  - `POSTHOG_ENABLED=true|false`
  - `POSTHOG_API_SAMPLE_RATE=0.5`

Ops runbook: `docs/ops/posthog-traffic-analytics.md`

### 2. `utilitas/traffic_analytics/` (backend module)

| File | Purpose |
|------|---------|
| `queue.py` | `BackgroundEventQueue` — bounded `queue.Queue`, daemon worker thread |
| `middleware.py` | `TrafficAnalyticsMiddleware` — measure, sample, enqueue |
| `db_metrics.py` | `DbMetricsCollector` — execute_wrapper for count + cumulative ms |
| `sampling.py` | Deterministic hash sampling; always-include rules |
| `routes.py` | Resolve `route_template` from `request.resolver_match` |
| `client.py` | Lazy-init posthog client; worker-only capture |

**Middleware scope:** `/api/v1/*` only.

**Skip (0% capture):** health checks, admin, silk, static, OPTIONS.

**Event name:** `api_request`

**Properties:**

| Property | Type | Notes |
|----------|------|-------|
| `route_template` | string | e.g. `courses/<int:pk>/attendance-marking` |
| `method` | string | GET, POST, … |
| `status_code` | int | |
| `response_ms` | float | wall time |
| `db_query_count` | int | |
| `db_time_ms` | float | sum of query durations |
| `response_bytes` | int | `len(response.content)` when available |
| `tenant_schema` | string | |
| `org_id` | int \| null | when resolvable |
| `environment` | string | staging / production |
| `sampled` | bool | for volume extrapolation |
| `sample_rate` | float | 0.5 for success bucket |

### 3. Sampling policy

| Request type | Sample rate |
|--------------|-------------|
| 2xx / 3xx success | **50%** (`POSTHOG_API_SAMPLE_RATE=0.5`) |
| 4xx / 5xx | 100% |
| `response_ms >= 1000` | 100% |
| `db_query_count >= 20` | 100% |
| Skipped routes (health, etc.) | 0% |

Deterministic hash: `hash(f"{route_template}:{request_id}") % 100 < sample_rate * 100` so the
same logical request stream is stable within a deploy.

PostHog dashboards multiply success counts by `1 / sample_rate` where `sampled=true`.

### 4. Frontend PostHog integration

**New files:**

- `src/lib/posthog.ts` — init, normalizePath, shouldTrackPage
- `src/components/providers/posthog-provider.tsx` — App Router `$pageview` on `usePathname()` change

**Include pageviews when path matches:**

- Any `(internal)` authenticated route
- `/help/*`
- `/platform/docs/*`

**Exclude:**

- `/debug/*`
- `/components/*`
- `/login`, `/register`, `/verify/*`, `/join-course/*`

**`$pageview` properties:**

| Property | Notes |
|----------|-------|
| `normalized_path` | `/courses/:id/attendance/marking/:eventIndex` |
| `tenant_schema` | from tenant cookie/context |
| `org_id` | |
| `role_bucket` | `student` \| `staff` \| `admin` \| `superadmin` |
| `environment` | |

**Path normalization:** map numeric segments and known UUID slugs to `:id`; reuse segment patterns
from Next.js dynamic routes where feasible; unit-test representative paths.

### 5. PostHog saved dashboards

Create and document URLs in ops runbook:

1. **Product traffic** — top `$pageview` by `normalized_path` (7d / 30d); breakdown by
   `role_bucket`.
2. **API volume** — top `api_request` by `route_template`; sample-adjusted count; unique tenants.
3. **Optimization priority** — score = `adjusted_volume × p95(response_ms) × avg(db_query_count)`;
   sort descending.
4. **Errors & payloads** — error rate by route; highest avg `response_bytes`.
5. **Docs usage** — `/help/*` and `/platform/docs/*` pageviews only.

### 6. `/debug` link card (optional, v1)

Add to `schedjuice-reimagined-fe/src/app/(internal)/debug/page.tsx`:

- Title: **Traffic analytics**
- Description: PostHog dashboards — top pages, API routes, optimization priority.
- External link to saved PostHog dashboard URL (env: `NEXT_PUBLIC_POSTHOG_DASHBOARD_URL`).

Superadmin-only (existing debug gate). No embedded iframe.

---

## Rollout Phases

| Phase | Scope | Gate |
|-------|--------|------|
| 0 | Create PostHog Cloud project | Test event ingests |
| 1 | Backend middleware on staging | Events visible; non-blocking verified |
| 2 | Frontend pageviews on staging | Normalized paths ~60–90 patterns |
| 3 | Production enable | Monitor event volume / billing |
| 4 | Dashboards + debug link | Ops can self-serve rankings |

Feature flags default **off** in dev unless explicitly enabled.

---

## Privacy

- No request/response bodies in events.
- Route templates only — no raw URLs with student/course IDs in event names.
- No email, name, or user id in v1 properties (`role_bucket` only).
- Query strings stripped before emit.
- Session replay off.

---

## Testing

### Backend

- Route template resolution for parameterized URLs
- Sampling: ~50% success over large sample; 100% for 5xx / slow / heavy-DB
- DB metrics collector returns expected counts
- Enqueue never blocks: full queue → drop, response still 200
- PostHog worker failure → response still 200
- **Non-blocking:** middleware wall time without worker processing ≈ baseline ± 2 ms

### Frontend

- `normalizePath` unit tests for dynamic routes
- `shouldTrackPage` include/exclude rules
- PostHog init skipped when env unset

### Manual smoke (staging)

- Visit attendance marking → normalized pageview + related `api_request` events
- Stop PostHog container → app remains usable
- Optimization dashboard surfaces known-heavy routes reasonably

---

## Success Criteria

1. Platform ops can open PostHog and answer “top 10 pages” and “top 10 API routes” without code.
2. Optimization dashboard identifies at least one known slow flow (e.g. attendance) in top tier.
3. Enabling analytics does not measurably degrade p95 API latency (< 2 ms delta in load test).
4. PostHog outage does not cause API or page errors.

---

## Related Work (not duplicated)

- `/shortcuts/analytics` — business ops metrics (keep separate)
- `AIRequestLog` / AI usage dashboards — AI-specific (keep separate)
- Cron health `/debug/cron-jobs` — background job observability (keep separate)
- Attendance marking bootstrap spec — example consumer of optimization priority data
