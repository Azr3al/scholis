from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _safe_invalidate_user_event(instance) -> None:
    try:
        from app_hr.school_overview_invalidation import (
            invalidate_school_overview_for_user_event,
        )

        invalidate_school_overview_for_user_event(instance)
    except Exception:
        logger.exception("school_overview signals: UserEvent invalidate failed")


def _safe_invalidate_current_month() -> None:
    try:
        from app_hr.school_overview_invalidation import (
            invalidate_school_overview_current_month,
        )

        invalidate_school_overview_current_month()
    except Exception:
        logger.exception("school_overview signals: current-month invalidate failed")


@receiver(post_save, sender="app_attendance.UserEvent")
@receiver(post_delete, sender="app_attendance.UserEvent")
def school_overview_on_user_event(sender, instance, **kwargs):
    _safe_invalidate_user_event(instance)


@receiver(post_save, sender="app_course.UserCourse")
@receiver(post_delete, sender="app_course.UserCourse")
def school_overview_on_user_course(sender, instance, **kwargs):
    try:
        role = getattr(instance, "assigned_as_role", None)
        seniority = getattr(role, "seniority", None) if role is not None else None
        if seniority is None:
            role_id = getattr(instance, "assigned_as_role_id", None)
            if role_id:
                from app_course.models import AssignedAsRole

                seniority = (
                    AssignedAsRole.objects.filter(id=role_id)
                    .values_list("seniority", flat=True)
                    .first()
                )
        from app_course.models import AssignedAsRole

        if seniority == AssignedAsRole.Seniority.MAIN_TEACHER:
            _safe_invalidate_current_month()
    except Exception:
        logger.exception("school_overview signals: UserCourse invalidate failed")


@receiver(post_save, sender="app_course.Course")
def school_overview_on_course(sender, instance, **kwargs):
    update_fields = kwargs.get("update_fields")
    if update_fields is not None:
        relevant = {"title", "code", "subject", "subject_id"}
        if not relevant.intersection(set(update_fields)):
            return
    _safe_invalidate_current_month()


@receiver(post_save, sender="app_course.CourseSubject")
@receiver(post_delete, sender="app_course.CourseSubject")
def school_overview_on_course_subject(sender, instance, **kwargs):
    _safe_invalidate_current_month()
