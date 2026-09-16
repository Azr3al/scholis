"""Per-tenant AI quotas and spend-threshold alerts."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from collections.abc import Iterable
from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import Sum
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.exceptions import AIQuotaExceeded, AIUserQuotaExceeded
from app_ai.models import AITenantUsageMonthly, AIUsageLog
from app_auth.models_user_ai import UserAIPreferences
from app_organization.models import Organization
from app_utils.ops_discord import notify_discord_ops


def _default_budget() -> tuple[Decimal | None, Decimal | None, bool, list[float]]:
    usd = getattr(settings, "AI_DEFAULT_MONTHLY_USD_LIMIT", None)
    tokens = getattr(settings, "AI_DEFAULT_MONTHLY_TOKEN_LIMIT", None)
    hard = bool(getattr(settings, "AI_DEFAULT_HARD_ENFORCE", False))
    thresholds = getattr(settings, "AI_DEFAULT_ALERT_THRESHOLDS", [0.5, 0.8, 1.0])
    usd_dec = Decimal(str(usd)) if usd is not None else None
    token_int = int(tokens) if tokens is not None else None
    return usd_dec, token_int, hard, [float(x) for x in thresholds]


def _effective_thresholds(tenant: Organization) -> list[float]:
    raw = tenant.ai_alert_thresholds or []
    if not raw:
        return [0.5, 0.8, 1.0]
    return [float(x) for x in raw]


def get_tenant_budget(tenant: Organization) -> tuple[
    Decimal | None, Decimal | None, bool, list[float], bool
]:
    """Return (usd_limit, token_limit, hard_enforce, alert_thresholds, is_active)."""
    if not tenant.ai_budget_active:
        usd, tokens, hard, thresholds = _default_budget()
        return usd, tokens, hard, thresholds, False

    usd_limit = tenant.ai_monthly_usd_limit
    token_limit = tenant.ai_monthly_token_limit
    hard_enforce = tenant.ai_hard_enforce
    thresholds = _effective_thresholds(tenant)

    default_usd, default_tokens, default_hard, default_thresholds = _default_budget()
    if usd_limit is None:
        usd_limit = default_usd
    if token_limit is None:
        token_limit = default_tokens
    if not tenant.ai_alert_thresholds:
        thresholds = default_thresholds

    return usd_limit, token_limit, hard_enforce, thresholds, True


def get_current_month_usage(tenant: Organization) -> tuple[Decimal, int]:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    with schema_context(get_public_schema_name()):
        rows = AITenantUsageMonthly.objects.filter(
            tenant=tenant, year=now.year, month=now.month
        )
        total_usd = sum((r.total_billed_usd for r in rows), Decimal("0"))
        total_tokens = sum((r.total_tokens for r in rows), 0)
    return total_usd, total_tokens


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


def get_user_budgets_batch(
    tenant: Organization, user_ids: Iterable[int]
) -> dict[int, Decimal]:
    """Return effective monthly USD budget for each user id (single query)."""
    ids = list(user_ids)
    if not ids:
        return {}
    default = get_org_default_user_budget(tenant)
    budgets: dict[int, Decimal] = dict.fromkeys(ids, default)
    schema = tenant.schema_name
    if not schema:
        return budgets
    with schema_context(schema):
        for row in UserAIPreferences.objects.filter(
            user_id__in=ids,
            monthly_usd_limit__isnull=False,
        ).values("user_id", "monthly_usd_limit"):
            budgets[row["user_id"]] = row["monthly_usd_limit"]
    return budgets


def get_user_budget(tenant: Organization, user_id: int) -> Decimal:
    return get_user_budgets_batch(tenant, [user_id])[user_id]


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
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    limit = get_user_budget(tenant, user_id)
    used = (
        used_usd
        if used_usd is not None
        else get_user_usage_for_month(tenant, user_id, year, month)
    )
    remaining = max(Decimal("0"), limit - used)
    used_pct = float(used / limit) if limit > 0 else 0.0
    override: Decimal | None = None
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


def assert_quota_allows(tenant: Organization) -> None:
    usd_limit, token_limit, hard_enforce, _, active = get_tenant_budget(tenant)
    if not active:
        return
    if not hard_enforce:
        return
    used_usd, used_tokens = get_current_month_usage(tenant)
    if usd_limit is not None and used_usd >= usd_limit:
        raise AIQuotaExceeded(
            f"Monthly AI spend limit reached (${usd_limit}). Contact your administrator."
        )
    if token_limit is not None and used_tokens >= token_limit:
        raise AIQuotaExceeded(
            f"Monthly AI token limit reached ({token_limit}). Contact your administrator."
        )


def maybe_send_spend_alerts(*, tenant: Organization, rollup: AITenantUsageMonthly) -> None:
    usd_limit, token_limit, _, thresholds, active = get_tenant_budget(tenant)
    if not active:
        return

    used_usd, used_tokens = get_current_month_usage(tenant)
    limit: Decimal | None = usd_limit
    used = used_usd
    unit = "USD"
    if limit is None and token_limit is not None:
        limit = Decimal(token_limit)
        used = Decimal(used_tokens)
        unit = "tokens"
    if limit is None or limit <= 0:
        return

    ratio = float(used / limit)
    crossed = [t for t in sorted(thresholds) if ratio >= t]
    if not crossed:
        return

    highest = Decimal(str(crossed[-1]))
    with schema_context(get_public_schema_name()):
        existing = AITenantUsageMonthly.objects.filter(
            tenant=tenant, year=rollup.year, month=rollup.month
        ).aggregate(models.Max("highest_alert_threshold"))
    prior = existing.get("highest_alert_threshold__max") or Decimal("0")
    if prior >= highest:
        return

    pct = int(crossed[-1] * 100)
    notify_discord_ops(
        f"AI spend alert: tenant reached {pct}% of monthly {unit} limit "
        f"({used} / {limit}).",
        tenant=tenant,
    )

    with schema_context(get_public_schema_name()):
        AITenantUsageMonthly.objects.filter(
            tenant=tenant, year=rollup.year, month=rollup.month
        ).update(highest_alert_threshold=highest)
