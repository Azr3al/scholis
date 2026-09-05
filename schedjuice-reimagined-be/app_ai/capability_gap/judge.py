from __future__ import annotations

import logging

from app_ai.capability_gap.classifier import classify_capability_gap
from app_ai.capability_gap.constants import CAPABILITY_GAP_UNKNOWN, VALID_CAPABILITY_GAPS
from app_ai.capability_gap.types import CapabilityGapResult
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def _normalize_gaps(raw: list | None) -> list[str]:
    gaps = [code for code in (raw or []) if code in VALID_CAPABILITY_GAPS]
    return gaps or [CAPABILITY_GAP_UNKNOWN]


def judge_capability_gap(
    *,
    prompt: str,
    response_text: str,
    tool_calls: list[dict],
    available_tool_names: list[str],
    org: Organization,
    user,
    conversation_history: list[dict[str, str]] | None = None,
) -> CapabilityGapResult:
    try:
        parsed = classify_capability_gap(
            prompt=prompt,
            response_text=response_text,
            tool_calls=tool_calls,
            available_tool_names=available_tool_names,
            conversation_history=conversation_history,
            org=org,
            user=user,
        )
    except Exception:
        logger.warning("capability gap judge failed", exc_info=True)
        return CapabilityGapResult.none()

    if not parsed.get("is_capability_gap"):
        return CapabilityGapResult.none()

    return CapabilityGapResult(
        is_gap=True,
        capability_gaps=_normalize_gaps(parsed.get("capability_gaps")),
        user_intent_summary=str(parsed.get("user_intent_summary") or "")[:256],
        gap_reason=str(parsed.get("gap_reason") or ""),
        suggested_surface=str(parsed.get("suggested_surface") or "")[:128],
        domain=str(parsed.get("domain") or "")[:64],
    )
