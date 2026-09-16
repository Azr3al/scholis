# Import Wizard & Linkable Data Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Import Wizard page (entity = Users) backed by a reusable Glide Data Grid, where email cells link to existing users and course cells fuzzy-link to courses, with bulk (N+1-safe) resolution and shimmer/linked/needs-attention cell states. No DB commit this iteration.

**Architecture:** Django adds three admin-only, tenant-scoped endpoints — stateless xlsx parse, bulk email→user resolve (one `email__in` query), and bulk course-name→candidates resolve (in-memory tiered fuzzy match, one query per tier). The Next.js app parses via the backend, holds parsed rows + per-cell resolution state in a Zustand store, renders them in a Glide `DataEditor` with canvas-drawn custom cells, fires two bulk resolution calls on the Review step, and lets admins disambiguate course cells in a Popover+Command picker.

**Tech Stack:** Backend — Django REST Framework, `openpyxl`, `rapidfuzz`. Frontend — Next.js 15 / React 19, `@glideapps/glide-data-grid`, TanStack Query v4, Zustand, Radix/shadcn (`Popover`, `Command`), `react-dropzone`, vitest.

**Repos:**
- Backend: `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be` (branch `dev`)
- Frontend: `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe` (branch `dev`)

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-09-import-wizard-data-grid-design.md`

---

## Shared type contracts (must stay identical across tasks)

Backend response bodies use the repo envelope `{ isError, message, data }` (via `self.ok(data)`).

**`POST /api/v1/imports/parse`** (multipart `file`, form field `sheet` optional) → `data`:
```jsonc
{
  "sheet_names": ["Sheet1", "Y3-R1"],
  "active_sheet": "Sheet1",
  "headers": ["email", "name", "courses"],
  "rows": [["a@x.edu", "Aung", "Y2 R1, Math"], ["b@x.edu", "Su", ""]],
  "row_count": 2
}
```

**`POST /api/v1/users/resolve-bulk`** body `{ "emails": ["a@x.edu"] }` → `data`:
```jsonc
{ "a@x.edu": { "id": 1, "name": "Aung", "email": "a@x.edu", "code": null, "profile_image": null, "roles": ["student"] }, "b@x.edu": null }
```

**`POST /api/v1/courses/resolve-bulk`** body `{ "names": ["Y2 R1", "Math"] }` → `data`:
```jsonc
{
  "Y2 R1": { "status": "linked", "match": { "id": 5, "title": "Year 2 Section R1 - Academic Year 2026-2027", "code": "Y2R1", "academic_year": "2026-2027", "student_count": 24, "score": 95.0 }, "candidates": [] },
  "Math":  { "status": "needs_attention", "match": null, "candidates": [ { "id": 8, "title": "Year 2 Mathematics - R1", "code": "MATH-Y2", "academic_year": "2026-2027", "student_count": 24, "score": 72.0 } ] }
}
```

Frontend mirror types live in `src/app/client-api/imports.ts` (Task B2) and are reused everywhere:
```ts
export type UserRef = { id: number; name: string; email: string; code: string | null; profile_image: string | null; roles: string[] };
export type CourseCandidate = { id: number; title: string; code: string | null; academic_year: string | null; student_count: number | null; score: number };
export type CourseResolution = { status: "linked" | "needs_attention" | "none"; match: CourseCandidate | null; candidates: CourseCandidate[] };
export type ParseResult = { sheetNames: string[]; activeSheet: string; headers: string[]; rows: (string | number | null)[][]; rowCount: number };
```

---

# PHASE A — Backend (Django)

Work in `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be`. Run tests with the venv python: `./env/bin/python manage.py test <path> -v 2` (Django `TestCase`; tenant setup uses `schema_context` + `HTTP_TENANT`, mirroring `app_course/tests/test_course_search_distinct.py`).

### Task A1: Add `rapidfuzz` dependency and IMPORT_* settings

**Files:**
- Modify: `requirements.txt` (after line 158 `openpyxl==3.1.5`)
- Modify: `schedjuice_backend/settings.py` (search-tuning block ~lines 489–505)

- [ ] **Step 1: Add the dependency line**

In `requirements.txt`, add below the `openpyxl==3.1.5` line:
```
rapidfuzz==3.9.7
```

- [ ] **Step 2: Install it**

Run: `cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be && ./env/bin/pip install rapidfuzz==3.9.7`
Expected: "Successfully installed rapidfuzz-3.9.7".

- [ ] **Step 3: Add IMPORT_* settings**

In `schedjuice_backend/settings.py`, immediately after the `USER_SEARCH_FALLBACK_MIN_RESULTS` config block, add:
```python
# Import Wizard course-matching tuning.
IMPORT_COURSE_MATCH_HIGH = config("IMPORT_COURSE_MATCH_HIGH", default=90.0, cast=float)
IMPORT_COURSE_MATCH_LOW = config("IMPORT_COURSE_MATCH_LOW", default=55.0, cast=float)
IMPORT_COURSE_MATCH_MARGIN = config("IMPORT_COURSE_MATCH_MARGIN", default=8.0, cast=float)
IMPORT_COURSE_RECENCY_YEARS = config("IMPORT_COURSE_RECENCY_YEARS", default=2, cast=int)
IMPORT_COURSE_CANDIDATE_LIMIT = config("IMPORT_COURSE_CANDIDATE_LIMIT", default=6, cast=int)
IMPORT_PARSE_MAX_ROWS = config("IMPORT_PARSE_MAX_ROWS", default=5000, cast=int)
IMPORT_PARSE_MAX_BYTES = config("IMPORT_PARSE_MAX_BYTES", default=10 * 1024 * 1024, cast=int)
```

- [ ] **Step 4: Verify Django still boots**

Run: `./env/bin/python manage.py check`
Expected: "System check identified no issues".

- [ ] **Step 5: Commit**
```bash
git add requirements.txt schedjuice_backend/settings.py
git commit -m "chore(imports): add rapidfuzz dep and import-wizard settings"
```

---

### Task A2: Course title normalization helper (pure, TDD)

**Files:**
- Create: `app_course/import_matching.py`
- Test: `app_course/tests/test_import_matching.py`

- [ ] **Step 1: Write the failing test**

Create `app_course/tests/test_import_matching.py`:
```python
from django.test import SimpleTestCase

from app_course.import_matching import normalize_course_title


class NormalizeCourseTitleTest(SimpleTestCase):
    def test_strips_academic_year_suffix(self):
        self.assertEqual(
            normalize_course_title("Year 2 Section R1 - Academic Year 2026-2027"),
            "year 2 section r1",
        )

    def test_lowercases_and_collapses_whitespace(self):
        self.assertEqual(normalize_course_title("  Math   101 "), "math 101")

    def test_handles_none(self):
        self.assertEqual(normalize_course_title(None), "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./env/bin/python manage.py test app_course.tests.test_import_matching -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'app_course.import_matching'`.

- [ ] **Step 3: Write minimal implementation**

Create `app_course/import_matching.py`:
```python
"""In-memory bulk fuzzy matching of spreadsheet course names to courses."""
from __future__ import annotations

import re

_ACADEMIC_YEAR_SUFFIX = re.compile(r"\s*-\s*academic year\s*\d{4}\s*-\s*\d{4}\s*$", re.IGNORECASE)


def normalize_course_title(value: str | None) -> str:
    s = (value or "").strip().lower()
    s = _ACADEMIC_YEAR_SUFFIX.sub("", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./env/bin/python manage.py test app_course.tests.test_import_matching -v 2`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add app_course/import_matching.py app_course/tests/test_import_matching.py
git commit -m "feat(imports): add course title normalization helper"
```

---

### Task A3: In-memory tiered bulk course matcher (TDD)

**Files:**
- Modify: `app_course/import_matching.py`
- Test: `app_course/tests/test_import_matching.py`

The matcher takes a list of raw names plus two iterables of "catalog entries" (tier-1 recent, tier-2 fallback) and returns a dict name→resolution. Catalog entries are plain dicts so the function is DB-free and unit-testable.

- [ ] **Step 1: Write the failing test (append to test file)**
```python
from app_course.import_matching import match_course_names

CATALOG = [
    {"id": 5, "title": "Year 2 Section R1 - Academic Year 2026-2027", "code": "Y2R1", "academic_year": "2026-2027", "student_count": 24},
    {"id": 8, "title": "Year 2 Mathematics - R1", "code": "MATH-Y2", "academic_year": "2026-2027", "student_count": 24},
    {"id": 9, "title": "Year 3 Mathematics - R1", "code": "MATH-Y3", "academic_year": "2026-2027", "student_count": 19},
]


class MatchCourseNamesTest(SimpleTestCase):
    def test_exact_normalized_match_is_linked(self):
        out = match_course_names(["Year 2 Section R1"], tier1=CATALOG, tier2=[])
        res = out["Year 2 Section R1"]
        self.assertEqual(res["status"], "linked")
        self.assertEqual(res["match"]["id"], 5)

    def test_ambiguous_match_needs_attention_with_candidates(self):
        out = match_course_names(["Math"], tier1=CATALOG, tier2=[])
        res = out["Math"]
        self.assertEqual(res["status"], "needs_attention")
        self.assertIsNone(res["match"])
        self.assertGreaterEqual(len(res["candidates"]), 2)
        scores = [c["score"] for c in res["candidates"]]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_no_match_even_in_tier2_is_none(self):
        out = match_course_names(["Underwater Basket Weaving"], tier1=CATALOG, tier2=[])
        self.assertEqual(out["Underwater Basket Weaving"]["status"], "none")

    def test_blank_name_is_none(self):
        out = match_course_names(["   "], tier1=CATALOG, tier2=[])
        self.assertEqual(out["   "]["status"], "none")

    def test_falls_back_to_tier2_when_tier1_empty(self):
        out = match_course_names(["Year 2 Section R1"], tier1=[], tier2=CATALOG)
        self.assertEqual(out["Year 2 Section R1"]["status"], "linked")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./env/bin/python manage.py test app_course.tests.test_import_matching -v 2`
Expected: FAIL — `ImportError: cannot import name 'match_course_names'`.

- [ ] **Step 3: Write minimal implementation (append to `import_matching.py`)**
```python
from django.conf import settings
from rapidfuzz import fuzz, process


def _entry_to_candidate(entry: dict, score: float) -> dict:
    return {
        "id": entry["id"],
        "title": entry["title"],
        "code": entry.get("code"),
        "academic_year": entry.get("academic_year"),
        "student_count": entry.get("student_count"),
        "score": round(float(score), 1),
    }


def _rank(name: str, catalog: list[dict]) -> list[tuple[dict, float]]:
    norm_query = normalize_course_title(name)
    if not norm_query or not catalog:
        return []
    choices = {idx: normalize_course_title(e["title"]) for idx, e in enumerate(catalog)}
    matches = process.extract(
        norm_query, choices, scorer=fuzz.WRatio, limit=settings.IMPORT_COURSE_CANDIDATE_LIMIT
    )
    ranked: list[tuple[dict, float]] = []
    for _title, score, idx in matches:
        ranked.append((catalog[idx], float(score)))
    return ranked


def _resolve_one(name: str, catalog: list[dict]) -> dict | None:
    ranked = _rank(name, catalog)
    if not ranked:
        return None
    high = settings.IMPORT_COURSE_MATCH_HIGH
    low = settings.IMPORT_COURSE_MATCH_LOW
    margin = settings.IMPORT_COURSE_MATCH_MARGIN
    top_entry, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    if top_score >= high and (top_score - second_score) >= margin:
        return {"status": "linked", "match": _entry_to_candidate(top_entry, top_score), "candidates": []}
    if top_score >= low:
        candidates = [_entry_to_candidate(e, s) for e, s in ranked if s >= low]
        return {"status": "needs_attention", "match": None, "candidates": candidates}
    return None


def match_course_names(names: list[str], *, tier1: list[dict], tier2: list[dict]) -> dict:
    results: dict[str, dict] = {}
    for name in names:
        if name in results:
            continue
        resolved = _resolve_one(name, tier1) or _resolve_one(name, tier2)
        results[name] = resolved or {"status": "none", "match": None, "candidates": []}
    return results
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./env/bin/python manage.py test app_course.tests.test_import_matching -v 2`
Expected: PASS (all). If `test_exact_normalized_match_is_linked` fails because WRatio of "year 2 section r1" vs the Math entries is unexpectedly close, lower `IMPORT_COURSE_MATCH_MARGIN` expectation — but with exact normalized equality top_score is 100 and margin holds.

- [ ] **Step 5: Commit**
```bash
git add app_course/import_matching.py app_course/tests/test_import_matching.py
git commit -m "feat(imports): in-memory tiered bulk course matcher"
```

---

### Task A4: Catalog loader + `courses/resolve-bulk` endpoint

**Files:**
- Modify: `app_course/import_matching.py` (DB loaders)
- Modify: `app_course/views.py` (new view, end of file)
- Modify: `app_course/urls.py` (new path near the `courses/search` line)
- Test: `app_course/tests/test_resolve_bulk.py`

- [ ] **Step 1: Add catalog loaders to `import_matching.py`**
```python
from datetime import date, timedelta

from app_course.models import Course


def _course_to_entry(course: Course) -> dict:
    intake = getattr(course, "intake", None)
    academic_year = getattr(intake, "name", None) if intake else None
    return {
        "id": course.id,
        "title": course.title,
        "code": course.code,
        "academic_year": academic_year,
        "student_count": course.student_count,
    }


def load_tier1_catalog() -> list[dict]:
    """Active/planned/paused courses ending within the recency window."""
    cutoff = date.today() - timedelta(days=365 * settings.IMPORT_COURSE_RECENCY_YEARS)
    qs = (
        Course.objects.select_related("intake")
        .exclude(status=Course.CourseStatus.ENDED)
        .exclude(status_override=Course.StatusOverride.ENDED)
        .filter(end_date__gte=cutoff)
    )
    return [_course_to_entry(c) for c in qs]


def load_tier2_catalog() -> list[dict]:
    """Everything else (older / ended) for fallback matching."""
    cutoff = date.today() - timedelta(days=365 * settings.IMPORT_COURSE_RECENCY_YEARS)
    qs = Course.objects.select_related("intake").filter(
        Q(status=Course.CourseStatus.ENDED)
        | Q(status_override=Course.StatusOverride.ENDED)
        | Q(end_date__lt=cutoff)
    )
    return [_course_to_entry(c) for c in qs]
```
Add `from django.db.models import Q` to the imports at the top of `import_matching.py`.

- [ ] **Step 2: Write the failing API test**

Create `app_course/tests/test_resolve_bulk.py` (mirror tenant/JWT setup from `app_course/tests/test_course_search_distinct.py` — copy its `_client`, `setUpTestData`, and `JWT_TENANT_SCHEMA_CLAIM` import exactly):
```python
import unittest
from datetime import date, timedelta

from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from schedjuice_backend.settings import JWT_TENANT_SCHEMA_CLAIM


def _db_ok():
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_db_ok(), "PostgreSQL not available")
class ResolveCoursesBulkTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _client(self, user):
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_TENANT=self.schema_name)
        return c

    def test_resolve_bulk_links_exact_and_flags_ambiguous(self):
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email="admin@imp.example", password="x", name="Admin",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            category = Category.objects.first()
            program = Program.objects.first()
            Course.objects.create(
                title="Year 2 Section R1 - Academic Year 2026-2027", code="Y2R1",
                start_date=date.today(), end_date=date.today() + timedelta(days=200),
                status=Course.CourseStatus.ACTIVE, category=category, program=program,
            )
        res = self._client(admin).post(
            "/api/v1/courses/resolve-bulk", {"names": ["Year 2 Section R1", "Totally Unknown"]}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertFalse(body["isError"])
        data = body["data"]
        self.assertEqual(data["Year 2 Section R1"]["status"], "linked")
        self.assertEqual(data["Totally Unknown"]["status"], "none")

    def test_requires_admin(self):
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email="stud@imp.example", password="x", name="Stud",
                phone_number="-", date_of_birth=date(2005, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
        res = self._client(student).post("/api/v1/courses/resolve-bulk", {"names": []}, format="json")
        self.assertEqual(res.status_code, 403, res.content)
```
> Note: confirm `Program`/`Category` constructor args by reading `app_course/models.py`; `load-data` may already seed a category/program. If `.create()` requires more required fields, prefer reusing seeded `Course.objects.first()`-style rows instead of creating new ones.

- [ ] **Step 3: Run test to verify it fails**

Run: `./env/bin/python manage.py test app_course.tests.test_resolve_bulk -v 2`
Expected: FAIL — 404 (route missing) or import error for the view.

- [ ] **Step 4: Add the view (append to `app_course/views.py`)**
```python
from app_course.import_matching import (
    load_tier1_catalog,
    load_tier2_catalog,
    match_course_names,
)
from schedjuice_backend.permissions import IsAdmin, IsSuperAdmin
from utilitas.views import BaseView

IsSuperAdminOrAdmin = IsSuperAdmin | IsAdmin


class CourseResolveBulkView(BaseView):
    name = "Course bulk resolve view"
    permission_classes = [IsAuthenticated, IsSuperAdminOrAdmin]

    def post(self, request):
        names = request.data.get("names") or []
        names = [str(n) for n in names if isinstance(n, (str, int, float))]
        if not names:
            return self.ok({})
        tier1 = load_tier1_catalog()
        tier2 = load_tier2_catalog()
        results = match_course_names(names, tier1=tier1, tier2=tier2)
        return self.ok(results)
```
> Ensure `IsAuthenticated` is imported at the top of `views.py` (it is used elsewhere there; reuse the existing import).

- [ ] **Step 5: Add the URL**

In `app_course/urls.py`, directly under the `courses/search` line, add:
```python
    path("courses/resolve-bulk", views.CourseResolveBulkView.as_view(), name="course-resolve-bulk"),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./env/bin/python manage.py test app_course.tests.test_resolve_bulk -v 2`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**
```bash
git add app_course/import_matching.py app_course/views.py app_course/urls.py app_course/tests/test_resolve_bulk.py
git commit -m "feat(imports): courses/resolve-bulk endpoint with tiered catalog match"
```

---

### Task A5: `users/resolve-bulk` endpoint (one query, N+1-safe)

**Files:**
- Modify: `app_auth/views.py` (new view)
- Modify: `app_auth/urls.py` (new path under `users/suggest`)
- Test: `app_auth/tests/test_resolve_bulk.py`

- [ ] **Step 1: Write the failing API test**

Create `app_auth/tests/test_resolve_bulk.py` (same tenant/JWT scaffolding as Task A4 Step 2):
```python
import unittest
from datetime import date

from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.models import User
from schedjuice_backend.settings import JWT_TENANT_SCHEMA_CLAIM


def _db_ok():
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_db_ok(), "PostgreSQL not available")
class ResolveUsersBulkTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _client(self, user):
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_TENANT=self.schema_name)
        return c

    def _admin(self):
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email="admin@ru.example", password="x", name="Admin",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def test_found_and_missing(self):
        admin = self._admin()
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="known@ru.example", password="x", name="Known",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
        res = self._client(admin).post(
            "/api/v1/users/resolve-bulk",
            {"emails": ["Known@ru.example", "missing@ru.example"]},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]
        self.assertIsNotNone(data["Known@ru.example"])      # case-insensitive normalize
        self.assertEqual(data["Known@ru.example"]["email"], "known@ru.example")
        self.assertIsNone(data["missing@ru.example"])

    def test_single_query_no_n_plus_one(self):
        admin = self._admin()
        with schema_context(self.schema_name):
            for i in range(5):
                User.objects.create_user(
                    email=f"u{i}@ru.example", password="x", name=f"U{i}",
                    phone_number="-", date_of_birth=date(1990, 1, 1),
                    roles=[User.UserRole.STUDENT],
                )
        emails = [f"u{i}@ru.example" for i in range(5)]
        client = self._client(admin)
        with schema_context(self.schema_name):
            with self.assertNumQueries(1):
                from app_auth.import_resolve import resolve_users_by_email
                resolve_users_by_email(emails)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./env/bin/python manage.py test app_auth.tests.test_resolve_bulk -v 2`
Expected: FAIL — route 404 / `ModuleNotFoundError: app_auth.import_resolve`.

- [ ] **Step 3: Add the pure resolver (so the query-count test can target it)**

Create `app_auth/import_resolve.py`:
```python
"""Bulk email -> user resolution for the Import Wizard (single query)."""
from __future__ import annotations

from app_auth.models import User
from app_organization.acca_spreadsheet_import import normalize_email

USER_REF_FIELDS = ("id", "name", "email", "code", "profile_image", "roles")


def resolve_users_by_email(emails: list[str]) -> dict[str, dict | None]:
    normalized = {normalize_email(e): e for e in emails if e}
    if not normalized:
        return {}
    found = {
        normalize_email(row["email"]): row
        for row in User.objects.filter(email__in=list(normalized.keys())).values(*USER_REF_FIELDS)
    }
    return {original: found.get(norm) for norm, original in normalized.items()}
```

- [ ] **Step 4: Add the view (append to `app_auth/views.py`)**
```python
class UserResolveBulkView(BaseView):
    name = "User bulk resolve view"
    permission_classes = [IsAuthenticated, IsSuperAdminOrAdmin]

    def post(self, request):
        from app_auth.import_resolve import resolve_users_by_email
        emails = request.data.get("emails") or []
        emails = [str(e) for e in emails if isinstance(e, (str,))]
        return self.ok(resolve_users_by_email(emails))
```
> `IsSuperAdminOrAdmin` is already defined in `app_auth/views.py` (line ~1160). `BaseView` and `IsAuthenticated` are already imported there.

- [ ] **Step 5: Add the URL**

In `app_auth/urls.py`, directly under the `users/suggest` line, add:
```python
    path("users/resolve-bulk", views.UserResolveBulkView.as_view(), name="user-resolve-bulk"),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./env/bin/python manage.py test app_auth.tests.test_resolve_bulk -v 2`
Expected: PASS (2 tests). The `assertNumQueries(1)` proves no N+1.

- [ ] **Step 7: Commit**
```bash
git add app_auth/import_resolve.py app_auth/views.py app_auth/urls.py app_auth/tests/test_resolve_bulk.py
git commit -m "feat(imports): users/resolve-bulk endpoint (single email__in query)"
```

---

### Task A6: `imports/parse` endpoint (stateless openpyxl parse)

**Files:**
- Create: `app_utils/import_parse.py` (pure parse helper)
- Create: `app_utils/import_views.py` (the view)
- Modify: `app_utils/urls.py` (add path; if the app has no urls or is not included, instead add the view + path in `app_auth/urls.py` and import from `app_utils.import_views`)
- Test: `app_utils/tests/test_import_parse.py`

> First read `app_utils/` to confirm it has `urls.py` wired into the root urlconf. If not, register the route in `app_auth/urls.py` as `path("imports/parse", import_views.ImportParseView.as_view(), name="imports-parse")` and import the view there. The endpoint path MUST resolve to `/api/v1/imports/parse`.

- [ ] **Step 1: Write the failing test for the pure parser**

Create `app_utils/tests/test_import_parse.py`:
```python
import io

from django.test import SimpleTestCase
from openpyxl import Workbook

from app_utils.import_parse import parse_workbook


def _wb_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class ParseWorkbookTest(SimpleTestCase):
    def test_parses_headers_and_rows(self):
        data = _wb_bytes({"Sheet1": [["email", "name"], ["a@x.edu", "Aung"], ["b@x.edu", "Su"]]})
        out = parse_workbook(io.BytesIO(data), sheet=None, max_rows=100)
        self.assertEqual(out["sheet_names"], ["Sheet1"])
        self.assertEqual(out["active_sheet"], "Sheet1")
        self.assertEqual(out["headers"], ["email", "name"])
        self.assertEqual(out["rows"], [["a@x.edu", "Aung"], ["b@x.edu", "Su"]])
        self.assertEqual(out["row_count"], 2)

    def test_selects_named_sheet(self):
        data = _wb_bytes({"A": [["h"], ["1"]], "B": [["x"], ["2"]]})
        out = parse_workbook(io.BytesIO(data), sheet="B", max_rows=100)
        self.assertEqual(out["active_sheet"], "B")
        self.assertEqual(out["headers"], ["x"])

    def test_row_cap_raises(self):
        data = _wb_bytes({"Sheet1": [["h"], ["1"], ["2"], ["3"]]})
        with self.assertRaises(ValueError):
            parse_workbook(io.BytesIO(data), sheet=None, max_rows=2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./env/bin/python manage.py test app_utils.tests.test_import_parse -v 2`
Expected: FAIL — `ModuleNotFoundError: app_utils.import_parse`.

- [ ] **Step 3: Implement the pure parser**

Create `app_utils/import_parse.py`:
```python
"""Stateless xlsx parsing for the Import Wizard."""
from __future__ import annotations

from typing import BinaryIO

from openpyxl import load_workbook


def _cell(value) -> str | int | float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    return str(value).strip()


def parse_workbook(file_obj: BinaryIO, *, sheet: str | None, max_rows: int) -> dict:
    wb = load_workbook(file_obj, data_only=True, read_only=True)
    sheet_names = list(wb.sheetnames)
    active = sheet if (sheet in sheet_names) else sheet_names[0]
    ws = wb[active]

    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return {"sheet_names": sheet_names, "active_sheet": active, "headers": [], "rows": [], "row_count": 0}

    headers = [(_cell(c) if c is not None else "") for c in header_row]
    headers = [("" if h is None else str(h)) for h in headers]
    width = len(headers)

    rows: list[list] = []
    for raw in rows_iter:
        if raw is None or all(c is None for c in raw):
            continue
        cells = [_cell(raw[i]) if i < len(raw) else None for i in range(width)]
        rows.append(cells)
        if len(rows) > max_rows:
            raise ValueError(f"File exceeds the maximum of {max_rows} rows.")

    wb.close()
    return {
        "sheet_names": sheet_names,
        "active_sheet": active,
        "headers": headers,
        "rows": rows,
        "row_count": len(rows),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./env/bin/python manage.py test app_utils.tests.test_import_parse -v 2`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the view**

Create `app_utils/import_views.py`:
```python
from django.conf import settings

from app_auth.views import IsSuperAdminOrAdmin
from app_utils.import_parse import parse_workbook
from rest_framework.permissions import IsAuthenticated
from utilitas.views import BaseView


class ImportParseView(BaseView):
    name = "Import parse view"
    permission_classes = [IsAuthenticated, IsSuperAdminOrAdmin]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return self.bad_request(message="No file uploaded.")
        if upload.size and upload.size > settings.IMPORT_PARSE_MAX_BYTES:
            return self.bad_request(message="File is too large.")
        sheet = request.data.get("sheet") or None
        try:
            result = parse_workbook(upload.file, sheet=sheet, max_rows=settings.IMPORT_PARSE_MAX_ROWS)
        except ValueError as exc:
            return self.bad_request(message=str(exc))
        except Exception:
            return self.bad_request(message="Could not read the file. Make sure it is a valid .xlsx workbook.")
        return self.ok(result)
```
> Verify `BaseView` exposes `bad_request(message=...)`. The explorer confirmed helpers like `bad_request`/`forbidden` exist on `BaseView`. If the signature differs, use `self.send_response(True, "...", {}, status=status.HTTP_400_BAD_REQUEST)`.

- [ ] **Step 6: Wire the URL**

Per the note above, register `path("imports/parse", ImportParseView.as_view(), name="imports-parse")` so it resolves to `/api/v1/imports/parse`. Verify with: `./env/bin/python manage.py show_urls 2>/dev/null | grep imports` (or `./env/bin/python manage.py check`).

- [ ] **Step 7: Add an API smoke test (append to `test_import_parse.py`)**

Add a `TestCase` using the same JWT/tenant `_client` scaffolding as Task A5, posting a workbook via `SimpleUploadedFile`:
```python
import unittest
from datetime import date
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context
from app_auth.models import User
from schedjuice_backend.settings import JWT_TENANT_SCHEMA_CLAIM


def _db_ok():
    try:
        connection.ensure_connection(); return True
    except Exception:
        return False


@unittest.skipUnless(_db_ok(), "PostgreSQL not available")
class ImportParseApiTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_parse_endpoint_returns_headers(self):
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email="admin@parse.example", password="x", name="Admin",
                phone_number="-", date_of_birth=date(1990, 1, 1), roles=[User.UserRole.ADMIN],
            )
        token = AccessToken.for_user(admin); token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        c = APIClient(); c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_TENANT=self.schema_name)
        data = _wb_bytes({"Sheet1": [["email", "name"], ["a@x.edu", "Aung"]]})
        upload = SimpleUploadedFile("u.xlsx", data, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res = c.post("/api/v1/imports/parse", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["data"]["headers"], ["email", "name"])
```

- [ ] **Step 8: Run all backend import tests**

Run: `./env/bin/python manage.py test app_utils.tests.test_import_parse app_course.tests.test_import_matching app_course.tests.test_resolve_bulk app_auth.tests.test_resolve_bulk -v 2`
Expected: PASS (all).

- [ ] **Step 9: Commit**
```bash
git add app_utils/import_parse.py app_utils/import_views.py app_utils/tests/test_import_parse.py <urls file modified>
git commit -m "feat(imports): stateless imports/parse endpoint via openpyxl"
```

---

# PHASE B — Frontend foundation

Work in `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe`. Tests: `npm run test:unit`. Dev server: `npm run dev` (port 3000; log in with `james@schedjuice.com` / `password123`).

### Task B1: Install Glide Data Grid + React-19 render spike

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/components/import-grid/glide-spike.tsx` (temporary)
- Create: `src/app/(internal)/imports/page.tsx` (temporary spike content; replaced in Phase D)

- [ ] **Step 1: Install Glide with legacy peer deps**

Run: `cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe && npm install --legacy-peer-deps @glideapps/glide-data-grid@^6 @glideapps/glide-data-grid-cells@^6`
Expected: installs without an unresolved error. Note the resolved major version for later reference.

- [ ] **Step 2: Create the spike component**

Create `src/components/import-grid/glide-spike.tsx`:
```tsx
"use client";

import "@glideapps/glide-data-grid/dist/index.css";
import { DataEditor, GridCellKind, type GridColumn } from "@glideapps/glide-data-grid";

const columns: GridColumn[] = [
  { title: "Email", id: "email", width: 220 },
  { title: "Name", id: "name", width: 160 },
];
const data = [
  ["a@x.edu", "Aung"],
  ["b@x.edu", "Su"],
];

export function GlideSpike() {
  return (
    <div style={{ height: 320 }}>
      <DataEditor
        columns={columns}
        rows={data.length}
        getCellContent={([col, row]) => ({
          kind: GridCellKind.Text,
          data: data[row][col],
          displayData: data[row][col],
          allowOverlay: false,
        })}
      />
    </div>
  );
}
```

- [ ] **Step 3: Mount it on a temporary page**

Create `src/app/(internal)/imports/page.tsx`:
```tsx
"use client";

import { GlideSpike } from "@/components/import-grid/glide-spike";
import { TypographyH1 } from "@/components/typography/h1";

export default function ImportWizardPage() {
  return (
    <div className="space-y-4">
      <TypographyH1>Import</TypographyH1>
      <GlideSpike />
    </div>
  );
}
```

- [ ] **Step 4: Verify it renders on React 19**

Run: `npm run dev` then open `http://localhost:3000/imports` (log in first). 
Expected: a 2-column grid with two rows renders, scrolls, and no console errors about React internals.
**If it errors:** try the Glide v5 line (`npm install --legacy-peer-deps @glideapps/glide-data-grid@^5`), or add a `next.config.js` transpile entry. Record the working version in this plan before proceeding. Do not continue until the grid renders.

- [ ] **Step 5: Commit the spike**
```bash
git add package.json package-lock.json pnpm-lock.yaml src/components/import-grid/glide-spike.tsx "src/app/(internal)/imports/page.tsx"
git commit -m "chore(imports): install glide-data-grid and verify React 19 render"
```

---

### Task B2: client-api/imports.ts (typed API wrappers)

**Files:**
- Create: `src/app/client-api/imports.ts`

- [ ] **Step 1: Implement the API module**

Create `src/app/client-api/imports.ts`:
```ts
import { axiosClient } from "@/lib/api";

export type UserRef = {
  id: number; name: string; email: string; code: string | null;
  profile_image: string | null; roles: string[];
};
export type CourseCandidate = {
  id: number; title: string; code: string | null;
  academic_year: string | null; student_count: number | null; score: number;
};
export type CourseResolution = {
  status: "linked" | "needs_attention" | "none";
  match: CourseCandidate | null;
  candidates: CourseCandidate[];
};
export type ParseResult = {
  sheetNames: string[]; activeSheet: string; headers: string[];
  rows: (string | number | null)[][]; rowCount: number;
};

export async function parseImport(file: File, sheet?: string): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  if (sheet) form.append("sheet", sheet);
  const res = await axiosClient.post("imports/parse", form);
  const d = res.data?.data ?? {};
  return {
    sheetNames: d.sheet_names ?? [],
    activeSheet: d.active_sheet ?? "",
    headers: d.headers ?? [],
    rows: d.rows ?? [],
    rowCount: d.row_count ?? 0,
  };
}

export async function resolveUsersBulk(emails: string[]): Promise<Record<string, UserRef | null>> {
  if (emails.length === 0) return {};
  const res = await axiosClient.post("users/resolve-bulk", { emails });
  return (res.data?.data ?? {}) as Record<string, UserRef | null>;
}

export async function resolveCoursesBulk(names: string[]): Promise<Record<string, CourseResolution>> {
  if (names.length === 0) return {};
  const res = await axiosClient.post("courses/resolve-bulk", { names });
  return (res.data?.data ?? {}) as Record<string, CourseResolution>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/app/client-api/imports.ts`.

- [ ] **Step 3: Commit**
```bash
git add "src/app/client-api/imports.ts"
git commit -m "feat(imports): typed client-api wrappers for parse and bulk resolve"
```

---

### Task B3: Pure wizard logic (TDD) — mapping guess, email validation, course tokens, collectors

**Files:**
- Create: `src/lib/imports/wizard-logic.ts`
- Test: `src/lib/imports/wizard-logic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/imports/wizard-logic.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  guessFieldForHeader,
  isValidEmail,
  splitCourseTokens,
  collectUniqueEmails,
  collectUniqueCourseTokens,
  USER_FIELDS,
} from "@/lib/imports/wizard-logic";

describe("guessFieldForHeader", () => {
  it("maps obvious headers", () => {
    expect(guessFieldForHeader("Email Address")).toBe("email");
    expect(guessFieldForHeader("full name")).toBe("name");
    expect(guessFieldForHeader("Courses")).toBe("courses");
  });
  it("returns null for unknown headers", () => {
    expect(guessFieldForHeader("favourite colour")).toBeNull();
  });
});

describe("isValidEmail", () => {
  it("validates", () => {
    expect(isValidEmail("a@x.edu")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("splitCourseTokens", () => {
  it("splits comma-separated, trims, drops blanks", () => {
    expect(splitCourseTokens("Y2 R1, Math ,")).toEqual(["Y2 R1", "Math"]);
    expect(splitCourseTokens("")).toEqual([]);
    expect(splitCourseTokens(null)).toEqual([]);
  });
});

describe("collectors", () => {
  const rows = [["A@x.edu", "Y2 R1, Math"], ["a@x.edu", "Math"], ["", ""]];
  it("collects unique valid emails (case-insensitive)", () => {
    expect(collectUniqueEmails(rows, 0)).toEqual(["A@x.edu"]);
  });
  it("collects unique course tokens", () => {
    expect(collectUniqueCourseTokens(rows, 1).sort()).toEqual(["Math", "Y2 R1"]);
  });
});

describe("USER_FIELDS", () => {
  it("marks email and courses special", () => {
    const email = USER_FIELDS.find((f) => f.key === "email");
    expect(email?.special).toBe("user");
    const courses = USER_FIELDS.find((f) => f.key === "courses");
    expect(courses?.special).toBe("course");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- wizard-logic`
Expected: FAIL — cannot resolve `@/lib/imports/wizard-logic`.

- [ ] **Step 3: Implement**

Create `src/lib/imports/wizard-logic.ts`:
```ts
export type SpecialKind = "user" | "course" | null;
export type FieldDef = { key: string; label: string; special: SpecialKind; required?: boolean };

export const USER_FIELDS: FieldDef[] = [
  { key: "email", label: "Email", special: "user", required: true },
  { key: "name", label: "Name", special: null },
  { key: "communication_email", label: "Communication email", special: null },
  { key: "alternative_name", label: "Alternative name", special: null },
  { key: "gender", label: "Gender", special: null },
  { key: "date_of_birth", label: "Date of birth", special: null },
  { key: "phone_number", label: "Phone number", special: null },
  { key: "courses", label: "Courses", special: "course" },
];

const HEADER_HINTS: Record<string, string> = {
  email: "email",
  "email address": "email",
  "e-mail": "email",
  name: "name",
  "full name": "name",
  "communication email": "communication_email",
  "alternative name": "alternative_name",
  gender: "gender",
  "date of birth": "date_of_birth",
  dob: "date_of_birth",
  phone: "phone_number",
  "phone number": "phone_number",
  course: "courses",
  courses: "courses",
  "course name": "courses",
};

export function guessFieldForHeader(header: string): string | null {
  const norm = (header || "").trim().toLowerCase();
  if (norm in HEADER_HINTS) return HEADER_HINTS[norm];
  if (norm.includes("email")) return "email";
  if (norm.includes("course")) return "courses";
  if (norm.includes("name")) return "name";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value || "").trim());
}

export function splitCourseTokens(value: string | number | null): string[] {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function collectUniqueEmails(rows: (string | number | null)[][], colIndex: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const raw = row[colIndex];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value || !isValidEmail(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function collectUniqueCourseTokens(rows: (string | number | null)[][], colIndex: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const token of splitCourseTokens(row[colIndex])) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- wizard-logic`
Expected: PASS (all).

- [ ] **Step 5: Commit**
```bash
git add src/lib/imports/wizard-logic.ts src/lib/imports/wizard-logic.test.ts
git commit -m "feat(imports): pure wizard logic (mapping guess, validation, collectors)"
```

---

### Task B4: Import Zustand store + resolution merge helpers (TDD for helpers)

**Files:**
- Create: `src/lib/imports/resolution.ts` (pure merge helpers)
- Test: `src/lib/imports/resolution.test.ts`
- Create: `src/store/import-store.ts`

- [ ] **Step 1: Write the failing test for merge helpers**

Create `src/lib/imports/resolution.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cellKey, buildUserResolutions, buildCourseResolutions } from "@/lib/imports/resolution";
import type { UserRef, CourseResolution } from "@/app/client-api/imports";

describe("cellKey", () => {
  it("joins rowId and field", () => {
    expect(cellKey("r1", "email")).toBe("r1:email");
  });
});

describe("buildUserResolutions", () => {
  it("fans out a user map across rows by email", () => {
    const rows = [["a@x.edu"], ["b@x.edu"], ["bad"]];
    const userMap: Record<string, UserRef | null> = {
      "a@x.edu": { id: 1, name: "A", email: "a@x.edu", code: null, profile_image: null, roles: [] },
      "b@x.edu": null,
    };
    const out = buildUserResolutions(rows, 0, ["r0", "r1", "r2"], userMap);
    expect(out.get("r0:email")?.status).toBe("linked");
    expect(out.get("r1:email")?.status).toBe("new");
    expect(out.get("r2:email")?.status).toBe("error"); // invalid email
  });
});

describe("buildCourseResolutions", () => {
  it("aggregates per-token state to worst-of", () => {
    const rows = [["Y2 R1, Math"]];
    const map: Record<string, CourseResolution> = {
      "Y2 R1": { status: "linked", match: { id: 5, title: "Year 2 R1", code: null, academic_year: null, student_count: null, score: 95 }, candidates: [] },
      "Math": { status: "needs_attention", match: null, candidates: [] },
    };
    const out = buildCourseResolutions(rows, 0, ["r0"], map);
    const cell = out.get("r0:courses");
    expect(cell?.status).toBe("needs_attention"); // worst-of
    expect(cell?.tokens?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- resolution`
Expected: FAIL — cannot resolve `@/lib/imports/resolution`.

- [ ] **Step 3: Implement merge helpers**

Create `src/lib/imports/resolution.ts`:
```ts
import type { CourseCandidate, CourseResolution, UserRef } from "@/app/client-api/imports";
import { isValidEmail, splitCourseTokens } from "@/lib/imports/wizard-logic";

export type CellStatus = "idle" | "resolving" | "linked" | "needs_attention" | "new" | "error";

export type CourseToken = {
  raw: string;
  status: "resolving" | "linked" | "needs_attention" | "none";
  match: { id: number; title: string } | null;
  candidates: CourseCandidate[];
};

export type CellResolution = {
  status: CellStatus;
  entityRef?: { id: number; label: string };
  tokens?: CourseToken[];
};

export function cellKey(rowId: string, field: string): string {
  return `${rowId}:${field}`;
}

export function buildUserResolutions(
  rows: (string | number | null)[][],
  colIndex: number,
  rowIds: string[],
  userMap: Record<string, UserRef | null>,
): Map<string, CellResolution> {
  const out = new Map<string, CellResolution>();
  rows.forEach((row, i) => {
    const raw = row[colIndex];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    const key = cellKey(rowIds[i], "email");
    if (!value) {
      out.set(key, { status: "idle" });
      return;
    }
    if (!isValidEmail(value)) {
      out.set(key, { status: "error" });
      return;
    }
    const found = userMap[value] ?? userMap[Object.keys(userMap).find((k) => k.toLowerCase() === value.toLowerCase()) ?? ""];
    if (found) {
      out.set(key, { status: "linked", entityRef: { id: found.id, label: found.name } });
    } else {
      out.set(key, { status: "new" });
    }
  });
  return out;
}

const WORST_ORDER: Record<string, number> = { linked: 0, none: 1, needs_attention: 2 };

export function buildCourseResolutions(
  rows: (string | number | null)[][],
  colIndex: number,
  rowIds: string[],
  courseMap: Record<string, CourseResolution>,
): Map<string, CellResolution> {
  const out = new Map<string, CellResolution>();
  rows.forEach((row, i) => {
    const tokensRaw = splitCourseTokens(row[colIndex]);
    const key = cellKey(rowIds[i], "courses");
    if (tokensRaw.length === 0) {
      out.set(key, { status: "idle", tokens: [] });
      return;
    }
    const tokens: CourseToken[] = tokensRaw.map((raw) => {
      const r = courseMap[raw];
      if (!r) return { raw, status: "resolving", match: null, candidates: [] };
      return {
        raw,
        status: r.status,
        match: r.match ? { id: r.match.id, title: r.match.title } : null,
        candidates: r.candidates,
      };
    });
    let worst: CourseToken["status"] = "linked";
    for (const t of tokens) {
      if ((WORST_ORDER[t.status] ?? 0) > (WORST_ORDER[worst] ?? 0)) worst = t.status;
    }
    const cellStatus: CellStatus = worst === "needs_attention" ? "needs_attention" : worst === "none" ? "needs_attention" : "linked";
    out.set(key, { status: cellStatus, tokens });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- resolution`
Expected: PASS (all).

- [ ] **Step 5: Create the Zustand store**

Create `src/store/import-store.ts`:
```ts
import { create } from "zustand";
import type { ParseResult } from "@/app/client-api/imports";
import type { CellResolution } from "@/lib/imports/resolution";

export type WizardStep = "upload" | "map" | "review";

export interface ImportState {
  step: WizardStep;
  entity: "users";
  parse: ParseResult | null;
  rowIds: string[];
  mapping: Record<number, string | null>; // uploaded column index -> field key
  resolution: Map<string, CellResolution>;
  setStep: (step: WizardStep) => void;
  setParse: (parse: ParseResult) => void;
  setMapping: (mapping: Record<number, string | null>) => void;
  setColumnMapping: (colIndex: number, field: string | null) => void;
  mergeResolutions: (entries: Map<string, CellResolution>) => void;
  setCellResolution: (key: string, value: CellResolution) => void;
  reset: () => void;
}

function makeRowIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i}`);
}

const useImportStore = create<ImportState>((set, get) => ({
  step: "upload",
  entity: "users",
  parse: null,
  rowIds: [],
  mapping: {},
  resolution: new Map(),
  setStep: (step) => set({ step }),
  setParse: (parse) => set({ parse, rowIds: makeRowIds(parse.rows.length), resolution: new Map() }),
  setMapping: (mapping) => set({ mapping }),
  setColumnMapping: (colIndex, field) => set({ mapping: { ...get().mapping, [colIndex]: field } }),
  mergeResolutions: (entries) => {
    const next = new Map(get().resolution);
    entries.forEach((v, k) => next.set(k, v));
    set({ resolution: next });
  },
  setCellResolution: (key, value) => {
    const next = new Map(get().resolution);
    next.set(key, value);
    set({ resolution: next });
  },
  reset: () => set({ step: "upload", parse: null, rowIds: [], mapping: {}, resolution: new Map() }),
}));

export default useImportStore;
```

- [ ] **Step 6: Typecheck + run all FE import tests**

Run: `npx tsc --noEmit && npm run test:unit -- imports`
Expected: PASS; no new type errors.

- [ ] **Step 7: Commit**
```bash
git add src/lib/imports/resolution.ts src/lib/imports/resolution.test.ts src/store/import-store.ts
git commit -m "feat(imports): resolution merge helpers and Zustand import store"
```

---

# PHASE C — Grid, custom cells, shimmer, picker

UI/canvas tasks: verified by running the dev server and visual check (the repo does not unit-test canvas). Keep functions pure where possible.

### Task C1: Glide theme mapping from app tokens

**Files:**
- Create: `src/components/import-grid/glide-theme.ts`

- [ ] **Step 1: Implement**

Create `src/components/import-grid/glide-theme.ts`:
```ts
import type { Theme } from "@glideapps/glide-data-grid";

// Resolve an app CSS variable to a usable color string at runtime.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function buildGlideTheme(): Partial<Theme> {
  return {
    accentColor: cssVar("--primary", "#3a49b5"),
    accentLight: "rgba(58,73,181,0.1)",
    textDark: cssVar("--foreground", "#222"),
    textMedium: cssVar("--muted-foreground", "#6b6b6b"),
    textLight: cssVar("--muted-foreground", "#8a8a8a"),
    bgCell: cssVar("--background", "#ffffff"),
    bgHeader: cssVar("--muted", "#f6f6f7"),
    borderColor: cssVar("--border", "#e2e2e2"),
    fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
    baseFontStyle: "13px",
    headerFontStyle: "600 11px",
  };
}

export const LINK_COLORS = {
  chipBg: "#eef1ff",
  chipBorder: "#d6ddff",
  chipText: "#2f3bb3",
  check: "#3aa564",
  attnBg: "#fff5e6",
  attnBorder: "#ffd8a1",
  attnText: "#9a5b00",
  newTag: "#8a8a8a",
  shimmerBase: "#8a8f99",
  shimmerHighlight: "#cfd6ff",
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (depends on the Glide `Theme` type name; if the import fails, use `import { type Theme } from "@glideapps/glide-data-grid"` or the version's exported theme type).

- [ ] **Step 3: Commit**
```bash
git add src/components/import-grid/glide-theme.ts
git commit -m "feat(imports): map app theme tokens into Glide grid theme"
```

---

### Task C2: Custom cell types + canvas draw helpers

**Files:**
- Create: `src/components/import-grid/cells/draw-helpers.ts`
- Create: `src/components/import-grid/cells/types.ts`

These hold the cell data shapes and pure-ish canvas draw routines (chip, amber chip, new tag, shimmer text). Draw helpers receive the canvas 2D context.

- [ ] **Step 1: Define cell data types**

Create `src/components/import-grid/cells/types.ts`:
```ts
import type { CourseToken } from "@/lib/imports/resolution";

export type UserLinkCellData = {
  kind: "user-link-cell";
  raw: string;
  status: "idle" | "resolving" | "linked" | "new" | "error";
  label?: string; // user name when linked
};

export type CourseLinkCellData = {
  kind: "course-link-cell";
  status: "idle" | "resolving" | "linked" | "needs_attention";
  tokens: CourseToken[];
  raw: string;
};
```

- [ ] **Step 2: Implement draw helpers**

Create `src/components/import-grid/cells/draw-helpers.ts`:
```ts
import { LINK_COLORS } from "@/components/import-grid/glide-theme";

export function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string,
  opts: { attn?: boolean; check?: boolean } = {},
): number {
  ctx.save();
  ctx.font = "12px var(--font-geist-sans, system-ui, sans-serif)";
  const padX = 8;
  const checkW = opts.check ? 14 : 0;
  const textW = ctx.measureText(text).width;
  const w = padX * 2 + textW + checkW;
  const h = 20;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = opts.attn ? LINK_COLORS.attnBg : LINK_COLORS.chipBg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = opts.attn ? LINK_COLORS.attnBorder : LINK_COLORS.chipBorder;
  ctx.stroke();
  ctx.fillStyle = opts.attn ? LINK_COLORS.attnText : LINK_COLORS.chipText;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
  if (opts.check) {
    ctx.fillStyle = LINK_COLORS.check;
    ctx.fillText("✓", x + padX + textW + 4, y + h / 2 + 0.5);
  }
  ctx.restore();
  return w + 6; // advance + gap
}

export function drawShimmerText(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string, time: number,
): void {
  ctx.save();
  ctx.font = "13px var(--font-geist-sans, system-ui, sans-serif)";
  ctx.textBaseline = "middle";
  const width = Math.max(60, ctx.measureText(text).width);
  // Sweep a highlight band across the text over ~2s.
  const phase = (time / 2000) % 1;
  const center = x - width + phase * (width * 2);
  const grad = ctx.createLinearGradient(center - 40, 0, center + 40, 0);
  grad.addColorStop(0, LINK_COLORS.shimmerBase);
  grad.addColorStop(0.5, LINK_COLORS.shimmerHighlight);
  grad.addColorStop(1, LINK_COLORS.shimmerBase);
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawNewTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.font = "10px var(--font-geist-sans, system-ui, sans-serif)";
  ctx.fillStyle = LINK_COLORS.newTag;
  ctx.textBaseline = "middle";
  ctx.fillText("new user", x, y);
  ctx.restore();
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**
```bash
git add src/components/import-grid/cells/types.ts src/components/import-grid/cells/draw-helpers.ts
git commit -m "feat(imports): custom cell types and canvas draw helpers"
```

---

### Task C3: Custom cell renderers (user-link + course-link)

**Files:**
- Create: `src/components/import-grid/cells/user-link-cell.tsx`
- Create: `src/components/import-grid/cells/course-link-cell.tsx`

Follow the Glide custom-renderer API for the installed version (`{ kind: GridCellKind.Custom, isMatch, draw, provideEditor }`, registered via `customRenderers` on `DataEditor`). Use the draw helpers from C2.

- [ ] **Step 1: Implement `user-link-cell.tsx`**
```tsx
import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";
import { drawChip, drawNewTag, drawShimmerText } from "./draw-helpers";
import type { UserLinkCellData } from "./types";

export type UserLinkCell = CustomCell<UserLinkCellData>;

export const userLinkRenderer: CustomRenderer<UserLinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is UserLinkCell => (c.data as any)?.kind === "user-link-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const d = cell.data;
    const x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    if (d.status === "resolving") {
      drawShimmerText(ctx, x, cy, d.raw, (args as any).requestAnimationFrame ? performance.now() : performance.now());
      return true;
    }
    if (d.status === "linked") {
      drawChip(ctx, x, cy - 10, d.raw, { check: true });
      return true;
    }
    if (d.status === "new") {
      ctx.save();
      ctx.fillStyle = theme.textDark;
      ctx.textBaseline = "middle";
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      const adv = ctx.measureText(d.raw).width;
      ctx.fillText(d.raw, x, cy);
      ctx.restore();
      drawNewTag(ctx, x + adv + 8, cy);
      return true;
    }
    if (d.status === "error") {
      ctx.save();
      ctx.fillStyle = "#c0392b";
      ctx.textBaseline = "middle";
      ctx.fillText(d.raw || "(invalid email)", x, cy);
      ctx.restore();
      return true;
    }
    return false; // idle -> default text rendering
  },
  provideEditor: () => undefined,
};
```
> Confirm against the installed Glide version: the `draw` signature is `(args: DrawArgs, cell) => boolean`. If this version doesn't trigger animation via repeated draws, the rAF `damage()` loop in Task C5 drives repaints; the time source can simply be `performance.now()` as above.

- [ ] **Step 2: Implement `course-link-cell.tsx`** (one chip per token; amber when not linked)
```tsx
import { GridCellKind, type CustomCell, type CustomRenderer } from "@glideapps/glide-data-grid";
import { drawChip, drawShimmerText } from "./draw-helpers";
import type { CourseLinkCellData } from "./types";

export type CourseLinkCell = CustomCell<CourseLinkCellData>;

export const courseLinkRenderer: CustomRenderer<CourseLinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is CourseLinkCell => (c.data as any)?.kind === "course-link-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const d = cell.data;
    let x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    if (d.status === "resolving" && d.tokens.length === 0) {
      drawShimmerText(ctx, x, cy, d.raw, performance.now());
      return true;
    }
    for (const t of d.tokens) {
      if (t.status === "resolving") {
        drawShimmerText(ctx, x, cy, t.raw, performance.now());
        x += ctx.measureText(t.raw).width + 12;
      } else if (t.status === "linked") {
        x += drawChip(ctx, x, cy - 10, t.match?.title ?? t.raw, { check: true });
      } else {
        x += drawChip(ctx, x, cy - 10, `${t.raw}  choose`, { attn: true });
      }
    }
    return true;
  },
  provideEditor: () => undefined,
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Fix type-name mismatches against the installed Glide version (`CustomRenderer`, `CustomCell`, `DrawArgs`).

- [ ] **Step 4: Commit**
```bash
git add src/components/import-grid/cells/user-link-cell.tsx src/components/import-grid/cells/course-link-cell.tsx
git commit -m "feat(imports): user-link and course-link custom cell renderers"
```

---

### Task C4: ImportDataGrid wrapper (getCellContent from store)

**Files:**
- Create: `src/components/import-grid/import-data-grid.tsx`

- [ ] **Step 1: Implement the grid wrapper**
```tsx
"use client";

import "@glideapps/glide-data-grid/dist/index.css";
import { useMemo, useRef } from "react";
import {
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import useImportStore from "@/store/import-store";
import { USER_FIELDS } from "@/lib/imports/wizard-logic";
import { buildGlideTheme } from "./glide-theme";
import { userLinkRenderer } from "./cells/user-link-cell";
import { courseLinkRenderer } from "./cells/course-link-cell";
import { cellKey } from "@/lib/imports/resolution";

export function ImportDataGrid({ onCellActivated }: { onCellActivated?: (item: Item) => void }) {
  const gridRef = useRef<DataEditorRef>(null);
  const parse = useImportStore((s) => s.parse);
  const mapping = useImportStore((s) => s.mapping);
  const rowIds = useImportStore((s) => s.rowIds);
  const resolution = useImportStore((s) => s.resolution);
  const theme = useMemo(() => buildGlideTheme(), []);

  const mappedCols = useMemo(
    () => Object.entries(mapping).filter(([, f]) => f).map(([idx, field]) => ({ idx: Number(idx), field: field as string })),
    [mapping],
  );

  const columns: GridColumn[] = useMemo(
    () => mappedCols.map(({ field }) => ({
      title: USER_FIELDS.find((f) => f.key === field)?.label ?? field,
      id: field,
      width: field === "email" ? 240 : field === "courses" ? 280 : 160,
    })),
    [mappedCols],
  );

  if (!parse) return null;

  const getCellContent = ([col, row]: Item): GridCell => {
    const { idx, field } = mappedCols[col];
    const raw = parse.rows[row]?.[idx];
    const value = raw === null || raw === undefined ? "" : String(raw);
    const res = resolution.get(cellKey(rowIds[row], field));

    if (field === "email") {
      return {
        kind: GridCellKind.Custom,
        allowOverlay: false,
        copyData: value,
        data: { kind: "user-link-cell", raw: value, status: (res?.status as any) ?? "idle", label: res?.entityRef?.label },
      } as GridCell;
    }
    if (field === "courses") {
      return {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: value,
        data: { kind: "course-link-cell", raw: value, status: (res?.status as any) ?? "idle", tokens: res?.tokens ?? [] },
      } as GridCell;
    }
    return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: false };
  };

  return (
    <div style={{ height: 560 }}>
      <DataEditor
        ref={gridRef}
        theme={theme}
        columns={columns}
        rows={parse.rows.length}
        rowMarkers="number"
        getCellContent={getCellContent}
        customRenderers={[userLinkRenderer, courseLinkRenderer]}
        onCellActivated={onCellActivated}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (reconcile `DataEditorRef`/`Item`/`customRenderers` names with the installed version).

- [ ] **Step 3: Commit**
```bash
git add src/components/import-grid/import-data-grid.tsx
git commit -m "feat(imports): ImportDataGrid wrapper reading resolution from store"
```

---

### Task C5: Shimmer animation loop (rAF damage of resolving cells)

**Files:**
- Create: `src/components/import-grid/use-shimmer-loop.ts`
- Modify: `src/components/import-grid/import-data-grid.tsx` (wire the hook)

- [ ] **Step 1: Implement the hook**

Create `src/components/import-grid/use-shimmer-loop.ts`:
```ts
import { useEffect } from "react";
import type { RefObject } from "react";
import type { DataEditorRef } from "@glideapps/glide-data-grid";

// Continuously damages the given cells (col,row) while any are resolving,
// so the canvas shimmer animates. Stops when the list is empty.
export function useShimmerLoop(
  gridRef: RefObject<DataEditorRef | null>,
  resolvingCells: { cell: [number, number] }[],
) {
  useEffect(() => {
    if (resolvingCells.length === 0) return;
    let raf = 0;
    const tick = () => {
      gridRef.current?.damage(resolvingCells);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gridRef, resolvingCells]);
}
```

- [ ] **Step 2: Wire it in `import-data-grid.tsx`**

After computing `mappedCols` and reading `resolution`, derive resolving cells and call the hook:
```tsx
import { useShimmerLoop } from "./use-shimmer-loop";
// ...inside component, after mappedCols + resolution:
const resolvingCells = useMemo(() => {
  const out: { cell: [number, number] }[] = [];
  parse?.rows.forEach((_, row) => {
    mappedCols.forEach(({ field }, col) => {
      const res = resolution.get(cellKey(rowIds[row], field));
      const anyTokenResolving = res?.tokens?.some((t) => t.status === "resolving");
      if (res?.status === "resolving" || anyTokenResolving) out.push({ cell: [col, row] });
    });
  });
  return out;
}, [parse, mappedCols, resolution, rowIds]);
useShimmerLoop(gridRef, resolvingCells);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (confirm `gridRef.current.damage` exists on the installed version's ref).

- [ ] **Step 4: Commit**
```bash
git add src/components/import-grid/use-shimmer-loop.ts src/components/import-grid/import-data-grid.tsx
git commit -m "feat(imports): rAF damage loop to animate shimmering cells"
```

---

### Task C6: Course disambiguation popover

**Files:**
- Create: `src/components/import-grid/course-picker-popover.tsx`

Uses `Popover` + `Command` (see `src/components/ui/combo-box.tsx`). Anchored via `PopoverAnchor` positioned at the clicked cell's screen rect. Refinement search reuses `useCourseSearch` (`src/hooks/course-search/use-course-search.ts`) → `CourseSuggestResult`/`courseType`.

- [ ] **Step 1: Implement the popover**
```tsx
"use client";

import { useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useCourseSearch } from "@/hooks/course-search/use-course-search";
import type { CourseCandidate } from "@/app/client-api/imports";

export type CoursePickerTarget = {
  rowId: string;
  tokenRaw: string;
  rect: { x: number; y: number; width: number; height: number };
  candidates: CourseCandidate[];
};

export function CoursePickerPopover({
  target,
  onPick,
  onClose,
}: {
  target: CoursePickerTarget | null;
  onPick: (tokenRaw: string, rowId: string, choice: { id: number; title: string } | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(target?.tokenRaw ?? "");
  const search = useCourseSearch(q, 1);
  if (!target) return null;

  const refined = search.data?.results ?? [];
  const list = q.trim().length >= 2 && refined.length
    ? refined.map((c) => ({ id: c.id, title: c.title, code: (c as any).code ?? null, score: null as number | null }))
    : target.candidates.map((c) => ({ id: c.id, title: c.title, code: c.code, score: c.score }));

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor asChild>
        <div style={{ position: "fixed", left: target.rect.x, top: target.rect.y + target.rect.height, width: target.rect.width, height: 0 }} />
      </PopoverAnchor>
      <PopoverContent align="start" className="p-0 w-[340px]">
        <div className="px-3 py-2 text-xs border-b" style={{ background: "#fff8ee", color: "#9a5b00" }}>
          Spreadsheet value: <b>“{target.tokenRaw}”</b>
        </div>
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search courses…" />
          <CommandList>
            <CommandEmpty>{search.isFetching ? "Searching…" : "No matches."}</CommandEmpty>
            <CommandGroup>
              {list.map((c) => (
                <CommandItem key={c.id} value={String(c.id)} onSelect={() => onPick(target.tokenRaw, target.rowId, { id: c.id, title: c.title })}>
                  <div className="flex flex-col">
                    <span className="text-sm">{c.title}</span>
                    {c.code ? <span className="text-[11px] text-muted-foreground">{c.code}</span> : null}
                  </div>
                  {c.score != null ? <span className="ml-auto text-[10px] text-emerald-600">{Math.round(c.score)}%</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <button className="w-full text-left px-3 py-2 text-xs border-t text-amber-700" onClick={() => onPick(target.tokenRaw, target.rowId, null)}>
          Mark as “no course” ✕
        </button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Adjust `useCourseSearch` result shape access to match `CourseSearchResponse.results`.

- [ ] **Step 3: Commit**
```bash
git add src/components/import-grid/course-picker-popover.tsx
git commit -m "feat(imports): course disambiguation popover with refine search"
```

---

# PHASE D — Wizard page + orchestration

### Task D1: Upload step (entity dropdown + dropzone)

**Files:**
- Create: `src/components/import-wizard/upload-step.tsx`

- [ ] **Step 1: Implement** — entity `Select` (only `Users` enabled), a `react-dropzone` area accepting `.xlsx`/`.xls`, and a `useMutation` calling `parseImport`. On success: `setParse(result)`, auto-guess mapping via `guessFieldForHeader` for each header, `setStep("map")`. Show `Skeleton`/`TextShimmer` while parsing.
```tsx
"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { parseImport } from "@/app/client-api/imports";
import useImportStore from "@/store/import-store";
import { guessFieldForHeader } from "@/lib/imports/wizard-logic";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

export function UploadStep() {
  const setParse = useImportStore((s) => s.setParse);
  const setMapping = useImportStore((s) => s.setMapping);
  const setStep = useImportStore((s) => s.setStep);

  const mutation = useMutation({
    mutationFn: (file: File) => parseImport(file),
    onSuccess: (result) => {
      const mapping: Record<number, string | null> = {};
      result.headers.forEach((h, i) => (mapping[i] = guessFieldForHeader(h)));
      setParse(result);
      setMapping(mapping);
      setStep("map");
    },
    onError: () => toast({ title: "Could not read file", description: "Upload a valid .xlsx workbook.", variant: "destructive" }),
  });

  const onDrop = useCallback((files: File[]) => { if (files[0]) mutation.mutate(files[0]); }, [mutation]);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, multiple: false, noClick: true, noKeyboard: true,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
  });

  return (
    <div className="space-y-4">
      <div className="w-64">
        <Select defaultValue="users">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="users">Users</SelectItem>
            <SelectItem value="courses" disabled>Courses (coming soon)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div {...getRootProps()} className="border border-dashed rounded-lg bg-muted/20 p-10 text-center">
        <input {...getInputProps()} />
        <p className="text-sm text-muted-foreground">{isDragActive ? "Drop the file…" : "Drag an Excel file here"}</p>
        <Button className="mt-3" type="button" onClick={open} disabled={mutation.isLoading}>
          {mutation.isLoading ? "Parsing…" : "Choose file"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**: `npx tsc --noEmit` → no new errors.
- [ ] **Step 3: Commit**
```bash
git add src/components/import-wizard/upload-step.tsx
git commit -m "feat(imports): upload step with entity dropdown and xlsx dropzone"
```

---

### Task D2: Mapping step (+ sheet selector)

**Files:**
- Create: `src/components/import-wizard/map-step.tsx`

- [ ] **Step 1: Implement** — render a sheet `Select` when `parse.sheetNames.length > 1` (on change, re-call `parseImport(file, sheet)` — keep the `File` in component state from D1 via the store or a ref; simplest: keep the last `File` in the store. Add `lastFile: File | null` + `setLastFile` to the store, set it in D1's `onDrop`). For each header, a `Select` of `USER_FIELDS` (+ "Ignore"), defaulting to the guessed mapping; calls `setColumnMapping`. Show first 5 preview rows in a plain table (reuse `CsvToTable` pattern or a simple table). A "Continue to review" `Button`, disabled unless an `email`-mapped column exists; on click `setStep("review")`.
> Add to `import-store.ts`: `lastFile: File | null;` field, `setLastFile: (f: File | null) => void;` setter, set `lastFile` in `setParse` callers. (Update the store interface + implementation accordingly and run `npm run test:unit -- imports` to confirm nothing breaks.)

- [ ] **Step 2: Typecheck + tests**: `npx tsc --noEmit && npm run test:unit -- imports` → pass.
- [ ] **Step 3: Commit**
```bash
git add src/components/import-wizard/map-step.tsx src/store/import-store.ts
git commit -m "feat(imports): column mapping step with sheet selector"
```

---

### Task D3: Review step + resolution orchestration

**Files:**
- Create: `src/components/import-wizard/review-step.tsx`
- Create: `src/hooks/imports/use-resolution.ts`

- [ ] **Step 1: Implement the resolution hook**

`use-resolution.ts`: on mount (when entering review), find the mapped `email` column index and `courses` column index. Build "resolving" placeholder resolutions for all relevant cells and `mergeResolutions`. Then:
- `collectUniqueEmails(rows, emailIdx)` → `resolveUsersBulk` (one call) → `buildUserResolutions` → `mergeResolutions`.
- `collectUniqueCourseTokens(rows, coursesIdx)` → `resolveCoursesBulk` (one call) → `buildCourseResolutions` → `mergeResolutions`.
Use `useMutation`/`useQuery`; guard so each fires once. Expose loading + summary counts (derive from `resolution`).
```ts
import { useEffect, useMemo, useState } from "react";
import useImportStore from "@/store/import-store";
import { resolveCoursesBulk, resolveUsersBulk } from "@/app/client-api/imports";
import {
  collectUniqueCourseTokens, collectUniqueEmails,
} from "@/lib/imports/wizard-logic";
import {
  buildCourseResolutions, buildUserResolutions, cellKey, type CellResolution,
} from "@/lib/imports/resolution";

export function useResolution() {
  const parse = useImportStore((s) => s.parse);
  const mapping = useImportStore((s) => s.mapping);
  const rowIds = useImportStore((s) => s.rowIds);
  const mergeResolutions = useImportStore((s) => s.mergeResolutions);
  const [done, setDone] = useState(false);

  const cols = useMemo(() => {
    const entries = Object.entries(mapping).filter(([, f]) => f) as [string, string][];
    const emailIdx = entries.find(([, f]) => f === "email")?.[0];
    const coursesIdx = entries.find(([, f]) => f === "courses")?.[0];
    return { emailIdx: emailIdx != null ? Number(emailIdx) : null, coursesIdx: coursesIdx != null ? Number(coursesIdx) : null };
  }, [mapping]);

  useEffect(() => {
    if (!parse || done) return;
    setDone(true);
    const seed = new Map<string, CellResolution>();
    if (cols.emailIdx != null) parse.rows.forEach((_, i) => seed.set(cellKey(rowIds[i], "email"), { status: "resolving" }));
    if (cols.coursesIdx != null) parse.rows.forEach((_, i) => seed.set(cellKey(rowIds[i], "courses"), { status: "resolving", tokens: [] }));
    mergeResolutions(seed);

    if (cols.emailIdx != null) {
      const emails = collectUniqueEmails(parse.rows, cols.emailIdx);
      resolveUsersBulk(emails).then((map) => mergeResolutions(buildUserResolutions(parse.rows, cols.emailIdx!, rowIds, map)));
    }
    if (cols.coursesIdx != null) {
      const names = collectUniqueCourseTokens(parse.rows, cols.coursesIdx);
      resolveCoursesBulk(names).then((map) => mergeResolutions(buildCourseResolutions(parse.rows, cols.coursesIdx!, rowIds, map)));
    }
  }, [parse, cols, rowIds, mergeResolutions, done]);
}
```

- [ ] **Step 2: Implement `review-step.tsx`** — calls `useResolution()`, renders the summary header (counts derived from `resolution`: linked / new / needs-attention), the `ImportDataGrid`, manages the `CoursePickerPopover` (open on `onCellActivated` of a courses cell with a token needing attention; compute screen rect from the grid ref's `getBounds(col,row)`), and a disabled "Import" `Button` with a tooltip "Coming soon". On `onPick`, update the token in that cell's resolution (set token `linked` with chosen course or `none`), recompute the cell's worst-of status, and `setCellResolution`.

- [ ] **Step 3: Typecheck**: `npx tsc --noEmit` → no new errors.
- [ ] **Step 4: Commit**
```bash
git add src/hooks/imports/use-resolution.ts src/components/import-wizard/review-step.tsx
git commit -m "feat(imports): review step with bulk resolution orchestration"
```

---

### Task D4: Assemble the wizard page + replace the spike

**Files:**
- Modify: `src/app/(internal)/imports/page.tsx`
- Delete: `src/components/import-grid/glide-spike.tsx`

- [ ] **Step 1: Replace the page**
```tsx
"use client";

import useImportStore from "@/store/import-store";
import { UploadStep } from "@/components/import-wizard/upload-step";
import { MapStep } from "@/components/import-wizard/map-step";
import { ReviewStep } from "@/components/import-wizard/review-step";
import { AcademicPageHeader } from "@/components/academic/academic-page-header";

export default function ImportWizardPage() {
  const step = useImportStore((s) => s.step);
  return (
    <div className="space-y-6">
      <AcademicPageHeader title="Import" description="Upload an Excel file to import users. Email and course cells link automatically." />
      {step === "upload" && <UploadStep />}
      {step === "map" && <MapStep />}
      {step === "review" && <ReviewStep />}
    </div>
  );
}
```

- [ ] **Step 2: Delete the spike component**

Run: `rm src/components/import-grid/glide-spike.tsx`

- [ ] **Step 3: End-to-end manual verification**

Run: `npm run dev`. With the backend running and logged in as an admin, open `http://localhost:3000/imports`:
- Upload `sdec-teacher-list.xlsx` (or `sdec-student-w-room.xlsx`) from the workspace root.
- Confirm: mapping step shows headers + auto-guesses; sheet selector appears for multi-sheet files; Review renders the grid; email cells shimmer then become linked chips / new tags; course cells show chips with amber "choose" where ambiguous; clicking an amber chip opens the picker; selecting a course turns it into a linked chip; summary counts update; "Import" button is disabled.
- Capture screenshots of the Review grid (shimmer + settled states) and the picker for the PR.

- [ ] **Step 4: Typecheck + all unit tests + lint**

Run: `npx tsc --noEmit && npm run test:unit && npm run lint`
Expected: pass / no new errors.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(internal)/imports/page.tsx"
git rm src/components/import-grid/glide-spike.tsx
git commit -m "feat(imports): assemble import wizard page (upload/map/review)"
```

---

### Task D5: Sidebar nav entry (optional, discover first)

**Files:**
- Modify: the app sidebar nav definition

- [ ] **Step 1: Locate the nav items** — read `src/components/nav/` (e.g. `app-sidebar.tsx`) to find the array of `{ title, url, icon }` nav items and the admin-visibility pattern.
- [ ] **Step 2: Add an entry** following the existing shape, e.g. `{ title: "Import", url: "/imports", icon: Upload }` (import `Upload` from `lucide-react`), gated to admins like sibling admin links.
- [ ] **Step 3: Verify** the link appears in the sidebar for an admin and routes to `/imports`.
- [ ] **Step 4: Commit**
```bash
git add src/components/nav
git commit -m "feat(imports): add Import link to the admin sidebar"
```

---

## Final verification

- [ ] Backend: `cd schedjuice-reimagined-be && ./env/bin/python manage.py test app_utils.tests.test_import_parse app_course.tests.test_import_matching app_course.tests.test_resolve_bulk app_auth.tests.test_resolve_bulk -v 2` → all pass.
- [ ] Frontend: `cd schedjuice-reimagined-fe && npx tsc --noEmit && npm run test:unit && npm run lint` → all pass.
- [ ] Manual E2E per Task D4, screenshots captured.
- [ ] Open two PRs (base `dev`): one per repo, cross-referencing each other and the spec. Frontend PR includes Review-grid + picker screenshots.

## Notes / known seams for the next iteration

- The disabled "Import" button in `review-step.tsx` is the commit seam. Next iteration adds `POST /imports/commit` (create/update users + enrollments via bulk_create/bulk_update, mirroring `import_sdec_students.py`) and enables the button.
- Course matching heuristics not built now (future toggles): current-intake priority, token/trigram prefilter, campus scoping — add inside `load_tier1_catalog()` / `_rank()`.
- Duplicate-email-in-file flagging is deferred; today duplicates share one resolution.
