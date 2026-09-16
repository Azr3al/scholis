# AI Entity Links (Users & Courses) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render users and courses in Telegram AI replies as clickable links to the tenant frontend (`/users/{id}`, `/courses/{id}`), with email beside user names when present and no numeric IDs in user-facing text.

**Architecture:** Shared URL builders and response cleanup in `app_ai/`; tool payloads enriched with `profile_url` / `url` at execution time; platform prompt instructs Markdown link format; Telegram converts Markdown links to HTML before send. Web API reuse deferred — same `app_ai/` modules, no `AIQueryView` changes in v1.

**Tech Stack:** Django, django-tenant-schemas, existing AI tool registry, Telegram Bot API (HTML parse mode).

**Spec:** `docs/superpowers/specs/2026-06-27-ai-entity-links-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/links.py` | `get_current_org()`, URL builders, `with_user_link` / `with_course_link` |
| `app_ai/response_format.py` | `cleanup_ai_response_text()` — strip `(ID: …)` / `(Course ID: …)` |
| `app_ai/prompts.py` | Link formatting rules in `PLATFORM_BASE_TEMPLATE` |
| `app_ai/tools/search_users.py` | Add `profile_url` to compact rows |
| `app_ai/tools/search_courses.py` | Add `url` to compact rows |
| `app_ai/tools/resolve.py` | Add `profile_url` / `url` to compact user and course candidates |
| `app_ai/tools/list_user_courses.py` | Add `profile_url` on user block, `url` on each course row |
| `app_telegram/formatting.py` | Markdown `[text](https://…)` → Telegram `<a>` |
| `app_telegram/tasks.py` | Call `cleanup_ai_response_text` before formatting |
| `app_ai/tests/test_links.py` | URL builder + enrichment tests |
| `app_ai/tests/test_response_format.py` | ID suffix stripping tests |
| `app_telegram/tests/test_formatting.py` | Link HTML conversion tests |
| `app_telegram/tests/test_ai_query.py` | End-to-end task test with linked reply |
| `app_ai/tests/test_tenant_context.py` | Assert prompt includes link rules |

---

## Conventions for every task

- **Run tests:** from `schedjuice-reimagined-be/`:
  `python manage.py test app_ai.tests.test_links -v 2`
- **DB tests:** use `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")` when hitting tenant DB; pure unit tests (links URL math, response_format, formatting) need no DB.
- **Tenant fixture:** `schema_name = "xschedjuice"`, `domain_url = "schedjuice.thiha.net"` (from `app_data/dummydata/organization.csv`).
- **Commits:** repo has `no-git-commits` rule — **do not `git commit`** unless the user asks. Stage + propose message only.
- **No real network:** mock `TelegramClient`, `AIService` in integration tests.

---

## Task 1: Shared link builders (`app_ai/links.py`)

**Files:**
- Create: `app_ai/links.py`
- Test: `app_ai/tests/test_links.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_links.py`:

```python
from django.test import TestCase

from app_ai.links import (
    build_frontend_url,
    course_url,
    user_profile_url,
    with_course_link,
    with_user_link,
)
from app_organization.models import Organization


class BuildFrontendUrlTests(TestCase):
    def test_builds_https_url(self):
        org = Organization(domain_url="school.schedjuice.com")
        self.assertEqual(
            build_frontend_url(org, "/users/12"),
            "https://school.schedjuice.com/users/12",
        )

    def test_strips_trailing_slash_from_domain(self):
        org = Organization(domain_url="school.schedjuice.com/")
        self.assertEqual(
            build_frontend_url(org, "/courses/3"),
            "https://school.schedjuice.com/courses/3",
        )

    def test_empty_when_domain_missing(self):
        org = Organization(domain_url="")
        self.assertEqual(build_frontend_url(org, "/users/1"), "")

    def test_user_and_course_helpers(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        self.assertEqual(
            user_profile_url(org, 3812),
            "https://schedjuice.thiha.net/users/3812",
        )
        self.assertEqual(
            course_url(org, 94),
            "https://schedjuice.thiha.net/courses/94",
        )


class EnrichmentHelpersTests(TestCase):
    def test_with_user_link_adds_profile_url(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_user_link({"id": 5, "name": "Bruce", "email": "b@e.com"}, org=org)
        self.assertEqual(
            row["profile_url"],
            "https://schedjuice.thiha.net/users/5",
        )

    def test_with_user_link_skips_when_no_domain(self):
        org = Organization(domain_url="")
        row = with_user_link({"id": 5, "name": "Bruce"}, org=org)
        self.assertNotIn("profile_url", row)

    def test_with_course_link_uses_course_id_key(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_course_link(
            {"course_id": 94, "title": "test course 3"},
            org=org,
        )
        self.assertEqual(row["url"], "https://schedjuice.thiha.net/courses/94")

    def test_with_course_link_uses_id_key(self):
        org = Organization(domain_url="schedjuice.thiha.net")
        row = with_course_link({"id": 82, "title": "Training Course"}, org=org)
        self.assertEqual(row["url"], "https://schedjuice.thiha.net/courses/82")
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_links -v 2`  
Expected: FAIL — `ModuleNotFoundError: No module named 'app_ai.links'`

- [ ] **Step 3: Implement `app_ai/links.py`**

Create `app_ai/links.py`:

```python
"""Frontend URL builders for AI tool payloads and responses."""
from __future__ import annotations

from typing import Any

from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def get_current_org() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return None
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()


def build_frontend_url(org: Organization, path: str) -> str:
    domain = (org.domain_url or "").strip().rstrip("/")
    if not domain:
        return ""
    if not path.startswith("/"):
        path = f"/{path}"
    return f"https://{domain}{path}"


def user_profile_url(org: Organization, user_id: int) -> str:
    return build_frontend_url(org, f"/users/{user_id}")


def course_url(org: Organization, course_id: int) -> str:
    return build_frontend_url(org, f"/courses/{course_id}")


def with_user_link(row: dict[str, Any], *, org: Organization | None = None) -> dict[str, Any]:
    org = org or get_current_org()
    if org is None:
        return row
    url = user_profile_url(org, int(row["id"]))
    if not url:
        return row
    return {**row, "profile_url": url}


def with_course_link(row: dict[str, Any], *, org: Organization | None = None) -> dict[str, Any]:
    org = org or get_current_org()
    if org is None:
        return row
    course_id = row.get("course_id", row.get("id"))
    if course_id is None:
        return row
    url = course_url(org, int(course_id))
    if not url:
        return row
    return {**row, "url": url}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_links -v 2`  
Expected: PASS (4 tests)

- [ ] **Step 5: Propose commit message (do not commit unless user asks)**

```
feat(ai): add shared frontend link builders for tool payloads
```

---

## Task 2: Response cleanup (`app_ai/response_format.py`)

**Files:**
- Create: `app_ai/response_format.py`
- Test: `app_ai/tests/test_response_format.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_response_format.py`:

```python
from django.test import TestCase

from app_ai.response_format import cleanup_ai_response_text


class CleanupAiResponseTextTests(TestCase):
    def test_strips_user_id_suffix(self):
        text = "Student Bruce (ID: 3812) is enrolled in:"
        self.assertEqual(
            cleanup_ai_response_text(text),
            "Student Bruce is enrolled in:",
        )

    def test_strips_course_id_suffix(self):
        text = "• test course 3 (Course ID: 94)"
        self.assertEqual(
            cleanup_ai_response_text(text),
            "• test course 3",
        )

    def test_case_insensitive_id_suffix(self):
        text = "Bruce (id: 12)"
        self.assertEqual(cleanup_ai_response_text(text), "Bruce")

    def test_leaves_markdown_links_unchanged(self):
        text = "[Bruce](https://schedjuice.thiha.net/users/3812) (bruce@school.com)"
        self.assertEqual(cleanup_ai_response_text(text), text)

    def test_empty_string(self):
        self.assertEqual(cleanup_ai_response_text(""), "")
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_response_format -v 2`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement cleanup**

Create `app_ai/response_format.py`:

```python
"""Channel-agnostic cleanup for AI assistant replies."""
from __future__ import annotations

import re

_USER_ID_SUFFIX_RE = re.compile(r"\s*\(ID:\s*\d+\)", re.IGNORECASE)
_COURSE_ID_SUFFIX_RE = re.compile(r"\s*\(Course ID:\s*\d+\)", re.IGNORECASE)


def cleanup_ai_response_text(text: str) -> str:
    if not text:
        return ""
    text = _USER_ID_SUFFIX_RE.sub("", text)
    text = _COURSE_ID_SUFFIX_RE.sub("", text)
    return text
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_response_format -v 2`  
Expected: PASS (5 tests)

- [ ] **Step 5: Propose commit message**

```
feat(ai): strip numeric ID suffixes from assistant replies
```

---

## Task 3: Enrich AI tool payloads with URLs

**Files:**
- Modify: `app_ai/tools/search_users.py`
- Modify: `app_ai/tools/search_courses.py`
- Modify: `app_ai/tools/resolve.py`
- Modify: `app_ai/tools/list_user_courses.py`
- Test: extend `app_ai/tests/test_count_tools.py` (or add `app_ai/tests/test_tool_links.py`)

- [ ] **Step 1: Write failing integration test for tool payloads**

Add to `app_ai/tests/test_count_tools.py` (or create `app_ai/tests/test_tool_links.py`):

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.search_courses import run_search_courses
from app_ai.tools.search_users import run_search_users
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ToolPayloadLinkFieldsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"bruce-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Bruce",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            program = Program.objects.create(name="P", code="p")
            category = Category.objects.create(name="C", program=program)
            self.course = Course.objects.create(
                title="test course 3",
                code="tc3",
                category=category,
                status=Course.CourseStatus.ACTIVE,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_search_users_includes_profile_url(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "Bruce"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(
            rows[0]["profile_url"],
            f"https://{self.org.domain_url}/users/{self.student.id}",
        )

    def test_search_courses_includes_url(self):
        with schema_context(self.schema_name):
            rows = run_search_courses({"query": "test course 3"}, self.admin)
        self.assertTrue(rows)
        self.assertEqual(
            rows[0]["url"],
            f"https://{self.org.domain_url}/courses/{self.course.id}",
        )

    def test_list_user_courses_includes_user_and_course_urls(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.student.id},
                self.admin,
            )
        self.assertEqual(
            result["user"]["profile_url"],
            f"https://{self.org.domain_url}/users/{self.student.id}",
        )
        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(
            result["courses"][0]["url"],
            f"https://{self.org.domain_url}/courses/{self.course.id}",
        )
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_tool_links -v 2`  
(or the new class in `test_count_tools`)  
Expected: FAIL — `KeyError: 'profile_url'`

- [ ] **Step 3: Update tool compact-row builders**

In `app_ai/tools/search_users.py`:

```python
from app_ai.links import with_user_link

def _compact_row(user: User) -> dict[str, Any]:
    return with_user_link(
        {
            "id": user.id,
            "name": user.name,
            "alternative_name": user.alternative_name,
            "email": user.email,
            "roles": list(user.roles or []),
        }
    )
```

In `app_ai/tools/search_courses.py`:

```python
from app_ai.links import with_course_link

def _compact_row(course) -> dict[str, Any]:
    return with_course_link(
        {
            "id": course.id,
            "title": course.title,
            "code": course.code,
            "subject_name": getattr(getattr(course, "subject", None), "name", None),
            "level_name": getattr(getattr(course, "level", None), "name", None),
            "section_name": getattr(getattr(course, "section", None), "name", None),
        }
    )
```

In `app_ai/tools/resolve.py`:

```python
from app_ai.links import with_course_link, with_user_link

def _compact_user(user: User) -> dict[str, Any]:
    return with_user_link({"id": user.id, "name": user.name, "email": user.email})
```

In the ambiguous branch of `resolve_accessible_course`, replace candidate dict with:

```python
"candidates": [
    with_course_link({"id": c.id, "title": c.title, "code": c.code})
    for c in matches[:limit]
],
```

In `app_ai/tools/list_user_courses.py`:

```python
from app_ai.links import with_course_link, with_user_link

def _compact_enrollment(user_course: UserCourse) -> dict[str, Any]:
    course = user_course.course
    row: dict[str, Any] = {
        "course_id": course.id,
        "title": course.title,
        "code": course.code,
        "status": course.status,
        "assigned_as": user_course.assigned_as,
    }
    if user_course.assigned_as == UserCourse.AssignedAs.TEACHER:
        row["assigned_as_role"] = _role_payload(user_course.assigned_as_role)
    return with_course_link(row)
```

In `run_list_user_courses`, replace the `user` block in `result`:

```python
"user": with_user_link(
    {
        "id": target.id,
        "name": target.name,
        "email": target.email,
        "roles": list(target.roles or []),
    }
),
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_tool_links -v 2`  
Expected: PASS (3 tests)

- [ ] **Step 5: Propose commit message**

```
feat(ai): add profile_url and url fields to user/course tool payloads
```

---

## Task 4: Prompt link-formatting rules

**Files:**
- Modify: `app_ai/prompts.py`
- Test: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Write failing test**

Add to `app_ai/tests/test_tenant_context.py` in `PlatformPromptTests`:

```python
    def test_platform_base_includes_link_formatting_rules(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("[Name](profile_url)", text)
        self.assertIn("[Title](url)", text)
        self.assertIn("Never show numeric user IDs", text)
        self.assertIn("Do not show course IDs", text)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_tenant_context.PlatformPromptTests.test_platform_base_includes_link_formatting_rules -v 2`  
Expected: FAIL — assertion on missing text

- [ ] **Step 3: Update `PLATFORM_BASE_TEMPLATE`**

In `app_ai/prompts.py`, append before the closing triple-quote:

```python
Link formatting:
- When mentioning a user, link only their name: [Name](profile_url). If email is
  present in tool data, append it in parentheses after the link, e.g. (user@school.com).
  Never show numeric user IDs.
- When mentioning a course, link only the title: [Title](url). Do not show course
  IDs, codes, or other metadata unless the user explicitly asks for them.
- Use profile_url and url from tool results exactly. Never invent URLs.
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_tenant_context -v 2`  
Expected: PASS

- [ ] **Step 5: Propose commit message**

```
feat(ai): instruct assistant to link users and courses in replies
```

---

## Task 5: Telegram Markdown link → HTML

**Files:**
- Modify: `app_telegram/formatting.py`
- Test: `app_telegram/tests/test_formatting.py`

- [ ] **Step 1: Write failing tests**

Add to `app_telegram/tests/test_formatting.py`:

```python
    def test_markdown_link(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "[Bruce](https://schedjuice.thiha.net/users/3812)"
            ),
            '<a href="https://schedjuice.thiha.net/users/3812">Bruce</a>',
        )

    def test_bullet_with_link(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "* [test course 3](https://schedjuice.thiha.net/courses/94)"
            ),
            '• <a href="https://schedjuice.thiha.net/courses/94">test course 3</a>',
        )

    def test_link_with_bold_label(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "[**Bruce**](https://schedjuice.thiha.net/users/3812)"
            ),
            '<a href="https://schedjuice.thiha.net/users/3812"><b>Bruce</b></a>',
        )

    def test_http_link_left_plain(self):
        self.assertEqual(
            markdown_to_telegram_html("[x](http://example.com)"),
            "[x](http://example.com)",
        )
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_telegram.tests.test_formatting -v 2`  
Expected: FAIL on link assertions

- [ ] **Step 3: Implement link conversion in `formatting.py`**

Add after `_BULLET_RE`:

```python
_LINK_RE = re.compile(r"\[([^\]]+)\]\((https://[^)\s]+)\)")
```

Add helper before `_format_text_segment`:

```python
def _format_link_label(label: str, replacements: list[str]) -> str:
    """Format markdown inside link anchor text (bold/italic/code only)."""
    return _format_text_segment(label)
```

Update `_format_text_segment` to process links first. At the start of `_format_text_segment`, before code/bold handling:

```python
def _format_text_segment(text: str) -> str:
    replacements: list[str] = []

    def stash_link(match: re.Match[str]) -> str:
        label_html = _format_link_label(match.group(1), replacements)
        href = escape_telegram_html(match.group(2))
        return _stash(replacements, f'<a href="{href}">{label_html}</a>')

    parts: list[str] = []
    last = 0
    for match in _LINK_RE.finditer(text):
        parts.append(text[last : match.start()])
        parts.append(stash_link(match))
        last = match.end()
    if last == 0:
        text_to_format = text
    else:
        parts.append(text[last:])
        text_to_format = "".join(parts)

    def stash_code(match: re.Match[str]) -> str:
        ...
```

**Important:** Refactor carefully to avoid infinite recursion — extract inner formatting (code, bold, italic, escape) into `_format_inline_without_links(text)` and call it from both `_format_text_segment` (outer, with link pass) and `_format_link_label`.

Minimal refactor pattern:

```python
def _format_inline_without_links(text: str) -> str:
    replacements: list[str] = []
    # existing code/bold/italic/escape logic (no link pass)
    ...

def _format_text_segment(text: str) -> str:
    replacements: list[str] = []

    def stash_link(match: re.Match[str]) -> str:
        label = _format_inline_without_links(match.group(1))
        href = escape_telegram_html(match.group(2))
        return _stash(replacements, f'<a href="{href}">{label}</a>')

    text = _LINK_RE.sub(stash_link, text)
    # If link stashes were inserted, unstash and return; else run inline formatter
    if replacements:
        text = escape_telegram_html(text)
        for idx, fragment in enumerate(replacements):
            text = text.replace(f"\x00{idx}\x00", fragment)
        return text
    return _format_inline_without_links(text)
```

Verify `test_link_with_bold_label` passes — label `[**Bruce**]` must become `<b>Bruce</b>` inside the anchor.

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_telegram.tests.test_formatting -v 2`  
Expected: PASS (all formatting tests)

- [ ] **Step 5: Propose commit message**

```
feat(telegram): render markdown links in AI replies as HTML anchors
```

---

## Task 6: Wire cleanup into Telegram task

**Files:**
- Modify: `app_telegram/tasks.py`
- Test: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Write failing integration test**

Add to `TelegramRunAiQueryTaskTests` in `app_telegram/tests/test_ai_query.py`:

```python
    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_success_formats_markdown_links_and_strips_ids(
        self, MockAIService, MockClient
    ):
        MockAIService.return_value.run.return_value = AIResult(
            text=(
                "Student [Bruce](https://schedjuice.thiha.net/users/3812) "
                "(bruce@school.com) (ID: 3812) is enrolled in:\n"
                "* [test course 3](https://schedjuice.thiha.net/courses/94) (Course ID: 94)"
            ),
            model="gemini-3-flash",
            iterations=2,
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="which courses is Bruce taking?",
            )
        sent = MockClient.return_value.send_message.call_args[0][1]
        self.assertIn('<a href="https://schedjuice.thiha.net/users/3812">Bruce</a>', sent)
        self.assertIn("(bruce@school.com)", sent)
        self.assertNotIn("(ID: 3812)", sent)
        self.assertIn('<a href="https://schedjuice.thiha.net/courses/94">test course 3</a>', sent)
        self.assertNotIn("Course ID: 94", sent)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_telegram.tests.test_ai_query.TelegramRunAiQueryTaskTests.test_success_formats_markdown_links_and_strips_ids -v 2`  
Expected: FAIL — IDs still present and/or links not HTML

- [ ] **Step 3: Update `run_ai_query`**

In `app_telegram/tasks.py`:

```python
from app_ai.response_format import cleanup_ai_response_text
```

Replace:

```python
        reply_text = result.text or "I couldn't find an answer."
```

with:

```python
        reply_text = cleanup_ai_response_text(result.text or "I couldn't find an answer.")
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_telegram.tests.test_ai_query -v 2`  
Expected: PASS (all task tests)

- [ ] **Step 5: Run full affected test suite**

Run:

```bash
python manage.py test \
  app_ai.tests.test_links \
  app_ai.tests.test_response_format \
  app_ai.tests.test_tool_links \
  app_ai.tests.test_tenant_context \
  app_telegram.tests.test_formatting \
  app_telegram.tests.test_ai_query \
  -v 2
```

Expected: all PASS

- [ ] **Step 6: Propose commit message**

```
feat(telegram): link users and courses in AI replies with ID cleanup
```

---

## Task 7: Manual verification

- [ ] **Step 1: Confirm tenant domain**

Ensure backend `.env` `DEV_TENANT_DOMAIN` matches the org's `domain_url` (e.g. `schedjuice.thiha.net`).

- [ ] **Step 2: Telegram smoke test**

1. Send: `which courses is student Bruce taking?`
2. Confirm Bruce and each course title are tappable links opening the frontend.
3. Confirm email appears when on record; no `(ID: …)` or `(Course ID: …)`.
4. Follow up: `how about inactive ones?` — inactive course titles should also be links only.

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-06-27-ai-entity-links-design.md`, set `Status: Implemented (YYYY-MM-DD)` after manual verification passes.

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
| --- | --- |
| `app_ai/links.py` URL builders | Task 1 |
| Tool payload `profile_url` / `url` | Task 3 |
| Prompt link rules | Task 4 |
| `cleanup_ai_response_text` | Task 2, Task 6 |
| Telegram Markdown → HTML links | Task 5 |
| Telegram task integration | Task 6 |
| Unit + integration tests | Tasks 1–6 |
| Manual test plan | Task 7 |
| Web API deferred | No task (by design) |
| Missing domain_url omits URLs | Task 1 tests + Task 3 uses `with_*` helpers |

No placeholders. Type names consistent: `profile_url` (users), `url` (courses), `cleanup_ai_response_text`, `with_user_link`, `with_course_link`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-27-ai-entity-links.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints between tasks

Which approach do you want?
