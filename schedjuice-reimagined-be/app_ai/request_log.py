"""Session-level AI request logging (public schema)."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import classify_tool_limit_causes
from app_ai.models import AIRequestLog
from app_organization.models import Organization

if TYPE_CHECKING:
    from app_ai.capability_gap.types import CapabilityGapResult
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
    capability_gap: CapabilityGapResult | None = None,
) -> AIRequestLog | None:
    tenant = _resolve_tenant()
    if tenant is None:
        logger.warning(
            "ai_request_log_skip_no_tenant feature=%s outcome=%s",
            feature,
            outcome,
        )
        return None

    if result is not None:
        response_text = response_text or result.text
        tool_iterations = result.iterations
        tool_calls = result.tool_calls
        model = result.model
        total_tokens = result.total_tokens
        latency_ms = result.latency_ms
        error_type = error_type or result.error_type
        thinking_steps = result.thinking_steps
    else:
        tool_iterations = 0
        tool_calls = []
        model = ""
        total_tokens = 0
        latency_ms = 0
        thinking_steps = []

    likely_causes = (
        classify_tool_limit_causes(tool_calls)
        if outcome == AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED
        else []
    )

    capability_gaps: list[str] = []
    capability_gap_reason = ""
    capability_gap_intent = ""
    capability_gap_domain = ""
    capability_gap_suggested_surface = ""
    if capability_gap is not None and capability_gap.is_gap:
        outcome = AIRequestLog.Outcome.CAPABILITY_GAP
        capability_gaps = capability_gap.capability_gaps
        capability_gap_reason = truncate_text(capability_gap.gap_reason)
        capability_gap_intent = (capability_gap.user_intent_summary or "")[:256]
        capability_gap_domain = (capability_gap.domain or "")[:64]
        capability_gap_suggested_surface = (
            capability_gap.suggested_surface or ""
        )[:128]

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
            likely_causes=likely_causes,
            capability_gaps=capability_gaps,
            capability_gap_reason=capability_gap_reason,
            capability_gap_intent=capability_gap_intent,
            capability_gap_domain=capability_gap_domain,
            capability_gap_suggested_surface=capability_gap_suggested_surface,
            model=model,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            source=source,
            error_type=error_type,
            thinking_steps=thinking_steps[:10],
        )
        if created_at is not None:
            return AIRequestLog.objects.create(**kwargs, created_at=created_at)
        return AIRequestLog.objects.create(**kwargs)
