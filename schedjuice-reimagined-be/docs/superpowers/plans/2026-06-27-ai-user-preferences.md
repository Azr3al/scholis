# AI User Preferences & Per-User Usage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist structured per-user AI preferences (language, tone, verbosity, preferred name) across Telegram and web, inject them into every `AIService.run()` call, expose a Memory form and per-user Usage panel on the user record AI section, and gate access via six new school-tier RBAC permissions.

**Architecture:** Store `UserAIPreferences` in tenant schema (`app_auth`, not `app_ai` — `app_ai` is shared/public-only). Business logic in `app_ai/user_preferences.py`. Chat updates via always-available `set_ai_preferences` tool. Per-user usage aggregates public `AIUsageLog` via extended `app_ai/reporting.py`. Frontend adds `?section=ai` to the user record rail.

**Tech Stack:** Django, DRF, django-tenant-schemas, Google Gemini, Next.js, Zod, TanStack Query, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-user-preferences-design.md`

**Repos:** `schedjuice-reimagined-be` (primary), `schedjuice-reimagined-fe`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_auth/models_user_ai.py` | `UserAIPreferences` model (tenant schema) |
| `app_auth/migrations/0067_useraipreferences.py` | Tenant migration |
| `app_ai/user_preferences.py` | get/upsert/serialize + `build_user_preferences_context()` |
| `app_ai/service.py` | Inject user preference block into `system_context` |
| `app_ai/prompts.py` | Platform prompt: call `set_ai_preferences` on preference requests |
| `app_ai/tools/set_ai_preferences.py` | Write tool for chat updates |
| `app_ai/tools/base.py` | Optional `always_available: bool` on `Tool` dataclass |
| `app_ai/tools/registry.py` | Register tool; include `always_available` tools on READ turns |
| `app_ai/reporting.py` | `build_user_usage_detail()` |
| `app_ai/user_views.py` | `UserAIUsageView`, `UserAIPreferencesView` |
| `app_ai/serializers.py` | Preference PATCH/GET serializers |
| `app_auth/urls.py` | Register `users/<id>/ai-usage`, `ai-preferences` |
| `app_rbac/catalog.py` | Six new permissions |
| `app_rbac/defaults.py` | Default matrix grants |
| `app_rbac/migrations/0013_ai_user_memory_permissions.py` | `seed_rbac()` |
| `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts` | Zod + TS types |
| `schedjuice-reimagined-fe/src/app/client-api/ai-user-preferences.ts` | API helpers |
| `schedjuice-reimagined-fe/src/lib/ai/visibility.ts` | Section/panel permission helpers |
| `schedjuice-reimagined-fe/src/components/record/record-sections.ts` | Add `"ai"` section |
| `schedjuice-reimagined-fe/src/components/record/sections/record-ai.tsx` | AI section shell |
| `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx` | Usage sub-panel |
| `schedjuice-reimagined-fe/src/components/users/ai/ai-memory-form.tsx` | Memory form |
| `schedjuice-reimagined-fe/src/app/(internal)/users/[id]/page.tsx` | Wire `RecordAi` section |

**Note:** Spec places the model in `app_ai/models.py`; use `app_auth` instead because `app_ai` is in `SHARED_APPS` only (public schema). Usage logs stay in public schema; preferences are per-tenant User rows.

---

## Conventions for every task

- **Tests:** Django `TestCase` under `app_ai/tests/`, `app_auth/tests/`.
  - `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")`
  - `@override_settings(RBAC_ENFORCE="enforce")` for permission tests
  - `setUpTestData`: `migrate_schemas` + `load-data` with `schema_name = "xschedjuice"`
  - Tenant ORM: `schema_context(self.schema_name)`; public org/logs: `schema_context(get_public_schema_name())`
- **Run backend tests:** `python manage.py test app_ai.tests.test_user_preferences -v 2`
- **Run FE tests:** `npm test -- record-sections` (from `schedjuice-reimagined-fe/`)
- **Migrations:** `python manage.py makemigrations app_auth` then `python manage.py migrate_schemas`
- **Commits:** Do not `git commit` unless the user asks (repo rule).

---

## Task 1: `UserAIPreferences` model

**Files:**
- Create: `app_auth/models_user_ai.py`
- Modify: `app_auth/models.py` (import for discoverability, optional)
- Create: `app_auth/migrations/0067_useraipreferences.py`
- Test: `app_auth/tests/test_user_ai_preferences_model.py`

- [ ] **Step 1: Write failing model test**

Create `app_auth/tests/test_user_ai_preferences_model.py`:

```python
import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserAIPreferencesModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_defaults_when_created(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            prefs = UserAIPreferences.objects.create(user=user)
        self.assertEqual(prefs.response_language, UserAIPreferences.ResponseLanguage.AUTO)
        self.assertEqual(prefs.tone, UserAIPreferences.Tone.DEFAULT)
        self.assertEqual(prefs.verbosity, UserAIPreferences.Verbosity.DEFAULT)
        self.assertEqual(prefs.preferred_name, "")
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_auth.tests.test_user_ai_preferences_model -v 2`  
Expected: FAIL — `ModuleNotFoundError: app_auth.models_user_ai`.

- [ ] **Step 3: Create model**

Create `app_auth/models_user_ai.py`:

```python
from django.db import models

from utilitas.models import BaseModel


class UserAIPreferences(BaseModel):
    class ResponseLanguage(models.TextChoices):
        AUTO = "auto", "auto"
        EN = "en", "en"
        MY = "my", "my"

    class Tone(models.TextChoices):
        DEFAULT = "default", "default"
        FORMAL = "formal", "formal"
        CASUAL = "casual", "casual"

    class Verbosity(models.TextChoices):
        DEFAULT = "default", "default"
        BRIEF = "brief", "brief"
        DETAILED = "detailed", "detailed"

    user = models.OneToOneField(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="ai_preferences",
    )
    response_language = models.CharField(
        max_length=8,
        choices=ResponseLanguage.choices,
        default=ResponseLanguage.AUTO,
    )
    tone = models.CharField(
        max_length=16,
        choices=Tone.choices,
        default=Tone.DEFAULT,
    )
    verbosity = models.CharField(
        max_length=16,
        choices=Verbosity.choices,
        default=Verbosity.DEFAULT,
    )
    preferred_name = models.CharField(max_length=64, blank=True, default="")
```

- [ ] **Step 4: Create migration**

Run: `python manage.py makemigrations app_auth --name useraipreferences`  
Run: `python manage.py migrate_schemas`

- [ ] **Step 5: Run test — expect PASS**

Run: `python manage.py test app_auth.tests.test_user_ai_preferences_model -v 2`  
Expected: PASS

---

## Task 2: Preference service + prompt context

**Files:**
- Create: `app_ai/user_preferences.py`
- Test: `app_ai/tests/test_user_preferences.py`

- [ ] **Step 1: Write failing tests for context builder**

Create `app_ai/tests/test_user_preferences.py`:

```python
import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_ai.user_preferences import (
    build_user_preferences_context,
    get_preferences_for_user,
    preferences_to_dict,
)
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserPreferencesContextTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_empty_context_for_defaults(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
        self.assertEqual(build_user_preferences_context(user), "")

    def test_context_includes_english_only(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            UserAIPreferences.objects.create(
                user=user,
                response_language=UserAIPreferences.ResponseLanguage.EN,
            )
        ctx = build_user_preferences_context(user)
        self.assertIn("English only", ctx)
        self.assertIn("User preferences:", ctx)

    def test_get_preferences_returns_defaults_without_row(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            data = preferences_to_dict(get_preferences_for_user(user))
        self.assertEqual(data["response_language"], "auto")
        self.assertIsNone(data["updated_at"])
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_ai.tests.test_user_preferences -v 2`  
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app_ai/user_preferences.py`**

```python
from __future__ import annotations

import re

from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

_LANGUAGE_LABELS = {
    UserAIPreferences.ResponseLanguage.AUTO: "Match the language of each user message",
    UserAIPreferences.ResponseLanguage.EN: "English only",
    UserAIPreferences.ResponseLanguage.MY: "Burmese only",
}
_TONE_LABELS = {
    UserAIPreferences.Tone.DEFAULT: "",
    UserAIPreferences.Tone.FORMAL: "formal",
    UserAIPreferences.Tone.CASUAL: "casual",
}
_VERBOSITY_LABELS = {
    UserAIPreferences.Verbosity.DEFAULT: "",
    UserAIPreferences.Verbosity.BRIEF: "be brief",
    UserAIPreferences.Verbosity.DETAILED: "be detailed",
}


def normalize_preferred_name(value: str | None) -> str:
    text = (value or "").strip()
    if _CONTROL_CHARS.search(text):
        raise ValueError("preferred_name contains invalid characters")
    return text[:64]


def get_preferences_for_user(user: User) -> UserAIPreferences | None:
    try:
        return user.ai_preferences
    except UserAIPreferences.DoesNotExist:
        return None


def preferences_to_dict(prefs: UserAIPreferences | None, *, user_id: int) -> dict:
    if prefs is None:
        return {
            "user_id": user_id,
            "response_language": UserAIPreferences.ResponseLanguage.AUTO,
            "tone": UserAIPreferences.Tone.DEFAULT,
            "verbosity": UserAIPreferences.Verbosity.DEFAULT,
            "preferred_name": "",
            "updated_at": None,
        }
    return {
        "user_id": user_id,
        "response_language": prefs.response_language,
        "tone": prefs.tone,
        "verbosity": prefs.verbosity,
        "preferred_name": prefs.preferred_name,
        "updated_at": prefs.updated_at.isoformat() if prefs.updated_at else None,
    }


def upsert_preferences(user: User, **fields) -> UserAIPreferences:
    prefs, _ = UserAIPreferences.objects.get_or_create(user=user)
    if "preferred_name" in fields:
        fields["preferred_name"] = normalize_preferred_name(fields["preferred_name"])
    if fields.get("clear_preferred_name"):
        fields["preferred_name"] = ""
        fields.pop("clear_preferred_name", None)
    for key, value in fields.items():
        if value is not None and hasattr(prefs, key):
            setattr(prefs, key, value)
    prefs.save()
    return prefs


def build_user_preferences_context(user: User) -> str:
    prefs = get_preferences_for_user(user)
    if prefs is None:
        return ""

    lines: list[str] = []
    lang_label = _LANGUAGE_LABELS.get(prefs.response_language, "")
    if lang_label and prefs.response_language != UserAIPreferences.ResponseLanguage.AUTO:
        lines.append(f"- Respond in: {lang_label}")
    elif prefs.response_language == UserAIPreferences.ResponseLanguage.EN:
        lines.append(f"- Respond in: {_LANGUAGE_LABELS[UserAIPreferences.ResponseLanguage.EN]}")
    elif prefs.response_language == UserAIPreferences.ResponseLanguage.MY:
        lines.append(f"- Respond in: {_LANGUAGE_LABELS[UserAIPreferences.ResponseLanguage.MY]}")

    tone = _TONE_LABELS.get(prefs.tone, "")
    if tone:
        lines.append(f"- Tone: {tone}")
    verbosity = _VERBOSITY_LABELS.get(prefs.verbosity, "")
    if verbosity:
        lines.append(f"- Verbosity: {verbosity}")
    if prefs.preferred_name.strip():
        lines.append(f"- Address the user as: {prefs.preferred_name.strip()}")

    if not lines:
        return ""
    return "User preferences:\n" + "\n".join(lines)
```

Fix the language block logic in implementation — only emit non-auto language lines (simplify):

```python
    if prefs.response_language != UserAIPreferences.ResponseLanguage.AUTO:
        lines.append(f"- Respond in: {_LANGUAGE_LABELS[prefs.response_language]}")
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_user_preferences -v 2`

---

## Task 3: Wire into `AIService` + platform prompt

**Files:**
- Modify: `app_ai/service.py`
- Modify: `app_ai/prompts.py`
- Test: `app_ai/tests/test_service_user_preferences.py`

- [ ] **Step 1: Write failing integration test**

Create `app_ai/tests/test_service_user_preferences.py`:

```python
import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.service import AIService
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIServiceUserPreferencesTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_ai.service.GeminiClient.generate_with_tools")
    def test_system_context_includes_user_preferences(self, mock_gen):
        from app_ai.client import AIResult

        mock_gen.return_value = AIResult(text="ok", tool_calls=[], model="test", iterations=0)
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            UserAIPreferences.objects.create(
                user=user,
                response_language=UserAIPreferences.ResponseLanguage.EN,
            )
            AIService().run("hello", user, feature="ai_query")

        kwargs = mock_gen.call_args.kwargs
        self.assertIn("English only", kwargs["system_context"])
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Patch `app_ai/service.py`**

After `system_context = build_system_context(tenant)` block (~line 72):

```python
            from app_ai.user_preferences import build_user_preferences_context

            pref_block = build_user_preferences_context(user)
            if pref_block:
                system_context = f"{system_context}\n\n{pref_block}"
```

- [ ] **Step 4: Update `app_ai/prompts.py`**

Append to `PLATFORM_BASE_TEMPLATE` before the closing `"""`:

```
User preferences:
- When the user asks to change response language, tone, verbosity, or what you
  call them, call set_ai_preferences before answering.
- Confirm the change briefly in your reply.
```

- [ ] **Step 5: Run test — expect PASS**

---

## Task 4: `set_ai_preferences` tool + always-available registry fix

**Problem:** Write tools are only exposed when `TurnIntent.WRITE` (points mutations). Preference requests like “speak English only” classify as READ. The preferences tool must be available on every turn.

**Files:**
- Modify: `app_ai/tools/base.py`
- Create: `app_ai/tools/set_ai_preferences.py`
- Modify: `app_ai/tools/registry.py`
- Test: `app_ai/tests/test_set_ai_preferences_tool.py`
- Modify: `app_ai/tests/test_tool_registry.py`

- [ ] **Step 1: Add `always_available` to `Tool` dataclass**

In `app_ai/tools/base.py`:

```python
@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[..., Any]
    exposure: Literal["read", "write"] = "read"
    requires_feature: str | None = None
    always_available: bool = False
```

- [ ] **Step 2: Write failing tool test**

Create `app_ai/tests/test_set_ai_preferences_tool.py`:

```python
import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_ai.tools.set_ai_preferences import run_set_ai_preferences
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SetAIPreferencesToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_sets_english_language(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            result = run_set_ai_preferences(
                user=user,
                response_language="en",
            )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["preferences"]["response_language"], "en")

    def test_requires_at_least_one_field(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            result = run_set_ai_preferences(user=user)
        self.assertEqual(result["status"], "error")
```

- [ ] **Step 3: Implement tool**

Create `app_ai/tools/set_ai_preferences.py`:

```python
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.user_preferences import preferences_to_dict, upsert_preferences
from app_auth.models import User

SCHEMA = strict_object_schema(
    properties={
        "response_language": {
            "type": "string",
            "enum": ["auto", "en", "my"],
            "description": "Language for assistant replies.",
        },
        "tone": {
            "type": "string",
            "enum": ["default", "formal", "casual"],
        },
        "verbosity": {
            "type": "string",
            "enum": ["default", "brief", "detailed"],
        },
        "preferred_name": {
            "type": "string",
            "description": "How to address the user in replies.",
            "maxLength": 64,
        },
        "clear_preferred_name": {
            "type": "boolean",
            "description": "When true, remove the stored preferred name.",
        },
    },
    required=[],
)


def run_set_ai_preferences(
    *,
    user: User,
    response_language: str | None = None,
    tone: str | None = None,
    verbosity: str | None = None,
    preferred_name: str | None = None,
    clear_preferred_name: bool | None = None,
    **_: Any,
) -> dict[str, Any]:
    updates = {
        k: v
        for k, v in {
            "response_language": response_language,
            "tone": tone,
            "verbosity": verbosity,
            "preferred_name": preferred_name,
            "clear_preferred_name": clear_preferred_name,
        }.items()
        if v is not None
    }
    if not updates:
        return {"status": "error", "message": "At least one preference field is required."}
    try:
        prefs = upsert_preferences(user, **updates)
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}
    return {
        "status": "ok",
        "preferences": preferences_to_dict(prefs, user_id=user.id),
    }


SET_AI_PREFERENCES_TOOL = Tool(
    name="set_ai_preferences",
    description=(
        "Update the calling user's AI preferences: response language, tone, "
        "verbosity, or preferred name. Call when the user asks to change how "
        "you speak or address them."
    ),
    parameters=SCHEMA,
    run=run_set_ai_preferences,
    exposure="write",
    always_available=True,
)
```

- [ ] **Step 4: Register + fix `list_tools_for_turn`**

In `app_ai/tools/registry.py`:

```python
from app_ai.tools.set_ai_preferences import SET_AI_PREFERENCES_TOOL

TOOL_REGISTRY[SET_AI_PREFERENCES_TOOL.name] = SET_AI_PREFERENCES_TOOL

def list_tools_for_turn(*, intent: TurnIntent, org: Organization | None) -> list[Tool]:
    selected: list[Tool] = []
    for tool in TOOL_REGISTRY.values():
        if not _org_allows_feature(org, tool.requires_feature):
            continue
        if tool.always_available:
            selected.append(tool)
            continue
        ...
```

Add test in `app_ai/tests/test_tool_registry.py`:

```python
def test_set_ai_preferences_available_on_read_turn(self):
    tools = list_tools_for_turn(intent=TurnIntent.READ, org=None)
    names = {t.name for t in tools}
    self.assertIn("set_ai_preferences", names)
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_set_ai_preferences_tool app_ai.tests.test_tool_registry -v 2`

---

## Task 5: RBAC permissions

**Files:**
- Modify: `app_rbac/catalog.py`
- Modify: `app_rbac/defaults.py`
- Create: `app_rbac/migrations/0013_ai_user_memory_permissions.py`
- Test: `app_rbac/tests/test_ai_memory_permissions.py` (or extend existing catalog test)

- [ ] **Step 1: Add six permissions to catalog** (after `ai.telegram_use`):

```python
    _p(
        "ai.usage.view_own",
        "View own AI usage",
        "view their own AI usage statistics",
        "Operational",
    ),
    _p(
        "ai.usage.view_all",
        "View all AI usage",
        "view any user's AI usage statistics",
        "Operational",
        sensitive=True,
    ),
    _p(
        "ai.memory.view_own",
        "View own AI memory",
        "view their own AI assistant preferences",
        "Operational",
    ),
    _p(
        "ai.memory.manage_own",
        "Manage own AI memory",
        "edit their own AI assistant preferences",
        "Operational",
    ),
    _p(
        "ai.memory.view_all",
        "View all AI memory",
        "view any user's AI assistant preferences",
        "Operational",
        sensitive=True,
    ),
    _p(
        "ai.memory.manage_all",
        "Manage all AI memory",
        "edit any user's AI assistant preferences",
        "Operational",
        sensitive=True,
    ),
```

- [ ] **Step 2: Update `DEFAULT_MATRIX`**

Add to `admin` and `manager`:

```python
"ai.usage.view_own", "ai.usage.view_all",
"ai.memory.view_own", "ai.memory.manage_own",
"ai.memory.view_all", "ai.memory.manage_all",
```

Add to `teacher`, `finance`, `hr`:

```python
"ai.usage.view_own", "ai.memory.view_own", "ai.memory.manage_own",
```

Do **not** add to `student` in v1.

- [ ] **Step 3: Migration calling `seed_rbac()`**

```python
from django.db import migrations

def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac
    seed_rbac()

class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0012_ai_telegram_use")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
```

- [ ] **Step 4: Verify catalog test**

Run: `python manage.py test app_rbac -v 2 -k catalog` (or full rbac suite)

---

## Task 6: Per-user usage aggregation

**Files:**
- Modify: `app_ai/reporting.py`
- Test: `app_ai/tests/test_user_usage_reporting.py`

- [ ] **Step 1: Write failing test**

```python
def test_build_user_usage_detail_filters_by_user(self):
    # Create AIUsageLog rows for two users in public schema for xschedjuice tenant
    # Assert build_user_usage_detail only sums target user_id
```

- [ ] **Step 2: Add `build_user_usage_detail()` to `app_ai/reporting.py`**

```python
def build_user_usage_detail(
    tenant: Organization,
    user_id: int,
    year: int,
    month: int,
) -> dict[str, Any]:
    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        base_qs = AIUsageLog.objects.filter(
            tenant=tenant,
            user_id=user_id,
            created_at__gte=start,
            created_at__lt=end,
        )
        month_agg = base_qs.aggregate(
            total_cost_usd=Sum("billed_cost_usd"),
            total_tokens=Sum("total_tokens"),
            request_count=Count("id"),
        )
        by_feature = list(
            base_qs.values("feature")
            .annotate(
                total_cost_usd=Sum("billed_cost_usd"),
                total_tokens=Sum("total_tokens"),
                request_count=Count("id"),
            )
            .order_by("-total_cost_usd")
        )

    month_summary = {
        "total_cost_usd": _decimal_str(month_agg["total_cost_usd"] or Decimal("0")),
        "total_tokens": month_agg["total_tokens"] or 0,
        "request_count": month_agg["request_count"] or 0,
        "by_feature": [
            {
                "feature": row["feature"] or "(unknown)",
                "total_cost_usd": _decimal_str(row["total_cost_usd"] or Decimal("0")),
                "total_tokens": row["total_tokens"] or 0,
                "request_count": row["request_count"] or 0,
            }
            for row in by_feature
        ],
    }

    trend = []
    for y, m in iter_months_ending(year, month, 6):
        s, e = _month_bounds_utc(y, m)
        with schema_context(get_public_schema_name()):
            agg = AIUsageLog.objects.filter(
                tenant=tenant,
                user_id=user_id,
                created_at__gte=s,
                created_at__lt=e,
            ).aggregate(
                total_cost_usd=Sum("billed_cost_usd"),
                total_tokens=Sum("total_tokens"),
                request_count=Count("id"),
            )
        trend.append({
            "year": y,
            "month": m,
            "total_cost_usd": _decimal_str(agg["total_cost_usd"] or Decimal("0")),
            "total_tokens": agg["total_tokens"] or 0,
            "request_count": agg["request_count"] or 0,
        })

    return {
        "user_id": user_id,
        "year": year,
        "month": month,
        "month_summary": month_summary,
        "trend": trend,
    }
```

- [ ] **Step 3: Run test — expect PASS**

---

## Task 7: API views + URL registration

**Files:**
- Create: `app_ai/user_views.py`
- Create/modify: `app_ai/serializers.py`
- Modify: `app_auth/urls.py`
- Test: `app_ai/tests/test_user_ai_api.py`

- [ ] **Step 1: Permission helper**

Create `app_ai/permissions.py`:

```python
from app_rbac.resolution import effective_permissions


def _is_self(actor, target_user_id: int) -> bool:
    return actor is not None and actor.id == target_user_id


def require_ai_usage_view(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.usage.view_own" in held
    return "ai.usage.view_all" in held


def require_ai_memory_view(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.memory.view_own" in held
    return "ai.memory.view_all" in held


def require_ai_memory_manage(actor, target_user_id: int) -> bool:
    held = set(effective_permissions(actor))
    if _is_self(actor, target_user_id):
        return "ai.memory.manage_own" in held
    return "ai.memory.manage_all" in held
```

- [ ] **Step 2: Views**

Create `app_ai/user_views.py` with `UserAIUsageView` and `UserAIPreferencesView`:

- `authentication_classes = [TenantBoundJWTStatelessAuthentication]`
- `rbac_decision = "authenticated_only"` (manual permission checks like `UserPointsView`)
- GET usage: parse year/month via `parse_year_month`, return `build_user_usage_detail(request.tenant, user_id, ...)`
- GET preferences: `preferences_to_dict(get_preferences_for_user(subject), user_id=...)`
- PATCH preferences: validate with serializer, `upsert_preferences(subject, **validated)`

- [ ] **Step 3: Serializer**

```python
class UserAIPreferencesSerializer(serializers.Serializer):
    response_language = serializers.ChoiceField(
        choices=UserAIPreferences.ResponseLanguage.choices, required=False
    )
    tone = serializers.ChoiceField(
        choices=UserAIPreferences.Tone.choices, required=False
    )
    verbosity = serializers.ChoiceField(
        choices=UserAIPreferences.Verbosity.choices, required=False
    )
    preferred_name = serializers.CharField(max_length=64, required=False, allow_blank=True)
```

- [ ] **Step 4: Register URLs in `app_auth/urls.py`**

```python
from app_ai.user_views import UserAIPreferencesView, UserAIUsageView

path("users/<int:user_id>/ai-usage", UserAIUsageView.as_view(), name="user-ai-usage"),
path("users/<int:user_id>/ai-preferences", UserAIPreferencesView.as_view(), name="user-ai-preferences"),
```

- [ ] **Step 5: API tests**

Test matrix in `app_ai/tests/test_user_ai_api.py`:

| Case | Expected |
| --- | --- |
| Self GET usage with `view_own` | 200 |
| Other GET usage without `view_all` | 403 |
| Self PATCH with `manage_own` | 200 |
| Other PATCH without `manage_all` | 403 |
| Invalid enum | 400 |

Run: `python manage.py test app_ai.tests.test_user_ai_api -v 2`

---

## Task 8: Frontend types + client API

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts`
- Create: `schedjuice-reimagined-fe/src/app/client-api/ai-user-preferences.ts`

- [ ] **Step 1: Types**

```typescript
import { z } from "zod";
import { aiUsageTrendPointSchema } from "@/types/ai-usage";

export const aiUserPreferencesSchema = z.object({
  user_id: z.number(),
  response_language: z.enum(["auto", "en", "my"]),
  tone: z.enum(["default", "formal", "casual"]),
  verbosity: z.enum(["default", "brief", "detailed"]),
  preferred_name: z.string(),
  updated_at: z.string().nullable(),
});

export const aiUserUsageDetailSchema = z.object({
  user_id: z.number(),
  year: z.number(),
  month: z.number(),
  month_summary: z.object({
    total_cost_usd: z.string(),
    total_tokens: z.number(),
    request_count: z.number(),
    by_feature: z.array(
      z.object({
        feature: z.string(),
        total_cost_usd: z.string(),
        total_tokens: z.number(),
        request_count: z.number(),
      }),
    ),
  }),
  trend: z.array(aiUsageTrendPointSchema),
});
```

- [ ] **Step 2: Client API**

```typescript
export async function fetchUserAiUsage(userId: number, year: number, month: number) { ... }
export async function fetchUserAiPreferences(userId: number) { ... }
export async function patchUserAiPreferences(userId: number, body: Partial<...>) { ... }
```

Use `axiosClient.get/patch(`users/${userId}/ai-usage`, { params: { year, month } })`.

---

## Task 9: Frontend visibility helpers + record section

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/ai/visibility.ts`
- Modify: `schedjuice-reimagined-fe/src/components/record/record-sections.ts`
- Create: `schedjuice-reimagined-fe/src/components/record/sections/record-ai.tsx`
- Create: `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx`
- Create: `schedjuice-reimagined-fe/src/components/users/ai/ai-memory-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: `visibility.ts`**

Mirror `src/lib/points/visibility.ts`:

```typescript
export function canViewAiSection({ subject, viewer }: ...): boolean {
  const perms = permissionsFor(viewer);
  const isSelf = viewer.id === subject.id;
  if (isSelf) {
    return perms.can("ai.usage.view_own") || perms.can("ai.memory.view_own");
  }
  return perms.can("ai.usage.view_all") || perms.can("ai.memory.view_all");
}

export function canViewAiUsage({ subject, viewer }: ...): boolean { ... }
export function canManageAiMemory({ subject, viewer }: ...): boolean { ... }
```

- [ ] **Step 2: Add `"ai"` to `RecordSectionId` and `RECORD_SECTIONS`**

```typescript
{
  id: "ai",
  label: "AI",
  visible: canViewAiSection,
},
```

- [ ] **Step 3: `RecordAi` component**

Props: `subject`, `viewer`, `userId`. Render two cards:

1. `AiUsagePanel` — if `canViewAiUsage`
2. `AiMemoryForm` — if `canViewAiMemory` (read-only when not manage)

Reuse `UsageTrendBars` from org AI usage. Month picker via `nuqs` `?date=` (same helper as org pages).

- [ ] **Step 4: Wire into user page**

```tsx
import { RecordAi } from "@/components/record/sections/record-ai";

{section === "ai" && user && account && (
  <RecordAi subject={user} viewer={account} userId={Number(id)} />
)}
```

- [ ] **Step 5: `/profile?section=ai` redirect**

In middleware or profile page: if path is `/profile` and `section=ai`, redirect to `/users/{accountId}?section=ai` (middleware already resolves profile → users/:id; ensure `section` query preserved).

---

## Task 10: Frontend tests

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/ai/__tests__/visibility.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/record/__tests__/record-sections.test.ts` (if exists) or add new test file

- [ ] **Step 1: Visibility tests**

```typescript
it("shows AI section for self with view_own", () => {
  expect(canViewAiSection({ subject: self, viewer: self })).toBe(true);
});
it("hides AI section for other user without view_all", () => { ... });
```

- [ ] **Step 2: Record sections includes ai id**

Run: `npm test -- visibility` from FE repo

---

## Task 11: End-to-end verification

- [ ] **Step 1: Telegram preference flow**

1. Link Telegram user with `ai.telegram_use`
2. Send: “can you speak in English only please”
3. Verify `UserAIPreferences.response_language == "en"` in DB
4. Send Burmese question — reply should be English
5. Send 6+ unrelated messages — preference still holds (beyond rolling window)

- [ ] **Step 2: Web preference flow**

1. PATCH `/users/{id}/ai-preferences` with `{ "verbosity": "brief" }`
2. POST `/ai/query` — inspect (mock/test) that system context includes “be brief”

- [ ] **Step 3: UI flow**

1. Open `/users/{ownId}?section=ai` as admin
2. Usage panel shows month totals
3. Memory form saves language change
4. Open another user's profile as manager — view works, edit works
5. Open another user's profile as teacher without `view_all` — AI section hidden

- [ ] **Step 4: Run full related test suites**

```bash
python manage.py test app_ai.tests.test_user_preferences app_ai.tests.test_set_ai_preferences_tool app_ai.tests.test_user_ai_api app_ai.tests.test_service_user_preferences -v 2
cd schedjuice-reimagined-fe && npm test -- visibility
```

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Typed preference model | Task 1 |
| System context injection (Telegram + web) | Tasks 2–3 |
| `set_ai_preferences` tool | Task 4 |
| Six RBAC permissions + matrix defaults | Task 5 |
| GET user ai-usage | Tasks 6–7 |
| GET/PATCH ai-preferences | Task 7 |
| User record AI section (Usage + Memory) | Task 9 |
| Chat + settings UI (C) | Tasks 4, 9 |
| Student not default granted | Task 5 |
| Out of scope items | Not in plan |

**Registry fix documented:** Task 4 `always_available` — required for READ-intent preference messages.

**Model location correction:** Task 1 uses `app_auth` instead of spec's `app_ai/models.py`.

---

## Execution handoff

**Plan saved to `docs/superpowers/plans/2026-06-27-ai-user-preferences.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement task-by-task in this session with checkpoints

Which approach do you want?
