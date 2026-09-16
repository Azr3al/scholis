from __future__ import annotations

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.types import CapabilityGapResult
from app_ai.models import AIRequestLog
from app_ai.request_log import truncate_text


def apply_capability_gap_to_request_log(
    request_log_id: int,
    gap: CapabilityGapResult,
) -> bool:
    """Update log row if still success. Returns True if updated."""
    if not gap.is_gap:
        return False

    with schema_context(get_public_schema_name()):
        updated = AIRequestLog.objects.filter(
            id=request_log_id,
            outcome=AIRequestLog.Outcome.SUCCESS,
        ).update(
            outcome=AIRequestLog.Outcome.CAPABILITY_GAP,
            capability_gaps=gap.capability_gaps,
            capability_gap_reason=truncate_text(gap.gap_reason),
            capability_gap_intent=(gap.user_intent_summary or "")[:256],
            capability_gap_domain=(gap.domain or "")[:64],
            capability_gap_suggested_surface=(gap.suggested_surface or "")[:128],
        )
    return updated > 0
