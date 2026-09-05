# Admissions Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an enterable Admissions workspace (People master-detail + Courses lookup) gated only on `admissions.view`, with sparse APIs that reuse User Hub / Academic Hub search internals without widening those views.

**Architecture:** New `app_admissions` (no models) exposes frozen serializers at `/api/v1/admissions/`. Frontend is a Studio-pattern sibling: `buildVisibleWorkspaces` makes Admissions enterable, a context rail mounts on `/admissions` and `/admissions/courses`, and new pages call the Admissions URLs — not `/users` or `/courses`.

**Tech Stack:** Django 4.2 + DRF, tenant schemas, Next.js App Router, Vitest + Testing Library, `useContextRail`, existing User Hub filter builders and Academic Hub status filters.

**Spec:** `docs/superpowers/specs/2026-08-17-admissions-workspace-design.md`

## Global Constraints

- `admissions.view` is the desk bundle. Do **not** add it to `POST /users/search`, `POST /courses/search`, or Finance views.
- Admissions querysets are **tenant-wide**. Do **not** call `scope_users_for_user` or course connection scoping.
- Frozen serializers: extra `fields` / `expand` ignored. People rows never include NRC / `profile_completeness`.
- Receipt number is `PaymentReceipt.number`, never payment PK.
- Copy: English, admin voice, no exclamation marks, no `text-transform: uppercase`.
- Tables: Latin small-caps headers, no header icons, 52px min rows, tabular numbers. `CourseRange` for dates.
- People default tab **Students**. No Create/Import. Course rows are not links.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- Always `vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn(), post: vi.fn() } }))` before importing modules that pull nav / finance-record-nav / permissions.
- High-value tests only. No “renders People” smoke.
- Never touch the Railway/dev database.
- Two git repos: commit BE files in `schedjuice-reimagined-be`, FE files in `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_rbac/catalog.py` | Modify | Add `admissions.view` |
| `schedjuice-reimagined-be/app_rbac/defaults.py` | Modify | Grant admin + manager |
| `schedjuice-reimagined-be/app_rbac/migrations/0023_admissions_view.py` | Create | Grant existing tenants |
| `schedjuice-reimagined-be/app_rbac/tests/test_seeding.py` | Modify | Matrix assertions |
| `schedjuice-reimagined-be/app_admissions/` | Create | No models. Views, serializers, services, urls, tests |
| `schedjuice-reimagined-be/schedjuice_backend/settings.py` | Modify | TENANT_APPS + INSTALLED_APPS |
| `schedjuice-reimagined-be/schedjuice_backend/urls.py` | Modify | `include("app_admissions.urls")` |
| `schedjuice-reimagined-fe/src/config/workspaces.ts` | Modify | Enterable Admissions; omit without capability |
| `schedjuice-reimagined-fe/src/config/__tests__/workspaces.test.ts` | Modify | Admissions-only / omit card |
| `schedjuice-reimagined-fe/src/config/admissions-record-nav.ts` | Create | People + Courses |
| `schedjuice-reimagined-fe/src/lib/is-admissions-record-route.ts` | Create | Find-dock hide |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | Modify | `/admissions` → `admissions.view` |
| `schedjuice-reimagined-fe/src/components/admissions/` | Create | Rail, pages, people panel, courses table |
| `schedjuice-reimagined-fe/src/app/(internal)/admissions/` | Create | Layout + People + Courses routes |
| `schedjuice-reimagined-fe/src/components/find-page/find-page-dialog.tsx` | Modify | Hide dock on Admissions routes |
| `schedjuice-reimagined-fe/src/components/workspaces/workspaces-dialog.test.tsx` | Modify | Enterable Admissions navigates |

**Do not modify:** `UserSearchView.required_permissions`, `CourseSearchView.required_permissions`, `nav-routes.tsx` People children, Finance rails.

---

### Task 1: Catalog, defaults, migration

**Files:**
- Modify: `schedjuice-reimagined-be/app_rbac/catalog.py`
- Modify: `schedjuice-reimagined-be/app_rbac/defaults.py`
- Modify: `schedjuice-reimagined-be/app_rbac/tests/test_seeding.py`
- Create: `schedjuice-reimagined-be/app_rbac/migrations/0023_admissions_view.py`

**Interfaces:**
- Produces: catalog code `admissions.view` (sensitive, Operational); `DEFAULT_MATRIX["admin"]` and `["manager"]` include it; teacher/finance/hr/student/consultant do not

- [ ] **Step 1: Add the seeding assertions**

In `test_seeding.py`, add:

```python
    def test_admissions_view_on_admin_and_manager_only(self):
        self.assertIn("admissions.view", catalog.ALL_CODES)
        self.assertTrue(catalog.BY_CODE["admissions.view"].sensitive)
        self.assertEqual(catalog.BY_CODE["admissions.view"].data_class, "Operational")
        self.assertIn("admissions.view", defaults.DEFAULT_MATRIX["admin"])
        self.assertIn("admissions.view", defaults.DEFAULT_MATRIX["manager"])
        for slug in ("finance", "hr", "teacher", "student", "consultant"):
            self.assertNotIn("admissions.view", defaults.DEFAULT_MATRIX[slug])
```

- [ ] **Step 2: Run — expect FAIL** (`admissions.view` not in catalog)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_rbac.tests.test_seeding.SeedingTests.test_admissions_view_on_admin_and_manager_only`

- [ ] **Step 3: Add the permission and defaults**

In `catalog.py`, after the `user_image.view.id_image` entry and before `# crm / leads`:

```python
    # admissions
    _p(
        "admissions.view",
        "View admissions",
        "use the admissions desk to look up people and courses, including verified class payments",
        "Operational",
        sensitive=True,
    ),
```

In `defaults.py`, add `"admissions.view"` to both the `"admin"` and `"manager"` lists (near the other Operational codes is fine).

- [ ] **Step 4: Data migration for existing tenants**

Create `app_rbac/migrations/0023_admissions_view.py`:

```python
from django.db import migrations

NEW = "admissions.view"
GRANT_SLUGS = ("admin", "manager")


def forwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug in GRANT_SLUGS:
        role = Role.objects.filter(slug=slug).first()
        if role is None:
            continue
        RolePermission.objects.get_or_create(role=role, permission_code=NEW)
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    RolePermission.objects.filter(permission_code=NEW).delete()


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0022_drop_certificate_perms")]
    operations = [migrations.RunPython(forwards, backwards)]
```

If `0022` is not the latest on the branch, depend on whatever `app_rbac` migration is actually HEAD.

- [ ] **Step 5: Run seeding tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_rbac.tests.test_seeding`

- [ ] **Step 6: Commit (BE)**

```bash
git add app_rbac/catalog.py app_rbac/defaults.py app_rbac/tests/test_seeding.py app_rbac/migrations/0023_admissions_view.py
git commit -m "$(cat <<'EOF'
feat(rbac): add admissions.view for Founder and School Admin

EOF
)"
```

---

### Task 2: People search API

**Files:**
- Create: `schedjuice-reimagined-be/app_admissions/apps.py`
- Create: `schedjuice-reimagined-be/app_admissions/__init__.py` (empty)
- Create: `schedjuice-reimagined-be/app_admissions/serializers.py`
- Create: `schedjuice-reimagined-be/app_admissions/views.py`
- Create: `schedjuice-reimagined-be/app_admissions/urls.py`
- Create: `schedjuice-reimagined-be/app_admissions/tests/__init__.py` (empty)
- Create: `schedjuice-reimagined-be/app_admissions/tests/test_people_search.py`
- Modify: `schedjuice-reimagined-be/schedjuice_backend/settings.py` (add `"app_admissions"` to `TENANT_APPS` and `INSTALLED_APPS`, next to `app_hr`)
- Modify: `schedjuice-reimagined-be/schedjuice_backend/urls.py` — `path("api/v1/", include("app_admissions.urls"))`

**Interfaces:**
- Consumes: `apply_user_search_q_with_meta`, `OptimizedSearchMixin`, `RBACSearchView`
- Produces: `POST /api/v1/admissions/people/search` with `required_permissions = {"POST": "admissions.view"}`; row keys `id`, `name`, `alternative_name`, `email`, `phone_number`, `is_active` only; tenant-wide (no `scope_users_for_user`)

- [ ] **Step 1: Write the failing API tests**

Create `app_admissions/tests/test_people_search.py` using the same `TestCase` + `schema_context` + `load-data` + `seed_rbac` + `APIClient` pattern as `app_awards/tests/test_rbac_awards.py`.

Helpers in the test class:

```python
def _client(self, user):
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_TENANT=self.schema_name)
    return client

def _admissions_only(self, suffix: str) -> User:
    from app_rbac.cache import bump_matrix_generation
    from app_rbac.models import Role, RolePermission

    role = Role.objects.create(
        slug=f"admissions-desk-{suffix}",
        display_name="Admissions desk",
        is_system=False,
    )
    RolePermission.objects.create(role=role, permission_code="admissions.view")
    bump_matrix_generation()
    return User.objects.create_user(
        email=f"adm-{suffix}@example.com",
        password="x",
        name="Officer",
        phone_number="-",
        date_of_birth=date(1990, 1, 1),
        roles=[role.slug],
    )
```

Tests (inside `schema_context` for ORM; HTTP via `_client`):

```python
    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_admissions_only_ok_sparse_row(self):
        with schema_context(self.schema_name):
            officer = self._admissions_only(self.suffix)
        resp = self._client(officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["id"] == self.listed.id)
        self.assertEqual(row["phone_number"], "95987654321")
        self.assertNotIn("profile_completeness", row)
        self.assertNotIn("nrc", row)
        self.assertCountEqual(
            row.keys(),
            ["id", "name", "alternative_name", "email", "phone_number", "is_active"],
        )

    def test_include_inactive_off_hides_inactive(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "is_active",
                        "operator": "exact",
                        "value": "true",
                    }
                ]
            },
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.inactive.id, ids)
```

In `setUp`, create `self.teacher` (`UserRole.TEACHER`), `self.listed` (active student with `phone_number="95987654321"`), `self.inactive` (`is_active=False`). `self.officer` = `_admissions_only` for the inactive test.

- [ ] **Step 2: Run — expect FAIL** (404, app missing)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_people_search`

- [ ] **Step 3: Implement the app and view**

`apps.py`:

```python
from django.apps import AppConfig

class AppAdmissionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_admissions"
```

`serializers.py`:

```python
from rest_framework import serializers
from app_auth.models import User

class AdmissionsPersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "name",
            "alternative_name",
            "email",
            "phone_number",
            "is_active",
        )
```

`views.py` — subclass the same mixins as `UserSearchView`, but:

```python
class AdmissionsPeopleSearchView(OptimizedSearchMixin, RBACSearchView):
    model = User
    serializer = AdmissionsPersonSerializer
    required_permissions = {"POST": "admissions.view"}

    def get_serializer_class(self):
        return AdmissionsPersonSerializer

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        from app_auth.user_search import apply_user_search_q_with_meta, get_search_q

        q = get_search_q(self.request)
        if q:
            queryset, self._search_used_fallback = apply_user_search_q_with_meta(
                queryset, q
            )
        else:
            self._search_used_fallback = False
        return queryset

    def post(self, request, filter_ids=None):
        # Tenant-wide. Do not pass scoped filter_ids.
        return super().post(request, None)
```

Ignore `expand` (never switch serializer). Honor `include_inactive` the same way `OptimizedSearchMixin` already does for User Hub.

`urls.py`:

```python
from django.urls import path
from app_admissions.views import AdmissionsPeopleSearchView

urlpatterns = [
    path(
        "admissions/people/search",
        AdmissionsPeopleSearchView.as_view(),
        name="admissions-people-search",
    ),
]
```

Register the app in settings and urls as listed in Files.

- [ ] **Step 4: Run people search tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_people_search`

- [ ] **Step 5: Commit (BE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): sparse people search for admissions.view

EOF
)"
```

---

### Task 3: Attending + last verified payment

**Files:**
- Create: `schedjuice-reimagined-be/app_admissions/services.py`
- Create: `schedjuice-reimagined-be/app_admissions/tests/test_attending.py`
- Modify: `schedjuice-reimagined-be/app_admissions/views.py`
- Modify: `schedjuice-reimagined-be/app_admissions/serializers.py`
- Modify: `schedjuice-reimagined-be/app_admissions/urls.py`

**Interfaces:**
- Consumes: `UserCourse.AssignedAs.STUDENT`, `compute_effective_status` / status in `{active, paused, planned}`, `UserPayment.Status.VERIFIED`, `PaymentReceipt.number`
- Produces: `GET /api/v1/admissions/people/<id>/attending`; `last_verified_payment` is the latest verified **part** for that user+course (`verified_at`, then `id`); `verified_by` is `{id, name}` or `null`; `receipt_number` from receipt entity; `screenshot` is the part file URL or shared-group screenshot URL (same rule as `getPaymentScreenshotUrl`)

- [ ] **Step 1: Write failing service + API tests**

`test_attending.py` (same tenant harness). Fixtures: student enrolled as STUDENT on (1) planned course, (2) ended course, (3) active course. Payments on the active course: one `pending_verification`, two `verified` with different `verified_at` and receipts via `ensure_receipt_for_payment`. Teacher enrollment as staff on another active course must not appear.

```python
    def test_planned_included_ended_excluded(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user
            rows = attending_classes_for_user(self.student)
        titles = {r["title"] for r in rows}
        self.assertIn(self.planned.title, titles)
        self.assertNotIn(self.ended.title, titles)

    def test_unverified_ignored_latest_verified_wins(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user
            row = next(
                r for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        pay = row["last_verified_payment"]
        self.assertEqual(pay["receipt_number"], self.newer_receipt_number)
        self.assertNotEqual(pay["receipt_number"], self.active_payment.id)

    def test_verified_by_null_serializes_null(self):
        # newer verified payment has verified_by=None
        ...
        self.assertIsNone(pay["verified_by"])

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).get(
            f"/api/v1/admissions/people/{self.student.id}/attending"
        )
        self.assertEqual(resp.status_code, 403)

    def test_unknown_person_404(self):
        resp = self._client(self.officer).get(
            "/api/v1/admissions/people/999999999/attending"
        )
        self.assertEqual(resp.status_code, 404)
```

Create courses with `start_date`/`end_date` relative to `timezone.localdate()` so effective status is planned vs ended vs active (`app_course.course_status.compute_effective_status`).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending`

- [ ] **Step 3: Implement `attending_classes_for_user` and the GET view**

In `services.py`:

```python
ATTENDING_STATUSES = {
    Course.CourseStatus.ACTIVE,
    Course.CourseStatus.PAUSED,
    Course.CourseStatus.PLANNED,
}

def attending_classes_for_user(user: User) -> list[dict]:
    memberships = (
        UserCourse.objects.filter(
            user=user,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course")
    )
    out = []
    for uc in memberships:
        if compute_effective_status(uc.course) not in ATTENDING_STATUSES:
            continue
        out.append(
            {
                "course_id": uc.course_id,
                "title": uc.course.title,
                "last_verified_payment": last_verified_payment(user.id, uc.course_id),
            }
        )
    return out
```

`last_verified_payment`: filter `UserPayment` on `user_id` + `course_id` + `status=VERIFIED`, `order_by("-verified_at", "-id")`. Prefetch `receipt`, `verified_by`, `covered_months`. Amount = `actual_amount` in the same JSON shape `UserPaymentSerializer` already emits (do not invent a new money object). Screenshot: `payment.screenshot.url` if the file exists, else the first sibling group part with a screenshot (mirror `getPaymentScreenshotUrl`).

GET view: `required_permissions = {"GET": "admissions.view"}`. Load user with `User.objects.filter(pk=pk).first()`; `None` → `not_found`. Response identity uses `AdmissionsPersonSerializer` plus `"classes": attending_classes_for_user(user)`.

URL: `path("admissions/people/<int:id>/attending", ...)`.

- [ ] **Step 4: Run attending tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending`

- [ ] **Step 5: Commit (BE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): attending classes with last verified payment

EOF
)"
```

---

### Task 4: Courses search API

**Files:**
- Modify: `schedjuice-reimagined-be/app_admissions/serializers.py`
- Modify: `schedjuice-reimagined-be/app_admissions/views.py`
- Create: `schedjuice-reimagined-be/app_admissions/course_unit.py`
- Modify: `schedjuice-reimagined-be/app_admissions/urls.py`
- Create: `schedjuice-reimagined-be/app_admissions/tests/test_course_search.py`

**Interfaces:**
- Consumes: `apply_course_search_q_with_meta`, Academic Hub status filter helpers (`extract_status_filter_values`, `apply_effective_status_filter`; Active includes paused)
- Produces: `POST /api/v1/admissions/courses/search`; frozen fields `id`, `title`, `start_date`, `end_date`, `status`, `weekday_pattern`, `time_pattern`, `first_event_time_from`, `first_event_time_to`, `current_unit`, `current_unit_updated_at`; tenant-wide

- [ ] **Step 1: Write failing tests**

```python
    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "status",
                        "operator": "in",
                        "value": "active,paused",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_current_unit_from_latest_daily_lesson(self):
        # same Announcement created_at dance as
        # CourseDataSheetTests.test_current_unit_from_most_recent_daily_lesson
        resp = self._client(self.officer).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.json()["data"] if r["id"] == self.course.id)
        self.assertEqual(row["current_unit"], 8)
        self.assertNotIn("student_count", row)

    def test_default_active_omits_ended(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "status",
                        "operator": "in",
                        "value": "active,paused",
                    }
                ]
            },
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.ended.id, ids)
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_course_search`

- [ ] **Step 3: Implement**

`course_unit.py` — annotate with a Subquery on `Announcement` (`post_type=daily_lesson`, `finished_unit` not null, order by `-created_at`), exposing `current_unit` and `current_unit_updated_at`. Same semantics as `app_reports/sql_strings.py` current_unit LATERAL.

Course search view: copy **status-filter stripping / effective status** from `CourseSearchView.get_filter_params` + `augment_search_queryset` (`apply_course_search_q_with_meta`, `annotate_course_queryset_first_event_times`, `apply_effective_status_filter`). Do not copy roster expand. Serializer `Meta.fields` is the frozen list. `required_permissions = {"POST": "admissions.view"}`. `post` does not pass connection-scoped ids.

URL: `admissions/courses/search`.

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_course_search app_admissions.tests.test_people_search app_admissions.tests.test_attending`

- [ ] **Step 5: Commit (BE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): sparse course search with current unit

EOF
)"
```

---

### Task 5: Workspaces overlay — Admissions enterable

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/workspaces.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/workspaces.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/workspaces/workspaces-dialog.test.tsx`

**Interfaces:**
- Consumes: `checker.canAny(["admissions.view"])`
- Produces: `isAdmissionsWorkspaceEnterable`; `buildVisibleWorkspaces` returns `[]` only when Finance, Studio, **and** Admissions are all false; Admissions card omitted without the capability; `homeHref: "/admissions"` when enterable

- [ ] **Step 1: Rewrite visibility tests**

Replace the finance-only expectation that Admissions is `coming_soon`. New cases:

```ts
  it("returns [] when Finance, Studio, and Admissions are all closed", () => {
    expect(
      buildVisibleWorkspaces({
        checker: makePermissionChecker(["course.view"]),
        tenant,
        user: { roles: [role.teacher] } as accountType,
      }),
    ).toEqual([]);
  });

  it("omits Admissions without admissions.view even if Finance is enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["payment.view_all"]),
      tenant,
      user: { roles: [role.finance] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["finance", "hr"]);
  });

  it("returns Admissions enterable plus HR coming soon for admissions.view only", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["admissions.view"]),
      tenant,
      user: { roles: [role.manager] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["admissions", "hr"]);
    expect(cards[0]).toMatchObject({
      status: "enterable",
      homeHref: "/admissions",
      label: "Admissions",
    });
    expect(cards.find((c) => c.id === "hr")).toMatchObject({
      status: "coming_soon",
    });
  });

  it("returns Finance, Studio, HR, Admissions when all are enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker([
        "payment.view_all",
        "document_template.manage",
        "admissions.view",
      ]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual([
      "finance",
      "studio",
      "hr",
      "admissions",
    ]);
    expect(cards.find((c) => c.id === "admissions")?.homeHref).toBe(
      "/admissions",
    );
  });
```

Keep the Studio-only test but drop Admissions from the expected ids (`["studio", "hr"]`) unless `admissions.view` is in the checker.

In `workspaces-dialog.test.tsx`, add a case with an enterable Admissions card: click **Admissions** → `push("/admissions")` and overlay closes. Keep the existing coming-soon-is-not-a-link case on **HR**.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/workspaces.test.ts`

- [ ] **Step 3: Implement**

```ts
export function isAdmissionsWorkspaceEnterable(
  checker: NavPermissionChecker,
): boolean {
  return checker.canAny(["admissions.view"]);
}
```

Extend `ENTERABLE_HOME` with `admissions: "/admissions"`.

`buildVisibleWorkspaces`:

```ts
  const finance = isFinanceWorkspaceEnterable(args);
  const studio = isStudioWorkspaceEnterable(args.checker);
  const admissions = isAdmissionsWorkspaceEnterable(args.checker);
  if (!finance && !studio && !admissions) return [];

  return WORKSPACE_ORDER.flatMap((id) => {
    if (id === "hr") {
      return [{ id, label: WORKSPACE_LABEL[id], logo: id, status: "coming_soon" as const }];
    }
    if (id === "admissions") {
      if (!admissions) return [];
      return [{
        id,
        label: WORKSPACE_LABEL[id],
        logo: id,
        status: "enterable" as const,
        homeHref: ENTERABLE_HOME.admissions,
      }];
    }
    if (id === "finance" && !finance) return [];
    if (id === "studio" && !studio) return [];
    return [{
      id,
      label: WORKSPACE_LABEL[id],
      logo: id,
      status: "enterable" as const,
      homeHref: ENTERABLE_HOME[id],
    }];
  });
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/workspaces.test.ts src/components/workspaces/workspaces-dialog.test.tsx`

- [ ] **Step 5: Commit (FE)**

```bash
git commit -m "$(cat <<'EOF'
feat(workspaces): make Admissions enterable with admissions.view

EOF
)"
```

---

### Task 6: Rail, routes, find dock

**Files:**
- Create: `schedjuice-reimagined-fe/src/config/admissions-record-nav.ts`
- Create: `schedjuice-reimagined-fe/src/config/__tests__/admissions-record-nav.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/is-admissions-record-route.ts`
- Create: `schedjuice-reimagined-fe/src/lib/is-admissions-record-route.test.ts`
- Create: `schedjuice-reimagined-fe/src/components/admissions/record/admissions-section-rail.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/record/admissions-section-rail.test.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/record/admissions-mobile-sections.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/record/admissions-record-rail-provider.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/admissions/layout.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/admissions/courses/layout.tsx` (same provider, or rely on parent if the segment is nested — prefer **one** `admissions/layout.tsx` wrapping both `page.tsx` and `courses/page.tsx`)
- Modify: `schedjuice-reimagined-fe/src/config/route-permissions.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/route-permissions.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/find-page/find-page-dialog.tsx`

**Interfaces:**
- Produces: `ADMISSIONS_CONTEXT_PARENT = { label: "People", href: "/admissions" }`; `ADMISSIONS_RECORD_NAV_ENTRIES` People `/admissions` + Courses `/admissions/courses`; `isAdmissionsRecordRoute`; `ruleForPath("/admissions")` and `"/admissions/courses"` → `anyOf: ["admissions.view"]`

- [ ] **Step 1: Write failing config tests**

```ts
expect(ADMISSIONS_CONTEXT_PARENT).toEqual({
  label: "People",
  href: "/admissions",
});

it("marks People only on /admissions", () => {
  expect(admissionsRecordNavActive(people, "/admissions")).toBe(true);
  expect(admissionsRecordNavActive(people, "/admissions/courses")).toBe(false);
});

it("marks Courses on /admissions/courses", () => {
  expect(admissionsRecordNavActive(courses, "/admissions/courses")).toBe(true);
  expect(admissionsRecordNavActive(courses, "/admissions")).toBe(false);
});
```

```ts
expect(isAdmissionsRecordRoute("/admissions")).toBe(true);
expect(isAdmissionsRecordRoute("/admissions/courses")).toBe(true);
expect(isAdmissionsRecordRoute("/users")).toBe(false);
expect(isAdmissionsRecordRoute("/admissionsx")).toBe(false);
```

```ts
expect(ruleForPath("/admissions")?.anyOf).toEqual(["admissions.view"]);
expect(ruleForPath("/admissions/courses")?.anyOf).toEqual(["admissions.view"]);
```

Rail test (copy Studio motion mocks): on `/admissions/courses`, both **People** and **Courses** links exist; Courses is `aria-current="page"`.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/admissions-record-nav.test.ts src/lib/is-admissions-record-route.test.ts src/config/__tests__/route-permissions.test.ts`

- [ ] **Step 3: Implement**

`admissions-record-nav.ts`:

```ts
export const ADMISSIONS_CONTEXT_PARENT = {
  label: "People",
  href: "/admissions",
} as const;

export const ADMISSIONS_RECORD_NAV_ENTRIES = [
  { id: "people" as const, label: "People", href: "/admissions" },
  { id: "courses" as const, label: "Courses", href: "/admissions/courses" },
];

export function admissionsRecordNavActive(
  entry: (typeof ADMISSIONS_RECORD_NAV_ENTRIES)[number],
  pathname: string,
): boolean {
  if (entry.href === "/admissions") return pathname === "/admissions";
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
```

`is-admissions-record-route.ts`: `pathname === "/admissions" || pathname.startsWith("/admissions/")`.

Rail: copy the structure of `studio-section-rail.tsx` with `RecordRailWorkspaceIdentity name="admissions" label="Admissions"`, `aria-label="Admissions sections"`, `SCHOOL_HOME` back, and the two nav entries. Provider:

```tsx
useContextRail(
  AdmissionsSectionRail,
  () => ({ pathname }),
  ADMISSIONS_CONTEXT_PARENT,
);
```

`admissions/layout.tsx` wraps `{children}` with `AdmissionsRecordRailProvider` (covers `/admissions` and `/admissions/courses`).

`route-permissions.ts` add `{ prefix: "/admissions", anyOf: ["admissions.view"] }`.

`find-page-dialog.tsx` `hideDock` also when `isAdmissionsRecordRoute(pathname)`.

Create `admissions/page.tsx` and `admissions/courses/page.tsx` that only call `usePageHeader` with H1 **People** / **Courses** until Tasks 7–8 fill them in.

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/admissions-record-nav.test.ts src/lib/is-admissions-record-route.test.ts src/config/__tests__/route-permissions.test.ts src/components/admissions/record/admissions-section-rail.test.tsx`

- [ ] **Step 5: Commit (FE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): context rail and route gate

EOF
)"
```

---

### Task 7: People desk UI

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-attending.ts`
- Create: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.test.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/admissions/page.tsx`

**Interfaces:**
- Consumes: `buildHubUserFilterParams`, `searchEntities("admissions/people", …)`, `makeGetRequest(\`admissions/people/${id}/attending\`)`
- Produces: People table (Name, Email, Phone, Status); knobs Staff/Students (default **Students**), search, include inactive, incomplete, page size 24; `?person=` master-detail; no Create; attending fetch on select — not `users/:id`

- [ ] **Step 1: Write the failing page tests**

Mock `searchEntities` and `makeGetRequest`. Render `AdmissionsPeoplePage` with a nuqs adapter (same as User Hub tests if present; otherwise wrap with `NuqsTestingAdapter`).

```ts
it("does not render Create", () => {
  render(<AdmissionsPeoplePage />);
  expect(screen.queryByRole("link", { name: /create/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
});

it("loads attending from admissions/people/:id/attending, not users/:id", async () => {
  makeGetRequest.mockResolvedValue({
    data: {
      data: {
        id: 11,
        name: "Aung",
        email: "a@x",
        phone_number: "09",
        is_active: true,
        classes: [],
      },
    },
  });
  render(<AdmissionsPeoplePage />);
  await userEvent.click(await screen.findByRole("button", { name: /aung/i }));
  expect(makeGetRequest).toHaveBeenCalledWith("admissions/people/11/attending");
  expect(makeGetRequest).not.toHaveBeenCalledWith(
    expect.stringMatching(/^users\/11/),
  );
});
```

Search mock: one row `{ id: 11, name: "Aung", email: "a@x", phone_number: "09", is_active: true }`. Default tab Students — `searchEntities` first call’s filter_params must use student `contained_by` (same as `buildHubUserFilterParams` for `tab: "students"`).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/admissions-people-page.test.tsx`

- [ ] **Step 3: Implement**

Reuse User Hub nuqs knobs but:

- default `tab` parser to `"students"`
- no `view` mode
- `searchEntities("admissions/people", { page, size: 24, sorts: ["name"], q, include_inactive, fields: PEOPLE_FIELDS }, buildHubUserFilterParams(state))`
- Tab counts: two `admissions/people` searches with `buildHubUserTabCountFilterParams` (equivalent to spec GET tab-counts)
- Table: semantic `Column.sizing` roles `person` / `identifier` / `identifier` / `status`. Headers Latin small-caps, 52px rows. Name is a button (not `/users/:id` link). Status ink text Active/Inactive.
- `useQueryState("person")` number. Selected row highlights; panel calls attending hook. Empty panel: **Select a person**. 404: **Person not found** and clear param. Attending error: **Could not load classes.** Empty classes: **Not attending any active or planned classes.**
- Payment cells: date (`verified_at`), amount (tabular), receipt, period via `formatPaymentReceiptBillingPeriod`, verified by name or **Automatic**, screenshot thumbnail → existing Finance lightbox (`PaymentScreenshotPreview` / the student-payments image dialog). No upload.
- H1 **People** via `usePageHeader`. `PageContainer width="full"`. Toolbar in header. Empty list: `EmptyCopy` **No people** / **No people match** (no exclamation marks).
- Desktop: table + panel split. Mobile: panel below.

Do not import `UserHubPage`.

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/admissions-people-page.test.tsx`

- [ ] **Step 5: Commit (FE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): people lookup with attending payment panel

EOF
)"
```

---

### Task 8: Courses desk UI

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-courses.ts`
- Create: `schedjuice-reimagined-fe/src/components/admissions/courses/admissions-courses-page.tsx`
- Create: `schedjuice-reimagined-fe/src/components/admissions/courses/admissions-courses-page.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/admissions/courses/page.tsx`

**Interfaces:**
- Consumes: `buildHubFilterParams` (do not pass `my`, intake, subjects, categories), `searchEntities("admissions/courses", …)`, `CourseRange`, Academic Hub clock helpers (`formatSessionClock` / weekday conversion — same as course card), `formatCurrentUnitDisplay`
- Produces: table Title | Dates | Time | Most recent unit; default status Active; page size `ACADEMIC_HUB_PAGE_SIZE` (24); row is not a link

- [ ] **Step 1: Write the failing tests**

```ts
it("does not link a course row to /courses/:id", async () => {
  searchEntities.mockResolvedValue({
    data: {
      data: [
        {
          id: 5,
          title: "A1 Flyers",
          start_date: "2026-06-01",
          end_date: "2026-08-31",
          current_unit: 8,
          current_unit_updated_at: "2026-08-03",
        },
      ],
      count: 1,
    },
  });
  render(<AdmissionsCoursesPage />);
  expect(await screen.findByText("A1 Flyers")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /a1 flyers/i }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/courses/admissions-courses-page.test.tsx`

- [ ] **Step 3: Implement**

H1 **Courses**. Toolbar: search, Active/Planned/Ended (default `["active"]` like Academic Hub), program tabs only when `tenant.program_count > 1`. No My classes switch.

`searchEntities("admissions/courses", { page, size: 24, q, sorts: ["-created_at"] }, buildHubFilterParams({ ...state, my: false, intake: null, subjects: [], categories: [] }, { userId: 0 }))`.

Dates column: `<CourseRange startDate={row.start_date} endDate={row.end_date} />`. Time: same weekday + clock as Academic Hub card (tenant timezone + `time_display_format`). Unit: `formatCurrentUnitDisplay` or **—**.

Empty: `EMPTY_COPY_PRESETS.noCoursesFound` / no-match. Error: **Could not load courses.**

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/courses/admissions-courses-page.test.tsx src/config/__tests__/workspaces.test.ts src/components/admissions/people/admissions-people-page.test.tsx`

- [ ] **Step 5: Commit (FE)**

```bash
git commit -m "$(cat <<'EOF'
feat(admissions): course lookup table

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| `admissions.view` catalog + admin/manager default + migration | 1 |
| Sparse people search, 403 teacher, tenant-wide | 2 |
| Attending active/paused/planned; last verified; Automatic; receipt entity; screenshot URL | 3 |
| Sparse course search + current_unit; Active omits ended | 4 |
| Overlay enterable / omit card / admissions-only trigger | 5 |
| Rail, `/admissions` gate, find dock | 6 |
| People master-detail, knobs, no Create, no `/users/:id` | 7 |
| Courses table, `CourseRange`, not a link | 8 |
| DESIGN.md table/header/empty rules | 7, 8 |
| Do not widen `/users/search` or Finance | 2–4 (new app) |
