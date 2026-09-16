"""
Microsoft Teams class provisioning for courses (sync and async).
"""

from __future__ import annotations

import logging
from datetime import date

from rest_framework.exceptions import ValidationError

from app_course.models import Course
from app_microsoft.flows import CreateTeamFlow
from app_microsoft.payment_assignment_helpers import is_first_month_of_course
from app_organization.models import Organization
from app_utils.ops_discord import notify_discord_ops
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


def tenant_syncs_course_team_roster(tenant) -> bool:
    """True when course roster changes should sync to Microsoft Teams group membership."""
    return bool(
        tenant
        and getattr(tenant, "is_microsoft_on", False)
        and getattr(tenant, "is_teams_creation_enabled", True)
    )


def _discord_team_provisioning_line(
    tenant: Organization,
    course: Course | None,
    *,
    action: str,
    detail: str,
) -> None:
    sn = getattr(tenant, "schema_name", "?")
    lines = [
        f"[Schedjuice] MS team provisioning: {action}",
        f"tenant={sn}",
    ]
    if course is not None:
        lines.append(f"course_id={course.id} title={course.title!r}")
    lines.append(str(detail)[:1200])
    notify_discord_ops("\n".join(lines), tenant=tenant)


def schedule_post_team_provisioning(
    course: Course,
    tenant: Organization,
    flow: CreateTeamFlow,
) -> None:
    """Payment assignment tasks after microsoft_group_id is saved."""
    today = date.today()
    category = course.category
    if (
        course.is_payment_enabled
        and category
        and category.is_payment_assignment_eligible
        and course.start_date <= today <= course.end_date
        and not is_first_month_of_course(course, today.year, today.month)
    ):
        flow.schedule_payment_assignment(course.id)


def provision_course_team(course: Course, tenant: Organization) -> None:
    """
    Create a Microsoft Teams education class for a course and backfill Graph IDs.
    Idempotent when microsoft_group_id is already set.
    """
    if not getattr(tenant, "is_teams_creation_enabled", True):
        logger.debug(
            "Skipping team creation for course %s: is_teams_creation_enabled=False",
            course.id,
        )
        return

    if course.microsoft_group_id:
        return

    course = (
        Course.objects.filter(pk=course.pk)
        .select_related("category")
        .first()
    )
    if course is None:
        return

    if course.microsoft_group_id:
        return

    flow = CreateTeamFlow(course.title, tenant)
    res = flow.start()

    course.microsoft_group_id = res["group_id"]
    course.microsoft_channel_id = res.get("channel_id")
    course.save(
        update_fields=["microsoft_group_id", "microsoft_channel_id"],
    )

    from app_microsoft.scope_team_sync import sync_scoped_team_owners_for_course_async

    sync_scoped_team_owners_for_course_async.delay(course.id, tenant.schema_name)

    schedule_post_team_provisioning(course, tenant, flow)


@django_q_task
@tenant_async(entity=Course)
def create_course_team_async(course, tenant):
    """
    Async wrapper around provision_course_team for deferred bulk/intake creates.
    """
    if course is None:
        return

    try:
        provision_course_team(course, tenant)
    except ValidationError as exc:
        logger.exception(
            "create_course_team_async Graph validation failed course_id=%s schema=%s",
            course.id,
            tenant.schema_name,
        )
        _discord_team_provisioning_line(
            tenant,
            course,
            action="CreateTeamFlow failed",
            detail=str(exc.detail),
        )
        raise
    except Exception as exc:
        logger.exception(
            "create_course_team_async failed course_id=%s schema=%s",
            course.id,
            tenant.schema_name,
        )
        _discord_team_provisioning_line(
            tenant,
            course,
            action="CreateTeamFlow unexpected error",
            detail=str(exc),
        )
        raise
