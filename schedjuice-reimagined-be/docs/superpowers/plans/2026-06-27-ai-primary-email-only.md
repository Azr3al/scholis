# AI Primary Email Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the Telegram AI assistant (and shared `app_ai` tool payloads) expose and instruct display of **primary email only** (`User.email`), never communication email, even when search matched on communication email.

**Architecture:** Add `compact_user_for_ai()` in `app_ai/links.py` as the single serializer for user rows returned to the model (`primary_email` + optional `profile_url`). Migrate all AI tools to use it. Strengthen `PLATFORM_BASE_TEMPLATE` link-formatting rules. No response post-processing.

**Tech Stack:** Django, django-tenant-schemas, existing AI tool registry, Gemini tool-calling via `app_ai/`.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-primary-email-only-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/links.py` | Add `compact_user_for_ai(user)` |
| `app_ai/tools/resolve.py` | Replace `_compact_user` with `compact_user_for_ai` |
| `app_ai/tools/search_users.py` | Use helper in `_compact_row`; clarify tool description |
| `app_ai/tools/list_user_courses.py` | Use helper for `user` block |
| `app_ai/tools/adjust_staff_points.py` | Use helper for `subject` |
| `app_ai/tools/get_staff_point_balances.py` | Use helper for `subject` |
| `app_ai/tools/count_teacher_courses.py` | Use helper for `user` (+ `profile_url`) |
| `app_ai/prompts.py` | `primary_email` + never show communication email |
| `app_ai/tests/test_links.py` | Unit tests for `compact_user_for_ai` |
| `app_ai/tests/test_primary_email.py` | DB integration: search by comm email → primary only |
| `app_ai/tests/test_tenant_context.py` | Assert prompt includes primary-email rules |

---

## Conventions for every task

- **Run tests:** from `schedjuice-reimagined-be/`:
  `python manage.py test app_ai.tests.test_links -v 2`
- **DB tests:** use `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")`; reuse `_CountToolsTestBase` from `app_ai.tests.test_count_tools` for tenant fixtures.
- **Tenant fixture:** `schema_name = "xschedjuice"`, `domain_url` from loaded org data (`schedjuice.thiha.net` in dummy CSV).
- **Commits:** workspace rule — **do not `git commit`** unless the user asks. Stage + propose message only.
- **Distinct emails in tests:** always set both `email` (primary) and `communication_email` explicitly on `User.objects.create_user(..., communication_email=...)`.

---

## Task 1: `compact_user_for_ai` helper

**Files:**
- Modify: `app_ai/links.py`
- Modify: `app_ai/tests/test_links.py`

- [ ] **Step 1: Write failing tests**

Add to `app_ai/tests/test_links.py`:

```python
from unittest.mock import MagicMock

from app_ai.links import compact_user_for_ai
from app_organization.models import Organization


class CompactUserForAiTests(TestCase):
    def test_sets_primary_email_from_user_email(self):
        user = MagicMock()
        user.id = 12
        user.name = "Bruce"
        user.email = "bruce@school.com"
        user.communication_email = "parent@gmail.com"
        row = compact_user_for_ai(user)
        self.assertEqual(row["primary_email"], "bruce@school.com")

    def test_never_includes_communication_email_or_legacy_email_key(self):
        user = MagicMock()
        user.id = 12
        user.name = "Bruce"
        user.email = "bruce@school.com"
        user.communication_email = "parent@gmail.com"
        row = compact_user_for_ai(user)
        self.assertNotIn("communication_email", row)
        self.assertNotIn("email", row)

    def test_adds_profile_url_when_org_has_domain(self):
        user = MagicMock()
        user.id = 5
        user.name = "Bruce"
        user.email = "b@e.com"
        user.communication_email = "other@e.com"
        org = Organization(domain_url="schedjuice.thiha.net")
        row = compact_user_for_ai(user, org=org)
        self.assertEqual(
            row["profile_url"],
            "https://schedjuice.thiha.net/users/5",
        )

    def test_strips_whitespace_from_primary_email(self):
        user = MagicMock()
        user.id = 1
        user.name = "A"
        user.email = "  a@e.com  "
        user.communication_email = "b@e.com"
        row = compact_user_for_ai(user)
        self.assertEqual(row["primary_email"], "a@e.com")
```

Update the import at the top of `test_links.py` to include `compact_user_for_ai`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_links.CompactUserForAiTests -v 2`

Expected: FAIL with `ImportError` or `cannot import name 'compact_user_for_ai'`

- [ ] **Step 3: Implement helper**

In `app_ai/links.py`, add import and function:

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app_auth.models import User


def compact_user_for_ai(user: User, *, org: Organization | None = None) -> dict[str, Any]:
  row = {
      "id": user.id,
      "name": user.name,
      "primary_email": (user.email or "").strip(),
  }
  return with_user_link(row, org=org)
```

Use a runtime import if `TYPE_CHECKING` causes issues in tests with MagicMock — either `from app_auth.models import User` directly (matches other `app_ai` modules) or keep `TYPE_CHECKING` only.

Preferred (matches codebase style):

```python
from app_auth.models import User

def compact_user_for_ai(user: User, *, org: Organization | None = None) -> dict[str, Any]:
    row = {
        "id": user.id,
        "name": user.name,
        "primary_email": (user.email or "").strip(),
    }
    return with_user_link(row, org=org)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python manage.py test app_ai.tests.test_links -v 2`

Expected: PASS

- [ ] **Step 5: Stage (commit only if user asks)**

```bash
git add app_ai/links.py app_ai/tests/test_links.py
# git commit -m "feat(ai): add compact_user_for_ai for primary email only payloads"
```

---

## Task 2: Migrate `resolve.py`

**Files:**
- Modify: `app_ai/tools/resolve.py`

- [ ] **Step 1: Replace `_compact_user`**

Change imports:

```python
from app_ai.links import compact_user_for_ai, with_course_link
```

Remove `with_user_link` import if unused.

Replace `_compact_user` body and all usages:

```python
def _compact_user(user: User) -> dict[str, Any]:
    return compact_user_for_ai(user)
```

Or delete `_compact_user` and call `compact_user_for_ai(user)` directly in `resolve_user`, `resolve_staff_user`, and `_ambiguous_payload` candidate lists (3 call sites).

- [ ] **Step 2: Verify no `email` key remains**

Run: `rg '"email":\s*(user\.|subject\.)' app_ai/tools/resolve.py`

Expected: no matches in resolve.py

- [ ] **Step 3: Run existing AI tests**

Run: `python manage.py test app_ai.tests.test_count_tools app_ai.tests.test_disambiguation -v 2`

Expected: PASS (no assertions on legacy `email` tool field)

- [ ] **Step 4: Stage**

```bash
git add app_ai/tools/resolve.py
```

---

## Task 3: Migrate `search_users.py` and `list_user_courses.py`

**Files:**
- Modify: `app_ai/tools/search_users.py`
- Modify: `app_ai/tools/list_user_courses.py`

- [ ] **Step 1: Update `search_users.py`**

```python
from app_ai.links import compact_user_for_ai

def _compact_row(user: User) -> dict[str, Any]:
    row = compact_user_for_ai(user)
    row["alternative_name"] = user.alternative_name
    row["roles"] = list(user.roles or [])
    return row
```

Update `SEARCH_USERS_TOOL.description` trailing sentence:

```python
description=(
    "Search staff or students by name, alternate name, email, communication email, "
    "or student/staff code. Communication email can be used for lookup but is never "
    "shown in replies. Use role=staff or role=student to narrow results."
),
```

Remove unused `with_user_link` import.

- [ ] **Step 2: Update `list_user_courses.py`**

Replace the `with_user_link({...})` block:

```python
user_row = compact_user_for_ai(target)
user_row["roles"] = list(target.roles or [])

result: dict[str, Any] = {
    "user": user_row,
    ...
}
```

Import `compact_user_for_ai`; remove `with_user_link` if unused.

- [ ] **Step 3: Run tool link tests**

Run: `python manage.py test app_ai.tests.test_tool_links -v 2`

Expected: PASS

- [ ] **Step 4: Stage**

```bash
git add app_ai/tools/search_users.py app_ai/tools/list_user_courses.py
```

---

## Task 4: Migrate points tools and `count_teacher_courses`

**Files:**
- Modify: `app_ai/tools/adjust_staff_points.py`
- Modify: `app_ai/tools/get_staff_point_balances.py`
- Modify: `app_ai/tools/count_teacher_courses.py`

- [ ] **Step 1: Update `adjust_staff_points.py`**

Replace:

```python
"subject": with_user_link(
    {"id": subject.id, "name": subject.name, "email": subject.email}
),
```

With:

```python
"subject": compact_user_for_ai(subject),
```

Import `compact_user_for_ai` from `app_ai.links`; remove `with_user_link` if unused.

- [ ] **Step 2: Update `get_staff_point_balances.py`**

Same replacement for `subject` payload. Import `compact_user_for_ai`.

- [ ] **Step 3: Update `count_teacher_courses.py`**

Replace return block `user` dict:

```python
return {
    "count": qs.count(),
    "user": compact_user_for_ai(teacher),
    "course_status": course_status,
}
```

Add: `from app_ai.links import compact_user_for_ai`

- [ ] **Step 4: Run points + count tests**

Run: `python manage.py test app_ai.tests.test_adjust_staff_points app_ai.tests.test_count_tools.CountTeacherCoursesToolTests -v 2`

Expected: PASS

- [ ] **Step 5: Stage**

```bash
git add app_ai/tools/adjust_staff_points.py app_ai/tools/get_staff_point_balances.py app_ai/tools/count_teacher_courses.py
```

---

## Task 5: Platform prompt + tenant context tests

**Files:**
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Update `PLATFORM_BASE_TEMPLATE` link formatting block**

Replace the user link bullet (lines 29–32) with:

```python
Link formatting:
- When mentioning a user, link only their name: [Name](profile_url). If primary_email
  is present in tool data, append it in parentheses after the link, e.g.
  (user@school.com). Use only the primary_email field from tools — never show
  communication email, even if the user searched by it or mentioned a different address.
  When clarifying that two lookups are the same person, do not list multiple email
  addresses. Never show numeric user IDs.
- When mentioning a course, link only the title: [Title](url). Do not show course
  IDs, codes, or other metadata unless the user explicitly asks for them.
- Use profile_url and url from tool results exactly. Never invent URLs."""
```

- [ ] **Step 2: Add failing tenant context tests**

In `app_ai/tests/test_tenant_context.py`, inside `PlatformPromptTests`:

```python
def test_platform_base_includes_primary_email_rules(self):
    org = Organization(name="Demo School")
    text = build_platform_base_prompt(org)
    self.assertIn("primary_email", text)
    self.assertIn("never show communication email", text.lower())

def test_platform_base_discourages_listing_multiple_emails(self):
    org = Organization(name="Demo School")
    text = build_platform_base_prompt(org)
    self.assertIn("do not list multiple email", text.lower())
```

- [ ] **Step 3: Run tenant context tests**

Run: `python manage.py test app_ai.tests.test_tenant_context.PlatformPromptTests -v 2`

Expected: PASS

- [ ] **Step 4: Stage**

```bash
git add app_ai/prompts.py app_ai/tests/test_tenant_context.py
```

---

## Task 6: Integration tests — search by communication email

**Files:**
- Create: `app_ai/tests/test_primary_email.py`

- [ ] **Step 1: Write integration tests**

Create `app_ai/tests/test_primary_email.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.db import connection
from django.test import override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.search_users import run_search_users
from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PrimaryEmailToolPayloadTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = __import__("django.utils.timezone", fromlist=["timezone"]).localdate()
        suffix = uuid4().hex[:6]
        self.primary = f"bruce-primary-{suffix}@yopmail.com"
        self.communication = f"parent+{suffix}@gmail.com"
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=self.primary,
                password="x",
                name="Bruce",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                communication_email=self.communication,
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title="test course 3",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + __import__("datetime", fromlist=["timedelta"]).timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_search_by_communication_email_returns_primary_email_only(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": self.communication}, self.admin)
        self.assertTrue(rows)
        row = rows[0]
        self.assertEqual(row["primary_email"], self.primary)
        self.assertNotIn("communication_email", row)
        self.assertNotIn("email", row)

    def test_search_by_name_returns_primary_email_only(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "Bruce"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(rows[0]["primary_email"], self.primary)
        self.assertNotIn(self.communication, rows[0])

    def test_list_user_courses_resolve_by_comm_email_uses_primary(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses({"query": self.communication}, self.admin)
        user = result["user"]
        self.assertEqual(user["primary_email"], self.primary)
        self.assertNotIn("communication_email", user)
        self.assertNotIn("email", user)
        self.assertEqual(len(result["courses"]), 1)
```

Prefer clean imports at top (`from datetime import timedelta`, `from django.utils import timezone`) instead of `__import__` — use:

```python
from datetime import date, timedelta
from django.utils import timezone
```

- [ ] **Step 2: Run integration tests**

Run: `python manage.py test app_ai.tests.test_primary_email -v 2`

Expected: PASS

- [ ] **Step 3: Run full `app_ai` test suite**

Run: `python manage.py test app_ai -v 2`

Expected: PASS

- [ ] **Step 4: Grep guard — no legacy email in tool payloads**

Run:

```bash
rg '"email":\s*(user\.|subject\.|target\.|teacher\.)' app_ai/tools/
```

Expected: no matches

- [ ] **Step 5: Stage**

```bash
git add app_ai/tests/test_primary_email.py
```

---

## Task 7: Manual verification (Telegram)

**Files:** none

- [ ] **Step 1: Deploy or run local stack with Telegram + AI enabled**

Use tenant where a student has distinct primary (`@yopmail` / school domain) and communication (`@gmail`) emails — same setup as production Bruce.

- [ ] **Step 2: Reproduce Bruce conversation**

1. “What classes is Bruce taking?” → parentheses show **primary** only.
2. “Any other students named Bruce?” → same **primary**, not communication email.
3. Ask using communication email as lookup cue → still **primary** in reply.
4. If bot explains same person twice → should not list both addresses.

- [ ] **Step 3: Note results** in PR or chat for reviewer.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `compact_user_for_ai` helper | Task 1 |
| `primary_email` field, no `communication_email` | Tasks 1–6 |
| All 6 tools migrated | Tasks 2–4 |
| `search_users` description (search vs display) | Task 3 |
| Prompt `primary_email` + never comm email | Task 5 |
| Duplicate-user prompt guidance | Task 5 |
| Unit tests `test_links` | Task 1 |
| Integration search-by-comm-email tests | Task 6 |
| Manual Telegram repro | Task 7 |
| No response post-processing | Out of scope (not in plan) |
| No `user_search` changes | Out of scope |

---

## Suggested commit messages (if user requests commits)

1. `feat(ai): add compact_user_for_ai for primary email payloads`
2. `refactor(ai): migrate tools to primary_email via compact_user_for_ai`
3. `fix(ai): prompt and tests for primary email only display`

Or one squashed commit:

`fix(ai): show primary email only in tool payloads and prompts`
