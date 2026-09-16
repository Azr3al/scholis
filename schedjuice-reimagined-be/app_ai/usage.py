"""Record AI usage and monthly rollups in the public schema."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from django.db import connection
from django.db.models import F
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIUsageLog, AITenantUsageMonthly, AIUserUsageMonthly
from app_ai.pricing import PRICING_VERSION, TokenUsage, apply_billing_markup, compute_cost
from app_ai.quota import maybe_send_spend_alerts
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def _resolve_tenant() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return None
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()


def record_usage(
    *,
    user_id: int | None,
    feature: str,
    model: str,
    usage: TokenUsage,
    latency_ms: int,
    tool_iterations: int,
    status: str,
    error_type: str = "",
    finish_reason: str = "",
    tool_calls: list[dict[str, Any]] | None = None,
    retries: int = 0,
) -> AIUsageLog | None:
    tenant = _resolve_tenant()
    if tenant is None:
        logger.warning("ai_usage_skip_no_tenant feature=%s model=%s", feature, model)
        return None

    computed = compute_cost(model, usage)
    billed = apply_billing_markup(computed)
    now = datetime.now(timezone.utc)

    with schema_context(get_public_schema_name()):
        log = AIUsageLog.objects.create(
            tenant=tenant,
            user_id=user_id,
            feature=feature,
            model=model,
            pricing_version=PRICING_VERSION,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            thinking_tokens=usage.thinking_tokens,
            cached_input_tokens=usage.cached_input_tokens,
            cache_write_tokens=usage.cache_write_tokens,
            total_tokens=usage.total_tokens,
            computed_cost_usd=computed,
            billed_cost_usd=billed,
            latency_ms=latency_ms,
            tool_iterations=tool_iterations,
            status=status,
            error_type=error_type,
            finish_reason=finish_reason,
            tool_calls=tool_calls or [],
            retries=retries,
        )
        rollup, _ = AITenantUsageMonthly.objects.get_or_create(
            tenant=tenant,
            year=now.year,
            month=now.month,
            model=model,
            defaults={
                "input_tokens": 0,
                "output_tokens": 0,
                "thinking_tokens": 0,
                "cached_input_tokens": 0,
                "cache_write_tokens": 0,
                "total_tokens": 0,
                "total_cost_usd": Decimal("0"),
                "total_billed_usd": Decimal("0"),
                "request_count": 0,
            },
        )
        AITenantUsageMonthly.objects.filter(pk=rollup.pk).update(
            input_tokens=F("input_tokens") + usage.input_tokens,
            output_tokens=F("output_tokens") + usage.output_tokens,
            thinking_tokens=F("thinking_tokens") + usage.thinking_tokens,
            cached_input_tokens=F("cached_input_tokens") + usage.cached_input_tokens,
            cache_write_tokens=F("cache_write_tokens") + usage.cache_write_tokens,
            total_tokens=F("total_tokens") + usage.total_tokens,
            total_cost_usd=F("total_cost_usd") + computed,
            total_billed_usd=F("total_billed_usd") + billed,
            request_count=F("request_count") + 1,
        )
        rollup.refresh_from_db()
        if user_id is not None:
            user_rollup, _ = AIUserUsageMonthly.objects.get_or_create(
                tenant=tenant,
                user_id=user_id,
                year=now.year,
                month=now.month,
                defaults={
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "thinking_tokens": 0,
                    "cached_input_tokens": 0,
                    "cache_write_tokens": 0,
                    "total_tokens": 0,
                    "total_cost_usd": Decimal("0"),
                    "total_billed_usd": Decimal("0"),
                    "request_count": 0,
                },
            )
            AIUserUsageMonthly.objects.filter(pk=user_rollup.pk).update(
                input_tokens=F("input_tokens") + usage.input_tokens,
                output_tokens=F("output_tokens") + usage.output_tokens,
                thinking_tokens=F("thinking_tokens") + usage.thinking_tokens,
                cached_input_tokens=F("cached_input_tokens") + usage.cached_input_tokens,
                cache_write_tokens=F("cache_write_tokens") + usage.cache_write_tokens,
                total_tokens=F("total_tokens") + usage.total_tokens,
                total_cost_usd=F("total_cost_usd") + computed,
                total_billed_usd=F("total_billed_usd") + billed,
                request_count=F("request_count") + 1,
            )
        maybe_send_spend_alerts(tenant=tenant, rollup=rollup)

    logger.info(
        "ai_usage tenant=%s user_id=%s model=%s tokens=%s cost_usd=%s status=%s",
        tenant.schema_name,
        user_id,
        model,
        usage.total_tokens,
        computed,
        status,
    )
    return log
