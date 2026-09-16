"""
Daily digest: payment-assignment rows missing for the current calendar month.
Invoked once from django_q (not per-tenant via run_cron_command). Posts to Discord
only when gaps exist and DISCORD_WEBHOOK_URL is set.
"""

from __future__ import annotations

import logging

from django.conf import settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_microsoft.payment_assignment_helpers import (
    iter_courses_expecting_payment_assignment_month,
    org_local_today,
    payment_assignment_month_in_ensure_window,
)
from app_organization.models import Organization
from app_utils.ops_discord import notify_discord_ops

logger = logging.getLogger(__name__)


def run_payment_assignment_gap_digest() -> None:
    """Scan all Microsoft-enabled tenants for current-month gaps; notify Discord if any."""
    if not (getattr(settings, "DISCORD_WEBHOOK_URL", None) or "").strip():
        logger.debug(
            "run_payment_assignment_gap_digest: DISCORD_WEBHOOK_URL unset, skipping"
        )
        return

    with schema_context(get_public_schema_name()):
        orgs = list(Organization.objects.filter(is_microsoft_on=True))

    sections: list[str] = []
    for org in orgs:
        schema_name = getattr(org, "schema_name", None)
        if not schema_name:
            continue
        today = org_local_today(org)
        year, month_index = today.year, today.month
        with schema_context(schema_name):
            rows = iter_courses_expecting_payment_assignment_month(
                year, month_index, include_existing=False
            )
            rows = [
                (course, has_row)
                for course, has_row in rows
                if payment_assignment_month_in_ensure_window(
                    today, year, month_index, course
                )
            ]
        if not rows:
            continue
        sample = ", ".join(str(c.id) for c, _ in rows[:15])
        suffix = "" if len(rows) <= 15 else f" …(+{len(rows) - 15} more)"
        sections.append(
            f"{schema_name} ({year}-{month_index:02d} org-local): "
            f"{len(rows)} gap(s) — course_ids: {sample}{suffix}"
        )

    if not sections:
        return

    body = (
        "[Schedjuice] Payment assignment gaps (missing PaymentAssignment row, "
        "within FM/HM create window only):\n" + "\n".join(sections)
    )
    notify_discord_ops(body)
    logger.info(
        "run_payment_assignment_gap_digest: notified Discord for %s tenant(s) with gaps",
        len(sections),
    )


def run_payment_assignment_gap_digest_wrapped() -> None:
    from app_tasks.cron_health import log_global_cron_run

    log_global_cron_run("alert-payment-assignment-gaps", run_payment_assignment_gap_digest)
