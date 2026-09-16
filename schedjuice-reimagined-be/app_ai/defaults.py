"""Platform-wide AI defaults exposed to tenant settings UI."""
from __future__ import annotations

from django.conf import settings


def get_platform_ai_defaults() -> dict:
    token_limit = getattr(settings, "AI_DEFAULT_MONTHLY_TOKEN_LIMIT", None)
    return {
        "default_model": getattr(
            settings, "AI_DEFAULT_MODEL", "gpt-5.6-luna"
        ),
        "monthly_usd_limit": float(
            getattr(settings, "AI_DEFAULT_MONTHLY_USD_LIMIT", 50.0)
        ),
        "default_user_monthly_usd_limit": float(
            getattr(settings, "AI_DEFAULT_USER_MONTHLY_USD_LIMIT", 1.0)
        ),
        "monthly_token_limit": int(token_limit) if token_limit is not None else None,
        "hard_enforce": bool(getattr(settings, "AI_DEFAULT_HARD_ENFORCE", False)),
        "alert_thresholds": list(
            getattr(settings, "AI_DEFAULT_ALERT_THRESHOLDS", [0.5, 0.8, 1.0])
        ),
        "max_tool_iterations": int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 5)),
    }
