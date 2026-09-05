"""Async (django-q) AI jobs."""
from __future__ import annotations

import logging
from types import SimpleNamespace

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.apply import apply_capability_gap_to_request_log
from app_ai.capability_gap.history import build_judge_history_for_request_log
from app_ai.capability_gap.judge import judge_capability_gap
from app_ai.models import AIRequestLog
from app_auth.models import User
from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)


@django_q_task
def judge_request_log_capability_gap(
    request_log_id: int,
    schema_name: str,
    available_tool_names: list[str],
):
    """Run capability gap judge and update AIRequestLog if applicable."""
    try:
        with schema_context(get_public_schema_name()):
            row = (
                AIRequestLog.objects.filter(id=request_log_id)
                .select_related("tenant")
                .first()
            )
        if row is None or row.outcome != AIRequestLog.Outcome.SUCCESS:
            return

        org = row.tenant
        user = None
        if row.user_id is not None:
            with schema_context(schema_name):
                user = User.objects.filter(id=row.user_id, is_active=True).first()
        if user is None and row.user_id is not None:
            user = SimpleNamespace(id=row.user_id)

        gap = judge_capability_gap(
            prompt=row.prompt,
            response_text=row.response_text,
            tool_calls=row.tool_calls,
            available_tool_names=available_tool_names,
            conversation_history=build_judge_history_for_request_log(row, org),
            org=org,
            user=user,
        )
        if gap.is_gap:
            apply_capability_gap_to_request_log(request_log_id, gap)
    except Exception:
        logger.warning(
            "judge_request_log_capability_gap failed request_log_id=%s",
            request_log_id,
            exc_info=True,
        )
