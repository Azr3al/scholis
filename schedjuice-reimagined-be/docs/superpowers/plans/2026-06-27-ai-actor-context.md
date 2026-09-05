# AI Actor Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the authenticated sender's identity (name, email, roles, `user_id`) into every AI system prompt and add a first-person safety net so “what are my classes?” resolves to the linked user without disambiguation.

**Architecture:** New `build_actor_context()` helper injected in `AIService.run()` after user preferences; shared `is_self_reference_query()` used by `resolve_user` and `search_users`. Telegram and web both benefit via the same service path. No binding or tool schema changes.

**Tech Stack:** Django, django-tenant-schemas, Google Gemini, existing AI tool registry.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-actor-context-design.md`

**Repo:** `schedjuice-reimagined-be`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/self_reference.py` | `is_self_reference_query(q)` helper |
| `app_ai/actor_context.py` | `build_actor_context(user, org=…)` |
| `app_ai/service.py` | Inject actor block into `system_context` |
| `app_ai/prompts.py` | First-person / current-user rules in platform prompt |
| `app_ai/tools/resolve.py` | Self-reference → actor in `resolve_user` |
| `app_ai/tools/search_users.py` | Self-reference → single actor row |
| `app_ai/tests/test_self_reference.py` | Unit tests for query detection |
| `app_ai/tests/test_actor_context.py` | Unit + integration tests |

---

## Conventions

- **Tests:** Django `TestCase` under `app_ai/tests/`
- `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")`
- `@override_settings(RBAC_ENFORCE="log_only")` unless testing RBAC
- `setUpTestData`: `migrate_schemas` + `load-data` with `schema_name = "xschedjuice"`
- Tenant ORM: `schema_context(self.schema_name)`
- **Run all new tests:** `python manage.py test app_ai.tests.test_self_reference app_ai.tests.test_actor_context -v 2`
- **Commits:** Do not `git commit` unless the user asks (repo rule).

---

## Task 1: Self-reference query helper

**Files:**
- Create: `app_ai/tools/self_reference.py`
- Create: `app_ai/tests/test_self_reference.py`

- [ ] **Step 1: Write the failing test**

Create `app_ai/tests/test_self_reference.py`:

```python
import unittest

from django.test import SimpleTestCase

from app_ai.tools.self_reference import is_self_reference_query


class SelfReferenceQueryTests(SimpleTestCase):
    def test_exact_tokens(self):
        for q in ("me", "Me", "MYSELF", "I", "my"):
            with self.subTest(q=q):
                self.assertTrue(is_self_reference_query(q))

    def test_my_prefix(self):
        self.assertTrue(is_self_reference_query("my classes"))
        self.assertTrue(is_self_reference_query("My schedule"))

    def test_not_self_reference(self):
        for q in ("Me Me Win", "Mecole", "memewin", "James", "", "   "):
            with self.subTest(q=q):
                self.assertFalse(is_self_reference_query(q))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_self_reference -v 2`  
Expected: FAIL — `ModuleNotFoundError: app_ai.tools.self_reference`

- [ ] **Step 3: Write minimal implementation**

Create `app_ai/tools/self_reference.py`:

```python
"""Detect first-person queries that refer to the authenticated actor."""
from __future__ import annotations

_SELF_EXACT = frozenset({"me", "myself", "i", "my"})


def is_self_reference_query(q: str) -> bool:
    text = (q or "").strip().lower()
    if not text:
        return False
    if text in _SELF_EXACT:
        return True
    if text.startswith("my "):
        return True
    return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_self_reference -v 2`  
Expected: PASS (3 tests)

---

## Task 2: Actor context builder

**Files:**
- Create: `app_ai/actor_context.py`
- Modify: `app_ai/tests/test_actor_context.py` (create file, actor block tests only for now)

- [ ] **Step 1: Write the failing test**

Create `app_ai/tests/test_actor_context.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.actor_context import build_actor_context
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class BuildActorContextUnitTests(SimpleTestCase):
    def test_returns_empty_when_user_none(self):
        self.assertEqual(build_actor_context(None, org=None), "")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class BuildActorContextIntegrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_includes_name_email_roles_and_user_id(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"actor-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Thiha Swan Htet",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER, User.UserRole.COORDINATOR],
            )
            block = build_actor_context(user, org=org)
        self.assertIn("Thiha Swan Htet", block)
        self.assertIn(user.email, block)
        self.assertIn("teacher", block.lower())
        self.assertIn(f"user_id: {user.id}", block)
        self.assertIn("never show numeric IDs", block.lower())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_actor_context.BuildActorContextUnitTests app_ai.tests.test_actor_context.BuildActorContextIntegrationTests -v 2`  
Expected: FAIL — `ModuleNotFoundError: app_ai.actor_context`

- [ ] **Step 3: Write minimal implementation**

Create `app_ai/actor_context.py`:

```python
"""Build system-prompt block describing the authenticated user (actor)."""
from __future__ import annotations

from app_auth.models import User
from app_organization.models import Organization


def build_actor_context(user: User | None, *, org: Organization | None) -> str:
    if user is None:
        return ""
    roles = ", ".join(user.roles or []) or "none"
    email = (user.email or "").strip()
    return (
        "Current user (the person asking):\n"
        f"- Name: {user.name}\n"
        f"- Email: {email}\n"
        f"- Roles: {roles}\n"
        f"- user_id: {user.id} (use for tool calls when they ask about themselves; "
        "never show numeric IDs in replies)"
    )
```

Note: `org` is accepted for future extension but unused in v1 (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_actor_context.BuildActorContextUnitTests app_ai.tests.test_actor_context.BuildActorContextIntegrationTests -v 2`  
Expected: PASS

---

## Task 3: Tool-layer safety net

**Files:**
- Modify: `app_ai/tools/resolve.py` (import + early return in query branch)
- Modify: `app_ai/tools/search_users.py` (import + early return)
- Modify: `app_ai/tests/test_actor_context.py` (add resolve/search tests)

- [ ] **Step 1: Write the failing tests**

Append to `app_ai/tests/test_actor_context.py`:

```python
from app_ai.tools.resolve import resolve_user
from app_ai.tools.search_users import run_search_users


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SelfReferenceToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.actor = User.objects.create_user(
                email=f"me-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Actor User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            User.objects.create_user(
                email=f"meme-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Me Me Win Shwe",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_resolve_user_me_returns_actor(self):
        with schema_context(self.schema_name):
            result = resolve_user(actor=self.actor, user_id=None, query="me")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.actor.id)

    def test_resolve_user_my_classes_returns_actor(self):
        with schema_context(self.schema_name):
            result = resolve_user(actor=self.actor, user_id=None, query="my classes")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.actor.id)

    def test_search_users_me_returns_single_actor_row(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "me"}, self.actor)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.actor.id)
        self.assertEqual(rows[0]["name"], "Actor User")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test app_ai.tests.test_actor_context.SelfReferenceToolTests -v 2`  
Expected: FAIL — `resolve_user` returns `ambiguous` or multiple matches for `"me"`

- [ ] **Step 3: Patch `resolve_user`**

In `app_ai/tools/resolve.py`, add import at top:

```python
from app_ai.tools.self_reference import is_self_reference_query
```

In `resolve_user`, in the `user_id is None` branch, immediately after `q = (query or "").strip()` and empty check:

```python
    if is_self_reference_query(q):
        return {"status": "ok", "user": actor}
```

- [ ] **Step 4: Patch `run_search_users`**

In `app_ai/tools/search_users.py`, add import:

```python
from app_ai.tools.self_reference import is_self_reference_query
```

At start of `run_search_users`, before FTS:

```python
    if is_self_reference_query(query):
        org = get_current_org()
        return [_compact_row(user, org=org)]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python manage.py test app_ai.tests.test_actor_context.SelfReferenceToolTests -v 2`  
Expected: PASS (3 tests)

---

## Task 4: Platform prompt rules

**Files:**
- Modify: `app_ai/prompts.py`

- [ ] **Step 1: Write failing prompt test**

Append to `app_ai/tests/test_actor_context.py`:

```python
from app_ai.prompts import build_platform_base_prompt


class PlatformPromptActorRulesTests(SimpleTestCase):
    def test_prompt_mentions_current_user_and_first_person(self):
        from unittest.mock import MagicMock

        org = MagicMock()
        org.name = "Test School"
        text = build_platform_base_prompt(org)
        self.assertIn("Current user", text)
        self.assertIn("user_id", text)
        self.assertIn("search_users", text)
        self.assertIn('"me"', text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_actor_context.PlatformPromptActorRulesTests -v 2`  
Expected: FAIL — `AssertionError` (strings not in prompt yet)

- [ ] **Step 3: Update `PLATFORM_BASE_TEMPLATE`**

In `app_ai/prompts.py`, insert after the “Use search tools first…” paragraph (before the Points section):

```
Current user context:
- The system prompt may include a "Current user" block. That person is always who
  is asking — on Telegram, the linked account holder; on web, the signed-in user.
- When they ask about themselves ("my classes", "my schedule", "my points"), pass
  their user_id to tools directly. Do not call search_users with "me", "my", or
  their own name to identify them.
- When they ask about someone else, use search_users or query as usual.

```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_actor_context.PlatformPromptActorRulesTests -v 2`  
Expected: PASS

---

## Task 5: Inject actor context in AIService

**Files:**
- Modify: `app_ai/service.py:105-112`
- Modify: `app_ai/tests/test_actor_context.py` (service injection test)

- [ ] **Step 1: Write failing service test**

Append to `app_ai/tests/test_actor_context.py`:

```python
from unittest.mock import patch

from app_ai.client import AIResult
from app_ai.service import AIService


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIServiceActorContextTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_ai.service.GeminiClient.generate_with_tools")
    def test_system_context_includes_actor_block(self, mock_gen):
        mock_gen.return_value = AIResult(
            text="ok", tool_calls=[], model="test", iterations=0
        )
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"svc-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Telegram Actor",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                telegram_user_id=88001,
            )
            AIService().run(
                "what are my classes?",
                user,
                feature="telegram_query",
                channel_key="telegram:88001",
            )
        kwargs = mock_gen.call_args.kwargs
        ctx = kwargs["system_context"]
        self.assertIn("Current user (the person asking)", ctx)
        self.assertIn("Telegram Actor", ctx)
        self.assertIn(f"user_id: {user.id}", ctx)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_actor_context.AIServiceActorContextTests -v 2`  
Expected: FAIL — actor block not in `system_context`

- [ ] **Step 3: Inject in `AIService.run()`**

In `app_ai/service.py`, after the user preferences block (lines 105–112), add:

```python
        if user is not None and tenant is not None:
            from app_ai.actor_context import build_actor_context

            actor_block = build_actor_context(user, org=tenant)
            if actor_block:
                system_context = (
                    f"{system_context}\n\n{actor_block}"
                    if system_context
                    else actor_block
                )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_actor_context.AIServiceActorContextTests -v 2`  
Expected: PASS

---

## Task 6: End-to-end tool chain for `list_user_courses`

**Files:**
- Modify: `app_ai/tests/test_actor_context.py`

- [ ] **Step 1: Write integration test**

Append to `app_ai/tests/test_actor_context.py`:

```python
from app_ai.tools.list_user_courses import run_list_user_courses
from app_course.models import Course, UserCourse


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ListUserCoursesSelfReferenceTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_query_me_returns_actor_courses_not_ambiguous(self):
        with schema_context(self.schema_name):
            actor = User.objects.create_user(
                email=f"luc-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Coordinator One",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.COORDINATOR],
            )
            User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Me Me Win Shwe",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            course = Course.objects.create(
                title="KET 152 WE",
                code=f"KET-{uuid4().hex[:4]}",
                status=Course.CourseStatus.ACTIVE,
            )
            UserCourse.objects.create(
                user=actor,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            result = run_list_user_courses({"query": "me"}, actor)
        self.assertNotIn("error", result)
        self.assertEqual(result["user"]["id"], actor.id)
        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["title"], "KET 152 WE")
```

Adjust `Course.objects.create` fields if the model requires more non-null columns — copy required fields from an existing test in `app_ai/tests/test_count_tools.py` or `app_telegram/tests/test_ai_query.py`.

- [ ] **Step 2: Run test**

Run: `python manage.py test app_ai.tests.test_actor_context.ListUserCoursesSelfReferenceTests -v 2`  
Expected: PASS (safety net from Task 3 + course fixture)

---

## Task 7: Full regression run

- [ ] **Step 1: Run all new tests**

Run:
```bash
python manage.py test app_ai.tests.test_self_reference app_ai.tests.test_actor_context -v 2
```
Expected: all PASS

- [ ] **Step 2: Run related AI test modules**

Run:
```bash
python manage.py test app_ai.tests.test_service_user_preferences app_ai.tests.test_count_tools app_telegram.tests.test_ai_query -v 2
```
Expected: no regressions

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-06-27-ai-actor-context-design.md`, change  
`Status: Draft — pending review` → `Status: Implemented (YYYY-MM-DD)`.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `build_actor_context` with name, email, roles, user_id | Task 2 |
| Inject in `AIService.run()` | Task 5 |
| Platform prompt first-person rules | Task 4 |
| `is_self_reference_query` exact + `my ` prefix | Task 1 |
| `resolve_user` safety net | Task 3 |
| `search_users` safety net | Task 3 |
| `list_user_courses` via `"me"` query | Task 6 |
| No binding/tool schema changes | N/A (not modified) |
| Tests | Tasks 1–7 |

---

## Manual verification (Telegram)

After deploy to a dev tenant:

1. Link Telegram account via Schedjuice deep link.
2. Send: `what are my classes?`
3. Expect: course list for the linked user, **no** “multiple users matching” disambiguation.
4. Send: `who teaches KET 152?` (or another third-person question) — should still use search tools normally.
