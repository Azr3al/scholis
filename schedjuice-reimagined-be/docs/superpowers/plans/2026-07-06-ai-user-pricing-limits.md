# AI Per-User Pricing Limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce layered monthly USD caps (per-user always hard-block + org cap when `ai_hard_enforce`) with org default $1/user, admin overrides, and UX visibility in chat footers, user Usage panels, and org Top spenders.

**Architecture:** Extend `app_ai/quota.py` with user budget resolution and `assert_user_quota_allows()` using `AIUsageLog` aggregation (no new rollup table). Store org default on `Organization.ai_default_user_monthly_usd_limit` (public schema) and per-user override on `UserAIPreferences.monthly_usd_limit` (tenant schema). Wire enforcement in `AIService.run()` before existing org quota. Extend reporting/API payloads with `budget` snapshots; frontend adds settings, allowance UI, and admin tables.

**Tech Stack:** Django, DRF, django-tenant-schemas, PostgreSQL, Next.js, Zod, TanStack Query, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-07-06-ai-user-pricing-limits-design.md`

**Repos:** `schedjuice-reimagined-be` (Tasks 1–9), `schedjuice-reimagined-fe` (Tasks 10–13)

---

## File map

| File | Responsibility |
| --- | --- |
| `schedjuice_backend/settings.py` | `AI_DEFAULT_USER_MONTHLY_USD_LIMIT = 1.0` |
| `app_ai/defaults.py` | Expose `default_user_monthly_usd_limit` in platform defaults |
| `app_organization/models.py` | `ai_default_user_monthly_usd_limit` |
| `app_organization/migrations/0070_organization_ai_default_user_monthly_usd_limit.py` | Public schema migration |
| `app_organization/serializers.py` | Org AI settings field + validation |
| `app_auth/models_user_ai.py` | `monthly_usd_limit` on preferences |
| `app_auth/migrations/0072_useraipreferences_monthly_usd_limit.py` | Tenant migration |
| `app_ai/exceptions.py` | `AIUserQuotaExceeded` |
| `app_ai/quota.py` | User budget helpers + `assert_user_quota_allows` |
| `app_ai/service.py` | Call user quota before org quota; log outcome |
| `app_ai/models.py` | `AIRequestLog.Outcome.USER_QUOTA_EXCEEDED` |
| `app_ai/reporting.py` | `user_budget_snapshot`, extend org/user payloads |
| `app_ai/user_preferences.py` | Limit fields in get/upsert/to_dict |
| `app_ai/serializers.py` | `monthly_usd_limit` on preferences serializer |
| `app_ai/user_views.py` | Gate limit PATCH to `manage_all` + not self |
| `app_ai/views.py` | `AIUserQuotaExceeded` handler + success `budget` |
| `app_telegram/tasks.py` | User quota message + reply footer |
| `app_ai/tests/test_user_quota.py` | Quota unit tests (new) |
| `app_organization/tests/test_ai_settings_api.py` | Org default field tests |
| `app_ai/tests/test_user_ai_api.py` | Preferences limit + usage budget tests |
| `app_ai/tests/test_usage_reporting.py` | Org user row limit fields |
| `app_ai/tests/test_ai_query_view_guardrails.py` | Extend for user quota 429 |
| `app_telegram/tests/test_ai_query.py` | Telegram user quota + footer |
| `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts` | Org default field |
| `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts` | Limit + budget types |
| `schedjuice-reimagined-fe/src/types/ai-usage.ts` | User row limit columns |
| `schedjuice-reimagined-fe/src/lib/ai/budget-footer.ts` | Shared footer formatter |
| `schedjuice-reimagined-fe/src/lib/ai/visibility.ts` | `canManageAiLimits()` helper |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-settings-pane.tsx` | Org default input |
| `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx` | Allowance card |
| `schedjuice-reimagined-fe/src/components/users/ai/ai-limits-form.tsx` | Admin limits card (new) |
| `schedjuice-reimagined-fe/src/components/record/sections/record-ai.tsx` | Mount limits form |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-usage-pane.tsx` | Top spenders columns |

**Note:** There is no web AI chat page in FE yet (`POST /api/v1/ai/query` exists on BE). Task 13 delivers types + `formatAiBudgetFooter()` for future chat UI; BE still returns `budget` on success.

---

## Conventions

- **Backend tests:** `./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- **TestCase setup:** `@unittest.skipUnless(_database_reachable())`, `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`.
- **Public org/logs:** `schema_context(get_public_schema_name())`.
- **Tenant users/prefs:** `schema_context(self.schema_name)`.
- **Permission tests:** `@override_settings(RBAC_ENFORCE="enforce")`.
- **Commits:** Only when the user asks (repo rule).

---

## Task 1: Platform default setting

**Files:**
- Modify: `schedjuice_backend/settings.py`
- Modify: `app_ai/defaults.py`
- Test: `app_organization/tests/test_ai_settings_api.py`

- [ ] **Step 1: Add setting**

In `settings.py` after `AI_DEFAULT_MONTHLY_USD_LIMIT`:

```python
AI_DEFAULT_USER_MONTHLY_USD_LIMIT = config(
    "AI_DEFAULT_USER_MONTHLY_USD_LIMIT", default=1.0, cast=float
)
```

- [ ] **Step 2: Extend platform defaults**

In `app_ai/defaults.py` `get_platform_ai_defaults()` return dict, add:

```python
"default_user_monthly_usd_limit": float(
    getattr(settings, "AI_DEFAULT_USER_MONTHLY_USD_LIMIT", 1.0)
),
```

- [ ] **Step 3: Assert in existing org settings test**

In `test_get_includes_platform_defaults_and_available_models`:

```python
self.assertEqual(
    data["ai_platform_defaults"]["default_user_monthly_usd_limit"], 1.0
)
```

- [ ] **Step 4: Run test**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_ai_settings_api.OrganizationAISettingsApiTests.test_get_includes_platform_defaults_and_available_models`

Expected: PASS

---

## Task 2: Organization model + migration

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_organization/migrations/0070_organization_ai_default_user_monthly_usd_limit.py`
- Modify: `app_organization/serializers.py`
- Test: `app_organization/tests/test_ai_settings_api.py`

- [ ] **Step 1: Add field to Organization**

After `ai_budget_active`:

```python
ai_default_user_monthly_usd_limit = models.DecimalField(
    max_digits=12,
    decimal_places=4,
    null=True,
    blank=True,
    help_text="Default monthly USD cap per user. Null = platform default ($1).",
)
```

- [ ] **Step 2: Generate migration**

Run: `cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations app_organization --name organization_ai_default_user_monthly_usd_limit`

- [ ] **Step 3: Expose on serializer**

Add to `OrganizationAISettingsSerializer.Meta.fields` (after `ai_budget_active`):

```python
"ai_default_user_monthly_usd_limit",
```

Add validator:

```python
def validate_ai_default_user_monthly_usd_limit(self, value):
    if value is None:
        return None
    if value <= 0:
        raise serializers.ValidationError("Must be greater than 0.")
    if value > Decimal("99999.99"):
        raise serializers.ValidationError("Must be at most 99999.99.")
    return value
```

(import `Decimal` at top if missing)

- [ ] **Step 4: Write API tests**

```python
def test_patch_default_user_monthly_usd_limit(self):
    resp = self._client(self.admin).patch(
        f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
        {"ai_default_user_monthly_usd_limit": "5.00"},
        format="json",
    )
    self.assertEqual(resp.status_code, 200, resp.content)
    self.assertEqual(
        resp.json()["data"]["ai_default_user_monthly_usd_limit"], "5.0000"
    )

def test_patch_rejects_non_positive_default_user_limit(self):
    resp = self._client(self.admin).patch(
        f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
        {"ai_default_user_monthly_usd_limit": "0"},
        format="json",
    )
    self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_organization.tests.test_ai_settings_api`

Expected: PASS

- [ ] **Step 6: Apply migration locally**

Run: `./env/bin/python manage.py migrate_schemas --noinput`

---

## Task 3: UserAIPreferences.monthly_usd_limit

**Files:**
- Modify: `app_auth/models_user_ai.py`
- Create: `app_auth/migrations/0072_useraipreferences_monthly_usd_limit.py`
- Test: `app_auth/tests/test_user_ai_preferences_model.py`

- [ ] **Step 1: Add field**

```python
monthly_usd_limit = models.DecimalField(
    max_digits=12,
    decimal_places=4,
    null=True,
    blank=True,
    help_text="Admin override: monthly USD cap. Null = org default.",
)
```

- [ ] **Step 2: Generate migration**

Run: `./env/bin/python manage.py makemigrations app_auth --name useraipreferences_monthly_usd_limit`

- [ ] **Step 3: Model test**

```python
def test_monthly_usd_limit_nullable(self):
    with schema_context(self.schema_name):
        user = User.objects.create_user(...)
        prefs = UserAIPreferences.objects.create(user=user, monthly_usd_limit=None)
        self.assertIsNone(prefs.monthly_usd_limit)
        prefs.monthly_usd_limit = Decimal("10.00")
        prefs.save()
        prefs.refresh_from_db()
        self.assertEqual(prefs.monthly_usd_limit, Decimal("10.00"))
```

- [ ] **Step 4: Run test + migrate**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_ai_preferences_model`

Run: `./env/bin/python manage.py migrate_schemas --noinput`

---

## Task 4: Quota helpers + unit tests

**Files:**
- Modify: `app_ai/quota.py`
- Modify: `app_ai/exceptions.py`
- Create: `app_ai/tests/test_user_quota.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_user_quota.py` with:

```python
@override_settings(
    AI_DEFAULT_USER_MONTHLY_USD_LIMIT=1.0,
    RBAC_ENFORCE="log_only",
)
class UserQuotaTests(TestCase):
    # ... standard setup with org, admin user ...

    def test_get_user_budget_platform_default(self):
        limit = get_user_budget(self.org, self.admin.id)
        self.assertEqual(limit, Decimal("1.00"))

    def test_get_user_budget_org_default(self):
        with schema_context(get_public_schema_name()):
            self.org.ai_default_user_monthly_usd_limit = Decimal("5.00")
            self.org.save(update_fields=["ai_default_user_monthly_usd_limit"])
        self.assertEqual(get_user_budget(self.org, self.admin.id), Decimal("5.00"))

    def test_get_user_budget_user_override(self):
        with schema_context(self.schema_name):
            UserAIPreferences.objects.create(
                user=self.admin, monthly_usd_limit=Decimal("10.00")
            )
        self.assertEqual(get_user_budget(self.org, self.admin.id), Decimal("10.00"))

    def test_assert_user_quota_allows_blocks_at_limit(self):
        # seed AIUsageLog billed_cost_usd >= 1.00 for admin this month
        with self.assertRaises(AIUserQuotaExceeded):
            assert_user_quota_allows(self.org, self.admin.id)

    def test_assert_user_quota_allows_skips_none_user_id(self):
        assert_user_quota_allows(self.org, None)  # no raise
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_user_quota`

- [ ] **Step 3: Implement helpers in `quota.py`**

Add imports: `datetime`, `Sum`, `AIUsageLog`, `UserAIPreferences`, `AIUserQuotaExceeded`.

```python
def get_default_user_budget() -> Decimal:
    raw = getattr(settings, "AI_DEFAULT_USER_MONTHLY_USD_LIMIT", 1.0)
    return Decimal(str(raw))

def get_org_default_user_budget(tenant: Organization) -> Decimal:
    if tenant.ai_default_user_monthly_usd_limit is not None:
        return tenant.ai_default_user_monthly_usd_limit
    return get_default_user_budget()

def _resolve_limit_source(
    tenant: Organization, override: Decimal | None
) -> str:
    if override is not None:
        return "user_override"
    if tenant.ai_default_user_monthly_usd_limit is not None:
        return "org_default"
    return "platform_default"

def get_user_budget(tenant: Organization, user_id: int) -> Decimal:
    override: Decimal | None = None
    schema = tenant.schema_name
    if schema:
        with schema_context(schema):
            prefs = UserAIPreferences.objects.filter(user_id=user_id).first()
            if prefs is not None and prefs.monthly_usd_limit is not None:
                override = prefs.monthly_usd_limit
    if override is not None:
        return override
    return get_org_default_user_budget(tenant)

def get_user_usage_for_month(
    tenant: Organization, user_id: int, year: int, month: int
) -> Decimal:
    from app_ai.reporting import _month_bounds_utc

    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        agg = AIUsageLog.objects.filter(
            tenant=tenant,
            user_id=user_id,
            created_at__gte=start,
            created_at__lt=end,
        ).aggregate(total=Sum("billed_cost_usd"))
    return agg["total"] or Decimal("0")

def get_current_month_user_usage(tenant: Organization, user_id: int) -> Decimal:
    now = datetime.now(timezone.utc)
    return get_user_usage_for_month(tenant, user_id, now.year, now.month)

def user_budget_snapshot(
    tenant: Organization,
    user_id: int,
    *,
    year: int | None = None,
    month: int | None = None,
    used_usd: Decimal | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    limit = get_user_budget(tenant, user_id)
    used = used_usd if used_usd is not None else get_user_usage_for_month(
        tenant, user_id, year, month
    )
    remaining = max(Decimal("0"), limit - used)
    used_pct = float(used / limit) if limit > 0 else 0.0
    override = None
    with schema_context(tenant.schema_name):
        prefs = UserAIPreferences.objects.filter(user_id=user_id).first()
        if prefs is not None:
            override = prefs.monthly_usd_limit
    return {
        "monthly_usd_limit": str(limit.quantize(Decimal("0.01"))),
        "used_usd": str(used.quantize(Decimal("0.00000001"))),
        "remaining_usd": str(remaining.quantize(Decimal("0.01"))),
        "used_pct": used_pct,
        "is_over_limit": used >= limit,
        "limit_source": _resolve_limit_source(tenant, override),
    }

def assert_user_quota_allows(tenant: Organization, user_id: int | None) -> None:
    if user_id is None:
        return
    limit = get_user_budget(tenant, user_id)
    used = get_current_month_user_usage(tenant, user_id)
    if used >= limit:
        raise AIUserQuotaExceeded(limit_usd=limit, used_usd=used)
```

- [ ] **Step 4: Add exception**

In `app_ai/exceptions.py`:

```python
class AIUserQuotaExceeded(AIQuotaExceeded):
    def __init__(self, *, limit_usd: Decimal, used_usd: Decimal):
        self.limit_usd = limit_usd
        self.used_usd = used_usd
        super().__init__(
            f"Your monthly AI allowance (${limit_usd:.2f}) is used up. "
            "Contact your administrator."
        )
```

(import `Decimal`)

- [ ] **Step 5: Run tests — expect PASS**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_user_quota`

---

## Task 5: AIService enforcement + request log outcome

**Files:**
- Modify: `app_ai/service.py`
- Modify: `app_ai/models.py`
- Create migration for `AIRequestLog` outcome choice
- Test: extend `app_ai/tests/test_user_quota.py`

- [ ] **Step 1: Add outcome**

In `AIRequestLog.Outcome`:

```python
USER_QUOTA_EXCEEDED = "user_quota_exceeded", "user_quota_exceeded"
```

Run `makemigrations app_ai` if Django requires it for choices (often no migration needed for TextChoices addition only — verify).

- [ ] **Step 2: Wire service**

In `app_ai/service.py`:

```python
from app_ai.exceptions import AIPromptBlocked, AIRateLimited, AIUserQuotaExceeded
from app_ai.quota import assert_quota_allows, assert_user_quota_allows
```

After guardrails block, before `assert_quota_allows(tenant)`:

```python
assert_user_quota_allows(tenant, user.id if user is not None else None)
```

In `except AIUserQuotaExceeded` handling (add alongside other AI errors before generic Exception):

```python
except AIUserQuotaExceeded:
    log_outcome = AIRequestLog.Outcome.USER_QUOTA_EXCEEDED
    log_response = "User monthly AI allowance exceeded."
    raise
```

- [ ] **Step 3: Integration test with mocked Gemini**

Patch `GeminiClient` so service reaches quota check; seed usage log over limit; assert `AIUserQuotaExceeded` raised.

- [ ] **Step 4: Run**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_user_quota`

---

## Task 6: Reporting + org/user usage APIs

**Files:**
- Modify: `app_ai/reporting.py`
- Modify: `app_ai/tests/test_usage_reporting.py`
- Modify: `app_ai/tests/test_user_ai_api.py`

- [ ] **Step 1: Extend `build_user_usage_detail`**

At end of payload assembly:

```python
"budget": user_budget_snapshot(tenant, user_id, year=year, month=month),
```

- [ ] **Step 2: Batch-load overrides in `user_usage_for_month`**

Add helper in `quota.py`:

```python
def load_user_limit_overrides(tenant: Organization, user_ids: list[int]) -> dict[int, Decimal | None]:
    result: dict[int, Decimal | None] = {}
    if not user_ids:
        return result
    with schema_context(tenant.schema_name):
        for row in UserAIPreferences.objects.filter(user_id__in=user_ids).values(
            "user_id", "monthly_usd_limit"
        ):
            result[row["user_id"]] = row["monthly_usd_limit"]
    return result
```

In `user_usage_for_month`, after building `result` list, for each entry with `user_id`:

```python
used = Decimal(entry["total_cost_usd"])
limit = get_user_budget(tenant, user_id)  # or batch-optimized variant
used_pct = float(used / limit) if limit > 0 else 0.0
entry["monthly_usd_limit"] = _decimal_str(limit)
entry["used_pct"] = used_pct
entry["remaining_usd"] = _decimal_str(max(Decimal("0"), limit - used))
entry["limit_status"] = (
    "at_limit" if used_pct >= 1.0
    else "near_limit" if used_pct >= 0.8
    else "ok"
)
```

- [ ] **Step 3: Tests**

```python
def test_build_user_usage_detail_includes_budget(self):
    detail = build_user_usage_detail(self.org, self.user_a.id, 2026, 7)
    self.assertIn("budget", detail)
    self.assertEqual(detail["budget"]["limit_source"], "platform_default")

def test_user_usage_for_month_includes_limit_status(self):
    users = user_usage_for_month(self.org, 2026, 6)
    self.assertIn("monthly_usd_limit", users[0])
    self.assertIn("limit_status", users[0])
```

- [ ] **Step 4: User API test**

```python
def test_get_ai_usage_includes_budget(self):
    res = self._client_for(self.admin).get(
        f"{self.api_prefix}/users/{self.admin.id}/ai-usage",
        {"year": 2026, "month": 7},
    )
    self.assertEqual(res.status_code, 200)
    self.assertIn("budget", res.json()["data"])
```

- [ ] **Step 5: Run**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_usage_reporting app_ai.tests.test_user_ai_api`

---

## Task 7: User preferences limit API

**Files:**
- Modify: `app_ai/serializers.py`
- Modify: `app_ai/user_preferences.py`
- Modify: `app_ai/user_views.py`
- Modify: `app_ai/tests/test_user_ai_api.py`

- [ ] **Step 1: Serializer field**

```python
monthly_usd_limit = serializers.DecimalField(
    max_digits=12, decimal_places=4, required=False, allow_null=True,
)

def validate_monthly_usd_limit(self, value):
    if value is None:
        return None
    if value <= 0:
        raise serializers.ValidationError("Must be greater than 0.")
    return value
```

- [ ] **Step 2: Extend `preferences_to_dict`**

Include `monthly_usd_limit`, `effective_monthly_usd_limit`, `limit_source` — resolve effective limit via `get_user_budget` (pass tenant from view).

Update `UserAIPreferencesView.get` to pass tenant into enriched dict helper, e.g. `preferences_to_dict(prefs, user_id=..., tenant=tenant)`.

- [ ] **Step 3: PATCH gating in `UserAIPreferencesView.patch`**

Before upsert:

```python
if "monthly_usd_limit" in request.data:
    if actor.id == user_id:
        return self.forbidden("You cannot change your own AI limit.")
    if not require_ai_memory_manage(actor, user_id) or actor.id == user_id:
        # manage_all required — check catalog: manage_all only for other users
        from app_ai.permissions import require_ai_memory_manage_all
        if not require_ai_memory_manage_all(actor):
            return self.forbidden("Only administrators can set AI limits.")
```

Add `require_ai_memory_manage_all(actor)` in `app_ai/permissions.py` if not present (checks `ai.memory.manage_all` only).

- [ ] **Step 4: Extend `upsert_preferences`**

Handle `monthly_usd_limit` key (allow explicit `None` to clear).

- [ ] **Step 5: API tests**

```python
def test_admin_sets_user_monthly_limit(self):
    res = self._client_for(self.admin).patch(
        f"{self.api_prefix}/users/{self.teacher.id}/ai-preferences",
        {"monthly_usd_limit": "10.00"},
        format="json",
    )
    self.assertEqual(res.status_code, 200)
    self.assertEqual(res.json()["data"]["monthly_usd_limit"], "10.0000")

def test_self_cannot_set_monthly_limit(self):
    res = self._client_for(self.admin).patch(
        f"{self.api_prefix}/users/{self.admin.id}/ai-preferences",
        {"monthly_usd_limit": "10.00"},
        format="json",
    )
    self.assertEqual(res.status_code, 403)
```

- [ ] **Step 6: Run**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_user_ai_api`

---

## Task 8: AIQueryView + Telegram handlers

**Files:**
- Modify: `app_ai/views.py`
- Modify: `app_telegram/tasks.py`
- Modify: `app_ai/tests/test_ai_query_view_guardrails.py`
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: AIQueryView user quota handler**

```python
from app_ai.exceptions import AIUserQuotaExceeded
from app_ai.quota import user_budget_snapshot

except AIUserQuotaExceeded as exc:
    return self.send_response(
        True,
        "user_quota_exceeded",
        {
            "code": "user_quota_exceeded",
            "details": str(exc),
            "limit_usd": str(exc.limit_usd),
            "used_usd": str(exc.used_usd),
        },
        status=429,
    )
```

On success, after `AIService().run()`:

```python
tenant = getattr(request, "tenant", None)
budget = None
if tenant is not None:
    budget = user_budget_snapshot(tenant, user.id)
return self.ok({..., "budget": budget})
```

- [ ] **Step 2: Telegram tasks**

Import `AIUserQuotaExceeded`, `user_budget_snapshot`.

Split `except AIQuotaExceeded` into:

```python
except AIUserQuotaExceeded as exc:
    _deliver_reply(client, chat_id, str(exc), **reply_kw)
except AIQuotaExceeded:
    _deliver_reply(client, chat_id, _QUOTA_MESSAGE, **reply_kw)
```

After successful reply, append footer:

```python
snap = user_budget_snapshot(tenant, user.id)
footer = _format_budget_footer(snap)  # local helper
if footer:
    reply_text = f"{reply_text}\n\n{footer}"
```

Helper:

```python
def _format_budget_footer(snap: dict) -> str:
    pct = snap["used_pct"]
    if pct >= 1.0:
        return ""
    if pct >= 0.8:
        return f"You've used {int(pct * 100)}% of your monthly AI allowance (${snap['monthly_usd_limit']})."
    return f"AI allowance: ${snap['remaining_usd']} of ${snap['monthly_usd_limit']} remaining this month."
```

- [ ] **Step 3: Tests**

Mock AIService to raise `AIUserQuotaExceeded`; assert 429 + code. Mock success with budget footer in telegram test.

- [ ] **Step 4: Run**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_ai_query_view_guardrails app_telegram.tests.test_ai_query`

---

## Task 9: Frontend types + org AI settings

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-settings-pane.tsx`

- [ ] **Step 1: Extend Zod schema**

```typescript
ai_default_user_monthly_usd_limit: z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .describe("Default per-user monthly USD limit"),
```

In `ai_platform_defaults`:

```typescript
default_user_monthly_usd_limit: z.number(),
```

- [ ] **Step 2: Form field in Budget card**

Add number input after org monthly USD limit (mirror existing pattern):

- Label: "Default per-user monthly limit (USD)"
- Placeholder: "Platform default"
- Description: `Platform default: $1.00` from `platformDefaults.default_user_monthly_usd_limit`

- [ ] **Step 3: patchAiSettings mapping**

Coerce empty string → `null` like `ai_monthly_usd_limit`.

- [ ] **Step 4: Manual smoke**

Load org AI settings in dev; save `5.00`; confirm GET returns value.

---

## Task 10: User Usage allowance panel

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts`
- Modify: `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx`

- [ ] **Step 1: Add budget schema**

```typescript
export const aiUserBudgetSchema = z.object({
  monthly_usd_limit: z.string(),
  used_usd: z.string(),
  remaining_usd: z.string(),
  used_pct: z.number(),
  is_over_limit: z.boolean(),
  limit_source: z.enum(["user_override", "org_default", "platform_default"]),
});

// extend aiUserUsageDetailSchema:
budget: aiUserBudgetSchema,
```

- [ ] **Step 2: Allowance card UI**

Above summary grid, when `usageQuery.data?.budget`:

- `Progress` component (`@/components/ui/progress`) with value `Math.min(100, used_pct * 100)`
- Text: `{formatAiUsd(used_usd)} / {formatAiUsd(monthly_usd_limit)}`
- Remaining: `{formatAiUsd(remaining_usd)} remaining`
- Variant classes: `< 0.8` default, `0.8–0.99` `text-amber-600`, `>= 1` destructive
- Subtext for admins: map `limit_source` → "Custom limit" / "Org default" / "Platform default ($1)"

---

## Task 11: Admin Limits form on user record

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/users/ai/ai-limits-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/ai/visibility.ts`
- Modify: `schedjuice-reimagined-fe/src/components/record/sections/record-ai.tsx`
- Modify: `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts`

- [ ] **Step 1: Visibility helper**

```typescript
export function canManageAiLimits({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  return (
    viewer.id !== subject.id &&
    permissionsFor(viewer).can("ai.memory.manage_all")
  );
}
```

- [ ] **Step 2: Limits form**

Card with:
- Read-only effective limit for all viewers with usage/memory view
- Editable `monthly_usd_limit` input when `canManageAiLimits`
- Helper: "Leave blank to use org default"
- PATCH via `patchUserAiPreferences`
- Clear button sets `monthly_usd_limit: null`

- [ ] **Step 3: Wire in RecordAi**

```typescript
{canManageAiLimits({ subject, viewer }) || showUsage ? (
  <AiLimitsForm userId={userId} readOnly={!canManageAiLimits(...)} />
) : null}
```

Extend preferences schema with optional limit fields on GET.

---

## Task 12: Org Top spenders columns

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/ai-usage.ts`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-usage-pane.tsx`

- [ ] **Step 1: Extend `aiUsageUserRowSchema`**

```typescript
monthly_usd_limit: z.string(),
used_pct: z.number(),
remaining_usd: z.string(),
limit_status: z.enum(["ok", "near_limit", "at_limit"]),
```

- [ ] **Step 2: Table columns**

After Cost: Limit, Used %, Status.

Status badge component (inline or small helper):

| `limit_status` | Label | className |
| --- | --- | --- |
| `ok` | OK | muted |
| `near_limit` | Near limit | amber |
| `at_limit` | At limit | destructive |

Optional: wrap `display_name` in `<Link href={/users/${row.user_id}?section=ai}>` when `user_id` set.

---

## Task 13: Shared budget footer util (future web chat)

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/ai/budget-footer.ts`
- Create: `schedjuice-reimagined-fe/src/lib/ai/budget-footer.test.ts`

- [ ] **Step 1: Implement formatter**

```typescript
export type AiBudgetSnapshot = {
  monthly_usd_limit: string;
  used_usd: string;
  remaining_usd: string;
  used_pct: number;
};

export function formatAiBudgetFooter(budget: AiBudgetSnapshot): string | null {
  if (budget.used_pct >= 1) return null;
  if (budget.used_pct >= 0.8) {
    return `You've used ${Math.round(budget.used_pct * 100)}% of your monthly AI allowance ($${budget.monthly_usd_limit}).`;
  }
  return `AI allowance: $${budget.remaining_usd} of $${budget.monthly_usd_limit} remaining this month.`;
}
```

- [ ] **Step 2: Unit tests**

Test three bands + at-limit returns null.

Run: `cd schedjuice-reimagined-fe && npm test -- budget-footer`

- [ ] **Step 3: Document wiring note**

When web AI chat UI is added, append `formatAiBudgetFooter(response.budget)` to answer bubble; handle 429 `user_quota_exceeded` with toast using `details` field.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Platform $1 default | 1 |
| Org `ai_default_user_monthly_usd_limit` | 2 |
| User `monthly_usd_limit` override | 3, 7, 11 |
| Layered enforcement | 4, 5 |
| User always hard-block | 4 |
| Org hard enforce unchanged | 4 |
| `user_quota_exceeded` code | 5, 8 |
| User usage `budget` block | 6, 10 |
| Org Top spenders limits | 6, 12 |
| Preferences PATCH admin-only | 7, 11 |
| Chat/Telegram footer | 8, 13 |
| AIQuery success `budget` | 8 |
| No token per-user limits | Out of scope |
| No unlimited override | Enforced in validation |

---

## Verification (full pass)

**Backend:**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_user_quota
./scripts/run_backend_tests.sh app_ai.tests.test_user_ai_api
./scripts/run_backend_tests.sh app_ai.tests.test_usage_reporting
./scripts/run_backend_tests.sh app_organization.tests.test_ai_settings_api
./scripts/run_backend_tests.sh app_ai.tests.test_ai_query_view_guardrails
./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query
```

**Frontend:**

```bash
cd schedjuice-reimagined-fe
npm test -- budget-footer
```

**Manual:**

1. Set org default per-user limit to $5 on org AI settings.
2. Confirm teacher Usage panel shows $0 / $5 allowance.
3. Set teacher override to $10 on user AI Limits card.
4. Confirm Top spenders shows limit + status after usage.
5. Telegram: confirm footer on reply and user-specific block message when capped.
