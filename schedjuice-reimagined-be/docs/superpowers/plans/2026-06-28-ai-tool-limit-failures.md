# AI Tool-Limit Failures Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a platform-internal **Tool limit failures** tab under AI Usage so operators can see which Telegram user questions exhausted the tool-call loop, with ongoing live instrumentation and optional historical backfill.

**Architecture:** Add public-schema `AIRequestLog` (one row per user turn). Extend `GeminiClient`/`AIService` to set `outcome=tool_limit_exceeded` and write session logs. Expose paginated failures APIs reusing `ai.usage.view`. FE adds tabbed routes under existing AI Usage pages.

**Tech Stack:** Django/DRF, django-tenant-schemas, Next.js App Router, TanStack Query, Zod, nuqs, shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-28-ai-tool-limit-failures-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/models.py` | Add `AIRequestLog` model |
| `app_ai/migrations/0002_airequestlog.py` | Migration (generated) |
| `app_ai/admin.py` | Register `AIRequestLogAdmin` |
| `app_ai/client.py` | Extend `AIResult`; tool-limit outcome + token/latency aggregation |
| `app_ai/request_log.py` | `record_request_log()`, text truncation helper |
| `app_ai/service.py` | Write session log on every `run()` completion |
| `app_ai/reporting.py` | `build_failures_list()`, user name resolution |
| `app_ai/usage_views.py` | `PlatformAIUsageFailuresView` |
| `app_ai/urls.py` | `platform/ai-usage/failures` |
| `app_organization/views.py` | `OrganizationAIUsageFailuresView` |
| `app_organization/urls.py` | `organizations/<id>/ai-usage/failures` |
| `app_ai/management/commands/backfill_ai_request_logs_from_telegram.py` | Historical backfill |
| `app_ai/tests/test_request_log.py` | Model + writer tests |
| `app_ai/tests/test_client_tool_limit.py` | Tool-limit outcome unit tests |
| `app_ai/tests/test_service_request_log.py` | AIService integration tests |
| `app_ai/tests/test_failures_reporting.py` | `build_failures_list` tests |
| `app_ai/tests/test_failures_api.py` | API permission + pagination tests |
| `app_ai/tests/test_backfill_request_logs.py` | Backfill command tests |
| `schedjuice-reimagined-fe/src/types/ai-usage.ts` | Failures Zod schemas |
| `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts` | Fetch helpers |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/ai-usage-tabs.tsx` | Overview / Failures tab links |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/failures-table.tsx` | Shared failures table + row expand |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/failures/page.tsx` | Platform overview failures |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/[id]/ai-usage/failures/page.tsx` | Org-scoped failures |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | `/organizations/ai-usage/failures` rule |
| `schedjuice-reimagined-fe/src/config/__tests__/route-permissions.test.ts` | Route test |
| `schedjuice-reimagined-fe/src/lib/__tests__/org-route-access.test.ts` | Already covered via prefix |

---

## Conventions

- **BE tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="enforce")`, `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData` (copy from `app_ai/tests/test_usage_api.py`).
- **Run all BE tests for this feature:**
  `python manage.py test app_ai.tests.test_request_log app_ai.tests.test_client_tool_limit app_ai.tests.test_service_request_log app_ai.tests.test_failures_reporting app_ai.tests.test_failures_api app_ai.tests.test_backfill_request_logs -v 2`
- **Run FE tests:** `npm test -- route-permissions org-route-access`
- **Do not commit** unless user asks (repo rule).

---

## Task 1: `AIRequestLog` model

**Files:**
- Modify: `app_ai/models.py`
- Modify: `app_ai/admin.py`
- Create: `app_ai/migrations/0002_airequestlog.py` (via `makemigrations`)
- Create: `app_ai/tests/test_request_log.py`

- [ ] **Step 1: Write the failing model test**

Add to `app_ai/tests/test_request_log.py`:

```python
import unittest
from datetime import datetime, timezone

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AIRequestLogModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name="xschedjuice").first()

    def test_create_tool_limit_row(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                channel_key="telegram:123",
                prompt="List every student in every course",
                response_text="I could not complete that request within the tool limit.",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
                model="gemini-test",
                total_tokens=1000,
                latency_ms=500,
                source=AIRequestLog.Source.LIVE,
            )
        self.assertEqual(row.outcome, "tool_limit_exceeded")
        self.assertEqual(row.feature, "telegram_query")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_request_log.AIRequestLogModelTests.test_create_tool_limit_row -v 2`

Expected: FAIL — `AIRequestLog` not defined or table missing.

- [ ] **Step 3: Add model to `app_ai/models.py`**

Append after `AIUsageLog`:

```python
class AIRequestLog(models.Model):
    class Outcome(models.TextChoices):
        SUCCESS = "success", "success"
        TOOL_LIMIT_EXCEEDED = "tool_limit_exceeded", "tool_limit_exceeded"
        ERROR = "error", "error"
        BLOCKED = "blocked", "blocked"
        RATE_LIMITED = "rate_limited", "rate_limited"

    class Source(models.TextChoices):
        LIVE = "live", "live"
        BACKFILL = "backfill", "backfill"

    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_request_logs",
    )
    user_id = models.PositiveIntegerField(null=True, blank=True)
    feature = models.CharField(max_length=128)
    channel_key = models.CharField(max_length=128, blank=True, default="")
    prompt = models.TextField()
    response_text = models.TextField(blank=True, default="")
    outcome = models.CharField(max_length=32, choices=Outcome.choices)
    tool_iterations = models.PositiveSmallIntegerField(default=0)
    tool_calls = models.JSONField(default=list, blank=True)
    model = models.CharField(max_length=128, blank=True, default="")
    total_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    source = models.CharField(
        max_length=16,
        choices=Source.choices,
        default=Source.LIVE,
    )
    error_type = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="ix_ai_req_tenant_created"),
            models.Index(fields=["outcome", "created_at"], name="ix_ai_req_outcome_created"),
            models.Index(
                fields=["feature", "outcome", "created_at"],
                name="ix_ai_req_feat_out_created",
            ),
        ]
```

- [ ] **Step 4: Generate and apply migration**

Run:

```bash
python manage.py makemigrations app_ai --name airequestlog
python manage.py migrate_schemas --shared
```

- [ ] **Step 5: Register admin**

Add to `app_ai/admin.py`:

```python
from app_ai.models import AITenantBudget, AITenantUsageMonthly, AIRequestLog, AIUsageLog


@admin.register(AIRequestLog)
class AIRequestLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "tenant",
        "user_id",
        "feature",
        "outcome",
        "tool_iterations",
        "created_at",
    )
    list_filter = ("outcome", "feature", "source", "tenant")
    search_fields = ("prompt", "tenant__name", "tenant__schema_name")
    readonly_fields = [f.name for f in AIRequestLog._meta.fields]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_request_log.AIRequestLogModelTests.test_create_tool_limit_row -v 2`

Expected: PASS

---

## Task 2: `record_request_log` writer

**Files:**
- Create: `app_ai/request_log.py`
- Modify: `app_ai/tests/test_request_log.py`

- [ ] **Step 1: Write failing writer tests**

Append to `app_ai/tests/test_request_log.py`:

```python
from unittest.mock import patch

from app_ai.client import AIResult
from app_ai.request_log import record_request_log, truncate_text


class RecordRequestLogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name="xschedjuice").first()

    def test_truncate_text(self):
        self.assertEqual(truncate_text("abc", 10), "abc")
        self.assertEqual(len(truncate_text("x" * 3000, 2000)), 2000)

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_persists_tool_limit(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="I could not complete that request within the tool limit.",
            tool_calls=[{"name": "search_users", "ok": True, "error": ""}],
            model="gemini-test",
            iterations=5,
            outcome="tool_limit_exceeded",
            total_tokens=900,
            latency_ms=400,
        )
        row = record_request_log(
            user_id=42,
            feature="telegram_query",
            channel_key="telegram:99",
            prompt="Who teaches what?",
            result=result,
            outcome="tool_limit_exceeded",
        )
        self.assertIsNotNone(row)
        self.assertEqual(row.outcome, "tool_limit_exceeded")
        self.assertEqual(row.tool_iterations, 5)
        self.assertEqual(row.total_tokens, 900)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_ai.tests.test_request_log.RecordRequestLogTests -v 2`

- [ ] **Step 3: Implement `app_ai/request_log.py`**

```python
"""Session-level AI request logging (public schema)."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
from app_organization.models import Organization

if TYPE_CHECKING:
    from app_ai.client import AIResult

logger = logging.getLogger(__name__)

_TEXT_LIMIT = 2000


def truncate_text(value: str, limit: int = _TEXT_LIMIT) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit]


def _resolve_tenant() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return None
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()


def record_request_log(
    *,
    user_id: int | None,
    feature: str,
    channel_key: str | None,
    prompt: str,
    result: AIResult | None = None,
    outcome: str,
    response_text: str = "",
    error_type: str = "",
    source: str = AIRequestLog.Source.LIVE,
    created_at=None,
) -> AIRequestLog | None:
    tenant = _resolve_tenant()
    if tenant is None:
        logger.warning("ai_request_log_skip_no_tenant feature=%s outcome=%s", feature, outcome)
        return None

    if result is not None:
        response_text = response_text or result.text
        tool_iterations = result.iterations
        tool_calls = result.tool_calls
        model = result.model
        total_tokens = result.total_tokens
        latency_ms = result.latency_ms
        error_type = error_type or result.error_type
    else:
        tool_iterations = 0
        tool_calls = []
        model = ""
        total_tokens = 0
        latency_ms = 0

    with schema_context(get_public_schema_name()):
        kwargs = dict(
            tenant=tenant,
            user_id=user_id,
            feature=feature,
            channel_key=channel_key or "",
            prompt=truncate_text(prompt),
            response_text=truncate_text(response_text),
            outcome=outcome,
            tool_iterations=tool_iterations,
            tool_calls=tool_calls,
            model=model,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            source=source,
            error_type=error_type,
        )
        if created_at is not None:
            return AIRequestLog.objects.create(**kwargs, created_at=created_at)
        return AIRequestLog.objects.create(**kwargs)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_request_log -v 2`

---

## Task 3: Tool-limit outcome in `GeminiClient`

**Files:**
- Modify: `app_ai/client.py`
- Create: `app_ai/tests/test_client_tool_limit.py`

- [ ] **Step 1: Write failing test**

Create `app_ai/tests/test_client_tool_limit.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app_ai.client import GeminiClient


def _tool_call_response(name: str):
    fc = MagicMock(name=name, args={})
    part = MagicMock(text=None, function_call=fc)
    candidate = MagicMock(content=MagicMock(parts=[part]), finish_reason="STOP")
    response = MagicMock(candidates=[candidate], usage_metadata=None)
    return response


@override_settings(GEMINI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=2)
class GeminiToolLimitTests(TestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_or_create_system_cache", return_value=None)
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.GeminiClient._build_client")
    def test_exhausted_loop_returns_tool_limit_outcome(
        self, mock_build, mock_get_tool, _cache, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.validate_args.return_value = {}
        mock_tool.exposure = "read"
        mock_tool.run.return_value = {"items": []}
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.models.generate_content.side_effect = [
            _tool_call_response("search_courses"),
            _tool_call_response("search_users"),
        ]

        client = GeminiClient()
        result = client.generate_with_tools(
            "complex question",
            user=MagicMock(id=1),
            tools=[MagicMock()],
            feature="telegram_query",
            max_iterations=2,
        )

        self.assertEqual(result.outcome, "tool_limit_exceeded")
        self.assertIn("tool limit", result.text.lower())
        self.assertEqual(result.iterations, 2)
        self.assertEqual(len(result.tool_calls), 2)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_client_tool_limit -v 2`

- [ ] **Step 3: Extend `AIResult` and loop exit in `app_ai/client.py`**

Update dataclass:

```python
@dataclass
class AIResult:
    text: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""
    iterations: int = 0
    outcome: str = "success"
    total_tokens: int = 0
    latency_ms: int = 0
    error_type: str = ""
```

At start of `generate_with_tools` loop section, add:

```python
request_started = time.monotonic()
accumulated_tokens = 0
```

After each `usage = usage_from_metadata(...)`:

```python
accumulated_tokens += usage.total_tokens
```

On successful text return, include aggregates:

```python
return AIResult(
    text=final_text,
    tool_calls=tool_call_log,
    model=model_name,
    iterations=iterations,
    outcome="success",
    total_tokens=accumulated_tokens,
    latency_ms=int((time.monotonic() - request_started) * 1000),
)
```

Replace final loop exit (lines ~350-355):

```python
return AIResult(
    text=final_text or "I could not complete that request within the tool limit.",
    tool_calls=tool_call_log,
    model=model_name,
    iterations=iterations,
    outcome="tool_limit_exceeded",
    total_tokens=accumulated_tokens,
    latency_ms=int((time.monotonic() - request_started) * 1000),
)
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_client_tool_limit -v 2`

---

## Task 4: Wire `AIService.run()` session logging

**Files:**
- Modify: `app_ai/service.py`
- Create: `app_ai/tests/test_service_request_log.py`

- [ ] **Step 1: Write failing integration test**

Create `app_ai/tests/test_service_request_log.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.client import AIResult
from app_ai.exceptions import AIPromptBlocked
from app_ai.models import AIRequestLog
from app_ai.service import AIService
from app_organization.models import Organization


@override_settings(GEMINI_API_KEY="test-key")
class AIServiceRequestLogTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)

    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.GeminiClient.generate_with_tools")
    def test_run_logs_blocked_prompt(self, mock_gen, mock_guard, mock_log):
        mock_guard.return_value = MagicMock(
            allowed=False, reason="blocked", message="Out of scope."
        )
        service = AIService()
        user = MagicMock(id=7)
        with self.assertRaises(AIPromptBlocked):
            service.run("tell me a joke", user, feature="telegram_query")
        mock_gen.assert_not_called()
        mock_log.assert_called_once()
        self.assertEqual(mock_log.call_args.kwargs["outcome"], "blocked")

    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.GeminiClient.generate_with_tools")
    def test_run_logs_tool_limit_result(self, mock_gen, mock_guard, mock_log):
        mock_guard.return_value = MagicMock(allowed=True)
        mock_gen.return_value = AIResult(
            text="I could not complete that request within the tool limit.",
            outcome="tool_limit_exceeded",
            iterations=5,
        )
        service = AIService()
        user = MagicMock(id=7)
        with patch.object(AIService, "_current_tenant", return_value=self.org):
            result = service.run("big question", user, feature="telegram_query")
        self.assertEqual(result.outcome, "tool_limit_exceeded")
        mock_log.assert_called_once()
        self.assertEqual(
            mock_log.call_args.kwargs["outcome"],
            "tool_limit_exceeded",
        )
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_service_request_log -v 2`

- [ ] **Step 3: Refactor `AIService.run()`**

Wrap the body after tenant resolution in try/except/finally. Structure:

```python
from app_ai.models import AIRequestLog
from app_ai.request_log import record_request_log

def run(...) -> AIResult:
    tenant = self._current_tenant()
    log_outcome = AIRequestLog.Outcome.SUCCESS
    log_response = ""
    log_error = ""
    log_result: AIResult | None = None

    try:
        # existing guard / quota / disambiguation / generate_with_tools logic
        ...
        log_result = self.client.generate_with_tools(...)
        log_outcome = log_result.outcome
        return log_result
    except AIPromptBlocked as exc:
        log_outcome = AIRequestLog.Outcome.BLOCKED
        log_response = exc.message
        raise
    except AIRateLimited as exc:
        log_outcome = AIRequestLog.Outcome.RATE_LIMITED
        log_response = exc.message
        raise
    except Exception as exc:
        log_outcome = AIRequestLog.Outcome.ERROR
        log_error = type(exc).__name__
        raise
    finally:
        if tenant is not None:
            record_request_log(
                user_id=getattr(user, "id", None),
                feature=feature,
                channel_key=channel_key,
                prompt=prompt,
                result=log_result,
                outcome=log_outcome,
                response_text=log_response,
                error_type=log_error,
            )
```

**Important:** Guardrail checks that `raise` before Gemini must set `log_outcome`/`log_response` in the `except` blocks above (not before the raise inside `if not guard.allowed`).

For `disambiguation_fast_path` early return, ensure the `return self.client.generate_with_tools(...)` goes through the same try path so `log_result` is populated.

When `tenant is None` (public schema calls), skip logging (same as `record_usage`).

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_service_request_log -v 2`

---

## Task 5: `build_failures_list` reporting

**Files:**
- Modify: `app_ai/reporting.py`
- Create: `app_ai/tests/test_failures_reporting.py`

- [ ] **Step 1: Write failing reporting test**

```python
import unittest
from datetime import datetime, timezone

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
from app_ai.reporting import build_failures_list
from app_auth.models import User
from app_organization.models import Organization


@unittest.skipUnless(connection.ensure_connection() or True, "db")
class BuildFailuresListTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(cls.schema_name):
            cls.user = User.objects.filter(is_active=True).first()

    def test_lists_tool_limit_rows_for_month(self):
        created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                channel_key="telegram:1",
                prompt="List all courses and rosters",
                response_text="I could not complete that request within the tool limit.",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
                model="gemini-test",
                total_tokens=500,
                latency_ms=300,
                created_at=created,
            )
        payload = build_failures_list(
            year=2026,
            month=6,
            outcome="tool_limit_exceeded",
            feature="telegram_query",
            tenant_id=None,
            page=1,
            page_size=25,
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["prompt"], "List all courses and rosters")
        self.assertEqual(payload["items"][0]["user_display_name"], self.user.name or self.user.email)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_failures_reporting -v 2`

- [ ] **Step 3: Implement `build_failures_list` in `app_ai/reporting.py`**

Add helper `_resolve_users_for_logs(tenant, user_ids)` mirroring `user_usage_for_month` lookup.

```python
from app_ai.models import AIRequestLog

DEFAULT_FAILURES_OUTCOME = "tool_limit_exceeded"
DEFAULT_FAILURES_FEATURE = "telegram_query"
MAX_FAILURES_PAGE_SIZE = 100


def build_failures_list(
    *,
    year: int,
    month: int,
    outcome: str = DEFAULT_FAILURES_OUTCOME,
    feature: str = DEFAULT_FAILURES_FEATURE,
    tenant_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    page_size = min(max(page_size, 1), MAX_FAILURES_PAGE_SIZE)
    page = max(page, 1)
    start, end = _month_bounds_utc(year, month)

    with schema_context(get_public_schema_name()):
        qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            outcome=outcome,
            feature=feature,
        )
        if tenant_id is not None:
            qs = qs.filter(tenant_id=tenant_id)

        total_count = qs.count()
        by_org = list(
            qs.values("tenant_id")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        tenant_ids = {row["tenant_id"] for row in by_org}
        tenants = {
            o.id: o
            for o in Organization.objects.filter(id__in=tenant_ids)
        }
        by_org_payload = [
            {
                "organization_id": tid,
                "name": tenants[tid].name,
                "count": row["count"],
            }
            for row in by_org
            for tid in [row["tenant_id"]]
            if tid in tenants
        ]

        offset = (page - 1) * page_size
        rows = list(
            qs.select_related("tenant")
            .order_by("-created_at")[offset : offset + page_size]
        )

    # Resolve users per tenant schema (batch by tenant)
    users_by_tenant: dict[int, dict[int, User]] = {}
    rows_by_tenant: dict[int, list[AIRequestLog]] = {}
    for row in rows:
        rows_by_tenant.setdefault(row.tenant_id, []).append(row)
    for tid, tenant_rows in rows_by_tenant.items():
        tenant = tenants.get(tid) or rows[0].tenant
        user_ids = [r.user_id for r in tenant_rows if r.user_id is not None]
        if not user_ids:
            continue
        with schema_context(tenant.schema_name):
            users_by_tenant[tid] = {
                u.id: u for u in User.objects.filter(id__in=user_ids, is_active=True)
            }

    items = []
    for row in rows:
        user_display = "Unknown user"
        user_email = ""
        if row.user_id is not None:
            user = users_by_tenant.get(row.tenant_id, {}).get(row.user_id)
            if user is not None:
                user_display = user.name or user.email
                user_email = user.email or ""
            else:
                user_display = f"User #{row.user_id}"

        items.append(
            {
                "id": row.id,
                "created_at": row.created_at.isoformat(),
                "organization_id": row.tenant_id,
                "organization_name": row.tenant.name,
                "user_id": row.user_id,
                "user_display_name": user_display,
                "user_email": user_email,
                "feature": row.feature,
                "channel_key": row.channel_key,
                "prompt": row.prompt,
                "response_text": row.response_text,
                "tool_iterations": row.tool_iterations,
                "tool_calls": row.tool_calls,
                "model": row.model,
                "total_tokens": row.total_tokens,
                "latency_ms": row.latency_ms,
                "source": row.source,
            }
        )

    top_org = by_org_payload[0] if by_org_payload else None
    return {
        "year": year,
        "month": month,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "summary": {
            "failure_count": total_count,
            "organizations_affected": len(by_org_payload),
            "top_org": top_org,
            "by_org": by_org_payload,
        },
        "items": items,
    }
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_failures_reporting -v 2`

---

## Task 6: Failures API endpoints

**Files:**
- Modify: `app_ai/usage_views.py`
- Modify: `app_ai/urls.py`
- Modify: `app_organization/views.py`
- Modify: `app_organization/urls.py`
- Create: `app_ai/tests/test_failures_api.py`

- [ ] **Step 1: Write failing API test**

Create `app_ai/tests/test_failures_api.py` (copy auth setup from `test_usage_api.py`):

```python
def test_superadmin_can_fetch_platform_failures(self):
    with schema_context(get_public_schema_name()):
        AIRequestLog.objects.create(
            tenant=self.org,
            user_id=self.superadmin.id,
            feature="telegram_query",
            prompt="test",
            response_text="I could not complete that request within the tool limit.",
            outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
        )
    resp = self._client(self.superadmin, self.admin_schema).get(
        f"{self.api_prefix}/platform/ai-usage/failures",
        {"year": 2026, "month": 6},
    )
    self.assertEqual(resp.status_code, 200, resp.content)
    body = resp.json()
    self.assertFalse(body["isError"])
    self.assertIn("items", body)
    self.assertIn("summary", body)

def test_admin_without_permission_forbidden(self):
    resp = self._client(self.admin, self.admin_schema).get(
        f"{self.api_prefix}/platform/ai-usage/failures",
        {"year": 2026, "month": 6},
    )
    self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_failures_api -v 2`

- [ ] **Step 3: Add views**

In `app_ai/usage_views.py`:

```python
class PlatformAIUsageFailuresView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
            page_size = int(request.query_params.get("page_size", 25))
        except ValueError:
            return self.bad_request("Invalid page or page_size")
        outcome = request.query_params.get("outcome") or "tool_limit_exceeded"
        feature = request.query_params.get("feature") or "telegram_query"
        payload = build_failures_list(
            year=year,
            month=month,
            outcome=outcome,
            feature=feature,
            tenant_id=None,
            page=page,
            page_size=page_size,
        )
        return self.send_response(False, "success", payload, status=200)
```

In `app_organization/views.py`:

```python
class OrganizationAIUsageFailuresView(RBACDetailsView):
    name = "Organization AI usage failures"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
            page_size = int(request.query_params.get("page_size", 25))
        except ValueError:
            return self.bad_request("Invalid page or page_size")
        outcome = request.query_params.get("outcome") or "tool_limit_exceeded"
        feature = request.query_params.get("feature") or "telegram_query"
        payload = build_failures_list(
            year=year,
            month=month,
            outcome=outcome,
            feature=feature,
            tenant_id=obj.id,
            page=page,
            page_size=page_size,
        )
        return self.send_response(False, "success", payload, status=200)
```

Register URLs:

`app_ai/urls.py`:

```python
path(
    "platform/ai-usage/failures",
    usage_views.PlatformAIUsageFailuresView.as_view(),
    name="platform-ai-usage-failures",
),
```

`app_organization/urls.py`:

```python
path(
    "organizations/<int:obj_id>/ai-usage/failures",
    views.OrganizationAIUsageFailuresView.as_view(),
    name="organization-ai-usage-failures",
),
```

- [ ] **Step 4: Run API tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_failures_api -v 2`

---

## Task 7: Backfill management command

**Files:**
- Create: `app_ai/management/commands/backfill_ai_request_logs_from_telegram.py`
- Create: `app_ai/tests/test_backfill_request_logs.py`

- [ ] **Step 1: Write failing backfill test**

Use tenant schema + `TelegramAIExchange` factory row with tool-limit `bot_text`, run command with `--schema=xschedjuice`, assert `AIRequestLog` created with `source=backfill`.

```python
TOOL_LIMIT_TEXT = "I could not complete that request within the tool limit."

def test_backfill_creates_request_log_from_exchange(self):
    with schema_context(self.schema_name):
        TelegramAIExchange.objects.create(
            user=self.user,
            chat_id=999,
            user_message_id=1,
            bot_message_id=2,
            user_text="List every student",
            bot_text=TOOL_LIMIT_TEXT,
        )
    call_command("backfill_ai_request_logs_from_telegram", schema=self.schema_name)
    with schema_context(get_public_schema_name()):
        row = AIRequestLog.objects.get(prompt="List every student")
    self.assertEqual(row.outcome, "tool_limit_exceeded")
    self.assertEqual(row.source, "backfill")
    self.assertEqual(row.tool_calls, [])
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement command**

```python
from django.core.management.base import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
from app_ai.request_log import truncate_text
from app_organization.models import Organization
from app_telegram.models import TelegramAIExchange

TOOL_LIMIT_SUBSTRING = "within the tool limit"


class Command(BaseCommand):
    help = "Backfill AIRequestLog rows from TelegramAIExchange tool-limit replies."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--schema", type=str, default="")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        schema_filter = (options["schema"] or "").strip()

        with schema_context(get_public_schema_name()):
            orgs = Organization.objects.all()
            if schema_filter:
                orgs = orgs.filter(schema_name=schema_filter)

        created = 0
        skipped = 0
        for org in orgs:
            with schema_context(org.schema_name):
                exchanges = TelegramAIExchange.objects.filter(
                    bot_text__icontains=TOOL_LIMIT_SUBSTRING,
                )
                for ex in exchanges:
                    prompt_key = truncate_text(ex.user_text, 500)
                    with schema_context(get_public_schema_name()):
                        exists = AIRequestLog.objects.filter(
                            tenant=org,
                            user_id=ex.user_id,
                            created_at=ex.created_at,
                            prompt__startswith=prompt_key[:500],
                            source=AIRequestLog.Source.BACKFILL,
                        ).exists()
                        if exists:
                            skipped += 1
                            continue
                        if dry_run:
                            created += 1
                            continue
                        AIRequestLog.objects.create(
                            tenant=org,
                            user_id=ex.user_id,
                            feature="telegram_query",
                            channel_key=f"telegram:{ex.chat_id}",
                            prompt=truncate_text(ex.user_text),
                            response_text=truncate_text(ex.bot_text),
                            outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                            tool_iterations=0,
                            tool_calls=[],
                            model="",
                            total_tokens=0,
                            latency_ms=0,
                            source=AIRequestLog.Source.BACKFILL,
                            created_at=ex.created_at,
                        )
                        created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"backfill complete created={created} skipped={skipped} dry_run={dry_run}"
            )
        )
```

- [ ] **Step 4: Run backfill test — expect PASS**

Run: `python manage.py test app_ai.tests.test_backfill_request_logs -v 2`

---

## Task 8: FE types and client API

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/ai-usage.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts`

- [ ] **Step 1: Add Zod schemas**

```typescript
export const aiUsageFailureToolCallSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  error: z.string(),
});

export const aiUsageFailureItemSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  organization_id: z.number(),
  organization_name: z.string(),
  user_id: z.number().nullable(),
  user_display_name: z.string(),
  user_email: z.string(),
  feature: z.string(),
  channel_key: z.string(),
  prompt: z.string(),
  response_text: z.string(),
  tool_iterations: z.number(),
  tool_calls: z.array(aiUsageFailureToolCallSchema),
  model: z.string(),
  total_tokens: z.number(),
  latency_ms: z.number(),
  source: z.enum(["live", "backfill"]),
});

export const aiUsageFailuresSchema = z.object({
  year: z.number(),
  month: z.number(),
  total_count: z.number(),
  page: z.number(),
  page_size: z.number(),
  summary: z.object({
    failure_count: z.number(),
    organizations_affected: z.number(),
    top_org: z
      .object({
        organization_id: z.number(),
        name: z.string(),
        count: z.number(),
      })
      .nullable(),
    by_org: z.array(
      z.object({
        organization_id: z.number(),
        name: z.string(),
        count: z.number(),
      }),
    ),
  }),
  items: z.array(aiUsageFailureItemSchema),
});

export type AiUsageFailures = z.infer<typeof aiUsageFailuresSchema>;
```

- [ ] **Step 2: Add fetch helpers**

```typescript
type FailuresParams = MonthParams & {
  page?: number;
  page_size?: number;
};

export async function fetchAiUsageFailures(
  params: FailuresParams,
): Promise<AiUsageFailures> {
  const res = await axiosClient.get("platform/ai-usage/failures", { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) throw new Error(message ?? "Failed to load AI failures");
  return aiUsageFailuresSchema.parse(payload);
}

export async function fetchOrgAiUsageFailures(
  orgId: number | string,
  params: FailuresParams,
): Promise<AiUsageFailures> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/failures`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) throw new Error(message ?? "Failed to load AI failures");
  return aiUsageFailuresSchema.parse(payload);
}
```

---

## Task 9: Shared UI components

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/ai-usage-tabs.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/failures-table.tsx`

- [ ] **Step 1: `AiUsageTabs` — link-based tab bar**

Props: `{ mode: "platform" | "org"; orgId?: string; dateParam: string; active: "overview" | "failures" }`

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const tabClass = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

export function AiUsageTabs({
  mode,
  orgId,
  dateParam,
  active,
}: {
  mode: "platform" | "org";
  orgId?: string;
  dateParam: string;
  active: "overview" | "failures";
}) {
  const base =
    mode === "platform"
      ? "/organizations/ai-usage"
      : `/organizations/${orgId}/ai-usage`;
  const q = `?date=${encodeURIComponent(dateParam)}`;

  return (
    <div className="flex gap-2">
      <Link href={`${base}${q}`} className={tabClass(active === "overview")}>
        Overview
      </Link>
      <Link href={`${base}/failures${q}`} className={tabClass(active === "failures")}>
        Tool limit failures
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: `FailuresTable` — paginated table with expandable rows**

Props: `{ items, showOrgColumn, dateParam, onPageChange, page, pageSize, totalCount }`

- Columns per spec (When, Org optional, User, Question, Tools badges, Iterations, Tokens)
- Expand row: full prompt, `JSON.stringify(tool_calls, null, 2)`, response text
- If `source === "backfill"` and `tool_calls.length === 0`, show muted badge **Historical (no tool detail)**
- Tools column shows `—` when no tool calls

- [ ] **Step 3: Add tabs to existing overview pages**

In `organizations/ai-usage/page.tsx` and `organizations/[id]/ai-usage/page.tsx`, render `<AiUsageTabs active="overview" ... />` below the H1 row.

---

## Task 10: Failures pages

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/failures/page.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/organizations/[id]/ai-usage/failures/page.tsx`

- [ ] **Step 1: Platform failures page**

Mirror overview page structure:
- `usePermissions` guard (`ai.usage.view`)
- `YearMonthSelector` + `AiUsageTabs active="failures"`
- React Query: `fetchAiUsageFailures({ year, month, page })`
- Summary cards: `failure_count`, `organizations_affected`, `top_org?.name` + count
- `<FailuresTable showOrgColumn />`
- Simple prev/next pagination buttons using `page` / `total_count` / `page_size`
- Empty state: "No tool limit failures this month."

- [ ] **Step 2: Org failures page**

Same as platform page but:
- `fetchOrgAiUsageFailures(id, ...)`
- `AiUsageTabs mode="org" orgId={id}`
- `BackButton href="/organizations/ai-usage/failures"`
- No org column; no "top org" card (show failures count + unique users count instead)

---

## Task 11: Route permissions

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/route-permissions.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/route-permissions.test.ts`

- [ ] **Step 1: Add route rule** (before the generic `/organizations/ai-usage` rule):

```typescript
{ prefix: "/organizations/ai-usage/failures", anyOf: ["ai.usage.view"] },
```

- [ ] **Step 2: Add test**

```typescript
it("resolves /organizations/ai-usage/failures to ai.usage.view", () => {
  const rule = ruleForPath("/organizations/ai-usage/failures");
  expect(rule?.prefix).toBe("/organizations/ai-usage/failures");
  expect(rule?.anyOf).toEqual(["ai.usage.view"]);
});
```

- [ ] **Step 3: Verify org-route-access**

Confirm existing test passes without change:

```typescript
expect(isPlatformOrgManagementPath("/organizations/ai-usage/failures", tenantId)).toBe(false);
```

Run: `npm test -- route-permissions org-route-access`

---

## Task 12: Manual verification

- [ ] Run full BE test suite for this feature (command in Conventions)
- [ ] Run FE tests (command in Conventions)
- [ ] Seed a tool-limit row (or run backfill), load `/organizations/ai-usage/failures?date=2026-06-01` as superadmin on admin tenant
- [ ] Confirm tab navigation preserves `date` query param
- [ ] Confirm org failures page filters to single org
- [ ] Optional post-deploy: `python manage.py backfill_ai_request_logs_from_telegram --dry-run`

---

## Spec coverage self-review

| Spec section | Task |
| --- | --- |
| `AIRequestLog` model | Task 1 |
| `AIResult` + tool-limit detection | Task 3 |
| `record_request_log` + `AIService` wiring | Tasks 2, 4 |
| Token/latency aggregation | Task 3 |
| Historical backfill command | Task 7 |
| Platform + org failures APIs | Tasks 5, 6 |
| FE routes, tabs, table | Tasks 8–11 |
| Error handling / empty states | Tasks 10, 12 |
| Testing | All tasks |

No placeholder steps. Type names consistent across tasks (`outcome`, `build_failures_list`, `AiUsageFailures`).
