"""Aggregate AI usage for platform and org dashboards."""
from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import (
    LIKELY_CAUSE_COMPLEX_TASK,
    LIKELY_CAUSE_MODEL_LOOP,
    LIKELY_CAUSE_TOOL_DESCRIPTIONS,
    LIKELY_CAUSE_UNKNOWN,
    LIKELY_CAUSE_UNCATEGORIZED,
    VALID_LIKELY_CAUSES,
)
from app_ai.capability_gap.constants import (
    CAPABILITY_GAP_ACCESS_POLICY,
    CAPABILITY_GAP_DATA_NOT_EXPOSED,
    CAPABILITY_GAP_FEATURE_UNAVAILABLE,
    CAPABILITY_GAP_MISSING_TOOL,
    CAPABILITY_GAP_UNKNOWN,
    VALID_CAPABILITY_GAPS,
)
from app_ai.models import AIUsageLog, AIRequestLog, AITenantUsageMonthly, AIUserUsageMonthly
from app_ai.pricing import cache_hit_rate, compute_cache_savings_usd
from app_ai.quota import (
    get_org_default_user_budget,
    get_tenant_budget,
    get_user_budgets_batch,
    user_budget_snapshot,
)
from app_auth.models import User
from app_organization.models import Organization


def _decimal_str(value: Decimal) -> str:
    return format(value, "f")


def _empty_month_totals() -> dict[str, Any]:
    return {
        "total_cost_usd": "0",
        "total_tokens": 0,
        "request_count": 0,
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "cache_hit_rate": 0.0,
        "cache_savings_usd": "0",
    }


def _empty_cache_fields() -> dict[str, Any]:
    empty = _empty_month_totals()
    return {
        key: empty[key]
        for key in (
            "input_tokens",
            "cached_input_tokens",
            "cache_hit_rate",
            "cache_savings_usd",
        )
    }


def _cache_fields_from_monthly_rows(rows) -> dict[str, Any]:
    input_tokens = sum((r.input_tokens for r in rows), 0)
    cached_input_tokens = sum((r.cached_input_tokens for r in rows), 0)
    cache_write_tokens = sum((r.cache_write_tokens for r in rows), 0)
    savings = sum(
        (
            compute_cache_savings_usd(
                r.model,
                cached_input_tokens=r.cached_input_tokens,
                cache_write_tokens=r.cache_write_tokens,
            )
            for r in rows
        ),
        Decimal("0"),
    )
    return {
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "cache_hit_rate": cache_hit_rate(
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
        ),
        "cache_savings_usd": _decimal_str(savings),
    }


def _cache_fields_from_model_aggregates(aggregates: list[dict[str, Any]]) -> dict[str, Any]:
    input_tokens = sum((row.get("input_tokens") or 0 for row in aggregates), 0)
    cached_input_tokens = sum(
        (row.get("cached_input_tokens") or 0 for row in aggregates),
        0,
    )
    cache_write_tokens = sum(
        (row.get("cache_write_tokens") or 0 for row in aggregates),
        0,
    )
    savings = sum(
        (
            compute_cache_savings_usd(
                row["model"],
                cached_input_tokens=row.get("cached_input_tokens") or 0,
                cache_write_tokens=row.get("cache_write_tokens") or 0,
            )
            for row in aggregates
        ),
        Decimal("0"),
    )
    return {
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "cache_hit_rate": cache_hit_rate(
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
        ),
        "cache_savings_usd": _decimal_str(savings),
    }


def iter_months_ending(year: int, month: int, count: int = 6) -> list[tuple[int, int]]:
    """Return `count` calendar months ending at (year, month), oldest first."""
    y, m = year, month
    months: list[tuple[int, int]] = []
    for _ in range(count):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()
    return months


def aggregate_monthly_rows(rows) -> dict[str, Any]:
    total_cost = sum((r.total_billed_usd for r in rows), Decimal("0"))
    total_tokens = sum((r.total_tokens for r in rows), 0)
    request_count = sum((r.request_count for r in rows), 0)
    cache_fields = _cache_fields_from_monthly_rows(rows) if rows else _empty_cache_fields()
    return {
        "total_cost_usd": _decimal_str(total_cost),
        "total_tokens": total_tokens,
        "request_count": request_count,
        **cache_fields,
    }


def _month_bounds_utc(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _monthly_rows_for_tenant(tenant: Organization, year: int, month: int):
    with schema_context(get_public_schema_name()):
        return list(
            AITenantUsageMonthly.objects.filter(
                tenant=tenant,
                year=year,
                month=month,
            )
        )


def budget_snapshot(
    tenant: Organization,
    selected_cost_usd: Decimal,
) -> dict[str, Any] | None:
    usd_limit, _, _, _, _ = get_tenant_budget(tenant)
    if usd_limit is None:
        return None
    used_pct = float(selected_cost_usd / usd_limit) if usd_limit > 0 else 0.0
    return {
        "monthly_usd_limit": _decimal_str(usd_limit),
        "used_pct": used_pct,
    }


DEFAULT_TOP_SPENDERS_LIMIT = 50


def _user_usage_rows_from_logs(
    tenant: Organization,
    year: int,
    month: int,
    *,
    limit: int | None,
) -> list[dict[str, Any]]:
    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        aggregates = AIUsageLog.objects.filter(
            tenant=tenant,
            created_at__gte=start,
            created_at__lt=end,
        ).values("user_id").annotate(
            total_cost_usd=Sum("billed_cost_usd"),
            total_tokens=Sum("total_tokens"),
            request_count=Count("id"),
            input_tokens=Sum("input_tokens"),
            cached_input_tokens=Sum("cached_input_tokens"),
        ).order_by("-total_cost_usd")
        if limit is not None:
            aggregates = aggregates[:limit]
        return list(aggregates)


def _user_usage_rows_from_rollup(
    tenant: Organization,
    year: int,
    month: int,
    *,
    limit: int | None,
) -> list[dict[str, Any]]:
    with schema_context(get_public_schema_name()):
        qs = AIUserUsageMonthly.objects.filter(
            tenant=tenant,
            year=year,
            month=month,
        ).order_by("-total_billed_usd")
        if limit is not None:
            qs = qs[:limit]
        return [
            {
                "user_id": row.user_id,
                "total_cost_usd": row.total_billed_usd,
                "total_tokens": row.total_tokens,
                "request_count": row.request_count,
                "input_tokens": row.input_tokens,
                "cached_input_tokens": row.cached_input_tokens,
            }
            for row in qs
        ]


def _rollup_exists_for_month(tenant: Organization, year: int, month: int) -> bool:
    with schema_context(get_public_schema_name()):
        return AIUserUsageMonthly.objects.filter(
            tenant=tenant,
            year=year,
            month=month,
        ).exists()


def _enrich_user_usage_rows(
    tenant: Organization,
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    user_ids = [r["user_id"] for r in rows if r["user_id"] is not None]
    users_by_id: dict[int, User] = {}
    if user_ids:
        with schema_context(tenant.schema_name):
            users_by_id = {
                u.id: u
                for u in User.objects.filter(
                    id__in=user_ids,
                    is_active=True,
                ).only("id", "name", "email")
            }

    budgets_by_user = get_user_budgets_batch(tenant, user_ids)
    org_default_budget = get_org_default_user_budget(tenant)

    result: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []
    for row in rows:
        user_id = row["user_id"]
        input_t = row["input_tokens"] or 0
        cached_t = row["cached_input_tokens"] or 0
        entry = {
            "user_id": user_id,
            "display_name": "Unknown user",
            "email": "",
            "total_cost_usd": _decimal_str(row["total_cost_usd"] or Decimal("0")),
            "total_tokens": row["total_tokens"] or 0,
            "request_count": row["request_count"] or 0,
            "cached_input_tokens": cached_t,
            "cache_hit_rate": cache_hit_rate(
                input_tokens=input_t,
                cached_input_tokens=cached_t,
            ),
        }
        if user_id is None:
            unknown.append(entry)
            continue
        user = users_by_id.get(user_id)
        if user is not None:
            entry["display_name"] = user.name or user.email
            entry["email"] = user.email or ""
        else:
            entry["display_name"] = f"User #{user_id}"
        used = Decimal(entry["total_cost_usd"])
        limit = budgets_by_user.get(user_id, org_default_budget)
        used_pct = float(used / limit) if limit > 0 else 0.0
        remaining = max(Decimal("0"), limit - used)
        entry["monthly_usd_limit"] = _decimal_str(limit)
        entry["used_pct"] = used_pct
        entry["remaining_usd"] = _decimal_str(remaining)
        entry["limit_status"] = (
            "at_limit"
            if used_pct >= 1.0
            else "near_limit"
            if used_pct >= 0.8
            else "ok"
        )
        result.append(entry)
    return result + unknown


def user_usage_for_month(
    tenant: Organization,
    year: int,
    month: int,
    *,
    limit: int = DEFAULT_TOP_SPENDERS_LIMIT,
) -> list[dict[str, Any]]:
    if _rollup_exists_for_month(tenant, year, month):
        rows = _user_usage_rows_from_rollup(tenant, year, month, limit=limit)
    else:
        rows = _user_usage_rows_from_logs(tenant, year, month, limit=limit)
    return _enrich_user_usage_rows(tenant, rows)


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
            input_tokens=Sum("input_tokens"),
            cached_input_tokens=Sum("cached_input_tokens"),
        )
        by_model = list(
            base_qs.values("model")
            .annotate(
                input_tokens=Sum("input_tokens"),
                cached_input_tokens=Sum("cached_input_tokens"),
                cache_write_tokens=Sum("cache_write_tokens"),
            )
        )
        by_feature = list(
            base_qs.values("feature")
            .annotate(
                total_cost_usd=Sum("billed_cost_usd"),
                total_tokens=Sum("total_tokens"),
                request_count=Count("id"),
                input_tokens=Sum("input_tokens"),
                cached_input_tokens=Sum("cached_input_tokens"),
            )
            .order_by("-total_cost_usd")
        )

    input_tokens = month_agg["input_tokens"] or 0
    cached_input_tokens = month_agg["cached_input_tokens"] or 0
    cache_fields = _cache_fields_from_model_aggregates(by_model)

    month_summary = {
        "total_cost_usd": _decimal_str(month_agg["total_cost_usd"] or Decimal("0")),
        "total_tokens": month_agg["total_tokens"] or 0,
        "request_count": month_agg["request_count"] or 0,
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "cache_hit_rate": cache_hit_rate(
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
        ),
        "cache_savings_usd": cache_fields["cache_savings_usd"],
        "by_feature": [
            {
                "feature": row["feature"] or "(unknown)",
                "total_cost_usd": _decimal_str(row["total_cost_usd"] or Decimal("0")),
                "total_tokens": row["total_tokens"] or 0,
                "request_count": row["request_count"] or 0,
                "cached_input_tokens": row["cached_input_tokens"] or 0,
                "cache_hit_rate": cache_hit_rate(
                    input_tokens=row["input_tokens"] or 0,
                    cached_input_tokens=row["cached_input_tokens"] or 0,
                ),
            }
            for row in by_feature
        ],
    }

    trend: list[dict[str, Any]] = []
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
                input_tokens=Sum("input_tokens"),
                cached_input_tokens=Sum("cached_input_tokens"),
            )
            trend_by_model = list(
                AIUsageLog.objects.filter(
                    tenant=tenant,
                    user_id=user_id,
                    created_at__gte=s,
                    created_at__lt=e,
                )
                .values("model")
                .annotate(
                    input_tokens=Sum("input_tokens"),
                    cached_input_tokens=Sum("cached_input_tokens"),
                    cache_write_tokens=Sum("cache_write_tokens"),
                )
            )
        trend_input = agg["input_tokens"] or 0
        trend_cached = agg["cached_input_tokens"] or 0
        trend_cache_fields = _cache_fields_from_model_aggregates(trend_by_model)
        trend.append(
            {
                "year": y,
                "month": m,
                "total_cost_usd": _decimal_str(agg["total_cost_usd"] or Decimal("0")),
                "total_tokens": agg["total_tokens"] or 0,
                "request_count": agg["request_count"] or 0,
                "input_tokens": trend_input,
                "cached_input_tokens": trend_cached,
                "cache_hit_rate": cache_hit_rate(
                    input_tokens=trend_input,
                    cached_input_tokens=trend_cached,
                ),
                "cache_savings_usd": trend_cache_fields["cache_savings_usd"],
            }
        )

    return {
        "user_id": user_id,
        "year": year,
        "month": month,
        "month_summary": month_summary,
        "trend": trend,
        "budget": user_budget_snapshot(tenant, user_id, year=year, month=month),
    }


def build_platform_summary(year: int, month: int) -> dict[str, Any]:
    month_keys = iter_months_ending(year, month, 6)
    with schema_context(get_public_schema_name()):
        orgs = list(Organization.objects.all().order_by("name"))
        all_rows = list(
            AITenantUsageMonthly.objects.filter(
                year__in={y for y, _ in month_keys},
                month__in={m for _, m in month_keys},
            ).select_related("tenant")
        )

    rows_by_tenant_month: dict[tuple[int, int, int], list] = {}
    for row in all_rows:
        key = (row.tenant_id, row.year, row.month)
        rows_by_tenant_month.setdefault(key, []).append(row)

    organizations: list[dict[str, Any]] = []
    platform_cost = Decimal("0")
    platform_tokens = 0
    platform_requests = 0
    platform_input_tokens = 0
    platform_cached_tokens = 0
    platform_savings = Decimal("0")

    for org in orgs:
        selected_rows = rows_by_tenant_month.get((org.id, year, month), [])
        selected = (
            aggregate_monthly_rows(selected_rows)
            if selected_rows
            else _empty_month_totals()
        )
        selected_cost = Decimal(selected["total_cost_usd"])
        platform_cost += selected_cost
        platform_tokens += selected["total_tokens"]
        platform_requests += selected["request_count"]
        platform_input_tokens += selected.get("input_tokens", 0)
        platform_cached_tokens += selected.get("cached_input_tokens", 0)
        platform_savings += Decimal(selected.get("cache_savings_usd", "0"))

        trend = []
        for y, m in month_keys:
            trend_rows = rows_by_tenant_month.get((org.id, y, m), [])
            trend_totals = (
                aggregate_monthly_rows(trend_rows)
                if trend_rows
                else _empty_month_totals()
            )
            trend.append({"year": y, "month": m, **trend_totals})

        org_entry = {
            "organization_id": org.id,
            "name": org.name,
            "schema_name": org.schema_name,
            "selected_month": selected,
            "budget": budget_snapshot(org, selected_cost),
            "trend": trend,
        }
        organizations.append(org_entry)

    organizations.sort(
        key=lambda o: Decimal(o["selected_month"]["total_cost_usd"]),
        reverse=True,
    )

    return {
        "year": year,
        "month": month,
        "totals": {
            "total_cost_usd": _decimal_str(platform_cost),
            "total_tokens": platform_tokens,
            "request_count": platform_requests,
            "organization_count": len(orgs),
            "input_tokens": platform_input_tokens,
            "cached_input_tokens": platform_cached_tokens,
            "cache_hit_rate": cache_hit_rate(
                input_tokens=platform_input_tokens,
                cached_input_tokens=platform_cached_tokens,
            ),
            "cache_savings_usd": _decimal_str(platform_savings),
        },
        "organizations": organizations,
    }


def build_org_usage_summary(org: Organization, year: int, month: int) -> dict[str, Any]:
    rows = _monthly_rows_for_tenant(org, year, month)
    month_summary = aggregate_monthly_rows(rows) if rows else _empty_month_totals()
    by_model = []
    for row in rows:
        cache_fields = _cache_fields_from_monthly_rows([row])
        by_model.append(
            {
                "model": row.model or "(default)",
                "total_cost_usd": _decimal_str(row.total_billed_usd),
                "total_tokens": row.total_tokens,
                "request_count": row.request_count,
                **cache_fields,
            }
        )
    by_model.sort(key=lambda r: Decimal(r["total_cost_usd"]), reverse=True)

    return {
        "organization": {"id": org.id, "name": org.name},
        "year": year,
        "month": month,
        "month_summary": {**month_summary, "by_model": by_model},
    }


def build_org_users_payload(
    org: Organization,
    year: int,
    month: int,
    *,
    limit: int = DEFAULT_TOP_SPENDERS_LIMIT,
) -> dict[str, Any]:
    return {
        "year": year,
        "month": month,
        "users": user_usage_for_month(org, year, month, limit=limit),
    }


def build_org_detail(org: Organization, year: int, month: int) -> dict[str, Any]:
    return build_org_usage_summary(org, year, month)


def parse_year_month(
    year_param: str | None,
    month_param: str | None,
) -> tuple[int, int] | None:
    now = datetime.now(timezone.utc)
    try:
        year = int(year_param) if year_param is not None else now.year
        month = int(month_param) if month_param is not None else now.month
    except (TypeError, ValueError):
        return None
    if month < 1 or month > 12:
        return None
    if year < 2000 or year > 2100:
        return None
    return year, month


DEFAULT_FAILURES_OUTCOME = "tool_limit_exceeded"
DEFAULT_FAILURES_FEATURE = "telegram_query"
DEFAULT_FAILURES_RESOLUTION = "open"
MAX_FAILURES_PAGE_SIZE = 100

VALID_FAILURES_RESOLUTIONS = frozenset({"open", "resolved", "all"})

VALID_FAILURES_OUTCOMES = frozenset(
    {
        AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
        AIRequestLog.Outcome.CAPABILITY_GAP,
        "all",
    }
)

FAILURE_OUTCOME_ALL = "all"

FAILURES_SORT_MAP = {
    "created_at": "created_at",
    "-created_at": "-created_at",
    "tool_iterations": "tool_iterations",
    "-tool_iterations": "-tool_iterations",
}

USER_FACING_FEATURES = ("telegram_query", "ai_query")
DEFAULT_REQUESTS_FEATURE = "telegram_query"
REQUESTS_FEATURE_ALL = "all"
REQUESTS_OUTCOME_ALL = "all"
MAX_REQUESTS_PAGE_SIZE = 100

VALID_REQUESTS_OUTCOMES = frozenset(
    {
        REQUESTS_OUTCOME_ALL,
        AIRequestLog.Outcome.SUCCESS,
        AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
        AIRequestLog.Outcome.CAPABILITY_GAP,
        AIRequestLog.Outcome.ERROR,
        AIRequestLog.Outcome.BLOCKED,
        AIRequestLog.Outcome.RATE_LIMITED,
    }
)

REQUESTS_SORT_MAP = {
    **FAILURES_SORT_MAP,
    "total_tokens": "total_tokens",
    "-total_tokens": "-total_tokens",
}


def _request_log_user_display(
    row: AIRequestLog,
    users_by_tenant: dict[int, dict[int, User]],
) -> tuple[str, str]:
    user_display = "Unknown user"
    user_email = ""
    if row.user_id is not None:
        user = users_by_tenant.get(row.tenant_id, {}).get(row.user_id)
        if user is not None:
            user_display = user.name or user.email
            user_email = user.email or ""
        else:
            user_display = f"User #{row.user_id}"
    return user_display, user_email


def _serialize_request_log_row(
    row: AIRequestLog,
    users_by_tenant: dict[int, dict[int, User]],
    resolver_names: dict[int, str] | None = None,
) -> dict[str, Any]:
    user_display, user_email = _request_log_user_display(row, users_by_tenant)
    resolver_names = resolver_names or {}
    return {
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
        "outcome": row.outcome,
        "tool_iterations": row.tool_iterations,
        "tool_calls": row.tool_calls,
        "likely_causes": row.likely_causes,
        "capability_gaps": row.capability_gaps,
        "capability_gap_intent": row.capability_gap_intent,
        "capability_gap_reason": row.capability_gap_reason,
        "capability_gap_domain": row.capability_gap_domain,
        "capability_gap_suggested_surface": row.capability_gap_suggested_surface,
        "model": row.model,
        "total_tokens": row.total_tokens,
        "latency_ms": row.latency_ms,
        "source": row.source,
        "thinking_steps": row.thinking_steps or [],
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "resolved_by_user_id": row.resolved_by_user_id,
        "resolved_by_display_name": _resolver_display_name(row, resolver_names),
    }


def serialize_request_log_failure_item(row: AIRequestLog) -> dict[str, Any]:
    tenants = {row.tenant_id: row.tenant}
    users_by_tenant = _resolve_users_by_tenant([row], tenants)
    resolver_ids = {row.resolved_by_user_id} if row.resolved_by_user_id else set()
    resolver_names = _resolve_resolver_display_names(resolver_ids)
    return _serialize_request_log_row(row, users_by_tenant, resolver_names)


def _resolve_users_by_tenant(
    rows: list[AIRequestLog],
    tenants: dict[int, Organization],
) -> dict[int, dict[int, User]]:
    users_by_tenant: dict[int, dict[int, User]] = {}
    rows_by_tenant: dict[int, list[AIRequestLog]] = {}
    for row in rows:
        rows_by_tenant.setdefault(row.tenant_id, []).append(row)
    for tid, tenant_rows in rows_by_tenant.items():
        tenant = tenants.get(tid) or tenant_rows[0].tenant
        user_ids = [r.user_id for r in tenant_rows if r.user_id is not None]
        if not user_ids:
            continue
        with schema_context(tenant.schema_name):
            users_by_tenant[tid] = {
                u.id: u for u in User.objects.filter(id__in=user_ids, is_active=True)
            }
    return users_by_tenant


def _requests_feature_filter(feature: str):
    if feature == REQUESTS_FEATURE_ALL:
        return {"feature__in": USER_FACING_FEATURES}
    return {"feature": feature}


def _count_by_outcome(qs) -> dict[str, int]:
    return {
        outcome: qs.filter(outcome=outcome).count()
        for outcome in (
            AIRequestLog.Outcome.SUCCESS,
            AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
            AIRequestLog.Outcome.CAPABILITY_GAP,
            AIRequestLog.Outcome.ERROR,
            AIRequestLog.Outcome.BLOCKED,
            AIRequestLog.Outcome.RATE_LIMITED,
        )
    }


def _count_by_likely_cause(qs) -> dict[str, int]:
    rows = qs.values_list("likely_causes", "source")
    counts = {
        LIKELY_CAUSE_TOOL_DESCRIPTIONS: 0,
        LIKELY_CAUSE_MODEL_LOOP: 0,
        LIKELY_CAUSE_COMPLEX_TASK: 0,
        LIKELY_CAUSE_UNKNOWN: 0,
        LIKELY_CAUSE_UNCATEGORIZED: 0,
    }
    for causes, source in rows:
        if not causes and source == AIRequestLog.Source.LIVE:
            counts[LIKELY_CAUSE_UNCATEGORIZED] += 1
        for code in (
            LIKELY_CAUSE_TOOL_DESCRIPTIONS,
            LIKELY_CAUSE_MODEL_LOOP,
            LIKELY_CAUSE_COMPLEX_TASK,
            LIKELY_CAUSE_UNKNOWN,
        ):
            if code in (causes or []):
                counts[code] += 1
    return counts


def _count_by_capability_gap(qs) -> dict[str, int]:
    rows = qs.filter(outcome=AIRequestLog.Outcome.CAPABILITY_GAP).values_list(
        "capability_gaps", flat=True
    )
    counts = {
        CAPABILITY_GAP_MISSING_TOOL: 0,
        CAPABILITY_GAP_DATA_NOT_EXPOSED: 0,
        CAPABILITY_GAP_ACCESS_POLICY: 0,
        CAPABILITY_GAP_FEATURE_UNAVAILABLE: 0,
        CAPABILITY_GAP_UNKNOWN: 0,
    }
    for gaps in rows:
        for code in (
            CAPABILITY_GAP_MISSING_TOOL,
            CAPABILITY_GAP_DATA_NOT_EXPOSED,
            CAPABILITY_GAP_ACCESS_POLICY,
            CAPABILITY_GAP_FEATURE_UNAVAILABLE,
            CAPABILITY_GAP_UNKNOWN,
        ):
            if code in (gaps or []):
                counts[code] += 1
    return counts


def _top_gap_domains(qs, *, limit: int = 5) -> list[dict[str, Any]]:
    from collections import Counter

    domains = Counter(
        domain
        for domain in qs.filter(
            outcome=AIRequestLog.Outcome.CAPABILITY_GAP
        ).values_list("capability_gap_domain", flat=True)
        if domain
    )
    return [
        {"domain": domain, "count": count}
        for domain, count in domains.most_common(limit)
    ]


def _failure_outcomes_for_filter(outcome: str) -> list[str]:
    if outcome == FAILURE_OUTCOME_ALL:
        return [
            AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
            AIRequestLog.Outcome.CAPABILITY_GAP,
        ]
    return [outcome]


def _apply_failures_resolution_filter(qs, resolution: str):
    if resolution == "open":
        return qs.filter(resolved_at__isnull=True)
    if resolution == "resolved":
        return qs.filter(resolved_at__isnull=False)
    return qs


def _resolver_display_name(
    row: AIRequestLog,
    resolver_names: dict[int, str],
) -> str:
    if row.resolved_by_user_id is None:
        return ""
    return resolver_names.get(row.resolved_by_user_id, f"User #{row.resolved_by_user_id}")


def _resolve_resolver_display_names(resolver_ids: set[int]) -> dict[int, str]:
    if not resolver_ids:
        return {}
    names: dict[int, str] = {}
    with schema_context(get_public_schema_name()):
        schema_names = list(Organization.objects.values_list("schema_name", flat=True))
    for schema_name in schema_names:
        remaining = resolver_ids - names.keys()
        if not remaining:
            break
        with schema_context(schema_name):
            for user in User.objects.filter(id__in=remaining, is_active=True):
                names[user.id] = user.name or user.email or f"User #{user.id}"
    for user_id in resolver_ids:
        names.setdefault(user_id, f"User #{user_id}")
    return names


def build_failures_list(
    *,
    year: int,
    month: int,
    outcome: str = DEFAULT_FAILURES_OUTCOME,
    feature: str = DEFAULT_FAILURES_FEATURE,
    tenant_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
    likely_cause: str | None = None,
    capability_gap: str | None = None,
    resolution: str = DEFAULT_FAILURES_RESOLUTION,
    sort: str = "-created_at",
) -> dict[str, Any]:
    page_size = min(max(page_size, 1), MAX_FAILURES_PAGE_SIZE)
    page = max(page, 1)
    start, end = _month_bounds_utc(year, month)

    if likely_cause and likely_cause not in VALID_LIKELY_CAUSES:
        raise ValueError(f"Invalid likely_cause: {likely_cause}")
    if outcome not in VALID_FAILURES_OUTCOMES:
        raise ValueError(f"Invalid outcome: {outcome}")
    if capability_gap and capability_gap not in VALID_CAPABILITY_GAPS:
        raise ValueError(f"Invalid capability_gap: {capability_gap}")
    if resolution not in VALID_FAILURES_RESOLUTIONS:
        raise ValueError(f"Invalid resolution: {resolution}")

    order = FAILURES_SORT_MAP.get(sort, "-created_at")
    outcome_values = _failure_outcomes_for_filter(outcome)

    with schema_context(get_public_schema_name()):
        month_qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            feature=feature,
        )
        if tenant_id is not None:
            month_qs = month_qs.filter(tenant_id=tenant_id)
        month_qs = _apply_failures_resolution_filter(month_qs, resolution)

        by_outcome = {
            AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED: month_qs.filter(
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED
            ).count(),
            AIRequestLog.Outcome.CAPABILITY_GAP: month_qs.filter(
                outcome=AIRequestLog.Outcome.CAPABILITY_GAP
            ).count(),
        }

        base_qs = month_qs.filter(outcome__in=outcome_values)

        tool_limit_qs = base_qs.filter(outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED)
        capability_gap_qs = base_qs.filter(outcome=AIRequestLog.Outcome.CAPABILITY_GAP)

        by_likely_cause = _count_by_likely_cause(tool_limit_qs)
        by_capability_gap = _count_by_capability_gap(capability_gap_qs)
        top_gap_domains = _top_gap_domains(capability_gap_qs)
        month_failure_count = base_qs.count()

        qs = base_qs
        if capability_gap:
            qs = qs.filter(
                outcome=AIRequestLog.Outcome.CAPABILITY_GAP,
                capability_gaps__contains=[capability_gap],
            )
        elif likely_cause:
            if likely_cause == LIKELY_CAUSE_UNCATEGORIZED:
                qs = qs.filter(
                    outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                    likely_causes=[],
                    source=AIRequestLog.Source.LIVE,
                )
            else:
                qs = qs.filter(
                    outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                    likely_causes__contains=[likely_cause],
                )

        total_count = qs.count()
        by_org = list(
            base_qs.values("tenant_id")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        tenant_ids = {row["tenant_id"] for row in by_org}
        tenants = {
            o.id: o for o in Organization.objects.filter(id__in=tenant_ids)
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
            .order_by(order, "-id")[offset : offset + page_size]
        )

    users_by_tenant = _resolve_users_by_tenant(rows, tenants)
    resolver_ids = {
        row.resolved_by_user_id for row in rows if row.resolved_by_user_id is not None
    }
    resolver_names = _resolve_resolver_display_names(resolver_ids)

    items = [
        _serialize_request_log_row(row, users_by_tenant, resolver_names)
        for row in rows
    ]

    top_org = by_org_payload[0] if by_org_payload else None
    return {
        "year": year,
        "month": month,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "summary": {
            "failure_count": month_failure_count,
            "organizations_affected": len(by_org_payload),
            "top_org": top_org,
            "by_org": by_org_payload,
            "by_outcome": by_outcome,
            "by_likely_cause": by_likely_cause,
            "by_capability_gap": by_capability_gap,
            "top_gap_domains": top_gap_domains,
        },
        "items": items,
    }


def build_requests_list(
    *,
    year: int,
    month: int,
    outcome: str = REQUESTS_OUTCOME_ALL,
    feature: str = DEFAULT_REQUESTS_FEATURE,
    tenant_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
    sort: str = "-created_at",
) -> dict[str, Any]:
    page_size = min(max(page_size, 1), MAX_REQUESTS_PAGE_SIZE)
    page = max(page, 1)
    start, end = _month_bounds_utc(year, month)

    if outcome not in VALID_REQUESTS_OUTCOMES:
        raise ValueError(f"Invalid outcome: {outcome}")
    if feature not in (*USER_FACING_FEATURES, REQUESTS_FEATURE_ALL):
        raise ValueError(f"Invalid feature: {feature}")

    order = REQUESTS_SORT_MAP.get(sort, "-created_at")

    with schema_context(get_public_schema_name()):
        month_qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_requests_feature_filter(feature),
        )
        if tenant_id is not None:
            month_qs = month_qs.filter(tenant_id=tenant_id)

        by_outcome = _count_by_outcome(month_qs)
        month_request_count = month_qs.count()

        qs = month_qs
        if outcome != REQUESTS_OUTCOME_ALL:
            qs = qs.filter(outcome=outcome)

        total_count = qs.count()
        by_org = list(
            month_qs.values("tenant_id")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        tenant_ids = {row["tenant_id"] for row in by_org}
        tenants = {
            o.id: o for o in Organization.objects.filter(id__in=tenant_ids)
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
            .order_by(order, "-id")[offset : offset + page_size]
        )

    users_by_tenant = _resolve_users_by_tenant(rows, tenants)
    items = [
        _serialize_request_log_row(row, users_by_tenant)
        for row in rows
    ]

    return {
        "year": year,
        "month": month,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "summary": {
            "request_count": month_request_count,
            "organizations_affected": len(by_org_payload),
            "by_outcome": by_outcome,
        },
        "items": items,
    }


def _tenant_id_filter(tenant_id: int | None) -> dict[str, int]:
    if tenant_id is None:
        return {}
    return {"tenant_id": tenant_id}


def _monthly_cost_for_scope(*, year: int, month: int, tenant_id: int | None) -> str:
    with schema_context(get_public_schema_name()):
        qs = AITenantUsageMonthly.objects.filter(year=year, month=month)
        if tenant_id is not None:
            qs = qs.filter(tenant_id=tenant_id)
        total = sum((row.total_billed_usd for row in qs), Decimal("0"))
    return _decimal_str(total)


def _daily_series(
    *,
    year: int,
    month: int,
    feature: str,
    tenant_id: int | None,
) -> list[dict[str, Any]]:
    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_requests_feature_filter(feature),
            **_tenant_id_filter(tenant_id),
        )
        grouped = {
            row["day"].strftime("%Y-%m-%d"): row
            for row in qs.annotate(day=TruncDate("created_at", tzinfo=timezone.utc))
            .values("day")
            .annotate(
                request_count=Count("id"),
                success_count=Count(
                    "id",
                    filter=Q(outcome=AIRequestLog.Outcome.SUCCESS),
                ),
                total_tokens=Sum("total_tokens"),
            )
        }
        cost_by_day = {
            row["day"].strftime("%Y-%m-%d"): row["total_cost_usd"]
            for row in AIUsageLog.objects.filter(
                created_at__gte=start,
                created_at__lt=end,
                **_tenant_id_filter(tenant_id),
            )
            .annotate(day=TruncDate("created_at", tzinfo=timezone.utc))
            .values("day")
            .annotate(total_cost_usd=Sum("billed_cost_usd"))
        }

    days_in_month = monthrange(year, month)[1]
    daily: list[dict[str, Any]] = []
    for day_num in range(1, days_in_month + 1):
        key = f"{year:04d}-{month:02d}-{day_num:02d}"
        row = grouped.get(key, {})
        daily.append(
            {
                "date": key,
                "request_count": row.get("request_count") or 0,
                "success_count": row.get("success_count") or 0,
                "total_tokens": row.get("total_tokens") or 0,
                "total_cost_usd": _decimal_str(cost_by_day.get(key) or Decimal("0")),
            }
        )
    return daily


def _monthly_trend_series(
    *,
    year: int,
    month: int,
    feature: str,
    tenant_id: int | None,
) -> list[dict[str, Any]]:
    trend: list[dict[str, Any]] = []
    for y, m in iter_months_ending(year, month, 6):
        start, end = _month_bounds_utc(y, m)
        with schema_context(get_public_schema_name()):
            qs = AIRequestLog.objects.filter(
                created_at__gte=start,
                created_at__lt=end,
                **_requests_feature_filter(feature),
                **_tenant_id_filter(tenant_id),
            )
            request_count = qs.count()
            success_count = qs.filter(outcome=AIRequestLog.Outcome.SUCCESS).count()
            total_tokens = qs.aggregate(total=Sum("total_tokens"))["total"] or 0
        trend.append(
            {
                "year": y,
                "month": m,
                "request_count": request_count,
                "success_count": success_count,
                "success_rate": (success_count / request_count) if request_count else 0.0,
                "total_cost_usd": _monthly_cost_for_scope(
                    year=y,
                    month=m,
                    tenant_id=tenant_id,
                ),
                "total_tokens": total_tokens,
            }
        )
    return trend


def _resolve_users_for_pairs(
    pairs: list[tuple[int, int | None]],
) -> dict[tuple[int, int | None], tuple[str, str]]:
    tenant_ids = {tenant_id for tenant_id, _ in pairs if tenant_id is not None}
    with schema_context(get_public_schema_name()):
        tenants = {
            org.id: org
            for org in Organization.objects.filter(id__in=tenant_ids)
        }
    users_by_pair: dict[tuple[int, int | None], tuple[str, str]] = {}
    rows_by_tenant: dict[int, list[int | None]] = {}
    for tenant_id, user_id in pairs:
        if tenant_id is None:
            continue
        rows_by_tenant.setdefault(tenant_id, []).append(user_id)

    users_by_tenant: dict[int, dict[int, User]] = {}
    for tid, user_ids in rows_by_tenant.items():
        tenant = tenants.get(tid)
        if tenant is None:
            continue
        lookup_ids = [uid for uid in user_ids if uid is not None]
        if not lookup_ids:
            continue
        with schema_context(tenant.schema_name):
            users_by_tenant[tid] = {
                user.id: user
                for user in User.objects.filter(id__in=lookup_ids, is_active=True)
            }

    for tenant_id, user_id in pairs:
        if user_id is None:
            users_by_pair[(tenant_id, user_id)] = ("Unknown user", "")
            continue
        user = users_by_tenant.get(tenant_id, {}).get(user_id)
        if user is not None:
            users_by_pair[(tenant_id, user_id)] = (
                user.name or user.email,
                user.email or "",
            )
        else:
            users_by_pair[(tenant_id, user_id)] = (f"User #{user_id}", "")
    return users_by_pair


def _top_users_for_month(
    *,
    year: int,
    month: int,
    feature: str,
    tenant_id: int | None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        rows = list(
            AIRequestLog.objects.filter(
                created_at__gte=start,
                created_at__lt=end,
                **_requests_feature_filter(feature),
                **_tenant_id_filter(tenant_id),
            )
            .values("tenant_id", "user_id")
            .annotate(
                request_count=Count("id"),
                total_tokens=Sum("total_tokens"),
            )
            .order_by("-request_count", "-total_tokens")[:limit]
        )
        cost_rows = AIUsageLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_tenant_id_filter(tenant_id),
        ).values("tenant_id", "user_id").annotate(
            total_cost_usd=Sum("billed_cost_usd")
        )
        cost_map = {
            (row["tenant_id"], row["user_id"]): row["total_cost_usd"] or Decimal("0")
            for row in cost_rows
        }

    display_by_pair = _resolve_users_for_pairs(
        [(row["tenant_id"], row["user_id"]) for row in rows]
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        display_name, email = display_by_pair.get(
            (row["tenant_id"], row["user_id"]),
            ("Unknown user", ""),
        )
        result.append(
            {
                "user_id": row["user_id"],
                "display_name": display_name,
                "email": email,
                "request_count": row["request_count"] or 0,
                "total_cost_usd": _decimal_str(
                    cost_map.get((row["tenant_id"], row["user_id"]), Decimal("0"))
                ),
                "total_tokens": row["total_tokens"] or 0,
            }
        )
    return result


def build_ai_usage_analytics(
    *,
    year: int,
    month: int,
    feature: str = DEFAULT_REQUESTS_FEATURE,
    tenant_id: int | None = None,
) -> dict[str, Any]:
    if feature not in (*USER_FACING_FEATURES, REQUESTS_FEATURE_ALL):
        raise ValueError(f"Invalid feature: {feature}")

    start, end = _month_bounds_utc(year, month)
    with schema_context(get_public_schema_name()):
        base_qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_requests_feature_filter(feature),
            **_tenant_id_filter(tenant_id),
        )
        outcome_totals = _count_by_outcome(base_qs)

    return {
        "year": year,
        "month": month,
        "feature": feature,
        "tenant_id": tenant_id,
        "daily": _daily_series(
            year=year,
            month=month,
            feature=feature,
            tenant_id=tenant_id,
        ),
        "outcome_totals": outcome_totals,
        "monthly_trend": _monthly_trend_series(
            year=year,
            month=month,
            feature=feature,
            tenant_id=tenant_id,
        ),
        "top_users": _top_users_for_month(
            year=year,
            month=month,
            feature=feature,
            tenant_id=tenant_id,
        ),
    }
