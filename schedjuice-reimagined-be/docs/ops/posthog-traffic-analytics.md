# PostHog traffic analytics — ops runbook

PostHog **Cloud (US)** for Schedjuice platform traffic analytics (pageviews + API request
metrics). Audience: platform operators / superadmins, cross-tenant.

**Design spec:** `docs/superpowers/specs/2026-07-02-traffic-analytics-posthog-design.md`

**Hosts:**
- **Event ingest (BE + FE SDK):** `https://us.i.posthog.com`
- **PostHog UI (dashboards):** `https://us.posthog.com`

---

## 1. Create PostHog Cloud account and project

### Sign up

1. Go to [posthog.com](https://posthog.com) and create an organization (or use an existing one).
2. Select **US Cloud** hosting when prompted (data stored in US region).
3. Create a project named **`schedjuice-production`**.
   - Optional: separate project **`schedjuice-staging`** for staging-only traffic.

### Copy credentials

1. Open **Project Settings → Project API key**.
2. Copy the **Project API key** → backend `POSTHOG_API_KEY` and frontend `NEXT_PUBLIC_POSTHOG_KEY`
   (same key for capture from both sides in v1).
3. Set ingest host on both apps:
   - Backend: `POSTHOG_HOST=https://us.i.posthog.com`
   - Frontend: `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`
4. Store keys in deployment secrets (not in git). `.env.example` files document names only.

### Verify account access

1. Open `https://us.posthog.com` and confirm you can see the project.
2. Open **Activity → Live events** — leave this tab open for rollout verification.

### Cloud billing note

Event volume is billed by PostHog Cloud. Current policy keeps volume manageable:

- **API events:** 50% sampling of successful requests (`POSTHOG_API_SAMPLE_RATE=0.5`); errors,
  slow, and heavy-DB requests captured at 100%.
- **Pageviews:** no sampling.

Monitor usage under **Settings → Billing & usage** and [PostHog pricing](https://posthog.com/pricing).

---

## 2. Env vars — staging → production rollout

Feature flags default **off** in dev unless explicitly enabled. Roll out in order:

| Phase | Scope | Gate | Backend (`schedjuice-reimagined-be`) | Frontend (`schedjuice-reimagined-fe`) |
|-------|--------|------|--------------------------------------|----------------------------------------|
| **0** | PostHog Cloud project | Live events tab reachable | *(none — PostHog only)* | *(none)* |
| **1** | Backend middleware on **staging** | `api_request` in Live events; non-blocking verified | `POSTHOG_ENABLED=true`<br>`POSTHOG_HOST=https://us.i.posthog.com`<br>`POSTHOG_API_KEY=<project key>`<br>`POSTHOG_API_SAMPLE_RATE=0.5`<br>`POSTHOG_ENVIRONMENT=staging` | *(unchanged — key unset)* |
| **2** | Frontend pageviews on **staging** | Normalized paths ~60–90 patterns | *(same as phase 1)* | `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`<br>`NEXT_PUBLIC_POSTHOG_KEY=<project key>`<br>`NEXT_PUBLIC_POSTHOG_ENVIRONMENT=staging`<br>`NEXT_PUBLIC_POSTHOG_DASHBOARD_URL=` *(optional until phase 4)* |
| **3** | **Production** enable | Monitor event volume / billing | Same as phase 1 with `POSTHOG_ENVIRONMENT=production` | Same as phase 2 with `NEXT_PUBLIC_POSTHOG_ENVIRONMENT=production` |
| **4** | Dashboards + debug link | Ops self-serve rankings | *(unchanged)* | Set `NEXT_PUBLIC_POSTHOG_DASHBOARD_URL` to saved **Optimization priority** dashboard URL for `/debug` link card |

### Backend variables (reference)

```bash
POSTHOG_ENABLED=false          # must be true to emit api_request events
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
POSTHOG_API_SAMPLE_RATE=0.5    # 50% of 2xx/3xx; 4xx/5xx/slow/heavy-DB always 100%
POSTHOG_ENVIRONMENT=staging    # or production / development
```

### Frontend variables (reference)

```bash
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=       # pageviews disabled when unset
NEXT_PUBLIC_POSTHOG_DASHBOARD_URL=https://us.posthog.com/project/<project-id>/dashboard/<dashboard-id>
NEXT_PUBLIC_POSTHOG_ENVIRONMENT=staging
```

### Event names

| Source | Event | When |
|--------|-------|------|
| Frontend | `$pageview` | Route change on tracked paths (no sampling) |
| Backend | `api_request` | `/api/v1/*` after response (sampled per policy) |

---

## 3. Saved dashboard definitions

Create five dashboards in PostHog Cloud and save URLs in this doc (or team password manager).

**Sample-adjusted volume** (for sampled success traffic):

```text
adjusted_count = count(events where sampled = true) / sample_rate
```

Where `sample_rate` is typically `0.5`. Always-include events (`sampled = false` or 4xx/5xx)
use raw count.

---

### 3.1 Product traffic

**Purpose:** Most visited frontend pages, cross-tenant.

| Insight | Type | Formula / config |
|---------|------|------------------|
| Top pages (7d) | Trends | Event: `$pageview`, aggregation: **Total count**, breakdown: `normalized_path`, last 7 days |
| Top pages (30d) | Trends | Same, last 30 days |
| By role | Trends | Event: `$pageview`, breakdown: `normalized_path`, secondary breakdown: `role_bucket` |

**Filters:** none (all tenants). Optional filter `environment = production` in prod.

---

### 3.2 API volume

**Purpose:** Most called API routes with extrapolated volume.

| Insight | Type | Formula / config |
|---------|------|------------------|
| Top routes (raw) | Trends | Event: `api_request`, breakdown: `route_template`, count |
| Top routes (adjusted) | Trends / HogQL | For rows with `sampled = true`: use `count / sample_rate`; combine with 100% captured errors/slow/heavy |
| Unique tenants | Trends | Event: `api_request`, breakdown: `route_template`, unique values of `tenant_schema` |

**HogQL sketch (adjusted volume by route):**

```sql
SELECT
  properties.route_template AS route_template,
  sum(if(properties.sampled, 1 / properties.sample_rate, 1)) AS adjusted_volume
FROM events
WHERE event = 'api_request'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY route_template
ORDER BY adjusted_volume DESC
LIMIT 50
```

---

### 3.3 Optimization priority

**Purpose:** Rank routes by popularity × cost so engineering prioritizes high-traffic slow/DB-heavy endpoints.

**Score formula:**

```text
optimization_score = adjusted_volume × p95(response_ms) × avg(db_query_count)
```

Sort **descending** by `optimization_score`.

| Insight | Type | Notes |
|---------|------|-------|
| Priority table | HogQL / formula | Group by `route_template`; compute adjusted_volume, p95 of `response_ms`, avg of `db_query_count`, then product |
| Slow + popular | Table | Filter `p95(response_ms) >= 1000` or top N by score |

**HogQL sketch:**

```sql
SELECT
  properties.route_template AS route_template,
  sum(if(properties.sampled, 1 / properties.sample_rate, 1)) AS adjusted_volume,
  quantile(0.95)(properties.response_ms) AS p95_response_ms,
  avg(properties.db_query_count) AS avg_db_query_count,
  adjusted_volume * p95_response_ms * avg_db_query_count AS optimization_score
FROM events
WHERE event = 'api_request'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY route_template
ORDER BY optimization_score DESC
LIMIT 25
```

Save dashboard URL → `NEXT_PUBLIC_POSTHOG_DASHBOARD_URL` (phase 4).

---

### 3.4 Errors & payloads

**Purpose:** Error-prone routes and large responses.

| Insight | Type | Formula / config |
|---------|------|------------------|
| Error rate by route | Trends | Event: `api_request`, formula: `count(status_code >= 400) / count(*)`, breakdown: `route_template` |
| 5xx volume | Trends | Filter `status_code >= 500`, breakdown: `route_template` |
| Largest payloads | Trends | Event: `api_request`, aggregation: **Average** of `response_bytes`, breakdown: `route_template`, sort desc |

---

### 3.5 Docs usage

**Purpose:** Help and platform docs traffic only.

| Insight | Type | Formula / config |
|---------|------|------------------|
| Help pages | Trends | Event: `$pageview`, filter `normalized_path` starts with `/help/`, breakdown: `normalized_path` |
| Platform docs | Trends | Event: `$pageview`, filter `normalized_path` starts with `/platform/docs/`, breakdown: `normalized_path` |
| Combined docs | Trends | `$pageview` with OR filter on both path prefixes |

---

## 4. Verification — test events in Live events

1. Open PostHog Cloud → **Activity → Live events**.
2. **Test `$pageview`:**
   - PostHog UI → **Events → New event** (or SDK test) with event name `$pageview`.
   - Properties (example): `normalized_path: /courses/:id/attendance/marking/:eventIndex`,
     `role_bucket: admin`, `environment: staging`.
   - Confirm event appears in Live events within ~30 s.
3. **Test `api_request`:**
   - Send test event `api_request` with properties: `route_template`, `method`, `status_code`,
     `response_ms`, `db_query_count`, `db_time_ms`, `response_bytes`, `tenant_schema`,
     `sampled`, `sample_rate`, `environment`.
   - Confirm in Live events.
4. **End-to-end (staging):**
   - Enable phase 1 BE env on staging; hit a `/api/v1/` endpoint → `api_request` in Live events.
   - Enable phase 2 FE env; navigate an internal route → `$pageview` with `normalized_path`.

---

## 5. Non-blocking verification checklist

Analytics must never block or break app requests. Verify before production (phase 3):

- [ ] **PostHog unreachable:** Block outbound HTTPS to `us.i.posthog.com` (or revoke/invalidate
      `POSTHOG_API_KEY`). Staging API returns **200**; no user-visible errors. Backend logs may
      show queue drops at WARNING — not exceptions.
- [ ] **Frontend:** With PostHog unreachable, pages load normally; no UI error toasts from analytics.
- [ ] **Load test:** Compare p95 API latency with `POSTHOG_ENABLED=true` vs `false` — delta **< 2 ms**.
- [ ] **Queue full:** Under synthetic load, bounded queue drops events silently; responses still **200**.
- [ ] **Worker failure:** Simulate capture exception in worker — middleware still completes.
- [ ] **Restore access:** Re-enable API key / network; events flow again without app restart.

---

## Related (out of scope for this runbook)

- `/shortcuts/analytics` — business ops metrics (separate)
- AI usage / `AIRequestLog` — separate
- Silk / QueryLogger — dev-only
