from __future__ import annotations

from django.utils import timezone

from app_ai.models import AIRequestLog

FAILURE_OUTCOMES = frozenset(
    {
        AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
        AIRequestLog.Outcome.CAPABILITY_GAP,
    }
)


class FailureResolutionError(ValueError):
    pass


def resolve_request_log_failure(
    row: AIRequestLog,
    *,
    resolved: bool,
    user_id: int,
) -> AIRequestLog:
    if row.outcome not in FAILURE_OUTCOMES:
        raise FailureResolutionError(
            f"Cannot resolve request log with outcome {row.outcome!r}"
        )

    if resolved:
        if row.resolved_at is not None:
            return row
        row.resolved_at = timezone.now()
        row.resolved_by_user_id = user_id
        row.save(update_fields=["resolved_at", "resolved_by_user_id"])
        return row

    if row.resolved_at is None:
        return row
    row.resolved_at = None
    row.resolved_by_user_id = None
    row.save(update_fields=["resolved_at", "resolved_by_user_id"])
    return row
