# Telegram Course Query Default Month — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix AI course queries (Telegram + web) so they default to active courses overlapping the current org-local month, and ignore LLM-provided wrong years unless the user explicitly stated a year.

**Architecture:** Extract shared `org_today` to `app_ai/org_datetime.py`. Add `user_stated_year` gate in `query_courses` (server enforcement). Inject today's date into system context and add explicit `query_courses` prompt rules (LLM guidance). Overlap filter unchanged.

**Tech Stack:** Django, tenant schemas, existing AI tool registry (`app_ai.tools`), Gemini function-calling.

**Spec:** `docs/superpowers/specs/2026-07-07-telegram-course-query-default-month-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/org_datetime.py` | Shared `org_today()` + `format_org_today_line()` |
| `app_ai/tools/query_courses.py` | Year gate, schema param, `year_source` in response |
| `app_ai/tools/get_unpaid_students.py` | Import `org_today` from new module |
| `app_ai/tenant_context.py` | Inject org-local today's date into system context |
| `app_ai/prompts.py` | `query_courses` year/month rules block |
| `app_ai/tests/test_query_courses.py` | Year-default and enforcement tests |
| `app_ai/tests/test_tenant_context.py` | Assert today's date line in system context |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Run tests:** `./scripts/run_backend_tests.sh app_ai.tests.test_query_courses app_ai.tests.test_tenant_context -v 2`
- **Manual fallback:** `cd schedjuice-reimagined-be && ./env/bin/python manage.py test app_ai.tests.test_query_courses app_ai.tests.test_tenant_context -v 2 --keepdb --noinput`
- **Commits:** Do not commit unless the user asks (repo rule)

---

## Task 1: Shared org datetime helper

**Files:**
- Create: `app_ai/org_datetime.py`
- Modify: `app_ai/tools/query_courses.py`
- Modify: `app_ai/tools/get_unpaid_students.py`

- [ ] **Step 1: Create `app_ai/org_datetime.py`**

```python
"""Org-local calendar helpers for AI tools and prompts."""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo


def org_today(org) -> date:
    tz = ZoneInfo(getattr(org, "timezone", None) or "UTC")
    return datetime.now(tz).date()


def format_org_today_line(org) -> str:
    today = org_today(org)
    # e.g. "Today's date (school timezone): Tuesday, 07 July 2026"
    return f"Today's date (school timezone): {today.strftime('%A, %d %B %Y')}"
```

- [ ] **Step 2: Update imports in `query_courses.py`**

Remove the local `org_today` definition (lines 23–25) and add:

```python
from app_ai.org_datetime import org_today
```

Keep `from datetime import date, datetime` only if still needed — `datetime` is no longer used after removal; keep `date` for `month_bounds`.

- [ ] **Step 3: Update import in `get_unpaid_students.py`**

Change:

```python
from app_ai.tools.query_courses import org_today
```

to:

```python
from app_ai.org_datetime import org_today
```

- [ ] **Step 4: Run existing tests to verify refactor**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_query_courses app_ai.tests.test_get_unpaid_students -v 2`

Expected: PASS (no behavior change)

---

## Task 2: Year gate — failing tests

**Files:**
- Modify: `app_ai/tests/test_query_courses.py`

- [ ] **Step 1: Add year-default tests**

Append to `QueryCoursesTests` in `app_ai/tests/test_query_courses.py`:

```python
    @patch("app_ai.tools.query_courses.org_today")
    def test_default_month_label_and_year_source(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.admin)
        self.assertNotIn("error", out)
        self.assertEqual(out["month"]["label"], "June 2026")
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["month"], 6)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_month_only_defaults_year_to_current(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses({"month": 6}, self.admin)
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_wrong_year_ignored_without_user_stated_year(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses({"month": 6, "year": 2024}, self.admin)
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_user_stated_year_honored(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"month": 6, "year": 2025, "user_stated_year": True},
                self.admin,
            )
        self.assertEqual(out["month"]["year"], 2025)
        self.assertEqual(out["month"]["year_source"], "user_stated")

    @patch("app_ai.tools.query_courses.org_today")
    def test_overlap_includes_course_spanning_month_boundary(self, mock_today):
        mock_today.return_value = date(2026, 6, 15)
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            spanning = Course.objects.create(
                title=f"Spanning {suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 6, 15),
                end_date=date(2026, 7, 15),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses({"month": 6}, self.admin)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertIn(spanning.title, titles)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_query_courses.QueryCoursesTests.test_default_month_label_and_year_source app_ai.tests.test_query_courses.QueryCoursesTests.test_wrong_year_ignored_without_user_stated_year -v 2`

Expected: FAIL — `year_source` KeyError or wrong year (2024 instead of 2026)

---

## Task 3: Year gate — implementation

**Files:**
- Modify: `app_ai/tools/query_courses.py`

- [ ] **Step 1: Add `user_stated_year` to schema**

In `QUERY_COURSES_SCHEMA`, update `year` description and add `user_stated_year`:

```python
        "year": {
            "type": "integer",
            "description": (
                "Calendar year. Ignored unless user_stated_year is true. "
                "Default: current year in org timezone."
            ),
        },
        ...
        "user_stated_year": {
            "type": "boolean",
            "description": (
                "True only when the user explicitly stated a calendar year "
                "in their message."
            ),
        },
```

- [ ] **Step 2: Update year resolution in `run_query_courses`**

Replace lines 107–109:

```python
    today = org_today(org)
    year = int(args.get("year") or today.year)
    month = int(args.get("month") or today.month)
```

with:

```python
    today = org_today(org)
    month = int(args.get("month") or today.month)
    user_stated_year = bool(args.get("user_stated_year"))
    if user_stated_year:
        year = int(args.get("year") or today.year)
        year_source = "user_stated"
    else:
        year = today.year
        year_source = "default"
```

- [ ] **Step 3: Add `year_source` to response**

Update the `month` dict in the result (around line 180):

```python
        "month": {
            "year": year,
            "month": month,
            "label": month_label,
            "year_source": year_source,
        },
```

- [ ] **Step 4: Update tool description**

In `QUERY_COURSES_TOOL.description`, add after "current month":

```
Year defaults to current calendar year unless user_stated_year is true.
```

- [ ] **Step 5: Run all query_courses tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_query_courses -v 2`

Expected: PASS

---

## Task 4: Inject today's date into system context

**Files:**
- Modify: `app_ai/tenant_context.py`
- Modify: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Write failing test**

Add to `TenantContextTests` in `app_ai/tests/test_tenant_context.py`:

```python
from unittest.mock import patch

from app_ai.org_datetime import format_org_today_line
```

```python
    @patch("app_ai.tenant_context.format_org_today_line")
    def test_build_system_context_includes_org_local_today(self, mock_format):
        mock_format.return_value = (
            "Today's date (school timezone): Tuesday, 07 July 2026"
        )
        org = Organization(name="Demo School")
        text = build_system_context(org)
        self.assertIn(
            "Today's date (school timezone): Tuesday, 07 July 2026",
            text,
        )
        mock_format.assert_called_once_with(org)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_tenant_context.TenantContextTests.test_build_system_context_includes_org_local_today -v 2`

Expected: FAIL — date line not in context

- [ ] **Step 3: Implement in `tenant_context.py`**

Add import:

```python
from app_ai.org_datetime import format_org_today_line
```

Update `build_system_context` return value to append the date line before `School context:`:

```python
    return (
        f"{build_platform_base_prompt(org)}\n\n"
        f"{format_org_today_line(org)}\n\n"
        f"School context:\n{school}\n\n"
        f"FM/HM course filters: {fm_hm}\n\n"
        f"Instructions:\n{instructions}"
    )
```

- [ ] **Step 4: Run tenant context tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_tenant_context -v 2`

Expected: PASS

---

## Task 5: Prompt rules for `query_courses`

**Files:**
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Write failing test for prompt content**

Add to `PlatformPromptTests`:

```python
    def test_platform_base_includes_query_courses_year_rules(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("query_courses", text)
        self.assertIn("user_stated_year", text)
        self.assertIn("Never guess or assume historical years", text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_tenant_context.PlatformPromptTests.test_platform_base_includes_query_courses_year_rules -v 2`

Expected: FAIL

- [ ] **Step 3: Add prompt block to `prompts.py`**

Insert after the existing `query_courses` bullet block (after line 36, before `Use search tools`):

```
Query courses (org-wide filtered listing):
- Default month and year are the current calendar month in the school's timezone.
  Omit month and year unless the user specifies a different period.
- When the user names a month without a year, pass only month — do not pass year.
- Set user_stated_year=true only when the user explicitly states a calendar year
  (e.g. "2026", "in 2025", "last year's June").
- Never guess or assume historical years (e.g. do not default to 2024).
- When reporting results, use the month.label from the tool response.
```

- [ ] **Step 4: Run prompt test**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_tenant_context.PlatformPromptTests.test_platform_base_includes_query_courses_year_rules -v 2`

Expected: PASS

---

## Task 6: Final verification

- [ ] **Step 1: Run full affected test modules**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_query_courses app_ai.tests.test_tenant_context app_ai.tests.test_get_unpaid_students app_ai.tests.test_tool_links -v 2`

Expected: PASS

- [ ] **Step 2: Smoke-check tool schema**

In Django shell (optional):

```python
from app_ai.tools.query_courses import QUERY_COURSES_SCHEMA
assert "user_stated_year" in QUERY_COURSES_SCHEMA["properties"]
```

- [ ] **Step 3: Commit (only if user asks)**

```bash
git add app_ai/org_datetime.py app_ai/tools/query_courses.py app_ai/tools/get_unpaid_students.py app_ai/tenant_context.py app_ai/prompts.py app_ai/tests/test_query_courses.py app_ai/tests/test_tenant_context.py docs/superpowers/specs/2026-07-07-telegram-course-query-default-month-design.md docs/superpowers/plans/2026-07-07-telegram-course-query-default-month.md
git commit -m "$(cat <<'EOF'
Fix AI course queries defaulting to wrong year.

Add user_stated_year gate so query_courses ignores LLM-provided years unless
the user explicitly stated one. Inject org-local today's date into AI context
and document year/month rules in the platform prompt.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Overlap filter unchanged | No code change (Task 3 keeps existing filter) |
| `user_stated_year` param | Task 3 |
| Year resolution logic | Task 3 |
| `year_source` in response | Task 3 |
| Inject org-local date | Task 4 |
| `query_courses` prompt rules | Task 5 |
| Tool schema descriptions | Task 3 |
| Default month label test | Task 2 |
| Month-only year default test | Task 2 |
| Wrong year ignored test | Task 2 |
| User-stated year test | Task 2 |
| Overlap boundary test | Task 2 |
| Context date test | Task 4 |
