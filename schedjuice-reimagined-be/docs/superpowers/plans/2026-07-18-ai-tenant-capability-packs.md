# AI Tenant Capability Packs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-tenant Gemini tool packs with short pack prompt snippets, subject schema binders, staff-only pack assignment, and a read-only tool catalog in org AI settings.

**Architecture:** Code-owned `PACK_REGISTRY` selects tools + optional prompt snippets; `Organization.ai_enabled_packs` stores staff-assigned pack ids; `resolve_tools_for_org` unions `core` with enabled packs, applies binders, then existing intent/feature filters; Telegram and web share `AIService`.

**Tech Stack:** Django, django-tenant-schemas, existing `app_ai` tool registry / Gemini client, org AI settings API, Next.js org AI settings pane.

**Spec:** `docs/superpowers/specs/2026-07-18-ai-tenant-capability-packs-design.md`

**Repos:** `schedjuice-reimagined-be` (Tasks 1–7) then `schedjuice-reimagined-fe` (Task 8)

## Global Constraints

- Pack definitions, tool schemas, and pack prompt snippets live in **code only** (no DB-defined tools).
- `core` is always on; empty `ai_enabled_packs` ⇒ core only.
- Pack writes require **platform admin tenant superadmin** (`RequiresPlatformAdminTenant`).
- School admins with `org.configure` see **read-only** tools/packs; may still edit school knobs.
- Existing AI orgs migrate to **legacy full packs** (today’s tool surface); `subject_analytics` is **not** in legacy.
- Subjects from tenant `Subject` table; count via `Course.subject` **OR** `CourseSubject`.
- Subject enum cap: **100** names; over-cap validate in `run`.
- Backend tests: always `./scripts/run_backend_tests.sh …` (includes `--keepdb --noinput`).
- **Commits:** only when the user explicitly asks (repo rule). Skip commit steps unless asked.

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/packs.py` | `Pack`, `PACK_REGISTRY`, legacy ids, `resolve_enabled_pack_ids`, `resolve_tools_for_org`, `pack_prompt_snippets`, catalog helpers |
| `app_ai/tools/registry.py` | Route `list_tools_for_*` through pack resolution |
| `app_ai/tools/count_courses_by_subject.py` | New read tool |
| `app_ai/tools/subject_binder.py` | Copy tool + inject subject enum / description |
| `app_ai/tenant_context.py` | Append enabled pack snippets to system context |
| `app_ai/client.py` | Block execution of tools not in the selected turn tool set |
| `app_organization/models.py` | `ai_enabled_packs` JSONField |
| `app_organization/migrations/0xxx_organization_ai_enabled_packs.py` | Field + data migration |
| `app_organization/serializers.py` | Packs + `available_tools` + `can_edit_ai_packs`; validate; cache invalidate |
| `app_organization/views.py` | 403 when non-platform staff PATCHes packs |
| `app_ai/tests/test_packs.py` | Pack resolution / prompt unit tests |
| `app_ai/tests/test_count_courses_by_subject.py` | Tool + binder integration tests |
| `app_ai/tests/test_tool_registry.py` | Update for pack-aware listing |
| `app_organization/tests/test_ai_settings_api.py` | Packs API tests |
| FE `src/types/organization-ai-settings.ts` | Zod fields |
| FE `src/components/org/record/sections/org-ai-settings-pane.tsx` | Packs UI + read-only tools |

---

## Conventions

- Unit tests that need an org stub: `SimpleNamespace(ai_enabled_packs=[...], is_staff_points_enabled=..., schema_name="x", name="X", ai_school_context="", ai_assistant_instructions="", is_fm_hm_course_display_enabled=False)` as required by callees.
- Integration tests: `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`, `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`.
- Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target> -v 2`

---

### Task 1: Pack registry + tool resolution

**Files:**
- Create: `app_ai/packs.py`
- Modify: `app_ai/tools/registry.py`
- Create: `app_ai/tests/test_packs.py`
- Modify: `app_ai/tests/test_tool_registry.py`

**Interfaces:**
- Produces:
  - `Pack(id, title, description, tool_names: tuple[str, ...], prompt_snippet: str = "")`
  - `CORE_PACK_ID = "core"`
  - `LEGACY_FULL_PACK_IDS: tuple[str, ...]` — all packs except `subject_analytics`
  - `PACK_REGISTRY: dict[str, Pack]`
  - `resolve_enabled_pack_ids(org: Organization | None) -> list[str]`
  - `resolve_tools_for_org(org: Organization | None) -> list[Tool]`
  - `iter_pack_prompt_snippets(org) -> list[tuple[str, str]]`  # (pack_id, snippet)
  - `list_available_packs() -> list[dict]`
  - `list_available_tools_for_org(org) -> list[dict]`  # name, description, pack_id, exposure

- [ ] **Step 1: Write failing unit tests**

Create `app_ai/tests/test_packs.py`:

```python
from types import SimpleNamespace
from django.test import SimpleTestCase

from app_ai.packs import (
    LEGACY_FULL_PACK_IDS,
    resolve_enabled_pack_ids,
    resolve_tools_for_org,
)


class ResolveEnabledPackIdsTests(SimpleTestCase):
    def test_none_org_uses_legacy(self):
        self.assertEqual(resolve_enabled_pack_ids(None), list(LEGACY_FULL_PACK_IDS))

    def test_empty_list_is_core_only(self):
        org = SimpleNamespace(ai_enabled_packs=[])
        self.assertEqual(resolve_enabled_pack_ids(org), [])

    def test_explicit_packs(self):
        org = SimpleNamespace(ai_enabled_packs=["course_counts", "finance"])
        self.assertEqual(
            resolve_enabled_pack_ids(org), ["course_counts", "finance"]
        )


class ResolveToolsForOrgTests(SimpleTestCase):
    def test_empty_packs_only_core_tools(self):
        org = SimpleNamespace(
            ai_enabled_packs=[],
            is_staff_points_enabled=True,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertEqual(
            names,
            {"search_users", "search_courses", "set_ai_preferences"},
        )
        self.assertNotIn("get_unpaid_students", names)
        self.assertNotIn("count_organization", names)

    def test_finance_pack_adds_unpaid(self):
        org = SimpleNamespace(
            ai_enabled_packs=["finance"],
            is_staff_points_enabled=False,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertIn("get_unpaid_students", names)
        self.assertIn("search_users", names)

    def test_staff_points_pack_still_needs_feature(self):
        org = SimpleNamespace(
            ai_enabled_packs=["staff_points"],
            is_staff_points_enabled=False,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertNotIn("list_point_types", names)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_packs -v 2
```

Expected: import/attribute errors for `app_ai.packs`.

- [ ] **Step 3: Implement `app_ai/packs.py`**

```python
"""Tenant AI capability packs — tool membership + prompt snippets."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app_ai.tools.base import Tool

if TYPE_CHECKING:
    from app_organization.models import Organization

CORE_PACK_ID = "core"
SUBJECT_ANALYTICS_PACK_ID = "subject_analytics"

# Today's tool surface minus subject_analytics (new / opt-in).
LEGACY_FULL_PACK_IDS: tuple[str, ...] = (
    "course_counts",
    "course_queries",
    "roster_read",
    "roster_write",
    "finance",
    "staff_points",
)


@dataclass(frozen=True)
class Pack:
    id: str
    title: str
    description: str
    tool_names: tuple[str, ...]
    prompt_snippet: str = ""


PACK_REGISTRY: dict[str, Pack] = {
    CORE_PACK_ID: Pack(
        id=CORE_PACK_ID,
        title="Core",
        description="Search users/courses and AI preferences.",
        tool_names=("search_users", "search_courses", "set_ai_preferences"),
        prompt_snippet="",
    ),
    "course_counts": Pack(
        id="course_counts",
        title="Course counts",
        description="Organization, teacher, and roster headcounts.",
        tool_names=(
            "count_organization",
            "count_teacher_courses",
            "count_course_roster",
        ),
        prompt_snippet=(
            "Course counts pack: use count_* tools for headcounts. "
            "Do not invent totals."
        ),
    ),
    "course_queries": Pack(
        id="course_queries",
        title="Course queries",
        description="Month-based course lists and per-user courses.",
        tool_names=(
            "query_courses",
            "query_courses_starting",
            "list_user_courses",
        ),
        prompt_snippet=(
            "Course queries pack: query_courses = active/overlap in a month; "
            "query_courses_starting = start_date in that month."
        ),
    ),
    "roster_read": Pack(
        id="roster_read",
        title="Roster read",
        description="List people on a course roster.",
        tool_names=("get_course_roster",),
        prompt_snippet="Roster read pack: use get_course_roster for names on a course.",
    ),
    "roster_write": Pack(
        id="roster_write",
        title="Roster write",
        description="Enroll/remove students; assign/remove staff.",
        tool_names=(
            "enroll_student_in_course",
            "remove_student_from_course",
            "assign_staff_to_course",
            "remove_staff_from_course",
        ),
        prompt_snippet=(
            "Roster write pack: mutating roster tools require write intent "
            "and confirmation where configured."
        ),
    ),
    "finance": Pack(
        id="finance",
        title="Finance",
        description="Unpaid student lookups.",
        tool_names=("get_unpaid_students",),
        prompt_snippet="Finance pack: use get_unpaid_students for unpaid counts/names.",
    ),
    "staff_points": Pack(
        id="staff_points",
        title="Staff points",
        description="Point types, balances, and adjustments.",
        tool_names=(
            "list_point_types",
            "get_staff_point_balances",
            "adjust_staff_points",
        ),
        prompt_snippet="Staff points pack: only when the school has staff points enabled.",
    ),
    SUBJECT_ANALYTICS_PACK_ID: Pack(
        id=SUBJECT_ANALYTICS_PACK_ID,
        title="Subject analytics",
        description="Count courses by subject.",
        tool_names=("count_courses_by_subject",),
        prompt_snippet=(
            "Subject analytics pack: use count_courses_by_subject with an exact "
            "subject name from the school catalog."
        ),
    ),
}


def resolve_enabled_pack_ids(org: Organization | None) -> list[str]:
    """Return staff-enabled pack ids (never includes core).

    None org or missing/None field → legacy full set (safe default for tests /
    pre-migration). Explicit [] → core only.
    """
    if org is None:
        return list(LEGACY_FULL_PACK_IDS)
    raw = getattr(org, "ai_enabled_packs", None)
    if raw is None:
        return list(LEGACY_FULL_PACK_IDS)
    return [str(x) for x in raw]


def _tool_pack_id(tool_name: str) -> str | None:
    for pack in PACK_REGISTRY.values():
        if tool_name in pack.tool_names:
            return pack.id
    return None


def resolve_tools_for_org(org: Organization | None) -> list[Tool]:
    """Core ∪ enabled packs. Does not apply turn intent. Feature flags applied later
    in registry helpers — except binders run here when packs module imports binder.
    """
    from app_ai.tools.registry import TOOL_REGISTRY

    enabled = set(resolve_enabled_pack_ids(org))
    allowed_names: set[str] = set(PACK_REGISTRY[CORE_PACK_ID].tool_names)
    for pack_id in enabled:
        pack = PACK_REGISTRY.get(pack_id)
        if pack is None or pack.id == CORE_PACK_ID:
            continue
        allowed_names.update(pack.tool_names)

    tools: list[Tool] = []
    for name in allowed_names:
        tool = TOOL_REGISTRY.get(name)
        if tool is not None:
            tools.append(tool)

    # Binders (Task 4): imported lazily to avoid cycles once subject binder exists.
    try:
        from app_ai.tools.subject_binder import bind_subject_analytics_tools

        tools = bind_subject_analytics_tools(org, tools)
    except ImportError:
        pass
    return tools


def iter_pack_prompt_snippets(org: Organization | None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for pack_id in resolve_enabled_pack_ids(org):
        pack = PACK_REGISTRY.get(pack_id)
        if not pack:
            continue
        snippet = (pack.prompt_snippet or "").strip()
        if snippet:
            out.append((pack.id, snippet))
    return out


def list_available_packs() -> list[dict[str, Any]]:
    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "tool_names": list(p.tool_names),
        }
        for p in PACK_REGISTRY.values()
        if p.id != CORE_PACK_ID
    ]


def list_available_tools_for_org(org: Organization | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for tool in resolve_tools_for_org(org):
        rows.append(
            {
                "name": tool.name,
                "description": tool.description,
                "pack_id": _tool_pack_id(tool.name) or CORE_PACK_ID,
                "exposure": tool.exposure,
            }
        )
    rows.sort(key=lambda r: (r["pack_id"], r["name"]))
    return rows
```

Note: Until Task 4 adds `count_courses_by_subject` to `TOOL_REGISTRY`, `subject_analytics` resolves to zero extra tools — that is OK; Task 4 registers the tool. For Task 1 tests that do not enable `subject_analytics`, skip binder ImportError path by creating an empty `app_ai/tools/subject_binder.py` stub:

```python
def bind_subject_analytics_tools(org, tools):
    return tools
```

Or omit the try/import until Task 4 and keep resolve without binder in Task 1 (prefer **stub binder** so Task 4 only fills it in).

- [ ] **Step 4: Wire `registry.py`**

Replace the bodies of `list_tools_for_cache` and `list_tools_for_turn` to iterate `resolve_tools_for_org(org)` instead of `TOOL_REGISTRY.values()`, keeping the same feature + intent logic:

```python
from app_ai.packs import resolve_tools_for_org

def list_tools_for_cache(org: Organization | None) -> list[Tool]:
    return [
        tool
        for tool in resolve_tools_for_org(org)
        if _org_allows_feature(org, tool.requires_feature)
    ]


def list_tools_for_turn(*, intent: TurnIntent, org: Organization | None) -> list[Tool]:
    selected: list[Tool] = []
    for tool in resolve_tools_for_org(org):
        if not _org_allows_feature(org, tool.requires_feature):
            continue
        if tool.always_available:
            selected.append(tool)
            continue
        if tool.exposure == "read":
            selected.append(tool)
        elif tool.exposure == "write" and intent == TurnIntent.WRITE:
            selected.append(tool)
    return selected
```

- [ ] **Step 5: Update `test_tool_registry.py` org stubs**

`ListToolsForCacheTests._org` must include legacy packs so existing expectations still hold:

```python
from app_ai.packs import LEGACY_FULL_PACK_IDS

def _org(self, *, points_enabled: bool):
    return SimpleNamespace(
        is_staff_points_enabled=points_enabled,
        ai_enabled_packs=list(LEGACY_FULL_PACK_IDS),
    )
```

Add:

```python
def test_empty_packs_hides_non_core_on_cache_list(self):
    org = SimpleNamespace(is_staff_points_enabled=True, ai_enabled_packs=[])
    names = {t.name for t in list_tools_for_cache(org)}
    self.assertEqual(names, {"search_users", "search_courses", "set_ai_preferences"})
```

Update `test_set_ai_preferences_available_on_read_turn` to pass an org with legacy packs (or `None`, which resolves to legacy).

- [ ] **Step 6: Run tests — expect PASS**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_packs app_ai.tests.test_tool_registry app_ai.tests.test_tool_intent -v 2
```

Expected: PASS. Fix any intent tests that assumed full registry with `org=None` (legacy) — they should still pass.

---

### Task 2: Pack prompt snippets in system context

**Files:**
- Modify: `app_ai/tenant_context.py`
- Modify: `app_ai/tests/test_packs.py` (add prompt tests)

**Interfaces:**
- Consumes: `iter_pack_prompt_snippets(org)`
- Produces: `build_system_context` includes a `Enabled capability packs:` section only when snippets exist

- [ ] **Step 1: Failing test**

```python
from app_ai.tenant_context import build_system_context

class PackPromptTests(SimpleTestCase):
    def test_finance_snippet_present_when_enabled(self):
        org = SimpleNamespace(
            name="Test School",
            ai_school_context="",
            ai_assistant_instructions="",
            is_fm_hm_course_display_enabled=False,
            ai_enabled_packs=["finance"],
        )
        text = build_system_context(org)
        self.assertIn("get_unpaid_students", text)

    def test_finance_snippet_absent_when_core_only(self):
        org = SimpleNamespace(
            name="Test School",
            ai_school_context="",
            ai_assistant_instructions="",
            is_fm_hm_course_display_enabled=False,
            ai_enabled_packs=[],
        )
        text = build_system_context(org)
        self.assertNotIn("get_unpaid_students", text)
```

- [ ] **Step 2: Run — expect FAIL** (snippet not in prompt)

- [ ] **Step 3: Update `build_system_context`**

After platform base / before or after school context (prefer **after** school context, **before** instructions):

```python
from app_ai.packs import iter_pack_prompt_snippets

def build_system_context(org: Organization) -> str:
    school = (org.ai_school_context or "").strip() or (
        "No additional school context provided."
    )
    instructions = (org.ai_assistant_instructions or "").strip() or _DEFAULT_INSTRUCTIONS_LINE
    fm_hm = (
        "enabled"
        if getattr(org, "is_fm_hm_course_display_enabled", False)
        else "disabled"
    )
    pack_bits = iter_pack_prompt_snippets(org)
    packs_block = ""
    if pack_bits:
        lines = "\n".join(f"- {snippet}" for _, snippet in pack_bits)
        packs_block = f"\n\nEnabled capability packs:\n{lines}"
    return (
        f"{build_platform_base_prompt(org)}\n\n"
        f"School context:\n{school}\n\n"
        f"FM/HM course filters: {fm_hm}"
        f"{packs_block}\n\n"
        f"Instructions:\n{instructions}"
    )
```

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_packs -v 2
```

---

### Task 3: `ai_enabled_packs` field + migration

**Files:**
- Modify: `app_organization/models.py` (after `ai_default_user_monthly_usd_limit`)
- Create: `app_organization/migrations/0xxx_organization_ai_enabled_packs.py` (use next number from `ls app_organization/migrations | tail`)

**Interfaces:**
- Produces: `Organization.ai_enabled_packs` — `JSONField(default=list, blank=True)`
- Data migration: for every existing `Organization`, set `ai_enabled_packs` to `list(LEGACY_FULL_PACK_IDS)` when current value is `[]` or null

- [ ] **Step 1: Add model field**

```python
ai_enabled_packs = models.JSONField(
    default=list,
    blank=True,
    help_text="AI capability pack ids enabled for this org (core always on).",
)
```

- [ ] **Step 2: Make migration**

```bash
./env/bin/python manage.py makemigrations app_organization --name organization_ai_enabled_packs
```

- [ ] **Step 3: Add RunPython in the same migration** (or follow-up migration)

```python
def forwards_set_legacy_packs(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    legacy = [
        "course_counts",
        "course_queries",
        "roster_read",
        "roster_write",
        "finance",
        "staff_points",
    ]
    for org in Organization.objects.all().iterator():
        val = org.ai_enabled_packs
        if val is None or val == []:
            org.ai_enabled_packs = legacy
            org.save(update_fields=["ai_enabled_packs"])


def backwards_noop(apps, schema_editor):
    pass
```

Wire `migrations.RunPython(forwards_set_legacy_packs, backwards_noop)` after `AddField`.

**Important:** New orgs created after migration should keep `default=list` → `[]` (core only). The data migration only backfills **existing** rows. Confirm `Organization.objects.create` / tenant provisioning does not copy legacy unintentionally.

- [ ] **Step 4: Smoke-check migration**

```bash
./env/bin/python manage.py migrate_schemas app_organization --shared
```

Expected: applies cleanly.

---

### Task 4: `count_courses_by_subject` + subject binder

**Files:**
- Create: `app_ai/tools/count_courses_by_subject.py`
- Replace stub: `app_ai/tools/subject_binder.py`
- Modify: `app_ai/tools/registry.py` (register tool)
- Create: `app_ai/tests/test_count_courses_by_subject.py`

**Interfaces:**
- Produces: `COUNT_COURSES_BY_SUBJECT_TOOL` name `"count_courses_by_subject"`
- Produces: `bind_subject_analytics_tools(org, tools: list[Tool]) -> list[Tool]`
- Produces: `SUBJECT_ENUM_CAP = 100`
- Consumes: `Subject`, `Course`, `CourseSubject`, `require_course_read_breadth`

- [ ] **Step 1: Failing integration tests**

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.count_courses_by_subject import run_count_courses_by_subject
from app_ai.tools.subject_binder import bind_subject_analytics_tools, SUBJECT_ENUM_CAP
from app_ai.tools.base import Tool
from app_auth.models import User
from app_course.models import Course, CourseSubject, Subject
from app_rbac.seeding import seed_rbac
from types import SimpleNamespace


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CountCoursesBySubjectTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_counts_via_fk_and_m2m(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            subj = Subject.objects.create(name=f"IELTS-{uuid4().hex[:4]}")
            today = date.today()
            cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            # Same shape as app_ai/tests/test_count_tools.py
            Course.objects.create(
                title=f"FK-{uuid4().hex[:6]}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today.replace(year=today.year + 1)
                if today.month != 2 or today.day != 29
                else today.replace(year=today.year + 1, day=28),
                status=Course.CourseStatus.ACTIVE,
                created_by=admin,
                subject=subj,
            )
            c_m2m = Course.objects.create(
                title=f"M2M-{uuid4().hex[:6]}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today.replace(year=today.year + 1)
                if today.month != 2 or today.day != 29
                else today.replace(year=today.year + 1, day=28),
                status=Course.CourseStatus.ACTIVE,
                created_by=admin,
            )
            CourseSubject.objects.create(course=c_m2m, subject=subj, sort_order=0)
            result = run_count_courses_by_subject({"subject": subj.name}, admin)
            self.assertNotIn("error", result)
            self.assertEqual(result["count"], 2)
            self.assertEqual(result["subject"], subj.name)

    def test_unknown_subject_errors(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            result = run_count_courses_by_subject({"subject": "NoSuchSubjectXYZ"}, admin)
            self.assertEqual(result["error"], "unknown_subject")
```

Imports for the integration test also need:
`from datetime import timedelta` (optional), `from app_course.models import Category, Course, CourseSubject, Program, Subject`.

**Binder unit tests** (same file or `test_packs.py`):

```python
from unittest.mock import patch
from django.test import SimpleTestCase
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.subject_binder import bind_subject_analytics_tools, SUBJECT_ENUM_CAP


class SubjectBinderTests(SimpleTestCase):
    def _tool(self):
        return Tool(
            name="count_courses_by_subject",
            description="x",
            parameters=strict_object_schema(
                properties={"subject": {"type": "string"}},
                required=["subject"],
            ),
            run=lambda args, user: {},
        )

    @patch("app_ai.tools.subject_binder.Subject")
    def test_sets_enum_under_cap(self, mock_subject_model):
        mock_subject_model.objects.order_by.return_value.values_list.return_value = [
            "IELTS",
            "TOEFL",
        ]
        bound = bind_subject_analytics_tools(None, [self._tool()])
        self.assertEqual(
            bound[0].parameters["properties"]["subject"]["enum"],
            ["IELTS", "TOEFL"],
        )

    @patch("app_ai.tools.subject_binder.Subject")
    def test_omits_enum_over_cap(self, mock_subject_model):
        names = [f"S{i}" for i in range(SUBJECT_ENUM_CAP + 1)]
        mock_subject_model.objects.order_by.return_value.values_list.return_value = names
        bound = bind_subject_analytics_tools(None, [self._tool()])
        self.assertNotIn("enum", bound[0].parameters["properties"]["subject"])
```

Binder must load names with a sliceable list:

```python
names = list(
    Subject.objects.order_by("name").values_list("name", flat=True)[: SUBJECT_ENUM_CAP + 1]
)
```

When mocking, make `values_list.return_value` a real `list` so `list(...)[:cap+1]` works (if the implementation uses queryset slicing before `list()`, adjust the mock to return a list from `__getitem__` / use `MagicMock` that returns `names` when sliced — simplest implementation: `list(Subject.objects.order_by("name").values_list("name", flat=True))[: SUBJECT_ENUM_CAP + 1]` so the mock only needs `values_list.return_value = names`).

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_count_courses_by_subject -v 2
```

- [ ] **Step 3: Implement tool**

`app_ai/tools/count_courses_by_subject.py` — mirror style of `count_organization.py`:

```python
COUNT_COURSES_BY_SUBJECT_SCHEMA = strict_object_schema(
    properties={
        "subject": {
            "type": "string",
            "description": "Exact subject name from the school Subject catalog.",
        },
        "course_status": {
            "type": "string",
            "enum": ["active", "planned", "ended", "paused", "all"],
            "description": "Default active.",
        },
    },
    required=["subject"],
)

def run_count_courses_by_subject(args, user):
    denied = require_course_read_breadth(user)
    if denied:
        return denied
    name = (args.get("subject") or "").strip()
    subject = Subject.objects.filter(name__iexact=name).first()
    if subject is None:
        sample = list(Subject.objects.order_by("name").values_list("name", flat=True)[:20])
        return {
            "error": "unknown_subject",
            "message": f"No subject named {name!r}.",
            "sample_subjects": sample,
        }
    status = args.get("course_status") or "active"
    from django.db.models import Q
    from app_ai.links import get_current_org
    from app_ai.org_datetime import org_today
    from app_course.course_status import apply_effective_status_filter

    qs = Course.objects.filter(
        Q(subject_id=subject.id) | Q(course_subjects__subject_id=subject.id)
    ).distinct()
    if status != "all":
        org = get_current_org()
        reference = org_today(org) if org is not None else None
        qs = apply_effective_status_filter(qs, [status], reference=reference)
    return {"subject": subject.name, "count": qs.count(), "course_status": status}

COUNT_COURSES_BY_SUBJECT_TOOL = Tool(
    name="count_courses_by_subject",
    description="Count courses linked to a subject (by catalog Subject name).",
    parameters=COUNT_COURSES_BY_SUBJECT_SCHEMA,
    run=run_count_courses_by_subject,
    exposure="read",
)
```

- [ ] **Step 4: Implement binder**

```python
from copy import deepcopy
from dataclasses import replace

SUBJECT_ENUM_CAP = 100

def bind_subject_analytics_tools(org, tools: list[Tool]) -> list[Tool]:
    out = []
    for tool in tools:
        if tool.name != "count_courses_by_subject":
            out.append(tool)
            continue
        names = list(
            Subject.objects.order_by("name").values_list("name", flat=True)[: SUBJECT_ENUM_CAP + 1]
        )
        params = deepcopy(tool.parameters)
        prop = params["properties"]["subject"]
        if len(names) <= SUBJECT_ENUM_CAP and names:
            prop["enum"] = names
            prop["description"] = "Exact subject name from the school catalog."
        else:
            prop.pop("enum", None)
            prop["description"] = (
                "Exact subject name from the school catalog "
                f"(large catalog; {SUBJECT_ENUM_CAP}+ subjects)."
            )
        out.append(replace(tool, parameters=params))
    return out
```

Only bind when tool is present (pack enabled). If `org` is None or outside tenant schema, catch DB errors and return unbound tool.

- [ ] **Step 5: Register in `TOOL_REGISTRY`**

Import `COUNT_COURSES_BY_SUBJECT_TOOL` and add to dict.

- [ ] **Step 6: Extend pack tests**

```python
def test_subject_pack_includes_tool_when_registered(self):
    org = SimpleNamespace(ai_enabled_packs=["subject_analytics"], is_staff_points_enabled=False)
    names = {t.name for t in resolve_tools_for_org(org)}
    self.assertIn("count_courses_by_subject", names)
```

- [ ] **Step 7: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_count_courses_by_subject app_ai.tests.test_packs app_ai.tests.test_tool_registry -v 2
```

---

### Task 5: Block pack-disabled tool execution in Gemini client

**Files:**
- Modify: `app_ai/client.py` (function-call loop)
- Modify or create: `app_ai/tests/test_client_pack_guard.py`

**Interfaces:**
- Consumes: `selected_tools` already built in `generate_with_tools`
- Behavior: if `fc.name` not in `{t.name for t in selected_tools}` → do not call `tool.run`; return error `"Tool not available for this organization."`

- [ ] **Step 1: Failing test**

Create `app_ai/tests/test_client_pack_guard.py` (copy helpers from `test_client_write_guard.py`):

```python
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import GeminiClient
from app_ai.tools.intent import TurnIntent
from app_ai.tools.search_users import SEARCH_USERS_TOOL


def _tool_call_response(name: str):
    fc = MagicMock(args={})
    fc.name = name
    part = MagicMock(text=None, function_call=fc)
    candidate = MagicMock(content=MagicMock(parts=[part]), finish_reason="STOP")
    return MagicMock(candidates=[candidate], usage_metadata=None)


def _text_response(text: str):
    part = MagicMock(text=text, function_call=None)
    candidate = MagicMock(content=MagicMock(parts=[part]), finish_reason="STOP")
    return MagicMock(candidates=[candidate], usage_metadata=None)


@override_settings(GEMINI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=3)
@patch("google.genai.types.Content", MagicMock)
class PackGuardTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_or_create_system_cache", return_value=None)
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.GeminiClient._build_client")
    def test_blocks_tool_not_in_selected_set(
        self, mock_build, mock_get_tool, _cache, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.exposure = "read"
        mock_tool.always_available = False
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.models.generate_content.side_effect = [
            _tool_call_response("get_unpaid_students"),
            _text_response("I cannot do that."),
        ]

        client = GeminiClient()
        result = client.generate_with_tools(
            "how many unpaid students",
            user=MagicMock(id=1),
            tools=[SEARCH_USERS_TOOL],
            cache_tools=[],
            turn_intent=TurnIntent.READ,
        )

        mock_tool.run.assert_not_called()
        self.assertEqual(len(result.tool_calls), 1)
        self.assertFalse(result.tool_calls[0]["ok"])
        self.assertIn("not available", result.tool_calls[0]["error"].lower())
```

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_client_pack_guard -v 2
```

- [ ] **Step 3: Implement guard** in `client.py`

Right after `selected_tools = tools if tools is not None else list(TOOL_REGISTRY.values())` (or equivalent), add:

```python
allowed_tool_names = {t.name for t in selected_tools}
```

Inside the function_call loop, before `tool = get_tool(name)`:

```python
if name not in allowed_tool_names:
    entry["error"] = "Tool not available for this organization."
    tool_call_log.append(entry)
    payload = clamp_tool_payload({"error": entry["error"]})
    response_parts.append(
        types.Part.from_function_response(
            name=name,
            response={"result": payload},
        )
    )
    continue
```

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_client_pack_guard app_ai.tests.test_client_write_guard -v 2
```

---

### Task 6: AI settings API — packs + catalog + permissions

**Files:**
- Modify: `app_organization/serializers.py`
- Modify: `app_organization/views.py`
- Modify: `app_organization/tests/test_ai_settings_api.py`

**Interfaces:**
- Response fields: `ai_enabled_packs`, `ai_available_packs`, `available_tools`, `can_edit_ai_packs`
- Write: `ai_enabled_packs` only when platform admin; unknown pack id → 400; include `ai_enabled_packs` in cache invalidation set

- [ ] **Step 1: Failing API tests** (extend `test_ai_settings_api.py`)

Add helper + tests. Reuse schemas from `test_platform_org_access.py` (`xschedjuice` = admin tenant, `xschedjuicethihanet` = customer).

```python
def test_get_includes_packs_and_tools(self):
    resp = self._client(self.admin).get(
        f"{self.api_prefix}/organizations/{self.org.id}/ai-settings"
    )
    self.assertEqual(resp.status_code, 200, resp.content)
    data = resp.json()["data"]
    self.assertIn("ai_enabled_packs", data)
    self.assertIn("ai_available_packs", data)
    self.assertIn("available_tools", data)
    self.assertIn("can_edit_ai_packs", data)
    self.assertFalse(data["can_edit_ai_packs"])  # school admin on customer tenant

def test_school_admin_cannot_patch_packs(self):
    resp = self._client(self.admin).patch(
        f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
        {"ai_enabled_packs": ["finance"]},
        format="json",
    )
    self.assertEqual(resp.status_code, 403)


class OrganizationAISettingsPacksPlatformTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
        with schema_context(self.admin_schema):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

    def _platform_client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.superadmin)
        client.credentials(HTTP_TENANT=self.admin_schema)
        return client

    def test_unknown_pack_rejected_for_platform_staff(self):
        resp = self._platform_client().patch(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/ai-settings",
            {"ai_enabled_packs": ["not_a_real_pack"]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_platform_staff_can_set_packs(self):
        resp = self._platform_client().patch(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/ai-settings",
            {"ai_enabled_packs": ["finance"]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["ai_enabled_packs"], ["finance"])
        self.assertTrue(data["can_edit_ai_packs"])
        names = {t["name"] for t in data["available_tools"]}
        self.assertIn("get_unpaid_students", names)
        self.assertNotIn("count_organization", names)
```

**RBAC note:** `OrganizationAISettingsView` requires `org.configure`. Superadmin on the admin tenant typically has platform permissions; if the platform-staff pack tests get 403 before the pack guard runs, either:
1. seed/grant `org.configure` for that superadmin in the admin schema, or
2. temporarily `@override_settings(RBAC_ENFORCE="log_only")` on the platform pack test class (same as existing `OrganizationAISettingsApiTests`).

Prefer (2) for consistency with `test_ai_settings_api.py`, and still assert the **pack-specific** 403 for school admins via the explicit `RequiresPlatformAdminTenant` check in `patch`.

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_organization.tests.test_ai_settings_api -v 2
```

- [ ] **Step 3: Serializer fields**

```python
ai_enabled_packs = serializers.JSONField(required=False)
ai_available_packs = serializers.SerializerMethodField()
available_tools = serializers.SerializerMethodField()
can_edit_ai_packs = serializers.SerializerMethodField()

# Meta.fields += those
# read_only: ai_available_packs, available_tools, can_edit_ai_packs

def get_ai_available_packs(self, obj):
    from app_ai.packs import list_available_packs
    return list_available_packs()

def get_available_tools(self, obj):
    from app_ai.packs import list_available_tools_for_org
    return list_available_tools_for_org(obj)

def get_can_edit_ai_packs(self, obj):
    request = self.context.get("request")
    if request is None:
        return False
    from app_organization.permissions import RequiresPlatformAdminTenant
    return RequiresPlatformAdminTenant().has_permission(request, None)

def validate_ai_enabled_packs(self, value):
    from app_ai.packs import PACK_REGISTRY, CORE_PACK_ID
    if value is None:
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("Must be a list of pack ids.")
    cleaned = []
    for item in value:
        pid = str(item)
        if pid == CORE_PACK_ID:
            continue
        if pid not in PACK_REGISTRY:
            raise serializers.ValidationError(f"Unknown pack id: {pid}")
        if pid not in cleaned:
            cleaned.append(pid)
    return cleaned
```

Add `"ai_enabled_packs"` to `cache_fields` in `update()`.

- [ ] **Step 4: View guard**

In `OrganizationAISettingsView.patch`, before `is_valid`:

```python
if "ai_enabled_packs" in request.data:
    from app_organization.permissions import RequiresPlatformAdminTenant
    if not RequiresPlatformAdminTenant().has_permission(request, self):
        return self.send_response(
            True, "forbidden", {"details": "Pack assignment requires platform admin."},
            status=403,
        )
```

- [ ] **Step 5: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_organization.tests.test_ai_settings_api -v 2
```

---

### Task 7: Backend regression sweep

**Files:** none new — run existing AI suites that list tools

- [ ] **Step 1: Run focused regression**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_packs app_ai.tests.test_tool_registry app_ai.tests.test_tool_intent app_ai.tests.test_count_courses_by_subject app_ai.tests.test_client_pack_guard app_organization.tests.test_ai_settings_api -v 2
```

Expected: PASS.

- [ ] **Step 2: Run broader AI smoke if time**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_service_write_retry app_telegram.tests.test_ai_query -v 2
```

Fix any failures caused by pack filtering (tests that need non-core tools must set `org.ai_enabled_packs = list(LEGACY_FULL_PACK_IDS)` on the Organization row or stub).

---

### Task 8: Frontend — read-only tools + staff pack editor

**Files (repo `schedjuice-reimagined-fe`):**
- Modify: `src/types/organization-ai-settings.ts`
- Modify: `src/components/org/record/sections/org-ai-settings-pane.tsx`

**Interfaces:**
- Consumes API: `ai_enabled_packs`, `ai_available_packs`, `available_tools`, `can_edit_ai_packs`

- [ ] **Step 1: Extend Zod schema**

```typescript
ai_enabled_packs: z.array(z.string()).optional().default([]),
ai_available_packs: z
  .array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      tool_names: z.array(z.string()),
    }),
  )
  .optional()
  .default([]),
available_tools: z
  .array(
    z.object({
      name: z.string(),
      description: z.string(),
      pack_id: z.string(),
      exposure: z.string(),
    }),
  )
  .optional()
  .default([]),
can_edit_ai_packs: z.boolean().optional().default(false),
```

Omit read-only catalog fields from `organizationAiSettingsEditSchema` (keep `ai_enabled_packs` in edit schema only used when `can_edit_ai_packs`).

- [ ] **Step 2: UI block — place above “System prompt”**

Lofi structure:

```
Capability packs
  [staff] checklist of ai_available_packs (id/title/description)
  [non-staff] read-only chips/list of enabled pack titles

Available tools (read-only)
  table/list: name | pack | exposure | description
```

- When `can_edit_ai_packs`:
  - Controlled checkboxes for each pack in `ai_available_packs`
  - Include `ai_enabled_packs` in form defaultValues / reset / submit payload
- When not:
  - Do not send `ai_enabled_packs` on PATCH
  - Show enabled pack titles from intersection of `ai_enabled_packs` × `ai_available_packs`
- Always show `available_tools` from GET (refresh after save).

Use existing `Field`, checkbox/`Switch` patterns in the pane; match border/section styling of “System prompt” / “General”.

- [ ] **Step 3: Manual check**

- School admin: sees tools list; no pack checkboxes (or disabled); save school context still works.
- Platform admin on admin tenant viewing an org: can toggle packs; after save, tool list and prompt preview update.

- [ ] **Step 4: Typecheck if used in repo**

```bash
cd schedjuice-reimagined-fe && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Fix any type errors in touched files.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Capability packs code registry | 1 |
| Minimal core + opt-in packs | 1 |
| Legacy migration for existing orgs | 3 |
| Pack prompt snippets / short prompt | 2 |
| `list_tools_for_turn` / cache pack filter | 1 |
| Subject analytics tool + Subject table | 4 |
| Schema binder + enum cap | 4 |
| Execution guard for disabled tools | 5 |
| Staff-only pack assignment (platform admin) | 6 |
| Read-only `available_tools` | 6, 8 |
| Cache invalidate on pack change | 6 |
| FE packs UI + read-only list | 8 |
| Telegram + web same path | 1 (via `AIService` / registry) |

## Self-review notes

- No TBD placeholders in tasks.
- `resolve_tools_for_org` ↔ binder import order: stub binder in Task 1, real binder in Task 4.
- `get_tool` remains full-registry for confirmation/disambiguation; **execution** gated in Task 5.
- New orgs: `ai_enabled_packs=[]` (core only); legacy backfill only in data migration for existing rows.
