from __future__ import annotations

import logging

from django.conf import settings

from app_ai.guardrails.classifier import classify_prompt
from app_ai.guardrails.heuristics import scan_heuristics
from app_ai.guardrails.messages import blocked_message, rate_limited_message
from app_ai.guardrails.rate_limit import check_ai_rate_limit
from app_ai.guardrails.types import GuardrailResult, HeuristicVerdict

logger = logging.getLogger(__name__)

__all__ = [
    "GuardrailResult",
    "HeuristicVerdict",
    "check_ai_rate_limit",
    "classify_prompt",
    "evaluate_prompt",
    "quick_heuristic_check",
]


def quick_heuristic_check(
    prompt: str,
    *,
    history: list | None = None,
) -> GuardrailResult | None:
    """Sync path for Telegram webhook — heuristics only, no rate limit/classifier."""
    verdict = scan_heuristics(prompt, history=history)
    if verdict == HeuristicVerdict.REJECT:
        return GuardrailResult(
            allowed=False,
            reason="heuristic_reject",
            message=None,
        )
    return None


def evaluate_prompt(
    prompt: str,
    *,
    user,
    org,
    history: list[dict[str, str]] | None = None,
) -> GuardrailResult:
    text = (prompt or "").strip()
    if not text:
        return GuardrailResult(
            allowed=False,
            reason="empty_prompt",
            message=blocked_message(org),
        )

    allowed_rl, retry = check_ai_rate_limit(
        schema_name=org.schema_name,
        user_id=getattr(user, "id", 0),
    )
    if not allowed_rl:
        return GuardrailResult(
            allowed=False,
            reason="rate_limited",
            message=rate_limited_message(retry),
            retry_after_seconds=retry,
        )

    verdict = scan_heuristics(text, history=history)
    if verdict == HeuristicVerdict.REJECT:
        return GuardrailResult(
            allowed=False,
            reason="heuristic_reject",
            message=blocked_message(org),
        )
    if verdict == HeuristicVerdict.ALLOW:
        return GuardrailResult(allowed=True, reason="allowed")

    try:
        result = classify_prompt(text, org=org, user=user)
    except Exception:
        logger.warning("guardrail classifier failed", exc_info=True)
        if getattr(settings, "AI_GUARDRAIL_FAIL_OPEN", True):
            return GuardrailResult(allowed=True, reason="classifier_fail_open")
        return GuardrailResult(
            allowed=False,
            reason="classifier_error",
            message=blocked_message(org),
        )

    if result.get("allowed"):
        return GuardrailResult(allowed=True, reason="allowed")
    return GuardrailResult(
        allowed=False,
        reason="classifier_reject",
        message=blocked_message(org),
    )
