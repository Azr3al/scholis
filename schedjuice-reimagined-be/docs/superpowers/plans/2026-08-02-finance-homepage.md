# Finance Homepage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/finances` — a program-scoped finance landing page with daily collections line chart (ghost comparison), payment breakdown pie chart, summary stat cards, and quick links — backed by one RBAC-scoped `POST finance/homepage` API with a fixed SQL query budget (no N+1).

**Architecture:** New `app_finance/homepage_services.py` builds the full payload in one orchestrator (`build_finance_homepage_payload`) using bulk DB aggregations (`TruncDate` + grouped queries, `.aggregate()`, existing `paid_user_ids_by_course` / `resolve_student_enrollments_bulk`). FE page composes filters + charts via a single react-query hook; URL state via `nuqs`.

**Tech Stack:** Django REST (`RBACView`), PostgreSQL, django-money, React Query, Recharts (`GenericLineChart` / `GenericPieChart`), `nuqs`, Vitest (FE), Django `TestCase` + `assertNumQueries` (BE).

**Spec:** `docs/superpowers/specs/2026-08-02-finance-homepage-design.md`

## Global Constraints

- Line chart Y-axis: **daily verified collections** (MMK per calendar day).
- Access: **one dashboard**, RBAC-scoped data (`scope_courses_for_user` on BE; membership-scoped teachers see subset).
- Unpaid: **Unpaid Students definition** — count = students with no covering payment for anchor month; amount = sum of `compute_course_term_total` for those pairs.
- Pie chart: **shared filters**, slice by verified **amount**, count in tooltip.
- Intake time range: single intake → intake dates; all intakes → month presets.
- Ghost line: previous intake (single intake) or previous equivalent calendar period.
- **SQL: ≤ 12 queries per request**, must not scale with course/student count — **no N+1**.
- BE tests: always `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be/` (uses test DB + `--keepdb`).
- FE tests: `npm run test:unit -- <path>` from `schedjuice-reimagined-fe/`.
- High-value tests only — RBAC denials, wrong scope, query budget, behavioral asserts.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_finance/homepage_services.py` | Create | Scope, period/ghost resolution, all aggregates |
| `schedjuice-reimagined-be/app_finance/views.py` | Modify | `FinanceHomepageView` |
| `schedjuice-reimagined-be/app_finance/urls.py` | Modify | Register `finance/homepage` |
| `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py` | Create | RBAC, aggregates, query budget |
| `schedjuice-reimagined-fe/src/types/finance/homepage.ts` | Create | Request/response types |
| `schedjuice-reimagined-fe/src/hooks/finances/use-finance-homepage.ts` | Create | React-query hook |
| `schedjuice-reimagined-fe/src/hooks/finances/use-finance-homepage.test.ts` | Create | Hook param / URL builder tests |
| `schedjuice-reimagined-fe/src/components/finances/finance-homepage-stat-cards.tsx` | Create | Four summary cards + % change |
| `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx` | Create | Filters, charts, quick links |
| `schedjuice-reimagined-fe/src/components/charts/finance-collections-line-chart.tsx` | Create | Dual-series line chart (current + ghost) |
| `schedjuice-reimagined-fe/src/components/charts/generic-pie-chart.tsx` | Modify | Amount dataKey + amount/count tooltip |
| `schedjuice-reimagined-fe/src/app/(internal)/finances/page.tsx` | Create | Page shell |
| `schedjuice-reimagined-fe/src/config/nav-routes.tsx` | Modify | Add Overview nav item (first Finance child) |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | Modify | Expand `/finances` anyOf |

---

### Task 1: Backend — scope & period resolution

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/homepage_services.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py`

**Interfaces:**
- Produces:
  ```python
  # homepage_services.py
  PeriodKind = Literal[
      "single_month", "last_3_months", "last_6_months",
      "last_12_months", "all_time", "custom", "intake_range",
  ]
  PieGroupBy = Literal["payment_status", "bank_type", "payment_method", "course"]

  @dataclass(frozen=True)
  class PeriodBounds:
      date_from: date
      date_to: date
      anchor_month: tuple[int, int]  # (year, month)
      label: str

  @dataclass(frozen=True)
  class GhostBounds:
      date_from: date
      date_to: date
      label: str
      align_by_day_index: bool  # True for single-intake ghost

  def resolve_scope_course_ids(
      *, program_id: int, intake_id: int | None, user: User
  ) -> list[int]: ...

  def resolve_period_bounds(
      *,
      period: PeriodKind,
      date_from: date | None,
      date_to: date | None,
      intake: Intake | None,
      org,
  ) -> PeriodBounds: ...

  def resolve_ghost_bounds(
      *,
      current: PeriodBounds,
      program_id: int,
      intake: Intake | None,
  ) -> GhostBounds | None: ...
  ```

- [ ] **Step 1: Write failing tests for scope resolution**

Add to `test_finance_homepage.py`:

```python
from datetime import date
from uuid import uuid4

from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Intake, Program, UserCourse
from app_finance.homepage_services import resolve_scope_course_ids


class FinanceHomepageScopeTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.admin = User.objects.filter(roles__contains=["admin"]).first()
            self.teacher = User.objects.create_user(
                email=f"fh-teacher-{suffix}@example.com",
                password="x",
                name="FH Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            self.program = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course_a = Course.objects.create(
                title=f"A {suffix}",
                category=cat,
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            self.course_b = Course.objects.create(
                title=f"B {suffix}",
                category=cat,
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )

    def test_teacher_scope_excludes_unassigned_courses(self):
        with schema_context(self.schema_name):
            ids = resolve_scope_course_ids(
                program_id=self.program.id, intake_id=None, user=self.teacher
            )
        self.assertEqual(ids, [self.course_a.id])

    def test_admin_scope_includes_all_program_courses(self):
        with schema_context(self.schema_name):
            ids = resolve_scope_course_ids(
                program_id=self.program.id, intake_id=None, user=self.admin
            )
        self.assertCountEqual(ids, [self.course_a.id, self.course_b.id])
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage.FinanceHomepageScopeTests -v 2
```

Expected: `ImportError: cannot import name 'resolve_scope_course_ids'`

- [ ] **Step 3: Implement scope + period helpers**

Create `homepage_services.py` with:

```python
from app_course.course_scoping import scope_courses_for_user
from app_course.models import Course, Intake, Program
from app_course.program_helpers import get_default_program
from app_reports.analytics_services import _as_org_day_bounds, _tz_for_tenant

def resolve_scope_course_ids(*, program_id: int, intake_id: int | None, user) -> list[int]:
    qs = Course.objects.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    qs = scope_courses_for_user(user, qs)
    return list(qs.values_list("id", flat=True))
```

Implement `resolve_period_bounds` (month presets + intake date range) and `resolve_ghost_bounds` (previous intake by `start_date`, or equal-length calendar window before `date_from`).

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage.FinanceHomepageScopeTests -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_finance/homepage_services.py app_finance/tests/test_finance_homepage.py
git commit -m "feat(finance): add homepage scope and period resolution helpers"
```

---

### Task 2: Backend — collected aggregates & daily line series (no N+1)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/homepage_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py`

**Interfaces:**
- Produces:
  ```python
  def aggregate_collected_summary(
      *, course_ids: list[int], start_dt, end_dt
  ) -> tuple[Decimal, int]: ...  # (amount, count)

  def aggregate_daily_series(
      *, course_ids: list[int], start_dt, end_dt, org
  ) -> list[dict]: ...  # [{"date": "2026-05-01", "amount": "450000.00"}, ...]
  ```

- [ ] **Step 1: Write failing collected aggregate test**

```python
from decimal import Decimal
from django.utils import timezone

from app_finance.models import UserPayment
from app_finance.homepage_services import aggregate_collected_summary, aggregate_daily_series


class FinanceHomepageCollectedTests(TestCase):
    # reuse fixture from Task 1 setup pattern
    def test_collected_summary_sums_verified_payments_in_scope(self):
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                status=UserPayment.Status.VERIFIED,
                verified_at=timezone.now(),
                parsed_amount=Decimal("100000"),
            )
            start_dt, end_dt = ...
            amount, count = aggregate_collected_summary(
                course_ids=[self.course_a.id], start_dt=start_dt, end_dt=end_dt
            )
        self.assertEqual(count, 1)
        self.assertEqual(amount, Decimal("100000"))
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage.FinanceHomepageCollectedTests -v 2
```

- [ ] **Step 3: Implement single-query aggregates**

```python
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from app_finance.models import UserPayment
from app_reports.analytics_services import _payment_revenue_amount, _date_series

def _verified_payments_qs(*, course_ids, start_dt, end_dt):
    if not course_ids:
        return UserPayment.objects.none()
    return UserPayment.objects.filter(
        course_id__in=course_ids,
        status=UserPayment.Status.VERIFIED,
        verified_at__isnull=False,
        verified_at__gte=start_dt,
        verified_at__lte=end_dt,
    )

def aggregate_collected_summary(*, course_ids, start_dt, end_dt):
    qs = _verified_payments_qs(course_ids=course_ids, start_dt=start_dt, end_dt=end_dt)
    # Prefer DB Sum on amount columns; if MoneyField Sum fails in CI, use ONE queryset.iterator()
    # bucketing in Python (still one query — not N+1).
    ...

def aggregate_daily_series(*, course_ids, start_dt, end_dt, org):
    tz = _tz_for_tenant(org)
    qs = _verified_payments_qs(course_ids=course_ids, start_dt=start_dt, end_dt=end_dt)
    buckets: dict[date, Decimal] = {}
    for row in qs.annotate(day=TruncDate("verified_at", tzinfo=tz)).values("day", "actual_amount", "parsed_amount"):
        ...
    # fill _date_series gaps with zero
    return [{"date": d.isoformat(), "amount": str(buckets.get(d, Decimal("0")))} for d in _date_series(...)]
```

**N+1 rule:** `aggregate_collected_summary` and `aggregate_daily_series` each use **at most 1 SQL query**. Never filter by single `course_id` in a loop.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(finance): add bulk collected aggregates for homepage"
```

---

### Task 3: Backend — unpaid aggregates (bulk, no N+1)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/homepage_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py`

**Interfaces:**
- Produces:
  ```python
  def aggregate_unpaid_summary(
      *, course_ids: list[int], anchor_year: int, anchor_month: int, org
  ) -> tuple[Decimal, int]: ...  # (amount, distinct student count)
  ```

- [ ] **Step 1: Write failing unpaid test**

```python
from app_finance.homepage_services import aggregate_unpaid_summary
from app_finance.unpaid_helpers import unpaid_counts_by_course

def test_unpaid_count_matches_unpaid_helpers(self):
    with schema_context(self.schema_name):
        amount, count = aggregate_unpaid_summary(
            course_ids=[self.course_a.id],
            anchor_year=2026,
            anchor_month=8,
            org=self.org,
        )
        payment_params = {"issued_at__gte": "...", "issued_at__lte": "..."}
        expected = sum(unpaid_counts_by_course([self.course_a.id], payment_params).values())
    self.assertEqual(count, expected)
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement bulk unpaid aggregation**

```python
from app_finance.discount_engine import compute_course_term_total
from app_finance.payment_discount_apply import resolve_student_enrollments_bulk
from app_finance.unpaid_helpers import paid_user_ids_by_course

def aggregate_unpaid_summary(*, course_ids, anchor_year, anchor_month, org):
    if not course_ids:
        return Decimal("0"), 0
    payment_params = _payment_params_for_anchor_month(anchor_year, anchor_month, org)
    paid_by_course = paid_user_ids_by_course(payment_params, course_ids)  # 1 query
    rows = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).values_list("course_id", "user_id")  # 1 query
    unpaid_pairs: set[tuple[int, int]] = set()
    unpaid_student_ids: set[int] = set()
    for cid, uid in rows:
        if uid not in paid_by_course.get(cid, ()):
            unpaid_pairs.add((uid, cid))
            unpaid_student_ids.add(uid)
    enrollments = resolve_student_enrollments_bulk(unpaid_pairs)  # 1 query
    total = Decimal("0")
    for pair, uc in enrollments.items():
        plan = uc.course.payment_plan
        if plan is None:
            continue
        total += Decimal(str(compute_course_term_total(user_course=uc, payment_plan=plan).amount))
    return total, len(unpaid_student_ids)
```

**N+1 rule:** exactly **3 queries** for unpaid block (paid map, enrollments list, bulk enrollment load). Python loop over `unpaid_pairs` only — no SQL inside.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(finance): add bulk unpaid summary for homepage"
```

---

### Task 4: Backend — pie chart aggregation & full payload

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/homepage_services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py`

**Interfaces:**
- Produces:
  ```python
  def aggregate_pie_slices(
      *, course_ids: list[int], start_dt, end_dt, pie_group_by: PieGroupBy
  ) -> list[dict]: ...

  def build_finance_homepage_payload(*, program_id, intake_id, period, date_from, date_to, pie_group_by, user, org) -> dict: ...
  ```

- [ ] **Step 1: Write failing pie + payload tests**

```python
def test_pie_slices_sum_to_collected_total(self):
    ...
    payload = build_finance_homepage_payload(...)
    slice_total = sum(Decimal(s["amount"]) for s in payload["pie_chart"]["slices"])
    self.assertEqual(slice_total, Decimal(payload["summary"]["collected_amount"]))

def test_pie_group_by_payment_status(self):
    ...
    keys = {s["key"] for s in payload["pie_chart"]["slices"]}
    self.assertIn("verified", keys)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement pie + orchestrator**

```python
_GROUP_FIELDS = {
    "payment_status": ("status", "status"),
    "bank_type": ("payment_method__payment_bank", "payment_method__payment_bank"),
    "payment_method": ("payment_method_id", "payment_method__name"),
    "course": ("course_id", "course__title"),
}

def aggregate_pie_slices(*, course_ids, start_dt, end_dt, pie_group_by):
    key_field, label_field = _GROUP_FIELDS[pie_group_by]
    qs = _verified_payments_qs(course_ids=course_ids, start_dt=start_dt, end_dt=end_dt)
    # ONE grouped query:
    rows = qs.values(key_field, label_field).annotate(count=Count("id"))
    # amount: sum in same query if Sum works; else one iterator pass (still 1 query)
    ...

def build_finance_homepage_payload(...):
    course_ids = resolve_scope_course_ids(...)
    if not course_ids:
        return _empty_payload(...)
    current = resolve_period_bounds(...)
    ghost = resolve_ghost_bounds(...)
    # current block: 1 summary + 1 line + 1 pie + 3 unpaid = 6 queries
    # ghost block (if ghost): +4 queries
    # scope already counted: 1 query → total ≤ 12
    ...
```

Implement `_pct_change(current, previous) -> float | None` and comparison block.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(finance): add homepage pie aggregation and payload builder"
```

---

### Task 5: Backend — view, URL, RBAC & query budget test

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/urls.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_finance_homepage.py`

**Interfaces:**
- Produces: `POST /api/v1/finance/homepage` → `FinanceHomepageView`

- [ ] **Step 1: Write failing RBAC + query budget tests**

```python
from django.test import TestCase
from django.db import connection
from django.test.utils import CaptureQueriesContext

class FinanceHomepageViewTests(TestCase):
    def test_forbidden_without_finance_permission(self):
        resp = self.client.post("/api/v1/finance/homepage", {...}, HTTP_X_DTS_SCHEMA=self.schema_name)
        self.assertEqual(resp.status_code, 403)

    def test_query_count_bounded_with_many_courses(self):
        # seed 50 courses, 200 students, verified payments
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.post("/api/v1/finance/homepage", {...})
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(ctx), 12, msg=f"queries: {ctx.captured_queries}")
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage.FinanceHomepageViewTests -v 2
```

- [ ] **Step 3: Add view + URL**

In `views.py`:

```python
_HOMEPAGE_PERMS = frozenset({
    "payment.view_all", "payment.view", "payment.record",
    "payment.view_unpaid", "payment.view_unpaid_all", "analytics.view",
})

class FinanceHomepageView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied()
        held = set(effective_permissions(user))
        if not held.intersection(_HOMEPAGE_PERMS):
            raise PermissionDenied()

    def post(self, request):
        # validate program_id, period, pie_group_by
        org = request.tenant
        payload = build_finance_homepage_payload(
            program_id=int(request.data["program_id"]),
            intake_id=request.data.get("intake_id"),
            period=request.data.get("period", "single_month"),
            date_from=_parse_date(request.data.get("date_from")),
            date_to=_parse_date(request.data.get("date_to")),
            pie_group_by=request.data.get("pie_group_by", "payment_status"),
            user=acting_user(request),
            org=org,
        )
        return self.send_response(False, "success", payload)
```

In `urls.py`:

```python
path("finance/homepage", views.FinanceHomepageView.as_view(), name="finance-homepage"),
```

- [ ] **Step 4: Run full homepage test module — expect PASS**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage -v 2
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(finance): expose homepage dashboard API with query budget guard"
```

---

### Task 6: Frontend — types, hook & chart primitives

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/finance/homepage.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-finance-homepage.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-finance-homepage.test.ts`
- Create: `schedjuice-reimagined-fe/src/components/charts/finance-collections-line-chart.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/charts/generic-pie-chart.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type FinanceHomepageRequest = {
    program_id: number;
    intake_id?: number | null;
    period: FinanceHomepagePeriod;
    date_from?: string;
    date_to?: string;
    pie_group_by: FinancePieGroupBy;
  };

  export function buildFinanceHomepageRequest(state: FinanceHomepageFilterState): FinanceHomepageRequest;
  export function useFinanceHomepage(filters: FinanceHomepageFilterState): UseQueryResult<FinanceHomepageResponse>;
  ```

- [ ] **Step 1: Write failing hook test**

```ts
import { describe, expect, it } from "vitest";
import { buildFinanceHomepageRequest } from "./use-finance-homepage";

describe("buildFinanceHomepageRequest", () => {
  it("maps program and pie group by", () => {
    expect(
      buildFinanceHomepageRequest({
        programId: "12",
        intakeId: "",
        period: "last_3_months",
        dateFrom: null,
        dateTo: null,
        pieGroupBy: "payment_status",
      }),
    ).toEqual({
      program_id: 12,
      intake_id: null,
      period: "last_3_months",
      pie_group_by: "payment_status",
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/hooks/finances/use-finance-homepage.test.ts
```

- [ ] **Step 3: Implement types, hook, charts**

`use-finance-homepage.ts`:

```ts
export function useFinanceHomepage(filters: FinanceHomepageFilterState) {
  const body = buildFinanceHomepageRequest(filters);
  return useQuery({
    queryKey: ["finance-homepage", body],
    queryFn: () => makePostRequest("finance/homepage", body),
    enabled: Boolean(body.program_id),
  });
}
```

`finance-collections-line-chart.tsx`: dual `Area` series — primary solid, ghost dashed `@ 30% opacity`.

`generic-pie-chart.tsx`: add prop `dataKey?: "count" | "amount"` (default `"count"` for backward compat); tooltip renders `{amount} ({count})`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(finance): add homepage hook and chart primitives"
```

---

### Task 7: Frontend — stat cards & homepage content

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-stat-cards.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx`

**Interfaces:**
- Consumes: `useFinanceHomepage`, `FinanceCollectionsLineChart`, `GenericPieChart`, `EntityCombobox`, `FilterToolbar`
- Produces: `FinanceHomepageContent` default export

- [ ] **Step 1: Implement stat cards with % change**

```tsx
function ChangeBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={cn("text-sm", up ? "text-green-600" : "text-red-600")}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
```

Four cards: Collected amount, Collected count, Unpaid amount, Unpaid count — each with `ChangeBadge`.

- [ ] **Step 2: Implement `FinanceHomepageContent`**

Filter toolbar:
- `EntityCombobox entity="programs"` — scoped list for teachers
- Intake combobox when `course_creation_method === intake_based`
- Period select (month presets or hidden when single intake)
- Pie group-by select

Charts grid (2-col on lg): line + pie.

Quick links (permission-gated via `usePermissions().canAny`):
- Student Payments → `/finances/student-payments?program=…&month=…`
- Unpaid Students → `/finances/unpaid-students?program=…&month=…`
- Recent Transactions → `/finances/recent-transactions?from=…&to=…`

Default program logic on mount (spec section: default program → first accessible for teachers).

Loading: `ReportSkeleton` or dashboard metric skeletons. Empty: "No programs available".

- [ ] **Step 3: Manual smoke**

Run FE dev server; verify page renders at `/finances` (after Task 8 route added).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(finance): add homepage content with stats, charts, and quick links"
```

---

### Task 8: Frontend — route, nav & permissions

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/finances/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`
- Modify: `schedjuice-reimagined-fe/src/config/route-permissions.ts`

- [ ] **Step 1: Write failing route-permissions test (if test file exists) or verify manually**

Check `route-permissions` test suite; if present add:

```ts
it("allows teachers with payment.view onto /finances", () => {
  expect(canAccessRoute("/finances", userWith(["payment.view"]))).toBe(true);
});
```

- [ ] **Step 2: Add page + nav + permissions**

`page.tsx`:

```tsx
"use client";
import { PageContainer } from "@/components/layout/page-container";
import { FinanceHomepageContent } from "@/components/finances/finance-homepage-content";
import { usePageHeader } from "@/components/shell/use-page-header";

export default function FinanceHomePage() {
  usePageHeader({
    breadcrumb: <h1 className="font-serif text-lg">Finance</h1>,
  });
  return (
    <PageContainer width="wide">
      <FinanceHomepageContent />
    </PageContainer>
  );
}
```

`nav-routes.tsx` — insert as first Finance child:

```tsx
{
  title: "Overview",
  icon: LayoutDashboard, // or PiggyBank
  href: "/finances",
  requiredPermissions: [
    "payment.view_all", "payment.view", "payment.record",
    "payment.view_unpaid", "payment.view_unpaid_all", "analytics.view",
  ],
},
```

`route-permissions.ts` — update `/finances` anyOf to match.

- [ ] **Step 3: Run FE unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/hooks/finances/use-finance-homepage.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(finance): add /finances route, nav entry, and permissions"
```

---

### Task 9: Integration verification

- [ ] **Step 1: Run full backend homepage tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_finance_homepage -v 2
```

Expected: all PASS; `test_query_count_bounded_with_many_courses` ≤ 12 queries.

- [ ] **Step 2: Run FE unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/hooks/finances/use-finance-homepage.test.ts
```

- [ ] **Step 3: Manual checklist**

- [ ] Admin: default program selected; charts populate
- [ ] Teacher: only assigned courses reflected in totals
- [ ] Ghost line visible when predecessor exists; hidden on first intake
- [ ] Pie group-by toggles refetch with same filters
- [ ] Quick links hidden when permission missing
- [ ] URL reload preserves filters

- [ ] **Step 4: Update spec status**

In `docs/superpowers/specs/2026-08-02-finance-homepage-design.md`, set `Status: Approved`.

- [ ] **Step 5: Final commit (if spec status changed)**

```bash
git add docs/superpowers/specs/2026-08-02-finance-homepage-design.md docs/superpowers/plans/2026-08-02-finance-homepage.md
git commit -m "docs: approve finance homepage spec and plan"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
| --- | --- |
| `/finances` landing page | Task 8 |
| Program dropdown + default logic | Task 7 |
| Intake/month period controls | Task 1, 7 |
| Daily verified line chart + ghost | Task 2, 6, 7 |
| Four stat cards + % change | Task 4, 7 |
| Pie chart group-by (4 dimensions) | Task 4, 6, 7 |
| Quick links with URL params | Task 7 |
| RBAC-scoped data | Task 1, 5 |
| Unpaid Students definition | Task 3 |
| ≤ 12 queries, no N+1 | Task 2–5 |
| Route permissions expanded | Task 8 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-02-finance-homepage.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
