"""Expire substitute teacher assignments once their last covered session has passed."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.membership_history import record_membership_event
from app_course.models import CourseMembershipEvent, UserCourse
from app_course.user_course_lifecycle import close_teacher_user_course
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from app_tasks.models import Task

logger = logging.getLogger(__name__)


def due_substitute_assignments(today: date) -> QuerySet[UserCourse]:
    """Teacher rows whose last covered session is strictly before today."""
    return (
        UserCourse.objects.filter(
            assigned_as=UserCourse.AssignedAs.TEACHER,
            substitute_auto_remove_on__isnull=False,
            substitute_auto_remove_on__lt=today,
        )
        .select_related("course", "user")
        .order_by("id")
    )


def _queue_teams_removal(tenant, user_course: UserCourse) -> None:
    if not tenant_syncs_course_team_roster(tenant):
        return
    group_id = user_course.course.microsoft_group_id
    ms_user_id = user_course.user.microsoft_id
    if not group_id or not ms_user_id:
        logger.info(
            "substitute_removal_skipped_teams course_id=%s user_id=%s",
            user_course.course_id,
            user_course.user_id,
        )
        return
    Task.objects.create(
        name=Task.TaskName.REMOVE_MS_MEMBER,
        data={
            "group_id": group_id,
            "role": user_course.get_role_from_assigned_as(),
            "user_id": ms_user_id,
        },
    )


def expire_substitute_assignments(
    *,
    tenant,
    today: date | None = None,
) -> dict[str, Any]:
    today = today or timezone.localdate()
    removed: list[dict[str, int]] = []
    for user_course in list(due_substitute_assignments(today)):
        course_id = user_course.course_id
        user_id = user_course.user_id
        due_date = user_course.substitute_auto_remove_on
        _queue_teams_removal(tenant, user_course)
        with transaction.atomic():
            record_membership_event(
                course_id=course_id,
                user_id=user_id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
                actor_id=None,
                source=CourseMembershipEvent.Source.CRON,
            )
            soft_delete_userevents(
                UserEvent.objects.filter(
                    user_id=user_id,
                    event__course_id=course_id,
                )
            )
            close_teacher_user_course(user_course)
        refresh_course_member_counts_now([course_id])
        removed.append({"course_id": course_id, "user_id": user_id})
        logger.info(
            "substitute_removed course_id=%s user_id=%s due=%s",
            course_id,
            user_id,
            due_date,
        )
    return {"count": len(removed), "removed": removed}
