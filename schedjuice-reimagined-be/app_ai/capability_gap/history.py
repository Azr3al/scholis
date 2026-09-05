from __future__ import annotations

from app_ai.models import AIRequestLog
from app_ai.request_log import truncate_text
from app_ai.tenant_context import resolve_max_context_turns
from app_organization.models import Organization


def build_judge_history_for_request_log(
    row: AIRequestLog,
    org: Organization,
) -> list[dict[str, str]]:
    if row.feature != "telegram_query":
        return []
    if not row.channel_key or row.user_id is None:
        return []

    n = resolve_max_context_turns(org)
    prior_rows = AIRequestLog.objects.filter(
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        channel_key=row.channel_key,
        feature="telegram_query",
        created_at__lt=row.created_at,
    ).order_by("-created_at")[:n]

    history: list[dict[str, str]] = []
    for prior in reversed(list(prior_rows)):
        history.append({"role": "user", "text": truncate_text(prior.prompt)})
        model_text = truncate_text(prior.response_text)
        if model_text:
            history.append({"role": "model", "text": model_text})
    return history
