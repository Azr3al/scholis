# Telegram AI Context, Reactions & Tenant AI Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram DM conversation memory (reply + rolling window), random ack reactions, per-tenant AI config on `Organization`, and a dedicated AI settings page — extending the existing `run_ai_query` flow.

**Architecture:** Consolidate tenant AI knobs onto `Organization` (migrate from `AITenantBudget`). Extend `GeminiClient`/`AIService` with `system_context` and multi-turn `history`. Persist Telegram exchanges in tenant-scoped `TelegramAIExchange`. React synchronously in `binding.py`, enqueue AI work async. Expose AI fields via a dedicated API + FE page, not org profile edit.

**Tech Stack:** Django, DRF, django-tenant-schemas, django-q, Google Gemini (`google-genai`), Telegram Bot API 7.0+, Next.js, React Hook Form, Zod, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-27-telegram-ai-context-design.md`

**Repos:** `schedjuice-reimagined-be` (primary), `schedjuice-reimagined-fe` (AI settings page)

---

## File map

| File | Responsibility |
| --- | --- |
| `app_organization/models.py` | New AI columns on `Organization` |
| `app_organization/migrations/0064_*.py` | Schema + data migration from `AITenantBudget` |
| `app_ai/tenant_context.py` | `build_system_context(org)`, `resolve_ai_model(org)`, etc. |
| `app_ai/quota.py` | Read budget from org fields |
| `app_ai/client.py` | `history`, `system_context`, `max_iterations` on Gemini call |
| `app_ai/service.py` | Pass-through new params |
| `app_ai/views.py` | Inject org system context on web queries |
| `app_telegram/config.py` | `TELEGRAM_AI_ACK_REACTIONS` constant |
| `app_telegram/client.py` | `set_message_reaction`, `send_message(..., reply_to_message_id=)` |
| `app_telegram/models.py` | `TelegramAIExchange` |
| `app_telegram/context.py` | `build_telegram_ai_history(...)` |
| `app_telegram/binding.py` | Reaction + context + enriched task enqueue |
| `app_telegram/tasks.py` | History-aware AI run + exchange persistence |
| `app_organization/serializers.py` | `OrganizationAISettingsSerializer` |
| `app_organization/views.py` | `OrganizationAISettingsView` |
| `app_organization/urls.py` | Route registration |
| `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts` | Zod schema |
| `schedjuice-reimagined-fe/src/app/client-api/ai-settings.ts` | GET/PATCH helpers |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-settings/page.tsx` | Settings UI |

---

## Conventions for every task

- **Tests:** Django `TestCase` under `app_telegram/tests/`, `app_ai/tests/`, `app_organization/tests/`.
  - `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")`
  - `@override_settings(RBAC_ENFORCE="log_only")` where RBAC involved
  - `setUpTestData`: `migrate_schemas` + `load-data` with `schema_name = "xschedjuice"`
  - Tenant ORM: `schema_context(self.schema_name)`; public org: `schema_context(get_public_schema_name())`
- **Run a test:** `python manage.py test app_telegram.tests.test_ai_context.TelegramContextBuilderTests.test_rolling_window -v 2`
- **Migrations:** `python manage.py makemigrations app_organization app_telegram` then `python manage.py migrate_schemas --shared` and `python manage.py migrate_schemas`
- **FE tests:** `npm test -- organization-ai-settings` (if adding unit tests for schema)
- **Commits:** Repo has `no-git-commits` rule — **do not `git commit`** unless the user asks. Stage + propose message only.
- **No real network in tests:** mock `TelegramClient`, `requests`, Gemini client.

---

## Task 1: Organization AI fields + budget migration

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_organization/migrations/0064_organization_ai_settings.py`
- Test: `app_organization/tests/test_ai_settings.py`

- [ ] **Step 1: Write failing test for org AI defaults**

Create `app_organization/tests/test_ai_settings.py`:

```python
import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class OrganizationAISettingsFieldsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_new_org_has_ai_defaults(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        self.assertTrue(org.is_ai_enabled)
        self.assertEqual(org.ai_max_context_turns, 5)
        self.assertEqual(org.ai_max_tool_iterations, 5)
        self.assertEqual(org.ai_school_context, "")
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_organization.tests.test_ai_settings -v 2`
Expected: FAIL — `Organization` has no attribute `is_ai_enabled`.

- [ ] **Step 3: Add fields to `Organization`**

In `app_organization/models.py`, after the Telegram block (~line 186), add:

```python
    # AI assistant (tenant-wide)
    is_ai_enabled = models.BooleanField(default=True)
    ai_default_model = models.CharField(max_length=128, null=True, blank=True)
    ai_max_context_turns = models.PositiveSmallIntegerField(default=5)
    ai_max_tool_iterations = models.PositiveSmallIntegerField(default=5)
    ai_school_context = models.TextField(blank=True, default="")
    ai_assistant_instructions = models.TextField(blank=True, default="")
    ai_monthly_usd_limit = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    ai_monthly_token_limit = models.PositiveBigIntegerField(null=True, blank=True)
    ai_hard_enforce = models.BooleanField(default=False)
    ai_alert_thresholds = models.JSONField(default=list, blank=True)
    ai_budget_active = models.BooleanField(default=True)
```

- [ ] **Step 4: Create migration with data copy from `AITenantBudget`**

Run: `python manage.py makemigrations app_organization --name organization_ai_settings`

Edit the generated migration to add a `RunPython` after `AddField` operations:

```python
def copy_ai_budget_to_org(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    AITenantBudget = apps.get_model("app_ai", "AITenantBudget")
    for budget in AITenantBudget.objects.select_related("tenant").all():
        org = budget.tenant
        Organization.objects.filter(pk=org.pk).update(
            ai_monthly_usd_limit=budget.monthly_usd_limit,
            ai_monthly_token_limit=budget.monthly_token_limit,
            ai_hard_enforce=budget.hard_enforce,
            ai_alert_thresholds=budget.alert_thresholds or [],
            ai_budget_active=budget.is_active,
        )


def noop(apps, schema_editor):
    pass
```

Add to `operations`:

```python
migrations.RunPython(copy_ai_budget_to_org, noop),
```

- [ ] **Step 5: Apply migrations**

Run:
```bash
python manage.py migrate_schemas --shared
python manage.py migrate_schemas
```

- [ ] **Step 6: Re-run test — expect PASS**

Run: `python manage.py test app_organization.tests.test_ai_settings -v 2`

---

## Task 2: Tenant context helper + quota refactor

**Files:**
- Create: `app_ai/tenant_context.py`
- Modify: `app_ai/quota.py`
- Test: `app_ai/tests/test_tenant_context.py`, `app_ai/tests/test_quota_org_fields.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_tenant_context.py`:

```python
from django.test import TestCase, override_settings

from app_ai.tenant_context import build_system_context, resolve_ai_model, resolve_max_tool_iterations
from app_organization.models import Organization


class TenantContextTests(TestCase):
    def test_build_system_context_includes_name_and_school_blurb(self):
        org = Organization(name="Demo School", ai_school_context="K-12 in Yangon.")
        text = build_system_context(org)
        self.assertIn("Demo School", text)
        self.assertIn("K-12 in Yangon.", text)

    @override_settings(AI_DEFAULT_MODEL="gemini-fallback")
    def test_resolve_model_uses_org_override(self):
        org = Organization(ai_default_model="gemini-override")
        self.assertEqual(resolve_ai_model(org), "gemini-override")

    @override_settings(AI_DEFAULT_MODEL="gemini-fallback")
    def test_resolve_model_falls_back_to_settings(self):
        org = Organization(ai_default_model=None)
        self.assertEqual(resolve_ai_model(org), "gemini-fallback")
```

Create `app_ai/tests/test_quota_org_fields.py`:

```python
from decimal import Decimal
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.quota import get_tenant_budget
from app_organization.models import Organization


class QuotaOrgFieldsTests(TestCase):
    def test_reads_budget_from_organization(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.first()
            if org is None:
                self.skipTest("no org")
            org.ai_monthly_usd_limit = Decimal("99.0000")
            org.ai_hard_enforce = True
            org.ai_budget_active = True
            org.save(update_fields=["ai_monthly_usd_limit", "ai_hard_enforce", "ai_budget_active"])
            usd, tokens, hard, thresholds, active = get_tenant_budget(org)
        self.assertEqual(usd, Decimal("99.0000"))
        self.assertTrue(hard)
        self.assertTrue(active)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_ai.tests.test_tenant_context app_ai.tests.test_quota_org_fields -v 2`

- [ ] **Step 3: Implement `app_ai/tenant_context.py`**

```python
"""Per-tenant AI prompt and limit resolution."""
from __future__ import annotations

from django.conf import settings

from app_organization.models import Organization

_DEFAULT_INSTRUCTIONS = (
    "Be concise and accurate. Use available tools to look up live data. "
    "Do not invent records."
)


def build_system_context(org: Organization) -> str:
    school = (org.ai_school_context or "").strip() or "No additional school context provided."
    instructions = (org.ai_assistant_instructions or "").strip() or _DEFAULT_INSTRUCTIONS
    return (
        f"You are the Schedjuice assistant for {org.name}.\n\n"
        f"School context:\n{school}\n\n"
        f"Instructions:\n{instructions}"
    )


def resolve_ai_model(org: Organization) -> str:
    return (org.ai_default_model or "").strip() or getattr(
        settings, "AI_DEFAULT_MODEL", "gemini-3.1-flash-lite"
    )


def resolve_max_tool_iterations(org: Organization) -> int:
    val = getattr(org, "ai_max_tool_iterations", None)
    if val is None:
        return int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 5))
    return int(val)


def resolve_max_context_turns(org: Organization) -> int:
    return max(1, int(getattr(org, "ai_max_context_turns", 5) or 5))
```

- [ ] **Step 4: Refactor `app_ai/quota.py`**

Replace `AITenantBudget` lookup in `get_tenant_budget()` with org fields:

```python
def get_tenant_budget(tenant: Organization) -> tuple[
    Decimal | None, Decimal | None, bool, list[float], bool
]:
    if tenant.ai_budget_active:
        thresholds = tenant.ai_alert_thresholds or []
        return (
            tenant.ai_monthly_usd_limit,
            tenant.ai_monthly_token_limit,
            tenant.ai_hard_enforce,
            [float(x) for x in thresholds] if thresholds else [0.5, 0.8, 1.0],
            True,
        )
    usd, tokens, hard, thresholds = _default_budget()
    return usd, tokens, hard, thresholds, True
```

Remove `AITenantBudget` import and `schema_context` lookup for budget row. Keep `_default_budget()` for when org limit fields are null.

Update `assert_quota_allows` to use org null fields with `_default_budget()` fallback for limits (same semantics as before).

- [ ] **Step 5: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_tenant_context app_ai.tests.test_quota_org_fields -v 2`

---

## Task 3: Extend Gemini client + AIService for history and system context

**Files:**
- Modify: `app_ai/client.py`
- Modify: `app_ai/service.py`
- Modify: `app_ai/views.py`
- Test: `app_ai/tests/test_client_history.py`

- [ ] **Step 1: Write failing test**

Create `app_ai/tests/test_client_history.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app_ai.client import GeminiClient


@override_settings(GEMINI_API_KEY="test-key")
class GeminiHistoryTests(TestCase):
    @patch("app_ai.client.GeminiClient._build_client")
    def test_history_prepended_before_current_prompt(self, mock_build):
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_response = MagicMock()
        mock_response.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="ok", function_call=None)]), finish_reason="STOP")]
        mock_response.usage_metadata = None
        mock_client.models.generate_content.return_value = mock_response

        client = GeminiClient()
        client.generate_with_tools(
            "current question",
            user=MagicMock(id=1),
            history=[
                {"role": "user", "text": "first"},
                {"role": "model", "text": "answer one"},
            ],
            system_context="You assist Demo School.",
            feature="test",
        )

        call_kwargs = mock_client.models.generate_content.call_args.kwargs
        config = call_kwargs["config"]
        self.assertEqual(config.system_instruction, "You assist Demo School.")
        contents = call_kwargs["contents"]
        self.assertEqual(contents[0].role, "user")
        self.assertEqual(contents[0].parts[0].text, "first")
        self.assertEqual(contents[1].role, "model")
        self.assertEqual(contents[-1].role, "user")
        self.assertEqual(contents[-1].parts[0].text, "current question")
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_client_history -v 2`

- [ ] **Step 3: Update `GeminiClient.generate_with_tools` signature and body**

Add parameters:

```python
def generate_with_tools(
    self,
    prompt: str,
    *,
    user,
    tools: list[Tool] | None = None,
    model: str | None = None,
    feature: str = "ai_query",
    system_context: str = "",
    history: list[dict[str, str]] | None = None,
    max_iterations: int | None = None,
) -> AIResult:
```

Before the existing `contents = [...]` block, build history:

```python
        contents: list[Any] = []
        for turn in history or []:
            role = turn.get("role", "user")
            text = (turn.get("text") or "").strip()
            if not text:
                continue
            gemini_role = "model" if role == "model" else "user"
            contents.append(
                types.Content(role=gemini_role, parts=[types.Part.from_text(text=text)])
            )
        contents.append(
            types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
        )
```

Update config:

```python
        loop_limit = max_iterations if max_iterations is not None else self.max_iterations
        gen_config = types.GenerateContentConfig(tools=gemini_tools)
        if system_context:
            gen_config.system_instruction = system_context
```

Replace `while iterations < self.max_iterations:` with `while iterations < loop_limit:`.

- [ ] **Step 4: Update `AIService.run`**

```python
    def run(
        self,
        prompt: str,
        user,
        *,
        tools: list[Tool] | None = None,
        model: str | None = None,
        feature: str = "ai_query",
        system_context: str = "",
        history: list[dict[str, str]] | None = None,
        max_iterations: int | None = None,
    ) -> AIResult:
        tenant = self._current_tenant()
        if tenant is not None:
            assert_quota_allows(tenant)
            if not tenant.is_ai_enabled:
                raise RuntimeError("AI is disabled for this organization.")
        selected = tools or list_tools()
        resolved_model = model
        resolved_iterations = max_iterations
        if tenant is not None:
            from app_ai.tenant_context import (
                build_system_context,
                resolve_ai_model,
                resolve_max_tool_iterations,
            )
            if not system_context:
                system_context = build_system_context(tenant)
            if resolved_model is None:
                resolved_model = resolve_ai_model(tenant)
            if resolved_iterations is None:
                resolved_iterations = resolve_max_tool_iterations(tenant)
        return self.client.generate_with_tools(
            prompt,
            user=user,
            tools=selected,
            model=resolved_model,
            feature=feature,
            system_context=system_context,
            history=history,
            max_iterations=resolved_iterations,
        )
```

- [ ] **Step 5: Update `AIQueryView`** — no code change needed if `AIService.run` auto-injects tenant context; verify existing test still passes.

- [ ] **Step 6: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_client_history -v 2`

---

## Task 4: TelegramClient — reactions and reply threading

**Files:**
- Modify: `app_telegram/config.py`
- Modify: `app_telegram/client.py`
- Test: `app_telegram/tests/test_client_reactions.py`

- [ ] **Step 1: Add reaction constant**

In `app_telegram/config.py`:

```python
TELEGRAM_AI_ACK_REACTIONS = ["🤔", "👀", "🧐", "🔍", "💭"]
```

- [ ] **Step 2: Write failing test**

Create `app_telegram/tests/test_client_reactions.py`:

```python
from unittest.mock import patch

from django.test import TestCase

from app_telegram.client import TelegramClient


class TelegramClientReactionTests(TestCase):
    @patch.object(TelegramClient, "_call")
    def test_set_message_reaction(self, mock_call):
        org = type("Org", (), {"get_telegram_bot_token": lambda self: "tok"})()
        client = TelegramClient(org)
        client.set_message_reaction(123, 456, "👀")
        mock_call.assert_called_once_with(
            "setMessageReaction",
            {
                "chat_id": 123,
                "message_id": 456,
                "reaction": [{"type": "emoji", "emoji": "👀"}],
            },
        )

    @patch.object(TelegramClient, "_call")
    def test_send_message_with_reply(self, mock_call):
        org = type("Org", (), {"get_telegram_bot_token": lambda self: "tok"})()
        client = TelegramClient(org)
        client.send_message(123, "hi", reply_to_message_id=456)
        mock_call.assert_called_once()
        payload = mock_call.call_args[0][1]
        self.assertEqual(payload["reply_to_message_id"], 456)
```

- [ ] **Step 3: Implement client methods**

In `app_telegram/client.py`:

```python
    def set_message_reaction(
        self, chat_id: int, message_id: int, emoji: str, *, is_big: bool = False
    ) -> Any:
        return self._call(
            "setMessageReaction",
            {
                "chat_id": chat_id,
                "message_id": message_id,
                "reaction": [{"type": "emoji", "emoji": emoji}],
                "is_big": is_big,
            },
        )

    def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str = "HTML",
        *,
        reply_to_message_id: int | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_to_message_id is not None:
            payload["reply_to_message_id"] = reply_to_message_id
        return self._call("sendMessage", payload)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `python manage.py test app_telegram.tests.test_client_reactions -v 2`

---

## Task 5: TelegramAIExchange model

**Files:**
- Modify: `app_telegram/models.py`
- Create: migration via `makemigrations app_telegram`
- Test: `app_telegram/tests/test_ai_exchange_model.py`

- [ ] **Step 1: Write failing test**

```python
import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_telegram.models import TelegramAIExchange


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramAIExchangeModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_create_exchange(self):
        with schema_context(self.schema_name):
            user = User.objects.first()
            ex = TelegramAIExchange.objects.create(
                user=user,
                chat_id=9001,
                user_message_id=100,
                bot_message_id=101,
                user_text="find admin",
                bot_text="Found admin.",
            )
            self.assertEqual(ex.user_text, "find admin")
```

- [ ] **Step 2: Add model to `app_telegram/models.py`**

```python
class TelegramAIExchange(BaseModel):
    """One user question + bot answer in a Telegram DM AI session."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    chat_id = models.BigIntegerField(db_index=True)
    user_message_id = models.BigIntegerField()
    bot_message_id = models.BigIntegerField(null=True, blank=True)
    user_text = models.TextField()
    bot_text = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(
                fields=["user", "chat_id", "-created_at"],
                name="ix_tg_ai_ex_user_chat_created",
            ),
        ]
```

- [ ] **Step 3: Migrate and run test**

Run:
```bash
python manage.py makemigrations app_telegram
python manage.py migrate_schemas
python manage.py test app_telegram.tests.test_ai_exchange_model -v 2
```

---

## Task 6: Context builder (`app_telegram/context.py`)

**Files:**
- Create: `app_telegram/context.py`
- Test: `app_telegram/tests/test_ai_context.py`

- [ ] **Step 1: Write failing tests for rolling window and reply chain**

Create `app_telegram/tests/test_ai_context.py` with tests:

1. `test_rolling_window_returns_last_n_exchanges` — create 7 exchanges, N=5 → 5 oldest-first user/model pairs (10 turns)
2. `test_reply_chain_merges_with_window` — reply to bot message from exchange 2, include chain + window deduped
3. `test_unknown_reply_falls_back_to_window_only`

- [ ] **Step 2: Implement `app_telegram/context.py`**

```python
"""Assemble multi-turn history for Telegram DM AI queries."""
from __future__ import annotations

from app_ai.tenant_context import resolve_max_context_turns
from app_telegram.models import TelegramAIExchange


def _exchange_to_turns(ex: TelegramAIExchange) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = [{"role": "user", "text": ex.user_text}]
    if ex.bot_text:
        turns.append({"role": "model", "text": ex.bot_text})
    return turns


def _find_exchange_by_message_id(user, chat_id: int, message_id: int):
    return (
        TelegramAIExchange.objects.filter(user=user, chat_id=chat_id)
        .filter(
            models.Q(user_message_id=message_id) | models.Q(bot_message_id=message_id)
        )
        .first()
    )


def build_telegram_ai_history(*, message: dict, user, org) -> list[dict[str, str]]:
    from django.db import models

    chat_id = int((message.get("chat") or {}).get("id") or 0)
    n = resolve_max_context_turns(org)

    recent = list(
        TelegramAIExchange.objects.filter(user=user, chat_id=chat_id)
        .order_by("-created_at")[:n]
    )
    recent.reverse()

    ordered: list[TelegramAIExchange] = []
    seen_user_ids: set[int] = set()

    reply_to = message.get("reply_to_message") or {}
    anchor_id = reply_to.get("message_id")
    if anchor_id is not None:
        chain: list[TelegramAIExchange] = []
        current_id = int(anchor_id)
        for _ in range(n * 2):
            ex = _find_exchange_by_message_id(user, chat_id, current_id)
            if ex is None:
                break
            chain.append(ex)
            parent = None
            if ex.bot_message_id == current_id:
                prior = (
                    TelegramAIExchange.objects.filter(
                        user=user, chat_id=chat_id, bot_message_id=current_id
                    )
                    .order_by("-created_at")
                    .first()
                )
                current_id = prior.user_message_id if prior else None
            else:
                current_id = None
            if current_id is None:
                break
        chain.reverse()
        for ex in chain:
            if ex.user_message_id not in seen_user_ids:
                ordered.append(ex)
                seen_user_ids.add(ex.user_message_id)

    for ex in recent:
        if ex.user_message_id not in seen_user_ids:
            ordered.append(ex)
            seen_user_ids.add(ex.user_message_id)
        if len(ordered) >= n:
            break

    ordered = ordered[-n:]
    history: list[dict[str, str]] = []
    for ex in ordered:
        history.extend(_exchange_to_turns(ex))
    return history
```

> **Note:** Simplify reply-chain walk: Telegram `reply_to_message` on the user's follow-up points at the **bot's answer message**. Walk: find exchange by `bot_message_id == anchor_id`; stop (no need to walk further for v1 unless user replies to their own prior message — handle that by matching `user_message_id` too).

Refine chain walk:

```python
    if anchor_id is not None:
        ex = _find_exchange_by_message_id(user, chat_id, int(anchor_id))
        if ex and ex.user_message_id not in seen_user_ids:
            ordered.append(ex)
            seen_user_ids.add(ex.user_message_id)
```

For v1, anchoring to the replied exchange + rolling window merge is sufficient per spec.

- [ ] **Step 3: Run tests — expect PASS**

Run: `python manage.py test app_telegram.tests.test_ai_context -v 2`

---

## Task 7: Wire binding + tasks (reactions, history, persistence)

**Files:**
- Modify: `app_telegram/binding.py`
- Modify: `app_telegram/tasks.py`
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Update failing tests in `test_ai_query.py`**

Add tests:

```python
@patch("app_telegram.binding.random.choice", return_value="👀")
@patch("app_telegram.binding.TelegramClient")
@patch("app_telegram.tasks.run_ai_query")
def test_reaction_before_enqueue(self, mock_task, MockClient, _mock_choice):
    ...
    MockClient.return_value.set_message_reaction.assert_called_once_with(
        self.admin.telegram_chat_id,
        ANY,  # message_id from payload
        "👀",
    )
    mock_task.delay.assert_called_once()
    # reaction call order before delay
```

Update `_private_message` helper to include `"message_id": 42`.

Update `test_linked_admin_enqueues_ai_query` to expect new kwargs: `history`, `user_message_id`, etc.

- [ ] **Step 2: Update `_handle_free_text_query` in `binding.py`**

```python
import random
import logging

from app_telegram.config import TELEGRAM_AI_ACK_REACTIONS

def _handle_free_text_query(tenant, message: dict, text: str, chat: dict) -> None:
    ...
    if not tenant.is_ai_enabled:
        _reply(tenant, chat["id"], "AI assistant is disabled for your school.")
        return

    user_message_id = message.get("message_id")
    if user_message_id is not None:
        try:
            emoji = random.choice(TELEGRAM_AI_ACK_REACTIONS)
            TelegramClient(tenant).set_message_reaction(chat["id"], user_message_id, emoji)
        except Exception:
            logger.warning("telegram: ack reaction failed", exc_info=True)

    from app_telegram.context import build_telegram_ai_history

    history = build_telegram_ai_history(message=message, user=user, org=tenant)

    run_ai_query.delay(
        user.id,
        tenant.schema_name,
        chat_id=chat["id"],
        prompt=text,
        history=history,
        user_message_id=user_message_id,
    )
```

Pass `tenant` as the org — in webhook handler, `tenant` is the Organization instance (verify in `views.py`; it is the org object with schema).

- [ ] **Step 3: Update `run_ai_query` task**

```python
@django_q_task
@tenant_async(entity=User)
def run_ai_query(
    user,
    tenant,
    *,
    chat_id: int,
    prompt: str,
    history: list | None = None,
    user_message_id: int | None = None,
):
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization
    from app_telegram.models import TelegramAIExchange

    client = TelegramClient(tenant)
    with schema_context(get_public_schema_name()):
        org = Organization.objects.get(schema_name=tenant.schema_name)

    try:
        result = AIService().run(
            prompt,
            user,
            feature="telegram_query",
            history=history or [],
        )
        reply_text = result.text or "I couldn't find an answer."
        sent = client.send_message(
            chat_id,
            reply_text,
            reply_to_message_id=user_message_id,
        )
        bot_message_id = (sent or {}).get("message_id")
        TelegramAIExchange.objects.create(
            user=user,
            chat_id=chat_id,
            user_message_id=user_message_id or 0,
            bot_message_id=bot_message_id,
            user_text=prompt,
            bot_text=reply_text,
        )
    except AIQuotaExceeded:
        client.send_message(chat_id, "...", reply_to_message_id=user_message_id)
    ...
```

Apply same `reply_to_message_id` on error replies. Do **not** persist exchange on error paths (per spec).

- [ ] **Step 4: Run telegram AI tests**

Run: `python manage.py test app_telegram.tests.test_ai_query -v 2`

---

## Task 8: AI settings API

**Files:**
- Modify: `app_organization/serializers.py`
- Modify: `app_organization/views.py`
- Modify: `app_organization/urls.py`
- Test: `app_organization/tests/test_ai_settings_api.py`

- [ ] **Step 1: Write failing API test**

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class OrganizationAISettingsApiTests(TestCase):
    ...
    def test_get_ai_settings(self):
        resp = self.client.get(f"/api/v1/organizations/{self.org.id}/ai-settings/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("is_ai_enabled", resp.json()["data"])

    def test_patch_validates_context_turns(self):
        resp = self.client.patch(
            f"/api/v1/organizations/{self.org.id}/ai-settings/",
            {"ai_max_context_turns": 99},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
```

Use existing test client auth pattern from `app_organization/tests/`.

- [ ] **Step 2: Add serializer**

In `app_organization/serializers.py`:

```python
class OrganizationAISettingsSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)

    class Meta:
        model = models.Organization
        fields = [
            "name",
            "is_ai_enabled",
            "ai_default_model",
            "ai_max_context_turns",
            "ai_max_tool_iterations",
            "ai_school_context",
            "ai_assistant_instructions",
            "ai_monthly_usd_limit",
            "ai_monthly_token_limit",
            "ai_hard_enforce",
            "ai_alert_thresholds",
            "ai_budget_active",
        ]
        read_only_fields = ["name"]

    def validate_ai_max_context_turns(self, value):
        if not 1 <= value <= 20:
            raise serializers.ValidationError("Must be between 1 and 20.")
        return value

    def validate_ai_max_tool_iterations(self, value):
        if not 1 <= value <= 10:
            raise serializers.ValidationError("Must be between 1 and 10.")
        return value

    def validate_ai_school_context(self, value):
        if len(value or "") > 2000:
            raise serializers.ValidationError("Max 2000 characters.")
        return value

    def validate_ai_assistant_instructions(self, value):
        if len(value or "") > 2000:
            raise serializers.ValidationError("Max 2000 characters.")
        return value
```

- [ ] **Step 3: Add view**

```python
class OrganizationAISettingsView(RBACDetailsView):
    name = "Organization AI settings"
    model = models.Organization
    serializer = serializers.OrganizationAISettingsSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "org.configure", "PATCH": "org.configure"}

    def patch(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        ser = self.get_serializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return self.send_response(True, "bad_request", {"details": ser.errors}, status=400)
        with schema_context(get_public_schema_name()):
            ser.save()
        return self.send_response(False, "updated", {"data": ser.data}, status=200)
```

- [ ] **Step 4: Register URL**

In `app_organization/urls.py`:

```python
    path(
        "organizations/<int:obj_id>/ai-settings",
        views.OrganizationAISettingsView.as_view(),
        name="organization-ai-settings",
    ),
```

- [ ] **Step 5: Run API tests — expect PASS**

Run: `python manage.py test app_organization.tests.test_ai_settings_api -v 2`

---

## Task 9: Frontend AI settings page

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts`
- Create: `schedjuice-reimagined-fe/src/app/client-api/ai-settings.ts`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-settings/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/organizations/profile/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/org-route-access.ts` (exclude `/organizations/ai-settings` from platform path if needed)

- [ ] **Step 1: Add Zod schema**

`organization-ai-settings.ts`:

```typescript
import * as z from "zod";

export const organizationAiSettingsSchema = z.object({
  name: z.string(),
  is_ai_enabled: z.boolean().describe("Enable AI assistant"),
  ai_default_model: z.string().nullable().optional().describe("Default model"),
  ai_max_context_turns: z.number().min(1).max(20).describe("Conversation memory (turns)"),
  ai_max_tool_iterations: z.number().min(1).max(10).describe("Max tool call rounds"),
  ai_school_context: z.string().max(2000).describe("School context"),
  ai_assistant_instructions: z.string().max(2000).describe("Assistant instructions"),
  ai_monthly_usd_limit: z.number().nullable().optional().describe("Monthly USD limit"),
  ai_monthly_token_limit: z.number().nullable().optional().describe("Monthly token limit"),
  ai_hard_enforce: z.boolean().describe("Hard enforce limits"),
  ai_alert_thresholds: z.array(z.number()).describe("Alert thresholds"),
  ai_budget_active: z.boolean().describe("Budget tracking active"),
});

export type OrganizationAiSettings = z.infer<typeof organizationAiSettingsSchema>;
```

- [ ] **Step 2: Add API helpers**

`ai-settings.ts`:

```typescript
import { axiosClient } from "@/lib/api";
import { OrganizationAiSettings } from "@/types/organization-ai-settings";

export async function fetchAiSettings(orgId: number | string) {
  const res = await axiosClient.get(`organizations/${orgId}/ai-settings`);
  return res.data.data as OrganizationAiSettings;
}

export async function patchAiSettings(
  orgId: number | string,
  body: Partial<OrganizationAiSettings>,
) {
  const res = await axiosClient.patch(`organizations/${orgId}/ai-settings`, body);
  return res.data.data as OrganizationAiSettings;
}
```

- [ ] **Step 3: Build settings page**

Create `organizations/ai-settings/page.tsx` following org profile edit patterns:

- `useTenant()` for org id
- `useQuery` → `fetchAiSettings`
- `useForm` + `zodResolver(organizationAiSettingsSchema.omit({ name: true }))` for editable fields
- Four `Card` sections: General, School context, Assistant behavior, Budget & limits
- `Textarea` for context/instructions fields
- Save button → `patchAiSettings` mutation → toast on success
- `BackButton` to `/organizations/profile`

- [ ] **Step 4: Add link on org profile hub**

In `organizations/profile/page.tsx`, next to Theme / Edit:

```tsx
<Link href="/organizations/ai-settings">
  <Button variant="outline">AI settings</Button>
</Link>
```

- [ ] **Step 5: Manual smoke test**

1. Log in as org admin → `/organizations/ai-settings`
2. Set school context → Save → reload → value persists
3. Confirm fields are **not** on `/organizations/profile/edit`

---

## Task 10: Cleanup + full test sweep

**Files:**
- Modify: `app_ai/admin.py` (optional note on deprecated `AITenantBudget`)
- Modify: `docs/superpowers/specs/2026-06-27-telegram-ai-context-design.md` (status → implemented pending)

- [ ] **Step 1: Run full backend test suites**

```bash
python manage.py test app_telegram app_ai app_organization.tests.test_ai_settings app_organization.tests.test_ai_settings_api -v 2
```

Expected: all PASS

- [ ] **Step 2: Verify webhook path manually (staging)**

1. Link Telegram account
2. Send "find staff named admin" → see random ack emoji on message
3. Reply to bot answer with follow-up → bot uses context
4. Disable `is_ai_enabled` in AI settings → send message → disabled reply

- [ ] **Step 3: Stage changes (no commit unless user asks)**

```bash
git add app_organization app_ai app_telegram schedjuice-reimagined-fe/src/types/organization-ai-settings.ts schedjuice-reimagined-fe/src/app/client-api/ai-settings.ts schedjuice-reimagined-fe/src/app/\(internal\)/organizations/ai-settings docs/superpowers/
```

Proposed commit message:
```
feat: Telegram AI context, ack reactions, and tenant AI settings page
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Random ack reactions (🤔👀🧐🔍💭), permanent | Task 4, 7 |
| Rolling N=5 context + reply anchor | Task 5, 6, 7 |
| Org AI fields + AITenantBudget migration | Task 1, 2 |
| System prompt from school context | Task 2, 3 |
| Gemini history + system_instruction | Task 3 |
| Bot reply as Telegram reply | Task 4, 7 |
| `is_ai_enabled` gate | Task 3, 7 |
| Dedicated AI settings API | Task 8 |
| AI settings FE page (settings only) | Task 9 |
| Quota reads org fields | Task 2 |
| Web AIQueryView gets org context | Task 3 |
| Error handling table | Task 7 |
| Groups deferred | N/A |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-27-telegram-ai-context.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
