"""Microsoft Teams owner sync for program/category course oversight scope."""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Q

from app_auth.models import User
from app_course.course_status import course_is_effectively_planned_or_active
from app_course.models import Course, UserCourse
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


def _microsoft_id(user: User) -> str:
    raw = getattr(user, "microsoft_id", None)
    if raw is None:
        return ""
    return raw.strip() if isinstance(raw, str) else str(raw).strip()


def user_matches_course_scope(user: User, course: Course) -> bool:
    if course.program_id and user.scoped_programs.filter(pk=course.program_id).exists():
        return True
    if course.category_id and user.scoped_categories.filter(pk=course.category_id).exists():
        return True
    return False


def teaching_owner_user_ids(course: Course) -> set[int]:
    return set(
        UserCourse.objects.filter(
            course_id=course.id,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).values_list("user_id", flat=True)
    )


def users_with_scope_for_course(course: Course):
    if course.program_id is None and course.category_id is None:
        return User.objects.none()
    q = Q()
    if course.program_id:
        q |= Q(scoped_programs=course.program_id)
    if course.category_id:
        q |= Q(scoped_categories=course.category_id)
    return (
        User.objects.filter(q)
        .exclude(microsoft_id__isnull=True)
        .exclude(microsoft_id="")
        .distinct()
    )


def _add_team_owner(group: MSGroup, user: User, course: Course) -> None:
    mid = _microsoft_id(user)
    gid = (course.microsoft_group_id or "").strip()
    if not mid or not gid:
        return
    group.add_member(mid, gid, "owners")


def _remove_team_owner(group: MSGroup, user: User, course: Course) -> None:
    mid = _microsoft_id(user)
    gid = (course.microsoft_group_id or "").strip()
    if not mid or not gid:
        return
    group.remove_member(gid, mid, "owners")


def reconcile_scope_owner_for_user_course(user: User, course: Course, tenant) -> None:
    """Add or remove one user as scope-based team owner for a course."""
    if not tenant_syncs_course_team_roster(tenant):
        return
    if not (course.microsoft_group_id or "").strip():
        return
    mid = _microsoft_id(user)
    if not mid:
        return

    should_own = user_matches_course_scope(user, course)
    is_teaching = UserCourse.objects.filter(
        user_id=user.id,
        course_id=course.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()

    group = MSGroup(tenant)
    if should_own:
        if course_is_effectively_planned_or_active(course):
            _add_team_owner(group, user, course)
    elif not is_teaching:
        _remove_team_owner(group, user, course)


def sync_scoped_team_owners_for_course(course: Course, tenant) -> None:
    """Ensure all scope-eligible users are team owners for this course."""
    if not tenant_syncs_course_team_roster(tenant):
        return
    if not (course.microsoft_group_id or "").strip():
        return
    if not course_is_effectively_planned_or_active(course):
        return

    teaching_ids = teaching_owner_user_ids(course)
    group = MSGroup(tenant)
    for user in users_with_scope_for_course(course):
        if user.id in teaching_ids:
            continue
        try:
            _add_team_owner(group, user, course)
        except Exception:
            logger.exception(
                "scope team owner add failed user_id=%s course_id=%s",
                user.id,
                course.id,
            )


def _course_ids_for_scope(program_ids: set[int], category_ids: set[int]):
    if not program_ids and not category_ids:
        return Course.objects.none().values_list("id", flat=True)
    q = Q()
    if program_ids:
        q |= Q(program_id__in=program_ids)
    if category_ids:
        q |= Q(category_id__in=category_ids)
    return Course.objects.filter(q).values_list("id", flat=True)


def _affected_course_ids_with_teams(
    *,
    previous_program_ids: set[int],
    previous_category_ids: set[int],
    new_program_ids: set[int],
    new_category_ids: set[int],
) -> list[int]:
    affected_ids = set(_course_ids_for_scope(previous_program_ids, previous_category_ids)) | set(
        _course_ids_for_scope(new_program_ids, new_category_ids)
    )
    if not affected_ids:
        return []
    return list(
        Course.objects.filter(id__in=affected_ids)
        .exclude(microsoft_group_id__isnull=True)
        .exclude(microsoft_group_id="")
        .values_list("id", flat=True)
    )


@django_q_task
@tenant_async(entity=Course)
def reconcile_scope_owner_for_user_course_async(course, tenant, *, user_id: int):
    if course is None:
        return
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return
    try:
        reconcile_scope_owner_for_user_course(user, course, tenant)
    except Exception:
        logger.exception(
            "async scope owner reconcile failed user_id=%s course_id=%s",
            user_id,
            course.id,
        )


@django_q_task
@tenant_async(entity=Course)
def sync_scoped_team_owners_for_course_async(course, tenant):
    if course is None:
        return
    try:
        sync_scoped_team_owners_for_course(course, tenant)
    except Exception:
        logger.exception(
            "async scope team owners sync failed course_id=%s",
            course.id,
        )


def schedule_scoped_team_owner_reconcile_for_user_after_commit(
    user_id: int,
    tenant,
    *,
    previous_program_ids: set[int],
    previous_category_ids: set[int],
) -> None:
    schema_name = tenant.schema_name

    def _run() -> None:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return
        new_program_ids = set(user.scoped_programs.values_list("id", flat=True))
        new_category_ids = set(user.scoped_categories.values_list("id", flat=True))
        course_ids = _affected_course_ids_with_teams(
            previous_program_ids=previous_program_ids,
            previous_category_ids=previous_category_ids,
            new_program_ids=new_program_ids,
            new_category_ids=new_category_ids,
        )
        for course_id in course_ids:
            reconcile_scope_owner_for_user_course_async.delay(
                course_id, schema_name, user_id=user_id
            )

    transaction.on_commit(_run)
