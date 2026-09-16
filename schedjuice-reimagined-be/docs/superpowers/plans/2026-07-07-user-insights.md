# User Insights + Course Insights Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Course data health to Course insights, and ship a User insights shortcut with duplicate-student cluster detection, MS last sign-in, and full-cluster merge.

**Architecture:** Backend gets `user_insights_services.py` (union-find clustering), `ms_sign_in_activity.py` (Graph batch), and `user_merge_services.py` (preview/apply in one transaction). Frontend mirrors the course-insights shortcut pattern: tabbed shell, expandable cluster table, merge sheet. Course insights is a rename-only pass (paths, types, API URL).

**Tech Stack:** Django 4 + tenant schemas, DRF `RBACView`, React Query, nuqs, shadcn Sheet/Dialog, MS Graph `signInActivity`.

**Spec:** `docs/superpowers/specs/2026-07-07-user-insights-design.md`

---

## File map

### Backend — rename

| File | Responsibility |
| --- | --- |
| `app_course/data_health_services.py` → `course_insights_services.py` | Rename module; keep logic, update docstring |
| `app_course/views.py` | `CourseInsightsSearchView` (was `CourseDataHealthSearchView`) |
| `app_course/urls.py` | `courses/insights/search` |
| `app_course/tests/test_data_health.py` → `test_course_insights.py` | Update imports + URL |

### Backend — user insights (new)

| File | Responsibility |
| --- | --- |
| `app_auth/user_insights_services.py` | Union-find clustering, sibling flags, summary, pagination |
| `app_auth/ms_sign_in_activity.py` | Batch Graph `signInActivity` fetch |
| `app_auth/user_merge_services.py` | Preview + apply merge, FK reassignment |
| `app_auth/user_insights_views.py` | Four RBAC views (search, sign-in, merge preview/apply) |
| `app_auth/urls.py` | Wire new routes |
| `app_auth/tests/test_user_insights.py` | Clustering + search API tests |
| `app_auth/tests/test_user_merge.py` | Merge preview/apply integration tests |
| `app_auth/tests/test_ms_sign_in_activity.py` | Mocked Graph batch tests |
| `app_microsoft/graph_wrapper/user.py` | `get_sign_in_activity(user_id)` helper |

### Frontend — rename

| File | Responsibility |
| --- | --- |
| `src/types/course-data-health.ts` → `course-insights.ts` | Type rename |
| `src/helpers/course-data-health.ts` → `course-insights.ts` | Label rename |
| `src/components/course-data-health/` → `course-insights/` | Component folder rename |
| `src/app/(internal)/shortcuts/course-insights/page.tsx` | New path; delete `course-data-health/page.tsx` |
| `src/config/shortcuts-tools.ts` | Tile + href |
| `src/config/route-permissions.ts` | Prefix update |
| `src/content/changelog/entries.ts` | Link labels/hrefs |

### Frontend — user insights (new)

| File | Responsibility |
| --- | --- |
| `src/types/user-insights.ts` | API response types |
| `src/helpers/user-insights.ts` | Field labels, `normalizeName`, survivor recommendation |
| `src/app/(internal)/shortcuts/user-insights/page.tsx` | Tab shell + queries |
| `src/components/user-insights/user-insights-tabs.tsx` | Tab bar (`nuqs`) |
| `src/components/user-insights/duplicate-clusters-table.tsx` | Cluster list |
| `src/components/user-insights/duplicate-cluster-expand.tsx` | Expanded member detail + MS column |
| `src/components/user-insights/user-merge-sheet.tsx` | Preview/apply merge |

---

## Phase 1 — Course Insights rename (BE)

### Task 1: Rename backend course insights module

**Files:**
- Rename: `schedjuice-reimagined-be/app_course/data_health_services.py` → `course_insights_services.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`
- Rename: `schedjuice-reimagined-be/app_course/tests/test_data_health.py` → `test_course_insights.py`

- [ ] **Step 1: Rename file and update module docstring**

```python
# app_course/course_insights_services.py (top of file)
"""
Course insights: detect setup gaps on effectively active courses.
"""
```

Keep all existing symbols (`DataHealthFilters`, `build_data_health_rows`, issue constants) unchanged for minimal diff — only module path changes.

- [ ] **Step 2: Update imports in `views.py`**

```python
from app_course.course_insights_services import (
    build_data_health_rows,
    paginate_rows,
    parse_data_health_filters,
)

class CourseInsightsSearchView(RBACView):
    """Staff: list effectively active courses with course insight issues."""
    required_permissions = {"POST": "course.view_all"}
    # ... same body as CourseDataHealthSearchView
```

Delete `CourseDataHealthSearchView` class.

- [ ] **Step 3: Update `urls.py`**

```python
path(
    "courses/insights/search",
    views.CourseInsightsSearchView.as_view(),
    name="course-insights-search",
),
```

Remove old `courses/data-health/search` path.

- [ ] **Step 4: Update test imports and URL**

In `test_course_insights.py`:

```python
from app_course.course_insights_services import (
    DataHealthFilters,
    build_data_health_rows,
    ...
)
```

Replace API paths:

```python
"/api/v1/courses/insights/search"
```

- [ ] **Step 5: Run tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_course_insights -v 2
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app_course/course_insights_services.py app_course/views.py app_course/urls.py app_course/tests/test_course_insights.py
git rm app_course/data_health_services.py app_course/tests/test_data_health.py
git commit -m "refactor: rename course data health backend to course insights"
```

---

## Phase 2 — Duplicate cluster service (BE)

### Task 2: Union-find clustering service

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/user_insights_services.py`
- Create: `schedjuice-reimagined-be/app_auth/tests/test_user_insights.py`

- [ ] **Step 1: Write failing unit tests for clustering**

```python
# app_auth/tests/test_user_insights.py
from django.test import SimpleTestCase
from app_auth.user_insights_services import (
    UnionFind,
    normalize_name,
    build_duplicate_clusters,
    DuplicateClusterFilters,
)


class UnionFindTests(SimpleTestCase):
    def test_transitive_merge(self):
        uf = UnionFind()
        uf.union(1, 2)
        uf.union(2, 3)
        self.assertEqual(uf.find(1), uf.find(3))


class NormalizeNameTests(SimpleTestCase):
    def test_collapses_whitespace_and_case(self):
        self.assertEqual(normalize_name("  Mi  Pakao  "), "mi pakao")


class BuildDuplicateClustersTests(SimpleTestCase):
    def test_three_user_transitive_cluster(self):
        users = [
            {"id": 1, "name": "Alice", "email": "a@x.io", "communication_email": "", "phone_number_digits": "111", "emergency_contact_phone_number_digits": "", "is_active": True},
            {"id": 2, "name": "Bob", "email": "b@x.io", "communication_email": "", "phone_number_digits": "111", "emergency_contact_phone_number_digits": "", "is_active": True},
            {"id": 3, "name": "Carol", "email": "c@x.io", "communication_email": "shared@fam.com", "phone_number_digits": "", "emergency_contact_phone_number_digits": "", "is_active": True},
            {"id": 4, "name": "Dave", "email": "d@x.io", "communication_email": "shared@fam.com", "phone_number_digits": "", "emergency_contact_phone_number_digits": "", "is_active": True},
        ]
        # 1-2 share phone; 3-4 share comm email; 2-3 linked if we also set 2.comm = shared
        users[1]["communication_email"] = "shared@fam.com"
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        ids_sets = [c["user_ids"] for c in clusters]
        self.assertIn([1, 2, 3, 4], ids_sets)

    def test_sibling_flag_on_name_mismatch(self):
        users = [
            {"id": 1, "name": "Mi Pakao Htaw", "email": "a@x.io", "communication_email": "", "phone_number_digits": "999", "emergency_contact_phone_number_digits": "", "is_active": True},
            {"id": 2, "name": "Mehm Samoi Htaw", "email": "b@x.io", "communication_email": "", "phone_number_digits": "999", "emergency_contact_phone_number_digits": "", "is_active": True},
        ]
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        self.assertTrue(clusters[0]["possible_siblings"])
        self.assertTrue(clusters[0]["match_reasons"][0]["possible_sibling"])

    def test_no_sibling_flag_when_names_match(self):
        users = [
            {"id": 1, "name": "Same Name", "email": "a@x.io", "communication_email": "", "phone_number_digits": "999", "emergency_contact_phone_number_digits": "", "is_active": True},
            {"id": 2, "name": "same  name", "email": "b@x.io", "communication_email": "", "phone_number_digits": "999", "emergency_contact_phone_number_digits": "", "is_active": True},
        ]
        _, clusters, _ = build_duplicate_clusters(users, DuplicateClusterFilters())
        self.assertFalse(clusters[0]["possible_siblings"])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights -v 2
```

Expected: FAIL — `ModuleNotFoundError: user_insights_services`

- [ ] **Step 3: Implement `user_insights_services.py`**

```python
# app_auth/user_insights_services.py
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app_auth.import_user_match import normalize_phone_digits
from app_organization.acca_spreadsheet_import import normalize_email
from app_attendance.god_view_services import paginate_rows

MATCH_FIELD_LABELS = {
    "phone": "Shared phone",
    "communication_email": "Shared communication email",
    "emergency_phone": "Shared emergency contact phone",
}


def normalize_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[int, int] = {}

    def find(self, x: int) -> int:
        self.parent.setdefault(x, x)
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


@dataclass
class DuplicateClusterFilters:
    q: str | None = None
    include_inactive: bool = False
    page: int = 1
    size: int = 25


def _cluster_id(user_ids: list[int]) -> str:
    raw = ",".join(str(i) for i in sorted(user_ids))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def build_duplicate_clusters(
    users: list[dict],
    filters: DuplicateClusterFilters,
) -> tuple[dict, list[dict]]:
    """Pure function: users list of dicts with id, name, email, communication_email, phone digits fields."""
    scoped = [
        u for u in users
        if "student" in (u.get("roles") or [])
        and (filters.include_inactive or u.get("is_active", True))
    ]
    by_id = {u["id"]: u for u in scoped}

    # key -> list[user_id]
    buckets: dict[tuple[str, str], list[int]] = {}
    for u in scoped:
        uid = u["id"]
        phone = normalize_phone_digits(u.get("phone_number_digits") or u.get("phone_number"))
        if phone:
            buckets.setdefault(("phone", phone), []).append(uid)
        comm = normalize_email(u.get("communication_email") or "")
        if comm:
            buckets.setdefault(("communication_email", comm), []).append(uid)
        emerg = normalize_phone_digits(u.get("emergency_contact_phone_number_digits") or "")
        if emerg:
            buckets.setdefault(("emergency_phone", emerg), []).append(uid)

    uf = UnionFind()
    reasons_raw: list[dict] = []
    for (field, norm_val), ids in buckets.items():
        if len(ids) < 2:
            continue
        for i in range(1, len(ids)):
            uf.union(ids[0], ids[i])
        reasons_raw.append({"field": field, "normalized_value": norm_val, "user_ids": sorted(ids)})

    groups: dict[int, set[int]] = {}
    for uid in by_id:
        root = uf.find(uid)
        groups.setdefault(root, set()).add(uid)
    clusters_users = [sorted(g) for g in groups.values() if len(g) >= 2]

    clusters: list[dict] = []
    for user_ids in clusters_users:
        match_reasons = []
        possible_siblings = False
        for rr in reasons_raw:
            overlap = [i for i in rr["user_ids"] if i in user_ids]
            if len(overlap) < 2:
                continue
            edge_sibling = False
            if rr["field"] != "email":
                names = {normalize_name(by_id[i]["name"]) for i in overlap}
                edge_sibling = len(names) > 1
            possible_siblings = possible_siblings or edge_sibling
            match_reasons.append({
                "field": rr["field"],
                "label": MATCH_FIELD_LABELS[rr["field"]],
                "normalized_value": rr["normalized_value"],
                "user_ids": overlap,
                "possible_sibling": edge_sibling,
            })
        members = [by_id[i] for i in user_ids]
        clusters.append({
            "cluster_id": _cluster_id(user_ids),
            "possible_siblings": possible_siblings,
            "user_ids": user_ids,
            "users": members,
            "match_reasons": match_reasons,
        })

    if filters.q:
        q = filters.q.strip().lower()
        clusters = [
            c for c in clusters
            if any(
                q in (m.get("name") or "").lower()
                or q in (m.get("email") or "").lower()
                or q in (m.get("communication_email") or "").lower()
                for m in c["users"]
            )
        ]

    sibling_flagged = sum(1 for c in clusters if c["possible_siblings"])
    student_count = sum(len(c["user_ids"]) for c in clusters)
    summary = {
        "cluster_count": len(clusters),
        "sibling_flagged_count": sibling_flagged,
        "student_count": student_count,
    }
    page_rows, count = paginate_rows(clusters, filters.page, filters.size)
    return summary, page_rows, count


def load_student_rows(include_inactive: bool) -> list[dict]:
    from app_auth.models import User

    qs = User.objects.filter(roles__contains=[User.UserRole.STUDENT])
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return list(qs.values(
        "id", "name", "email", "communication_email", "phone_number",
        "phone_number_digits", "emergency_contact_phone_number_digits",
        "microsoft_id", "is_active", "roles",
    ))
```

Adjust `build_duplicate_clusters` return to `(summary, page_rows, count)` — update tests accordingly.

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights -v 2
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/user_insights_services.py app_auth/tests/test_user_insights.py
git commit -m "feat: add duplicate student cluster detection service"
```

---

### Task 3: Duplicate search API endpoint

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/user_insights_views.py`
- Modify: `schedjuice-reimagined-be/app_auth/urls.py`
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_user_insights.py`

- [ ] **Step 1: Write failing API test**

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserInsightsDuplicateSearchApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        # ... schema_context setup, create admin with course.view_all
        # create two students sharing phone_number_digits
        pass

    def test_returns_cluster_for_shared_phone(self):
        response = self._client(self.admin).post(
            f"{self.api_prefix}/users/insights/duplicates/search",
            {"page": 1, "size": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        results = response.data["data"]["results"]
        self.assertGreaterEqual(len(results), 1)
```

- [ ] **Step 2: Implement view**

```python
# app_auth/user_insights_views.py
class UserInsightsDuplicateSearchView(RBACView):
    required_permissions = {"POST": "course.view_all"}

    def post(self, request):
        from app_auth.user_insights_services import (
            DuplicateClusterFilters,
            build_duplicate_clusters,
            load_student_rows,
        )
        body = request.data if isinstance(request.data, dict) else {}
        filters = DuplicateClusterFilters(
            q=body.get("q"),
            include_inactive=bool(body.get("include_inactive")),
            page=max(1, int(body.get("page") or 1)),
            size=int(body.get("size") or 25),
        )
        users = load_student_rows(filters.include_inactive)
        summary, results, count = build_duplicate_clusters(users, filters)
        return self.send_response(
            False, "success",
            {"data": {"summary": summary, "results": results}, "page": filters.page, "size": filters.size, "count": count},
            status=200,
        )
```

- [ ] **Step 3: Register URL**

```python
path("users/insights/duplicates/search", user_insights_views.UserInsightsDuplicateSearchView.as_view(), name="user-insights-duplicates-search"),
```

- [ ] **Step 4: Run tests and commit**

```bash
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights -v 2
git add app_auth/user_insights_views.py app_auth/urls.py app_auth/tests/test_user_insights.py
git commit -m "feat: add user insights duplicate search API"
```

---

## Phase 3 — MS sign-in activity (BE)

### Task 4: Graph sign-in batch helper + API

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/graph_wrapper/user.py`
- Create: `schedjuice-reimagined-be/app_auth/ms_sign_in_activity.py`
- Modify: `schedjuice-reimagined-be/app_auth/user_insights_views.py`
- Create: `schedjuice-reimagined-be/app_auth/tests/test_ms_sign_in_activity.py`

- [ ] **Step 1: Add Graph helper**

```python
# app_microsoft/graph_wrapper/user.py
def get_sign_in_activity(self, microsoft_id: str) -> str | None:
    response = self.get_user_select(microsoft_id, "signInActivity")
    if response.status_code != 200:
        return None
    payload = response.json()
    activity = payload.get("signInActivity") or {}
    return activity.get("lastSignInDateTime")
```

Add `get_user_select` if not present:

```python
def get_user_select(self, user_id: str, select: str):
    return super().get(f"{self.URL}users/{user_id}?$select={select}")
```

- [ ] **Step 2: Write failing test with mocked Graph**

```python
@patch("app_auth.ms_sign_in_activity.MSUser")
def test_returns_last_sign_in_for_linked_users(self, mock_ms_user):
    mock_ms_user.return_value.get_sign_in_activity.return_value = "2026-07-01T10:00:00Z"
    result = fetch_sign_in_activity_for_users(
        tenant=tenant_with_ms,
        users_by_id={101: user_with_ms_id},
    )
    self.assertEqual(result["101"]["last_sign_in"], "2026-07-01T10:00:00Z")
```

- [ ] **Step 3: Implement batch fetch (max 50)**

```python
# app_auth/ms_sign_in_activity.py
MAX_BATCH = 50

def fetch_sign_in_activity_for_users(tenant, users_by_id: dict[int, object]) -> dict[str, dict]:
    if not tenant.is_microsoft_on:
        return {}
    out: dict[str, dict] = {}
    ms = MSUser(tenant)
    for uid, user in list(users_by_id.items())[:MAX_BATCH]:
        if not user.microsoft_id:
            out[str(uid)] = {"last_sign_in": None, "error": "not_linked"}
            continue
        try:
            ts = ms.get_sign_in_activity(user.microsoft_id)
            out[str(uid)] = {"last_sign_in": ts}
        except Exception:
            out[str(uid)] = {"last_sign_in": None, "error": "graph_error"}
    return out
```

- [ ] **Step 4: Add view + URL**

```python
class MicrosoftSignInActivityView(RBACView):
    required_permissions = {"POST": "course.view_all"}

    def post(self, request):
        from app_auth.ms_sign_in_activity import fetch_sign_in_activity_for_users
        from app_auth.models import User
        raw = request.data.get("user_ids") or []
        user_ids = [int(i) for i in raw[:50]]
        users = {u.id: u for u in User.objects.filter(id__in=user_ids)}
        data = fetch_sign_in_activity_for_users(request.tenant, users)
        return self.ok(data)
```

```python
path("users/microsoft-sign-in-activity", user_insights_views.MicrosoftSignInActivityView.as_view(), name="microsoft-sign-in-activity"),
```

- [ ] **Step 5: Run tests and commit**

```bash
./scripts/run_backend_tests.sh app_auth.tests.test_ms_sign_in_activity -v 2
git commit -m "feat: add batch Microsoft sign-in activity API"
```

---

## Phase 4 — User merge (BE)

### Task 5: FK audit checklist (merge targets)

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/user_merge_services.py` (create with checklist comment)

- [ ] **Step 1: Document FK targets at top of merge service**

```python
# Reassign user_id / student_id / created_by (where student-owned) from absorbed -> survivor
USER_FK_REASSIGNMENTS = [
    ("app_course.UserCourse", "user_id", "merge_user_course_conflict"),
    ("app_attendance.UserEvent", "user_id", None),
    ("app_finance.UserPayment", "user_id", None),
    ("app_course.CourseJoinRequest", "user_id", None),
    ("app_quiz_v3.QuizAttemptV3", "user_id", None),  # verify model name
    ("app_grading_reports.GradingReportStudent", "student_id", None),
    ("app_chat.ChatThreadParticipant", "user_id", "skip_duplicate"),
    ("app_telegram.TelegramLink", "user_id", "delete_absorbed_row"),
    ("app_hr.BuildingCheckin", "user_id", None),
    # Run `rg 'ForeignKey.*User' app_*/models.py` before implementation; add any missing rows
]
```

- [ ] **Step 2: Verify model names with ripgrep and fix list before coding**

```bash
cd schedjuice-reimagined-be
rg "ForeignKey.*User" app_*/models.py
```

---

### Task 6: Merge preview + apply services

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/user_merge_services.py`
- Create: `schedjuice-reimagined-be/app_auth/tests/test_user_merge.py`

- [ ] **Step 1: Write failing integration test**

```python
def test_merge_apply_moves_user_courses_to_survivor(self):
    # student_a + student_b share phone; each on different course
    preview = build_merge_preview(survivor=a, absorbed=[b], primary_email=a.email, microsoft_id=a.microsoft_id)
    self.assertEqual(preview["reassignments"]["user_courses"], 1)
    apply_user_merge(...)
    self.assertEqual(UserCourse.objects.filter(user=b).count(), 0)
    self.assertEqual(UserCourse.objects.filter(user=a).count(), 2)
    self.assertFalse(User.objects.filter(id=b.id).exists())
```

- [ ] **Step 2: Implement `merge_user_course_conflict`**

When survivor and absorbed both have `UserCourse` for same `course_id`:
- Keep survivor's `UserCourse` row
- Reassign `UserEvent` rows from absorbed's enrollment to survivor's `UserCourse` (match by `event_id` + `user_id`)

- [ ] **Step 3: Implement `build_merge_preview` and `apply_user_merge`**

```python
@transaction.atomic
def apply_user_merge(*, survivor, absorbed_users, primary_email, microsoft_id, actor):
    survivor.email = primary_email
    survivor.microsoft_id = microsoft_id
    _backfill_scalars(survivor, absorbed_users)
    for absorbed in absorbed_users:
        _reassign_all_fks(survivor, absorbed)
        absorbed.delete()
    _log_merge(actor, survivor, absorbed_users, primary_email, microsoft_id)
```

`_backfill_scalars`: for each field in `["phone_number", "communication_email", "emergency_contact_name", "emergency_contact_phone_number", ...]`, if not getattr(survivor, f) and getattr(absorbed, f): copy first non-empty from absorbed list.

- [ ] **Step 4: Add merge views**

```python
class UserInsightsMergePreviewView(RBACView):
    required_permissions = {"POST": "course.manage_all"}
    # validate cluster membership, full-cluster absorbed list

class UserInsightsMergeApplyView(RBACView):
    required_permissions = {"POST": "course.manage_all"}
```

URLs:

```python
path("users/insights/merge/preview", ...),
path("users/insights/merge/apply", ...),
```

- [ ] **Step 5: Run tests**

```bash
./scripts/run_backend_tests.sh app_auth.tests.test_user_merge -v 2
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add user merge preview and apply with FK reassignment"
```

---

## Phase 5 — Course Insights rename (FE)

### Task 7: Rename frontend course insights

**Files:** See file map above.

- [ ] **Step 1: `git mv` types, helpers, components, page**

```bash
cd schedjuice-reimagined-fe
git mv src/types/course-data-health.ts src/types/course-insights.ts
git mv src/helpers/course-data-health.ts src/helpers/course-insights.ts
git mv src/components/course-data-health src/components/course-insights
git mv src/app/\(internal\)/shortcuts/course-data-health src/app/\(internal\)/shortcuts/course-insights
```

- [ ] **Step 2: Global replace imports**

Replace across `src/`:
- `course-data-health` → `course-insights`
- `courseDataHealth` → `courseInsights`
- `CourseDataHealth` → `CourseInsights` (types/components)
- API path: `courses/data-health/search` → `courses/insights/search`
- Page heading: `Course data health` → `Course insights`

- [ ] **Step 3: Update `shortcuts-tools.ts`**

```typescript
{
  title: "Course insights",
  description: "Find active courses missing schedule, roster, or recent session attendance/check-in data.",
  href: "/shortcuts/course-insights",
  icon: ClipboardList,
  roles: [role.superadmin, role.admin, role.manager],
},
const COURSE_INSIGHTS_SHORTCUT_HREF = "/shortcuts/course-insights";
```

- [ ] **Step 4: Update `route-permissions.ts`**

```typescript
{ prefix: "/shortcuts/course-insights", anyOf: ["course.view_all", "course.manage_all"] },
```

Remove `/shortcuts/course-data-health` entry.

- [ ] **Step 5: Update changelog `entries.ts` labels/hrefs** (keep historical image filenames; update links only).

- [ ] **Step 6: Verify old route gone**

```bash
test ! -f src/app/\(internal\)/shortcuts/course-data-health/page.tsx
```

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor: rename course data health to course insights"
```

---

## Phase 6 — User Insights frontend

### Task 8: Types and helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/user-insights.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/user-insights.ts`

- [ ] **Step 1: Add types matching API**

```typescript
export type DuplicateMatchReason = {
  field: "phone" | "communication_email" | "emergency_phone";
  label: string;
  normalized_value: string;
  user_ids: number[];
  possible_sibling: boolean;
};

export type DuplicateClusterUser = {
  id: number;
  name: string;
  email: string;
  communication_email: string;
  phone_number: string;
  microsoft_id: string | null;
  is_active: boolean;
};

export type DuplicateCluster = {
  cluster_id: string;
  possible_siblings: boolean;
  users: DuplicateClusterUser[];
  match_reasons: DuplicateMatchReason[];
};

export type DuplicateSearchResponse = {
  data: {
    summary: { cluster_count: number; sibling_flagged_count: number; student_count: number };
    results: DuplicateCluster[];
  };
  page: number;
  size: number;
  count: number;
};
```

- [ ] **Step 2: Add survivor recommendation helper**

```typescript
export function recommendSurvivor(
  users: DuplicateClusterUser[],
  signInByUserId: Record<string, { last_sign_in?: string | null }>,
  enrollmentCounts: Record<number, number>,
): { survivorUserId: number; primaryEmail: string; microsoftId: string | null } {
  const ranked = [...users].sort((a, b) => {
    const aTs = signInByUserId[String(a.id)]?.last_sign_in ?? "";
    const bTs = signInByUserId[String(b.id)]?.last_sign_in ?? "";
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    const aEn = enrollmentCounts[a.id] ?? 0;
    const bEn = enrollmentCounts[b.id] ?? 0;
    if (aEn !== bEn) return bEn - aEn;
    return a.id - b.id;
  });
  const survivor = ranked[0];
  return {
    survivorUserId: survivor.id,
    primaryEmail: survivor.email,
    microsoftId: survivor.microsoft_id,
  };
}
```

- [ ] **Step 3: Commit**

---

### Task 9: User insights page + duplicate table

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/shortcuts/user-insights/page.tsx`
- Create: `schedjuice-reimagined-fe/src/components/user-insights/user-insights-tabs.tsx`
- Create: `schedjuice-reimagined-fe/src/components/user-insights/duplicate-clusters-table.tsx`
- Create: `schedjuice-reimagined-fe/src/components/user-insights/duplicate-cluster-expand.tsx`
- Modify: `schedjuice-reimagined-fe/src/config/shortcuts-tools.ts`
- Modify: `schedjuice-reimagined-fe/src/config/route-permissions.ts`

- [ ] **Step 1: Add shortcut tile**

```typescript
import { UserSearch } from "lucide-react";

{
  title: "User insights",
  description: "Find duplicate student accounts and review user data quality.",
  href: "/shortcuts/user-insights",
  icon: UserSearch,
  roles: [role.superadmin, role.admin, role.manager],
},
```

Gate with `hasSchoolWideCourseAccess` same as course insights.

- [ ] **Step 2: Build page with parallel queries**

```tsx
const duplicateQuery = useQuery({
  queryKey: ["userInsightsDuplicates", searchBody],
  queryFn: () => makePostRequest("users/insights/duplicates/search", searchBody, ...),
});

const userIds = useMemo(
  () => duplicateQuery.data?.data.results.flatMap((c) => c.users.map((u) => u.id)) ?? [],
  [duplicateQuery.data],
);

const signInQuery = useQuery({
  queryKey: ["msSignInActivity", userIds],
  enabled: userIds.length > 0 && tenant?.is_microsoft_on,
  queryFn: () => makePostRequest("users/microsoft-sign-in-activity", { user_ids: userIds }),
});
```

- [ ] **Step 3: Duplicate table with expand + sibling badge**

Use shadcn `Badge variant="outline"` for reasons; amber badge for `possible_siblings`. Expand row shows `DuplicateClusterExpand` with MS last sign-in column (from `signInQuery.data`).

- [ ] **Step 4: Route permission**

```typescript
{ prefix: "/shortcuts/user-insights", anyOf: ["course.view_all", "course.manage_all"] },
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add user insights duplicates tab UI"
```

---

### Task 10: Merge sheet

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/user-insights/user-merge-sheet.tsx`

- [ ] **Step 1: Sheet with survivor/email/MS selectors**

Props: `cluster`, `signInByUserId`, `onMerged`.

Pre-fill via `recommendSurvivor()`. Primary email dropdown = unique emails from cluster members. MS dropdown = non-null `microsoft_id` values with user name labels.

- [ ] **Step 2: Preview step**

```tsx
const preview = await makePostRequest("users/insights/merge/preview", {
  cluster_id: cluster.cluster_id,
  survivor_user_id: survivorId,
  primary_email: primaryEmail,
  microsoft_id: microsoftId,
  absorbed_user_ids: cluster.users.filter((u) => u.id !== survivorId).map((u) => u.id),
});
```

Render `reassignments`, `enrollment_conflicts`, `warnings`.

- [ ] **Step 3: Apply with confirmation dialog**

```tsx
<AlertDialog>
  <AlertDialogAction onClick={applyMerge}>Merge accounts</AlertDialogAction>
</AlertDialog>
```

On success: `queryClient.invalidateQueries({ queryKey: ["userInsightsDuplicates"] })`, toast, close sheet.

- [ ] **Step 4: Gate merge button on `canManageAll` / `course.manage_all` permission**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add user merge sheet with preview and apply"
```

---

## Phase 7 — Final verification

### Task 11: End-to-end smoke

- [ ] **Step 1: Backend full test run**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights app_auth.tests.test_user_merge app_auth.tests.test_ms_sign_in_activity app_course.tests.test_course_insights -v 2
```

- [ ] **Step 2: Frontend typecheck**

```bash
cd schedjuice-reimagined-fe
npm run typecheck
```

- [ ] **Step 3: Manual smoke**

1. Open `/shortcuts/course-insights` — loads course table
2. Confirm `/shortcuts/course-data-health` 404s
3. Open `/shortcuts/user-insights?tab=duplicates`
4. Expand a cluster — MS sign-in column populates (MS tenant)
5. Review merge → preview → apply on test duplicate pair

---

## Spec coverage checklist

| Spec section | Task |
|---|---|
| Course insights rename, no redirect | Task 1, 7 |
| User insights shell + tab URL | Task 9 |
| Duplicate detection + transitive clusters | Task 2, 3 |
| Sibling flag | Task 2 |
| MS sign-in batch on load | Task 4, 9 |
| Merge preview/apply, full cluster | Task 6, 10 |
| Admin picks email + microsoft_id | Task 10 |
| Default survivor from MS activity | Task 8, 10 |
| No data loss FK reassignment | Task 5, 6 |
| Students only, active default + toggle | Task 2, 9 |
| Access gate course.view_all / manage_all for merge | Task 3, 6, 10 |
