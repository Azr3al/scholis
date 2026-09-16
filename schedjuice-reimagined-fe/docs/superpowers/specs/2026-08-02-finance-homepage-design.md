# Finance Homepage

**Date:** 2026-08-02  
**Status:** Approved for planning  
**Surface:** `/finances` (new landing page, root of Finance nav)  
**Approach:** Dedicated `POST finance/homepage` API + single FE page with shared filter state

## Summary

Add a finance homepage at `/finances` that gives admins, teachers, and other finance-permitted users an at-a-glance view of collections and unpaid exposure for a selected program, with a daily collections line chart (ghost comparison), a payment breakdown pie chart, and quick links to Student Payments, Unpaid Students, and Recent Transactions.

One dashboard layout for all roles; data is RBAC-scoped server-side (teachers see only courses they belong to).

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Line chart Y-axis | Daily verified collections (MMK per calendar day) |
| Access model | One dashboard; RBAC-scoped data (not admin-only) |
| Unpaid definition | Unpaid Students page: count = students with no covering payment; amount = sum of expected term fees for those pairs |
| Pie chart | Same program + period filters; slice by verified **amount**; count in tooltip |
| Intake time range | Single intake → intake `start_date`–`end_date` (or today); All intakes → month presets (last month, 3/6/12 months, all time, custom) |
| Monthly programs | Month picker + presets (last 3/6/12 months, all time, custom) — no intake selector |
| Ghost line | Previous intake (intake-based, single) or previous equivalent calendar period (monthly / all intakes) |
| Backend | Dedicated bundled endpoint — not composed from existing APIs |
| SQL performance | Fixed query budget; **no N+1** (see Query performance section) |

## Goals / non-goals

**Goals**

- Finance root page: metrics, charts, navigation hub
- Program-scoped aggregates with intake/month period controls
- Ghost comparison on line chart and % change on stat cards
- Pie chart group-by: payment status (default), bank type, payment method, course
- Quick links pass filter context via URL query params
- Teachers see scoped data; admins see school-wide (within program)

**Non-goals**

- Cash-flow / payroll / P&L (existing `/finances/cash-flow`, `/finances/school-overview`)
- Student self-pay flows (`/finances/make-payment`)
- Replacing `/home` finance widgets (they may link here later)
- Real-time / websocket updates
- Export / PDF from homepage

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ FinanceHomePage (FE)                                            │
│  FilterToolbar: program, intake|month|period, pie group-by      │
│  URL state (nuqs) ─────────────────────────────────────────────│
└────────────────────────────┬────────────────────────────────────┘
                             │ POST finance/homepage (single call)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ FinanceHomepageView → build_finance_homepage_payload()         │
│  1. resolve_scope_courses(program, intake, user) → course_ids  │
│  2. resolve_period_bounds(...) → current + ghost date ranges    │
│  3. aggregate_summary (collected + unpaid, current + ghost)     │
│  4. aggregate_daily_series (line current + ghost)               │
│  5. aggregate_pie_slices (group_by)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Lofi layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Finance                          [Program ▼] [Intake/Period ▼]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │
│ │ Collected    │ │ Collected    │ │ Unpaid       │ │ Unpaid  │ │
│ │ MMK 12.4M    │ │ 847 payments │ │ MMK 3.1M     │ │ 42 stds │ │
│ │ ↑ 8.2%       │ │ ↑ 5.1%       │ │ ↓ 12.3%      │ │ ↓ 3     │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────┐ ┌─────────────────────────────┐ │
│ │ Daily Collections           │ │ Payment Breakdown           │ │
│ │ ── current  ·· ghost        │ │ Group by: [Status ▼]        │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [Student Payments]  [Unpaid Students]  [Recent Transactions]    │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend

### Route & nav

| Item | Value |
|------|-------|
| Page | `schedjuice-reimagined-fe/src/app/(internal)/finances/page.tsx` |
| Nav | First child under Finance in `nav-routes.tsx`, label **Overview** or **Finance Home** |
| Container | `PageContainer width="wide"` |
| Header | `usePageHeader` — breadcrumb + `FilterToolbar` |

### Route permissions

Expand `/finances` prefix rule in `route-permissions.ts`:

```
anyOf: payment.view_all, payment.view, payment.record,
       payment.view_unpaid, payment.view_unpaid_all, analytics.view
```

(Sub-routes keep their existing stricter rules.)

### Default program selection

On mount (before first fetch):

1. Load tenant default program (`is_default=True`) via programs list API.
2. **Admin / school-wide users:** use default program.
3. **Membership-scoped users:** if they have no course in the default program, pick the first program (alphabetical by name) where they have ≥1 course membership.
4. Program dropdown lists only programs the user can see (all for admins; filtered for teachers).

Reuse `EntityCombobox entity="programs"` + `ACTIVE_PROGRAM_FILTER_PARAMS`. Intake selector appears when `program.course_creation_method === "intake_based"`.

### Period controls

| Program type | Intake selected | Period UI |
|--------------|-----------------|-----------|
| Intake-based | Single intake | X-axis = intake start → min(end, today). No month presets. |
| Intake-based | All intakes | Month presets: single month, last 3/6/12 months, all time, custom range |
| Manual / monthly | — | Same month presets as above |

### Stat cards

Four cards using `AggregateCards` / dashboard metric grid styling:

| Card | Value | % change |
|------|-------|----------|
| Collected amount | Sum verified `actual_amount` (fallback `parsed_amount`) in scope | vs ghost period |
| Collected count | Count verified payments in scope | vs ghost period |
| Unpaid amount | Sum `term_total` for unpaid student–course pairs (see Unpaid logic) | vs ghost period |
| Unpaid count | Distinct students with no covering payment (Unpaid Students definition) | vs ghost period |

% change: `((current − previous) / previous) × 100`. Show ↑ green / ↓ red. If `previous === 0`, display **—**.

### Line chart

- Extend `GenericLineChart` (or add `FinanceCollectionsLineChart`) to support a second **ghost** `Area` series (`strokeDasharray`, `fillOpacity: 0.15`, `--chart-2`).
- Primary label from `meta.period_label`; ghost label from `line_chart.ghost_label`.
- Empty ghost array → hide ghost series and omit % changes.

### Pie chart

- Extend `GenericPieChart` to accept `amount` as slice `dataKey` (today uses `count` only); tooltip shows amount + count.
- Group-by select: `payment_status` | `bank_type` | `payment_method` | `course`.
- Labels: human-readable status labels; bank enum strings; payment method name; course title.

### Quick links

Permission-gated buttons; each carries current filter context:

| Link | Min permission | URL example |
|------|----------------|-------------|
| Student Payments | `payment.view_all` \| `payment.view` \| `payment.record` | `/finances/student-payments?program=12&month=2026-08` |
| Unpaid Students | `payment.view_unpaid` \| `payment.view_unpaid_all` | `/finances/unpaid-students?program=12&month=2026-08` |
| Recent Transactions | `payment.view_all` | `/finances/recent-transactions?program=12&from=…&to=…` |

Destination pages may ignore unknown query params initially; passing them is forward-compatible.

### URL state (`nuqs`)

Persist: `program`, `intake`, `period`, `date_from`, `date_to`, `pie_group_by`.

### Key FE files

| File | Change |
|------|--------|
| `src/app/(internal)/finances/page.tsx` | **New** — page shell |
| `src/components/finances/finance-homepage-content.tsx` | **New** — filters, cards, charts, links |
| `src/hooks/finances/use-finance-homepage.ts` | **New** — react-query hook |
| `src/config/nav-routes.tsx` | Add Overview nav item |
| `src/config/route-permissions.ts` | Expand `/finances` anyOf |
| `src/components/charts/generic-line-chart.tsx` | Optional ghost series support |
| `src/components/charts/generic-pie-chart.tsx` | Amount dataKey + richer tooltip |

## Backend

### Endpoint

`POST /api/v1/finance/homepage`

**Permission:** `anyOf` same set as route (enforced in view).

**Request body:**

```json
{
  "program_id": 12,
  "intake_id": null,
  "period": "last_3_months",
  "date_from": "2026-05-01",
  "date_to": "2026-08-01",
  "pie_group_by": "payment_status"
}
```

`period` enum: `single_month`, `last_3_months`, `last_6_months`, `last_12_months`, `all_time`, `custom`, `intake_range` (server-derived when single intake selected).

**Response:**

```json
{
  "summary": {
    "collected_amount": "12400000.00",
    "collected_count": 847,
    "unpaid_amount": "3100000.00",
    "unpaid_count": 42,
    "comparison": {
      "collected_amount_pct": 8.2,
      "collected_count_pct": 5.1,
      "unpaid_amount_pct": -12.3,
      "unpaid_count_pct": -7.1
    }
  },
  "line_chart": {
    "current": [{ "date": "2026-05-01", "amount": "450000.00" }],
    "ghost": [{ "date": "2026-04-01", "amount": "380000.00" }],
    "ghost_label": "Apr 2026"
  },
  "pie_chart": {
    "slices": [
      { "key": "verified", "label": "Verified", "amount": "8000000.00", "count": 620 }
    ]
  },
  "meta": {
    "program": { "id": 12, "name": "General", "course_creation_method": "manual" },
    "period_label": "Last 3 months",
    "date_from": "2026-05-01",
    "date_to": "2026-08-01",
    "anchor_month": { "year": 2026, "month": 8 }
  }
}
```

### Scope resolution

```python
def resolve_scope_course_ids(*, program_id, intake_id, user) -> list[int]:
    qs = Course.objects.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    if is_payment_membership_scoped(user):
        qs = qs.filter(id__in=user_course_ids_for(user))
    return list(qs.values_list("id", flat=True))
```

**One query.** Empty list → return zeroed payload + empty charts (no further queries).

### Collected aggregates & line chart

Use DB-side aggregation — **never** iterate payments in Python for totals or daily buckets.

```python
# Daily series — one query per range
UserPayment.objects.filter(
    course_id__in=course_ids,
    status=UserPayment.Status.VERIFIED,
    verified_at__gte=start_dt,
    verified_at__lte=end_dt,
).annotate(
    day=TruncDate("verified_at", tzinfo=tenant_tz)
).values("day").annotate(
    total=Sum(Coalesce(F("actual_amount"), F("parsed_amount"))),
    count=Count("id"),
).order_by("day")
```

Summary collected amount/count: same filter, single `.aggregate(total=Sum(...), count=Count(...))` — **one query** for current period, **one** for ghost.

Fill missing calendar days with zero in Python (in-memory only, no SQL).

### Pie chart

Single grouped query per request; switch `values()` field by `pie_group_by`:

| `pie_group_by` | Group field |
|----------------|-------------|
| `payment_status` | `status` |
| `bank_type` | `payment_method__payment_bank` |
| `payment_method` | `payment_method_id` (+ prefetch names in same query via `values(..., "payment_method__name")`) |
| `course` | `course_id` (+ `course__title`) |

Filter: verified payments in current period, `course_id__in=course_ids`.  
`.values(group_field).annotate(amount=Sum(...), count=Count("id"))`.

Use `select_related("payment_method", "course")` on the base queryset before aggregation when joining FK labels.

### Unpaid logic

**Anchor month:** For unpaid stats, use the **last calendar month** in the current period (`meta.anchor_month`). Unpaid is inherently month-scoped (matches Unpaid Students page).

1. Build `payment_params` with `issued_at__gte/lte` for anchor month (reuse `apply_month_scope` helpers).
2. **Unpaid count** — reuse existing bulk helpers (no per-course loop):
   - `paid_user_ids_by_course(payment_params, course_ids)` → 1 query
   - `UserCourse` active students for `course_ids` → 1 query
   - Count distinct `user_id` where not in paid set (in-memory set ops)
3. **Unpaid amount** — for unpaid `(user_id, course_id)` pairs only:
   - `resolve_student_enrollments_bulk(unpaid_pairs)` → 1 query with `select_related` + discount prefetch (existing helper)
   - Loop pairs in Python calling `compute_course_term_total(user_course, plan)` — **in-memory only**, no SQL per pair
   - Sum term totals; pairs without payment plan contribute `0` (same as admin-report `remaining_amount` null handling)

Ghost period unpaid: repeat steps 1–3 for ghost anchor month (same fixed query count).

### Ghost period resolution

| Context | Ghost range |
|---------|-------------|
| Single intake | Previous intake by `start_date` (same program); align line chart by day index within intake length |
| Monthly / all intakes + preset | Previous calendar period of equal length immediately before current `date_from` |
| Single month | Previous calendar month |
| Custom range | Equal-length window immediately preceding `date_from` |

If no ghost exists (first intake ever, etc.), return empty ghost arrays and `comparison: null` fields.

### Query performance (no N+1)

**Invariant:** Query count is **bounded by course/student count**, not proportional to it.

| Step | Queries | Notes |
|------|---------|-------|
| Resolve course IDs | 1 | `values_list` only |
| Load program/intake meta | 0–1 | Optional; can cache from request |
| Collected summary (current) | 1 | `.aggregate()` |
| Collected summary (ghost) | 1 | `.aggregate()` |
| Line series (current) | 1 | `TruncDate` + `values().annotate()` |
| Line series (ghost) | 1 | Same pattern |
| Pie slices | 1 | `values().annotate()` |
| Unpaid paid-map (current) | 1 | `paid_user_ids_by_course` |
| Unpaid enrollments (current) | 1 | `UserCourse.values_list` |
| Unpaid term totals (current) | 1 | `resolve_student_enrollments_bulk(unpaid_pairs)` |
| Unpaid (ghost) | 3 | Same three-step block |
| Membership course IDs (scoped user) | 0–1 | Cached on user context if available |

**Expected total: ≤ 12 queries** per homepage request, regardless of hundreds of courses.

**Forbidden patterns:**

- Per-course or per-student `.get()` / `.filter()` inside loops
- Loading full `UserPayment` rows for aggregation (use `.aggregate()` / `.values().annotate()`)
- Calling `build_payment_pair_context` with synthetic rows per course
- N separate pie queries per group dimension (group_by is a param, one query)

**Tests:**

- `assertNumQueries(N)` on representative fixtures (small + large course count) — query count must not increase when course count grows (only when ghost/summary blocks add fixed overhead)
- Regression test: 50 courses / 200 students ≤ 12 queries

### Key BE files

| File | Change |
|------|--------|
| `app_finance/homepage_services.py` | **New** — scope, aggregates, ghost logic |
| `app_finance/views.py` | `FinanceHomepageView` |
| `app_finance/urls.py` | Register route |
| `app_finance/tests/test_finance_homepage.py` | **New** — RBAC, aggregates, query count |

## Error handling & edge cases

| Case | Behavior |
|------|----------|
| No accessible programs | Empty state; no API call |
| Program with zero courses | Zeroed summary, empty charts |
| No ghost predecessor | Hide ghost line; comparison fields `null` |
| Previous period zero | Show **—** for % change |
| Invalid program/intake for user | 404 or 403 |
| Loading | Skeleton cards + chart placeholders |
| Partial API failure | Error banner + retry (single endpoint → all-or-nothing) |

## Testing

### Backend (high-value)

- Teacher scoped to subset of program courses — aggregates match manual sum
- Wrong-tenant / missing permission → 403
- Default program: admin vs teacher without default-program course
- Unpaid count matches `unpaid_counts_by_course` for same anchor month
- Ghost alignment: single intake day-index vs calendar month offset
- Pie grouping buckets sum to collected total
- **`assertNumQueries` bounded** — 50 courses does not exceed 12 queries

### Frontend

- Filter change sends correct POST body; URL round-trips
- Quick links hidden without permission
- Ghost series omitted when `ghost` empty
- Empty course scope → empty states, no crash

## Open items (none)

All requirements confirmed in brainstorming session 2026-08-02.
