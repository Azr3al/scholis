# AI Tool Surface & Write Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intent-based tool subsetting and the first write tool (`adjust_staff_points`) with A/B/C disambiguation for ambiguous staff subjects and point types.

**Architecture:** Flat `TOOL_REGISTRY` with `exposure` / `requires_feature` metadata. `AIService.run()` pre-flights pending disambiguation, classifies read vs write intent, and passes a filtered tool subset to Gemini. Write tool calls `app_points.services.post_transaction()` only. Pending state lives in tenant DB (`AIDisambiguationPending`).

**Tech Stack:** Django, django-tenant-schemas, existing RBAC (`app_rbac`), Gemini client (`app_ai.client`), points service (`app_points.services`).

**Spec:** `docs/superpowers/specs/2026-06-27-ai-tool-surface-write-tools-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/base.py` | Add `exposure`, `requires_feature` to `Tool` |
| `app_ai/tools/resolve.py` | Letter keys on ambiguous results; add `resolve_point_type` |
| `app_ai/tools/intent.py` | Read/write intent heuristics; disambiguation reply parsing |
| `app_ai/tools/registry.py` | Register new tools; `list_tools_for_turn()` |
| `app_ai/disambiguation.py` | Pending CRUD, TTL, merge args, execute pending write |
| `app_telegram/models.py` | `AIDisambiguationPending` tenant model |
| `app_telegram/migrations/000N_*.py` | Migration for pending table |
| `app_ai/tools/list_point_types.py` | Read tool — active point types |
| `app_ai/tools/get_staff_point_balances.py` | Read tool — staff balances |
| `app_ai/tools/adjust_staff_points.py` | Write tool — award/deduct via `post_transaction` |
| `app_ai/tools/points_rbac.py` | `require_points_view`, `require_points_award` |
| `app_ai/service.py` | Pre-flight disambiguation + intent routing + `channel_key` |
| `app_ai/prompts.py` | Points + disambiguation instructions |
| `app_ai/views.py` | Pass `channel_key=f"web:{user.id}"` |
| `app_telegram/binding.py` | Pass `channel_key=f"telegram:{chat_id}"` |
| `app_ai/tests/test_tool_intent.py` | Intent + reply parser tests |
| `app_ai/tests/test_tool_registry.py` | Subset + feature flag tests |
| `app_ai/tests/test_resolve_point_type.py` | Point type resolver tests |
| `app_ai/tests/test_adjust_staff_points.py` | Write tool + disambiguation tests |
| `app_ai/tests/test_disambiguation.py` | Pending store + pre-flight tests |
| `app_ai/tests/test_tools_and_pricing.py` | Update registry size assertion |
| `app_telegram/tests/test_ai_query.py` | Integration with mocked Gemini |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`
- **Points tests:** set `org.is_staff_points_enabled = True` in `setUp`
- **Run all new tests:** `python manage.py test app_ai.tests.test_tool_intent app_ai.tests.test_tool_registry app_ai.tests.test_resolve_point_type app_ai.tests.test_adjust_staff_points app_ai.tests.test_disambiguation -v 2`
- **Commits:** Do not commit unless the user asks (repo rule)
- **Branch:** Work on current branch (`dev`); no feature branches

---

## Task 1: Tool metadata on `Tool`

**Files:**
- Modify: `app_ai/tools/base.py`
- Modify: `app_ai/tools/registry.py` (mark existing tools `exposure="read"`)
- Test: `app_ai/tests/test_tool_registry.py` (start file)

- [ ] **Step 1: Write failing registry metadata test**

Create `app_ai/tests/test_tool_registry.py`:

```python
import unittest

from django.test import SimpleTestCase

from app_ai.tools.registry import TOOL_REGISTRY


class ToolMetadataTests(SimpleTestCase):
    def test_core_tools_are_read_exposure(self):
        for name in (
            "search_users",
            "search_courses",
            "count_organization",
            "count_teacher_courses",
            "count_course_roster",
            "list_user_courses",
        ):
            tool = TOOL_REGISTRY[name]
            self.assertEqual(tool.exposure, "read", name)
            self.assertIsNone(tool.requires_feature, name)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_tool_registry.ToolMetadataTests -v 2`

Expected: FAIL — `Tool` has no attribute `exposure`

- [ ] **Step 3: Extend `Tool` dataclass**

In `app_ai/tools/base.py`:

```python
from typing import Literal

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[[dict[str, Any], Any], list[dict[str, Any]]]
    exposure: Literal["read", "write"] = "read"
    requires_feature: str | None = None
```

In each existing tool module (`search_users.py`, etc.), no change needed — default is `"read"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_tool_registry.ToolMetadataTests -v 2`

Expected: PASS

---

## Task 2: Letter keys + `resolve_point_type`

**Files:**
- Modify: `app_ai/tools/resolve.py`
- Test: `app_ai/tests/test_resolve_point_type.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_resolve_point_type.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.resolve import resolve_point_type, resolve_staff_user
from app_auth.models import User
from app_organization.models import Organization
from app_points import models as point_models
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ResolvePointTypeTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.merit = point_models.PointType.objects.create(
                name=f"Merit-{suffix}", sort_order=1
            )
            self.merit_plus = point_models.PointType.objects.create(
                name=f"Merit Plus-{suffix}", sort_order=2
            )
            self.retired = point_models.PointType.objects.create(
                name=f"Retired-{suffix}", is_active=False
            )

    def test_single_match_by_query(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query=self.merit.name.split("-")[0])
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["point_type"].id, self.merit.id)

    def test_ambiguous_includes_letter_keys(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query="Merit")
        self.assertEqual(result["status"], "ambiguous")
        keys = [c["key"] for c in result["candidates"]]
        self.assertEqual(keys, ["A", "B"])

    def test_inactive_type_not_matched_when_active_only(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query=self.retired.name)
        self.assertEqual(result["status"], "not_found")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ResolveStaffUserLetterKeyTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            for name in ("Jamey", "James", "Jamess"):
                User.objects.create_user(
                    email=f"{name.lower()}-{uuid4().hex[:4]}@e.com",
                    password="x",
                    name=name,
                    phone_number="-",
                    date_of_birth=date(1990, 1, 1),
                    roles=[User.UserRole.TEACHER],
                )

    def test_ambiguous_staff_has_letter_keys(self):
        with schema_context(self.schema_name):
            result = resolve_staff_user(query="James")
        self.assertEqual(result["status"], "ambiguous")
        self.assertTrue(all("key" in c for c in result["candidates"]))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test app_ai.tests.test_resolve_point_type -v 2`

Expected: FAIL — `resolve_point_type` not defined; staff ambiguous lacks `key`

- [ ] **Step 3: Implement helpers in `resolve.py`**

Add:

```python
def _with_letter_keys(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = []
    for i, row in enumerate(candidates):
        keyed = dict(row)
        keyed["key"] = letters[i]
        out.append(keyed)
    return out


def _ambiguous_payload(*, message: str, query: str, candidates: list[dict]) -> dict:
    return {
        "status": "ambiguous",
        "message": message,
        "query": query,
        "candidates": _with_letter_keys(candidates),
    }
```

Update `resolve_staff_user` ambiguous branch to use `_ambiguous_payload`.

Add:

```python
def resolve_point_type(
    *,
    point_type_id: int | None,
    query: str | None,
    limit: int = 5,
    active_only: bool = True,
) -> dict[str, Any]:
    from app_points import models as point_models

    if point_type_id is not None:
        pt = point_models.PointType.objects.filter(pk=point_type_id).first()
        if pt is None or (active_only and not pt.is_active):
            return {"status": "not_found", "message": "Point type not found."}
        return {"status": "ok", "point_type": pt}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs = point_models.PointType.objects.all().order_by("sort_order", "id")
    if active_only:
        qs = qs.filter(is_active=True)
    qs = qs.filter(name__icontains=q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No point type match for {q!r}."}
    if len(matches) > limit:
        compact = [{"id": p.id, "name": p.name, "description": p.description} for p in matches[:limit]]
        return _ambiguous_payload(
            message=f"Multiple point types match {q!r}.",
            query=q,
            candidates=compact,
        )
    if len(matches) > 1:
        compact = [{"id": p.id, "name": p.name, "description": p.description} for p in matches]
        return _ambiguous_payload(
            message=f"Multiple point types match {q!r}.",
            query=q,
            candidates=compact,
        )
    return {"status": "ok", "point_type": matches[0]}
```

Fix `resolve_staff_user` ambiguous to include email in candidates and letter keys:

```python
"candidates": _with_letter_keys([_compact_user(u) for u in matches[:limit]]),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python manage.py test app_ai.tests.test_resolve_point_type -v 2`

Expected: PASS

---

## Task 3: Intent router

**Files:**
- Create: `app_ai/tools/intent.py`
- Test: `app_ai/tests/test_tool_intent.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_tool_intent.py`:

```python
from django.test import SimpleTestCase

from app_ai.tools.intent import (
    TurnIntent,
    classify_turn_intent,
    parse_disambiguation_reply,
)


class IntentClassifierTests(SimpleTestCase):
    def test_read_intent_default(self):
        self.assertEqual(classify_turn_intent("how many students"), TurnIntent.READ)

    def test_write_intent_points(self):
        self.assertEqual(
            classify_turn_intent("award James 5 merit points for teamwork"),
            TurnIntent.WRITE,
        )

    def test_disambiguation_letter(self):
        candidates = [{"key": "A", "id": 1, "name": "Jamey"}, {"key": "B", "id": 2, "name": "James"}]
        picked = parse_disambiguation_reply("B", candidates=candidates)
        self.assertEqual(picked, 2)

    def test_disambiguation_name(self):
        candidates = [{"key": "A", "id": 1, "name": "Jamey"}, {"key": "B", "id": 2, "name": "James"}]
        picked = parse_disambiguation_reply("James", candidates=candidates)
        self.assertEqual(picked, 2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_tool_intent -v 2`

Expected: FAIL — module not found

- [ ] **Step 3: Implement `intent.py`**

```python
from __future__ import annotations

import re
from enum import Enum
from typing import Any

_WRITE_PATTERN = re.compile(
    r"\b("
    r"award|deduct|give|remove|add|subtract|grant|take away"
    r")\b.*\b(points?|merit|demerit)\b|"
    r"\b(points?|merit)\b.*\b(award|deduct|give|remove|add)\b",
    re.IGNORECASE,
)

_CANCEL_PATTERN = re.compile(r"^(?:cancel|nevermind|never mind|abort|stop)$", re.IGNORECASE)
_LETTER_REPLY = re.compile(r"^[A-Z](?:[.:\)]|\s|$)", re.IGNORECASE)


class TurnIntent(str, Enum):
    READ = "read"
    WRITE = "write"


def classify_turn_intent(prompt: str) -> TurnIntent:
    text = (prompt or "").strip()
    if _WRITE_PATTERN.search(text):
        return TurnIntent.WRITE
    return TurnIntent.READ


def is_cancel_reply(prompt: str) -> bool:
    return bool(_CANCEL_PATTERN.match((prompt or "").strip()))


def parse_disambiguation_reply(
    prompt: str,
    *,
    candidates: list[dict[str, Any]],
) -> int | None:
    text = (prompt or "").strip()
    if not text or not candidates:
        return None
    if _LETTER_REPLY.match(text):
        letter = text[0].upper()
        for c in candidates:
            if c.get("key", "").upper() == letter:
                return int(c["id"])
    lower = text.lower()
    for c in candidates:
        name = (c.get("name") or "").strip()
        if name and name.lower() == lower:
            return int(c["id"])
    if text.isdigit():
        wanted = int(text)
        ids = {int(c["id"]) for c in candidates}
        if wanted in ids:
            return wanted
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python manage.py test app_ai.tests.test_tool_intent -v 2`

Expected: PASS

---

## Task 4: Registry subsetting

**Files:**
- Modify: `app_ai/tools/registry.py`
- Test: `app_ai/tests/test_tool_registry.py` (extend)

- [ ] **Step 1: Write failing subset tests**

Append to `app_ai/tests/test_tool_registry.py`:

```python
from unittest.mock import MagicMock

from app_ai.tools.intent import TurnIntent
from app_ai.tools.registry import list_tools_for_turn


class ToolSubsetTests(unittest.TestCase):
    def _org(self, *, points_enabled: bool):
        org = MagicMock()
        org.is_staff_points_enabled = points_enabled
        return org

    def test_read_without_points_returns_six(self):
        names = {t.name for t in list_tools_for_turn(intent=TurnIntent.READ, org=self._org(points_enabled=False))}
        self.assertEqual(len(names), 6)

    def test_write_with_points_includes_adjust_tool(self):
        names = {t.name for t in list_tools_for_turn(intent=TurnIntent.WRITE, org=self._org(points_enabled=True))}
        self.assertIn("adjust_staff_points", names)
        self.assertIn("search_users", names)
        self.assertEqual(len(names), 9)
```

Import `unittest` at top of file.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_tool_registry.ToolSubsetTests -v 2`

Expected: FAIL — `list_tools_for_turn` not defined / tools not registered

- [ ] **Step 3: Implement `list_tools_for_turn`**

In `registry.py`, after new tools are registered (Task 6–8), implement:

```python
from app_ai.tools.intent import TurnIntent
from app_organization.models import Organization

_FEATURE_FLAGS = {
    "staff_points": lambda org: bool(getattr(org, "is_staff_points_enabled", False)),
}


def _org_allows_feature(org: Organization | None, feature: str | None) -> bool:
    if not feature:
        return True
    if org is None:
        return False
    checker = _FEATURE_FLAGS.get(feature)
    return bool(checker(org)) if checker else False


def list_tools_for_turn(*, intent: TurnIntent, org: Organization | None) -> list[Tool]:
    out: list[Tool] = []
    for tool in TOOL_REGISTRY.values():
        if not _org_allows_feature(org, tool.requires_feature):
            continue
        if tool.exposure == "read":
            out.append(tool)
        elif tool.exposure == "write" and intent == TurnIntent.WRITE:
            out.append(tool)
    return out
```

Register placeholder imports for new tools as they land in Tasks 6–8.

- [ ] **Step 4: Run subset tests after Tasks 6–8 complete**

Deferred until new tools registered — see Task 8 step 4.

---

## Task 5: Pending disambiguation model + service

**Files:**
- Modify: `app_telegram/models.py`
- Create: `app_telegram/migrations/0003_aidisambiguationpending.py` (adjust number to next available)
- Create: `app_ai/disambiguation.py`
- Test: `app_ai/tests/test_disambiguation.py`

- [ ] **Step 1: Write failing disambiguation service tests**

Create `app_ai/tests/test_disambiguation.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_ai.disambiguation import (
    clear_pending,
    get_active_pending,
    save_pending,
)
from app_auth.models import User
from app_rbac.seeding import seed_rbac
from app_telegram.models import AIDisambiguationPending


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class DisambiguationStoreTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.user = User.objects.create_user(
                email=f"d-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def test_save_and_get_pending(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.user,
                channel_key="telegram:123",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={"direction": "add", "amount": 5, "note": "Good job", "query": "James"},
                candidates=[{"key": "A", "id": 1, "name": "James"}],
            )
            row = get_active_pending(user=self.user, channel_key="telegram:123")
        self.assertIsNotNone(row)
        self.assertEqual(row.pending_field, "subject")

    def test_expired_pending_not_returned(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.user,
                channel_key="web:1",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={},
                candidates=[],
                ttl=timedelta(seconds=-1),
            )
            row = get_active_pending(user=self.user, channel_key="web:1")
        self.assertIsNone(row)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_disambiguation -v 2`

Expected: FAIL — model / service missing

- [ ] **Step 3: Add model to `app_telegram/models.py`**

```python
class AIDisambiguationPending(BaseModel):
    """Pending A/B/C disambiguation for AI write tools (Telegram + web)."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    channel_key = models.CharField(max_length=128, db_index=True)
    tool_name = models.CharField(max_length=64)
    pending_field = models.CharField(max_length=32)
    partial_args = models.JSONField(default=dict)
    candidates = models.JSONField(default=list)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "channel_key"],
                name="uniq_ai_disambiguation_user_channel",
            ),
        ]
```

Run: `python manage.py makemigrations app_telegram --name aidisambiguationpending`

Then: `python manage.py migrate_schemas --shared` and `python manage.py migrate_schemas`

- [ ] **Step 4: Implement `app_ai/disambiguation.py`**

```python
from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.utils import timezone

from app_telegram.models import AIDisambiguationPending

DEFAULT_TTL = timedelta(minutes=10)


def save_pending(
    *,
    user,
    channel_key: str,
    tool_name: str,
    pending_field: str,
    partial_args: dict[str, Any],
    candidates: list[dict[str, Any]],
    ttl: timedelta = DEFAULT_TTL,
) -> AIDisambiguationPending:
    expires_at = timezone.now() + ttl
    row, _ = AIDisambiguationPending.objects.update_or_create(
        user=user,
        channel_key=channel_key,
        defaults={
            "tool_name": tool_name,
            "pending_field": pending_field,
            "partial_args": partial_args,
            "candidates": candidates,
            "expires_at": expires_at,
        },
    )
    return row


def get_active_pending(*, user, channel_key: str) -> AIDisambiguationPending | None:
    row = AIDisambiguationPending.objects.filter(
        user=user, channel_key=channel_key
    ).first()
    if row is None:
        return None
    if row.expires_at <= timezone.now():
        row.delete()
        return None
    return row


def clear_pending(*, user, channel_key: str) -> None:
    AIDisambiguationPending.objects.filter(user=user, channel_key=channel_key).delete()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python manage.py test app_ai.tests.test_disambiguation -v 2`

Expected: PASS

---

## Task 6: Points RBAC helpers + read tools

**Files:**
- Create: `app_ai/tools/points_rbac.py`
- Create: `app_ai/tools/list_point_types.py`
- Create: `app_ai/tools/get_staff_point_balances.py`
- Modify: `app_ai/tools/registry.py`

- [ ] **Step 1: Write failing read-tool tests**

Add to `app_ai/tests/test_adjust_staff_points.py` (create file with read section first):

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tools.get_staff_point_balances import run_get_staff_point_balances
from app_ai.tools.list_point_types import run_list_point_types
from app_auth.models import User
from app_organization.models import Organization
from app_points import models as point_models
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PointsReadToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_staff_points_enabled = True
            org.save(update_fields=["is_staff_points_enabled"])
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"pa-{suffix}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"pt-{suffix}@e.com",
                password="x",
                name="Teacher One",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.pt = point_models.PointType.objects.create(name=f"Merit-{suffix}")

    def test_list_point_types_returns_active(self):
        with schema_context(self.schema_name):
            result = run_list_point_types({}, self.admin)
        self.assertTrue(any(row["name"].startswith("Merit-") for row in result))

    def test_get_balances_by_user_id(self):
        with schema_context(self.schema_name):
            from app_points import services

            services.post_transaction(
                subject=self.teacher,
                actor=self.admin,
                point_type=self.pt,
                delta=4,
                note="Seed balance",
            )
            result = run_get_staff_point_balances(
                {"user_id": self.teacher.id}, self.admin
            )
        self.assertEqual(result["balances"][str(self.pt.id)], 4)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test app_ai.tests.test_adjust_staff_points.PointsReadToolTests -v 2`

Expected: FAIL — modules not found

- [ ] **Step 3: Implement points RBAC + read tools**

`app_ai/tools/points_rbac.py`:

```python
from __future__ import annotations

from typing import Any

from app_rbac.resolution import effective_permissions


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_points_view(user) -> dict[str, Any] | None:
    if "points.view" in set(effective_permissions(user)):
        return None
    return _denied("Viewing staff points requires points.view.")


def require_points_award(user) -> dict[str, Any] | None:
    if "points.award" in set(effective_permissions(user)):
        return None
    return _denied("Awarding or deducting points requires points.award.")
```

`app_ai/tools/list_point_types.py` — returns list of `{id, name, description, color}` for active types; checks `require_points_view`.

`app_ai/tools/get_staff_point_balances.py` — resolves staff via `resolve_staff_user`, returns `{subject: {id, name}, balances: {str(id): int}}`; maps ambiguous to `ambiguous_subject` with letter keys; checks `require_points_view` (allow self-view per API: if subject is self and staff, skip points.view check).

Register both with `requires_feature="staff_points"`, `exposure="read"`.

- [ ] **Step 4: Run read-tool tests**

Run: `python manage.py test app_ai.tests.test_adjust_staff_points.PointsReadToolTests -v 2`

Expected: PASS

---

## Task 7: `adjust_staff_points` write tool

**Files:**
- Create: `app_ai/tools/adjust_staff_points.py`
- Modify: `app_ai/tools/registry.py`
- Test: `app_ai/tests/test_adjust_staff_points.py` (extend)

- [ ] **Step 1: Write failing write-tool tests**

Append to `test_adjust_staff_points.py`:

```python
from unittest.mock import patch

from app_ai.disambiguation import get_active_pending
from app_ai.tools.adjust_staff_points import run_adjust_staff_points


class AdjustStaffPointsWriteTests(PointsReadToolTests):
    def test_unambiguous_add_calls_post_transaction(self):
        with schema_context(self.schema_name):
            result = run_adjust_staff_points(
                {
                    "user_id": self.teacher.id,
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 5,
                    "note": "Great teamwork",
                },
                self.admin,
                channel_key="web:1",
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["transaction"]["delta"], 5)

    def test_ambiguous_subject_stores_pending(self):
        with schema_context(self.schema_name):
            for name in ("James", "Jamesy"):
                User.objects.create_user(
                    email=f"{name}-{uuid4().hex[:4]}@e.com",
                    password="x",
                    name=name,
                    phone_number="-",
                    date_of_birth=date(1990, 1, 1),
                    roles=[User.UserRole.TEACHER],
                )
            result = run_adjust_staff_points(
                {
                    "query": "James",
                    "point_type_id": self.pt.id,
                    "direction": "add",
                    "amount": 2,
                    "note": "Nice work",
                },
                self.admin,
                channel_key="telegram:99",
            )
            pending = get_active_pending(user=self.admin, channel_key="telegram:99")
        self.assertEqual(result["status"], "ambiguous_subject")
        self.assertIsNotNone(pending)
        self.assertEqual(pending.pending_field, "subject")

    def test_deduct_negative_delta(self):
        with schema_context(self.schema_name):
            result = run_adjust_staff_points(
                {
                    "user_id": self.teacher.id,
                    "point_type_id": self.pt.id,
                    "direction": "deduct",
                    "amount": 3,
                    "note": "Late arrival",
                },
                self.admin,
                channel_key="web:1",
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["transaction"]["delta"], -3)
```

Note: `run_adjust_staff_points` signature includes optional `channel_key` kwarg for pending storage — implement accordingly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test app_ai.tests.test_adjust_staff_points.AdjustStaffPointsWriteTests -v 2`

Expected: FAIL

- [ ] **Step 3: Implement `adjust_staff_points.py`**

Key implementation rules:

```python
def run_adjust_staff_points(
    args: dict[str, Any],
    user: User,
    *,
    channel_key: str | None = None,
    org=None,
) -> dict[str, Any]:
    # 1. feature_disabled if not org.is_staff_points_enabled
    # 2. require_points_award
    # 3. validate exactly one of user_id/query; point_type_id/point_type_query
    # 4. resolve_staff_user → if ambiguous: save_pending(pending_field="subject"); return ambiguous_subject payload
    # 5. resolve_point_type(active_only=True) → if ambiguous: save_pending(pending_field="point_type"); return ambiguous_point_type payload
    # 6. delta = amount if direction=="add" else -amount
    # 7. tx = services.post_transaction(subject=..., actor=user, point_type=..., delta=delta, note=note)
    # 8. return status ok + transaction + balances + subject
```

Wrap `ValidationError` from service as `{"error": "validation_error", "message": ...}`.

Register tool:

```python
ADJUST_STAFF_POINTS_TOOL = Tool(
    name="adjust_staff_points",
    description=(
        "Award or deduct staff points. Requires points.award. Staff only — not students. "
        "Provide user_id or query for the staff member; point_type_id or point_type_query "
        "for the point type. Use direction add or deduct with a positive amount and a note."
    ),
    parameters=ADJUST_STAFF_POINTS_SCHEMA,
    run=run_adjust_staff_points,
    exposure="write",
    requires_feature="staff_points",
)
```

Update `registry.py` to import and register all three new tools.

- [ ] **Step 4: Run write-tool tests**

Run: `python manage.py test app_ai.tests.test_adjust_staff_points -v 2`

Expected: PASS

- [ ] **Step 5: Run registry subset tests (Task 4)**

Run: `python manage.py test app_ai.tests.test_tool_registry -v 2`

Expected: PASS

---

## Task 8: Wire `channel_key` through tool execution

**Files:**
- Modify: `app_ai/client.py`
- Modify: `app_ai/tools/base.py` (optional wrapper) OR pass context via closure

The Gemini client calls `tool.run(args, user)`. Extend to pass kwargs:

In `client.py` tool execution block (~line 201):

```python
run_kwargs: dict[str, Any] = {}
if hasattr(tool, "exposure") and tool.exposure == "write":
    run_kwargs["channel_key"] = self._channel_key
    run_kwargs["org"] = self._org
result = tool.run(args, user, **run_kwargs) if run_kwargs else tool.run(args, user)
```

Add `channel_key` and `org` parameters to `generate_with_tools()`; store on `self` for the loop.

Update `Tool.run` type hint to accept `**kwargs` in handlers that need it (write tools only).

- [ ] **Step 1: Write failing client test** (optional lightweight test mocking tool with channel_key)

- [ ] **Step 2: Implement client passthrough**

- [ ] **Step 3: Verify adjust_staff_points receives channel_key in integration test**

---

## Task 9: `AIService` orchestration

**Files:**
- Modify: `app_ai/service.py`
- Modify: `app_ai/disambiguation.py` (add `try_resolve_pending_turn`)
- Test: extend `app_ai/tests/test_disambiguation.py`

- [ ] **Step 1: Write failing pre-flight test**

```python
from unittest.mock import MagicMock, patch

from app_ai.disambiguation import save_pending
from app_ai.service import AIService
from app_ai.tools.intent import TurnIntent


class PreFlightDisambiguationTests(DisambiguationStoreTests):
    @patch("app_ai.service.GeminiClient")
    def test_letter_reply_executes_without_write_intent(self, MockClient):
        mock_client = MockClient.return_value
        mock_client.generate_with_tools.return_value = MagicMock(
            text="Done.", tool_calls=[], model="x", iterations=1
        )
        with schema_context(self.schema_name):
            save_pending(
                user=self.user,
                channel_key="web:9",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={
                    "query": "James",
                    "point_type_id": 1,
                    "direction": "add",
                    "amount": 1,
                    "note": "ok",
                },
                candidates=[{"key": "A", "id": self.user.id, "name": "Admin"}],
            )
            AIService(client=mock_client).run(
                "B",
                self.user,
                channel_key="web:9",
            )
        # When only one candidate and user picks B but only A exists, adjust test data:
        # Use two teacher candidates and mock post_transaction instead — refine in implementation
```

Refine test during implementation to use real candidate IDs and `@patch("app_points.services.post_transaction")`.

- [ ] **Step 2: Implement `try_resolve_pending_turn` in `disambiguation.py`**

Returns `ExecutedTurn | None`:

- If cancel → clear pending, return sentinel for "cancelled"
- If letter/name match → merge ID into `partial_args`, call `get_tool(tool_name).run(...)`, clear pending, return result dict for injection
- If pending exists but no match → return `PendingReminder` with candidate summary for system context injection

- [ ] **Step 3: Update `AIService.run()`**

Add parameters:

```python
def run(
    self,
    prompt: str,
    user,
    *,
    channel_key: str | None = None,
    tools: list[Tool] | None = None,
    ...
) -> AIResult:
```

Flow:

```python
from app_ai.tools.intent import TurnIntent, classify_turn_intent, is_cancel_reply
from app_ai.tools.registry import list_tools_for_turn

if tenant and channel_key:
    pending_result = try_resolve_pending_turn(
        prompt=prompt, user=user, channel_key=channel_key, org=tenant
    )
    if pending_result and pending_result.executed:
        system_context += f"\n\nTool result: {pending_result.payload}"
    elif pending_result and pending_result.cancelled:
        system_context += "\n\nThe user cancelled the pending disambiguation."
    elif pending_result and pending_result.reminder:
        system_context += f"\n\nPending disambiguation: {pending_result.reminder}"

intent = classify_turn_intent(prompt)
selected = tools or list_tools_for_turn(intent=intent, org=tenant)
return self.client.generate_with_tools(
    prompt,
    user=user,
    tools=selected,
    channel_key=channel_key,
    org=tenant,
    ...
)
```

When `try_resolve_pending_turn` fully executes a write, still call Gemini so the model formats a natural confirmation — inject executed payload into `system_context`.

- [ ] **Step 4: Run disambiguation + service tests**

Run: `python manage.py test app_ai.tests.test_disambiguation -v 2`

Expected: PASS

---

## Task 10: Channel wiring (Telegram + web)

**Files:**
- Modify: `app_telegram/binding.py`
- Modify: `app_telegram/tasks.py`
- Modify: `app_ai/views.py`

- [ ] **Step 1: Pass `channel_key` from Telegram**

In `binding.py` where `run_ai_query` is enqueued, pass `channel_key=f"telegram:{chat_id}"`.

In `tasks.py` `run_ai_query`, forward to `AIService().run(..., channel_key=channel_key)`.

- [ ] **Step 2: Pass `channel_key` from web**

In `AIQueryView.post`:

```python
result = AIService().run(
    prompt,
    user,
    feature="ai_query",
    channel_key=f"web:{user.id}",
)
```

- [ ] **Step 3: Manual smoke test** (optional)

Telegram: "award Teacher One 5 merit points for teamwork" with unambiguous name → immediate success message.

---

## Task 11: Prompt + declaration count

**Files:**
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tools_and_pricing.py`

- [ ] **Step 1: Update platform prompt**

Append to `PLATFORM_BASE_TEMPLATE`:

```python
"""
Points (when enabled):
- Use list_point_types and get_staff_point_balances for points questions.
- Use adjust_staff_points to award or deduct staff points (not students).
- When a tool returns ambiguous_subject or ambiguous_point_type, list the lettered
  options and wait for the user to reply with A, B, C or a full name — do not guess.
- Only say points changed after adjust_staff_points returns status ok.
"""
```

- [ ] **Step 2: Update declaration count test**

In `test_tools_and_pricing.py`, change `len(declarations)` from `5` to `9` (full registry size).

- [ ] **Step 3: Run pricing test**

Run: `python manage.py test app_ai.tests.test_tools_and_pricing -v 2`

Expected: PASS

---

## Task 12: Telegram integration test

**Files:**
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Write failing integration test**

Add test that mocks `GeminiClient.generate_with_tools` to simulate tool call returning ambiguous subject, then verify bot reply includes lettered options.

- [ ] **Step 2: Implement minimal mock chain**

Follow existing patterns in `test_ai_query.py` (`AIResult`, `@patch` on `AIService` or `GeminiClient`).

- [ ] **Step 3: Run test**

Run: `python manage.py test app_telegram.tests.test_ai_query -v 2`

Expected: PASS (including new test)

---

## Task 13: Spec status + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-27-ai-tool-surface-write-tools-design.md` — set `Status: Approved`

- [ ] **Step 1: Run full test suite for touched apps**

```bash
python manage.py test app_ai app_telegram.tests.test_ai_query -v 2
```

Expected: all pass

- [ ] **Step 2: Update spec status to Approved**

---

## Spec coverage checklist

| Spec section | Task |
| --- | --- |
| Tool metadata (`exposure`, `requires_feature`) | Task 1 |
| Intent router read/write | Task 3, 9 |
| Registry subsetting | Task 4 |
| Disambiguation pending store | Task 5 |
| A/B/C letter keys | Task 2 |
| `resolve_point_type` | Task 2 |
| `list_point_types` | Task 6 |
| `get_staff_point_balances` | Task 6 |
| `adjust_staff_points` + `post_transaction` | Task 7 |
| HTTP guards via service layer | Task 7 |
| Ambiguous subject + point type | Task 7 |
| No yes/no write confirm | Task 7, 9 |
| `channel_key` Telegram + web | Task 10 |
| Prompt updates | Task 11 |
| Tests per spec §13 | Tasks 2–12 |

---

## Out of scope (do not implement in this plan)

- Enrollment / announcement write tools
- Attendance tool
- Intent classifier Gemini fallback (heuristics only for v1)
- Telegram inline buttons
- Usage dashboard intent metrics
