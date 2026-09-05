# AI Per-User Pricing Limits — Design Spec

**Date:** 2026-07-06  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Approach:** Extend existing quota module + `AIUsageLog` aggregation (Approach 1)

## 1. Summary

Add **layered monthly USD limits** so every AI request must pass **both**:

1. **Per-user cap** — always hard-enforced
2. **Org cap** — hard-enforced only when `Organization.ai_hard_enforce` is on (unchanged)

Schools get an org-wide **default per-user limit** (platform default **$1.00/month**), configurable
on org AI settings. Admins can set a **custom USD cap** per user on the user record (no
"unlimited" override). Users see remaining allowance inline in chat; admins see usage vs limit
on user Usage panels and the org AI usage dashboard.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Enforcement model | Layered ceiling — user **and** org checks |
| Default per-user limit | Applies to all AI users automatically |
| Platform default per-user USD | **$1.00/month** (`AI_DEFAULT_USER_MONTHLY_USD_LIMIT`) |
| Org default | Configurable on org AI settings; blank → platform $1 |
| User-level enforcement | **Always hard-block** |
| Org-level enforcement | Existing `ai_hard_enforce` toggle only |
| Per-user override | Custom USD amount only (no unlimited) |
| Limit metric (v1) | **USD billed cost** only (not tokens) |
| UX (v1) | Chat footer + user Usage progress + org admin Top spenders columns |
| Quota check source | Aggregate `AIUsageLog` for current UTC month (no new rollup table) |

---

## 2. Problem

Today:

- Org monthly USD/token caps exist but **per-user limits do not**.
- `assert_quota_allows(tenant)` checks **org total only** and only when `ai_hard_enforce` is on
  (defaults off).
- Per-user rate limiting (30 req/hour) prevents abuse but not spend runaway.
- One heavy user can consume the entire org budget before admins notice.
- Quota errors are generic; users have no visibility into remaining allowance.

---

## 3. Data model

### 3.1 Organization (public schema)

Add to `Organization`:

```python
ai_default_user_monthly_usd_limit = models.DecimalField(
    max_digits=12, decimal_places=4, null=True, blank=True,
    help_text="Default monthly USD cap per user. Null = platform default ($1).",
)
```

Expose on org AI settings GET/PATCH alongside existing budget fields.

**Platform setting** (new in `settings.py`):

```python
AI_DEFAULT_USER_MONTHLY_USD_LIMIT = config(
    "AI_DEFAULT_USER_MONTHLY_USD_LIMIT", default=1.0, cast=float
)
```

Include in `ai_platform_defaults` response as `default_user_monthly_usd_limit`.

### 3.2 UserAIPreferences (tenant schema, `app_auth/models_user_ai.py`)

Add:

```python
monthly_usd_limit = models.DecimalField(
    max_digits=12, decimal_places=4, null=True, blank=True,
    help_text="Admin override: monthly USD cap for this user. Null = org default.",
)
```

**Semantics:**

- `null` → inherit org default (which may itself inherit platform $1).
- Non-null → fixed cap for that user.
- No sentinel for "unlimited"; admins must enter a positive number to raise a user.

**Who may write:** `ai.memory.manage_all` only, and only when `target_user_id != actor.id`
(users cannot change their own cap via API).

---

## 4. Limit resolution & enforcement

### 4.1 Helpers (`app_ai/quota.py`)

```python
def get_default_user_budget() -> Decimal:
    """Platform default per-user USD limit."""

def get_org_default_user_budget(tenant: Organization) -> Decimal:
    """Org field or platform default."""

def get_user_budget(tenant: Organization, user_id: int) -> Decimal:
    """
    Effective per-user USD limit:
      UserAIPreferences.monthly_usd_limit (if row exists and field set)
      ?? tenant.ai_default_user_monthly_usd_limit
      ?? settings.AI_DEFAULT_USER_MONTHLY_USD_LIMIT
    """

def get_current_month_user_usage(tenant: Organization, user_id: int) -> Decimal:
    """Sum AIUsageLog.billed_cost_usd for tenant+user in current UTC month."""

def user_budget_snapshot(
    tenant: Organization, user_id: int,
) -> dict[str, Any]:
    """
    Returns monthly_usd_limit, used_usd, remaining_usd, used_pct (0–1+).
    Always returns a snapshot when user_id is set (limit always defined).
    """

def assert_user_quota_allows(tenant: Organization, user_id: int | None) -> None:
    """
    Always hard-enforces per-user cap when user_id is set.
    Raises AIUserQuotaExceeded with limit amount in message.
    Skips when user_id is None (system/background calls).
    """

def assert_quota_allows(tenant: Organization) -> None:
    """Unchanged org-level check (respects ai_hard_enforce)."""
```

### 4.2 Enforcement order in `AIService.run()`

After rate limit + guardrails, before main Gemini call:

```
assert_user_quota_allows(tenant, user.id)   # NEW — always hard
assert_quota_allows(tenant)                 # existing org check
```

### 4.3 Exceptions

New `AIUserQuotaExceeded(AIQuotaExceeded)` in `app_ai/exceptions.py`:

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

| Code | HTTP | When |
| --- | --- | --- |
| `user_quota_exceeded` | 429 | Personal cap hit |
| `quota_exceeded` | 429 | Org cap hit (`ai_hard_enforce`) |

Web response body for user quota:

```json
{
  "code": "user_quota_exceeded",
  "details": "Your monthly AI allowance ($1.00) is used up. Contact your administrator.",
  "limit_usd": "1.00",
  "used_usd": "1.02"
}
```

Telegram: send the same user-facing message (replace generic org quota copy when
`AIUserQuotaExceeded`).

Log `AIRequestLog` outcome: add `Outcome.USER_QUOTA_EXCEEDED` (or reuse `QUOTA_EXCEEDED`
with metadata — prefer distinct outcome for admin reporting).

---

## 5. Backend API changes

### 5.1 Org AI settings

**GET/PATCH** existing org AI settings endpoints — add:

| Field | Notes |
| --- | --- |
| `ai_default_user_monthly_usd_limit` | Nullable decimal |
| `ai_platform_defaults.default_user_monthly_usd_limit` | Read-only platform default |

Validation: if set, must be `> 0`, max e.g. `99999.99`.

### 5.2 `GET /api/v1/users/{user_id}/ai-usage`

Extend response with `budget` block (always present when limit resolves):

```json
{
  "user_id": 42,
  "year": 2026,
  "month": 7,
  "month_summary": { "...": "..." },
  "trend": [ "..." ],
  "budget": {
    "monthly_usd_limit": "1.00",
    "used_usd": "0.73",
    "remaining_usd": "0.27",
    "used_pct": 0.73,
    "is_over_limit": false,
    "limit_source": "org_default"
  }
}
```

`limit_source` enum: `user_override` | `org_default` | `platform_default`.

Implement via `user_budget_snapshot()` using selected month (not only current month).

### 5.3 `GET/PATCH /api/v1/users/{user_id}/ai-preferences`

**GET** — include read-only budget fields for viewers with `ai.memory.view_*` or
`ai.usage.view_*`:

```json
{
  "monthly_usd_limit": null,
  "effective_monthly_usd_limit": "1.00",
  "limit_source": "org_default"
}
```

**PATCH** — accept optional `monthly_usd_limit` (decimal or null to clear override).

- Requires `ai.memory.manage_all` and target ≠ actor.
- Validate `> 0` when non-null.
- Ignored on self PATCH even if caller has manage_own.

### 5.4 Org AI usage detail

Extend each row in `users` array from `build_org_detail()` / `user_usage_for_month()`:

```json
{
  "user_id": 42,
  "display_name": "Jane",
  "total_cost_usd": "0.95",
  "monthly_usd_limit": "1.00",
  "used_pct": 0.95,
  "remaining_usd": "0.05",
  "limit_status": "near_limit"
}
```

`limit_status` enum:

| Value | Condition |
| --- | --- |
| `ok` | `used_pct < 0.8` |
| `near_limit` | `0.8 <= used_pct < 1.0` |
| `at_limit` | `used_pct >= 1.0` |

Resolve per-user limit via `get_user_budget()`; load overrides in batch for all
user_ids in the ranking query to avoid N+1.

### 5.5 `POST /api/v1/ai/query` success response

Append `budget` snapshot (current month, post-request usage — computed after
`record_usage` in the success path, or include projected usage in footer text only).

```json
{
  "answer": "...",
  "budget": {
    "monthly_usd_limit": "1.00",
    "used_usd": "0.48",
    "remaining_usd": "0.52",
    "used_pct": 0.48
  }
}
```

Frontend appends a muted footer to the chat bubble when `budget` is present.

---

## 6. Frontend UX

### 6.1 Org AI settings — Budget & limits card

Add field below org monthly USD limit:

| Label | Control |
| --- | --- |
| Default per-user monthly limit (USD) | Number input, nullable (placeholder "Platform default — $1.00") |
| Helper | "Applies to every AI user unless overridden on their user record." |

Show platform default in `FormDescription` (same pattern as existing budget fields).

Update `organization-ai-settings.ts` schema + edit schema.

### 6.2 User record — AI section

**Usage panel** (`ai-usage-panel.tsx`):

- New **Allowance** card above summary stats: progress bar (`used_pct`), labels
  `$used / $limit`, remaining text.
- Color: default &lt;80%, warning 80–99%, destructive at 100%+.
- Show `limit_source` helper ("Org default" vs "Custom limit") for admins viewing others.

**Memory panel** or new **Limits** sub-section (admin only):

- Visible when viewer has `ai.memory.manage_all` and target ≠ self.
- Single field: **Monthly USD limit** (number, blank = inherit org default).
- Save via PATCH `ai-preferences` with `monthly_usd_limit`.
- Read-only display of effective limit for non-admin viewers.

Prefer adding the limit field to a small **Limits** card on the AI section (stacked
below Memory) rather than mixing into Memory form — keeps user prefs vs admin policy separate.

### 6.3 Org AI usage — Top spenders table

Add columns after **Cost**:

| Column | Content |
| --- | --- |
| Limit | `formatAiUsd(monthly_usd_limit)` |
| Used % | Progress mini-bar or percentage |
| Status | Badge: OK / Near limit / At limit |

Optional: link user name to `/users/{id}?section=ai`.

### 6.4 Web AI chat inline footer

When `budget` returned on successful query:

- `used_pct < 0.8`: no footer (silent)
- `0.8 <= used_pct < 1.0`: warning tone — "You've used 92% of your monthly AI allowance."
- Blocked state handled by 429 handler with `user_quota_exceeded` code.

### 6.5 Telegram

Append warning footer to successful replies only when `used_pct >= 0.8` and below cap
(plain text, after answer body). No footer below 80% usage.

On `AIUserQuotaExceeded`, reply with user message (not org-wide quota message).

---

## 7. Data flow

```
User prompt (web or Telegram)
  → rate limit
  → guardrails
  → assert_user_quota_allows(tenant, user.id)     # hard
  → assert_quota_allows(tenant)                   # if ai_hard_enforce
  → AIService.run() → record_usage()
  → response + budget snapshot footer

Admin sets org default
  → PATCH org AI settings (ai_default_user_monthly_usd_limit)

Admin sets user override
  → PATCH users/{id}/ai-preferences (monthly_usd_limit)
```

---

## 8. Error handling

| Case | Behavior |
| --- | --- |
| User at personal cap, org has budget | Block with `user_quota_exceeded` |
| User under cap, org at cap + hard enforce | Block with `quota_exceeded` |
| User under cap, org over cap, soft enforce | Allow (org tracking only) |
| `user_id` is None on service call | Skip user quota check |
| Invalid limit on PATCH | 400 field error |
| Non-admin sets `monthly_usd_limit` | Field ignored or 403 |
| User with no `UserAIPreferences` row | Org/platform default applies |

---

## 9. Testing

### Backend

- `get_user_budget()` resolution chain (override → org → platform)
- `assert_user_quota_allows()` blocks at limit; allows below
- Org hard enforce still independent
- `AIUserQuotaExceeded` vs `AIQuotaExceeded` in web + Telegram handlers
- User usage API includes `budget` block
- Org detail users include limit columns + `limit_status`
- PATCH preferences: manage_all can set/clear override; self cannot
- Org settings PATCH for `ai_default_user_monthly_usd_limit`

### Frontend

- Org AI settings field saves and shows platform default helper
- User Usage allowance progress bar states
- Admin Limits card visibility by permission
- Top spenders new columns render status badges
- Chat footer on success; 429 handler for `user_quota_exceeded`

---

## 10. Out of scope (v1)

- Per-user **token** limits (USD only)
- "Unlimited" per-user override
- Role-based default limits (teachers vs staff)
- User-level Discord/email alerts
- `AIUserUsageMonthly` rollup table (add only if quota check perf requires)
- Prorated limits for mid-month new users
- Bulk assign limits UI
- Platform superadmin UI for `AI_DEFAULT_USER_MONTHLY_USD_LIMIT` (env only)
- Student self-service limit visibility changes (follows existing AI section permissions)

---

## 11. Files (expected touch list)

### Backend

| File | Change |
| --- | --- |
| `app_organization/models.py` | `ai_default_user_monthly_usd_limit` |
| `app_organization/serializers.py` | Expose + validate field |
| `app_auth/models_user_ai.py` | `monthly_usd_limit` |
| `app_ai/quota.py` | User budget helpers + `assert_user_quota_allows` |
| `app_ai/exceptions.py` | `AIUserQuotaExceeded` |
| `app_ai/service.py` | Call user quota before org quota |
| `app_ai/reporting.py` | `user_budget_snapshot`, extend user/org payloads |
| `app_ai/views.py` | Handle `AIUserQuotaExceeded`; success `budget` |
| `app_ai/user_views.py` | Preferences PATCH for limit |
| `app_ai/serializers.py` | `monthly_usd_limit` on preferences |
| `app_ai/user_preferences.py` | Upsert limit field |
| `app_ai/models.py` | Optional `AIRequestLog.Outcome.USER_QUOTA_EXCEEDED` |
| `app_telegram/tasks.py` | User quota message + footer |
| `schedjuice_backend/settings.py` | `AI_DEFAULT_USER_MONTHLY_USD_LIMIT` |
| `app_ai/defaults.py` | Include in platform defaults helper |

### Frontend

| File | Change |
| --- | --- |
| `src/types/organization-ai-settings.ts` | New org field + platform default |
| `src/types/ai-user-preferences.ts` | Limit fields + usage budget block |
| `src/types/ai-usage.ts` | Org user row limit fields |
| `src/components/org/record/sections/org-ai-settings-pane.tsx` | Default per-user limit input |
| `src/components/users/ai/ai-usage-panel.tsx` | Allowance progress card |
| `src/components/users/ai/ai-limits-form.tsx` | New admin limits card |
| `src/components/record/sections/record-ai.tsx` | Mount limits form |
| `src/components/org/record/sections/org-ai-usage-pane.tsx` | Top spenders columns |
| Web AI chat component | Budget footer + 429 handling |

---

## 12. Migration notes

- Org migration: add nullable `ai_default_user_monthly_usd_limit` (no backfill — null means platform $1).
- Tenant migration: add nullable `monthly_usd_limit` on `UserAIPreferences`.
- No change to existing org `ai_monthly_usd_limit` behavior.
