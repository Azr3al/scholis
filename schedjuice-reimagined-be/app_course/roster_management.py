from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_auth.models import User
from app_course import models, serializers
from app_course.course_role_policy import (
    MissingMainTeacherRole,
    course_roles_enabled,
    resolve_main_teacher_role,
)
from app_course.membership_history import (
    MembershipEventInput,
    record_membership_events_bulk,
)
from app_course.user_course_lifecycle import close_teacher_user_course
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from app_tasks.models import Task


def classify_roster_creates(
    *,
    entities: list[dict],
    to_be_removed: list[dict],
) -> list[dict]:
    """Return entity rows that will be created after removals (no writes)."""
    if not entities:
        return []
    removed_keys = {(i["user"], i["course"]) for i in to_be_removed}
    existing_keys = set(
        models.UserCourse.objects.filter(
            user_id__in=[i["user"] for i in entities],
            course_id__in=[i["course"] for i in entities],
        ).values_list("user_id", "course_id")
    )
    to_be_created = []
    for row in entities:
        key = (row["user"], row["course"])
        if key in existing_keys and key not in removed_keys:
            continue
        to_be_created.append(row)
    return to_be_created


def validate_roster_creates_for_teams(
    *,
    tenant,
    to_be_created: list[dict],
) -> str | None:
    """Return an error details string if Teams sync requires missing MS links."""
    if not tenant_syncs_course_team_roster(tenant) or not to_be_created:
        return None
    ms_user_ids = {row["user"] for row in to_be_created}
    ms_course_ids = {row["course"] for row in to_be_created}
    ms_users = {
        u.id: u
        for u in User.objects.filter(id__in=ms_user_ids).only("id", "microsoft_id")
    }
    ms_courses = {
        c.id: c
        for c in models.Course.objects.filter(id__in=ms_course_ids).only(
            "id", "microsoft_group_id"
        )
    }
    for row in to_be_created:
        u = ms_users.get(row["user"])
        c = ms_courses.get(row["course"])
        if not u or not u.microsoft_id:
            return (
                "A user in this update is not linked to Microsoft 365. "
                "Link their Microsoft account before saving roster changes for Teams classes."
            )
        if not c or not c.microsoft_group_id:
            return (
                "A class in this update does not have a Microsoft team linked. "
                "Link the team before saving roster changes."
            )
    return None


@transaction.atomic
def apply_user_course_management(
    *,
    actor: User,
    tenant,
    to_be_removed: list[dict],
    entities: list[dict],
) -> list[dict] | None:
    """Apply roster removals/updates/creates. Caller must pre-validate creates + MS links.

    Returns created row dicts for Graph sync, or None.
    """
    deleted_user_courses = list(
        models.UserCourse.objects.filter(
            user_id__in=[i["user"] for i in to_be_removed],
            course_id__in=[i["course"] for i in to_be_removed],
        ).select_related("course", "user")
    )
    removed_events = [
        MembershipEventInput(
            course_id=uc.course_id,
            user_id=uc.user_id,
            event_type=models.CourseMembershipEvent.EventType.REMOVED,
            actor_id=actor.id,
            source=models.CourseMembershipEvent.Source.API,
        )
        for uc in deleted_user_courses
        if uc.assigned_as == models.UserCourse.AssignedAs.STUDENT
    ]
    if removed_events:
        record_membership_events_bulk(removed_events)
    if tenant_syncs_course_team_roster(tenant):
        tasks = []
        for i in deleted_user_courses:
            tasks.append(
                Task(
                    name=Task.TaskName.REMOVE_MS_MEMBER,
                    data={
                        "group_id": i.course.microsoft_group_id,
                        "role": i.get_role_from_assigned_as(),
                        "user_id": i.user.microsoft_id,
                    },
                )
            )
        Task.objects.bulk_create(tasks)

    teacher_removals = [
        uc
        for uc in deleted_user_courses
        if uc.assigned_as != models.UserCourse.AssignedAs.STUDENT
    ]
    if teacher_removals:
        soft_delete_userevents(
            UserEvent.objects.filter(
                user_id__in=[uc.user_id for uc in teacher_removals],
                event__course_id__in=[uc.course_id for uc in teacher_removals],
            )
        )

    student_ids = [
        uc.id
        for uc in deleted_user_courses
        if uc.assigned_as == models.UserCourse.AssignedAs.STUDENT
    ]
    for uc in deleted_user_courses:
        if uc.assigned_as == models.UserCourse.AssignedAs.TEACHER:
            close_teacher_user_course(uc)
    if student_ids:
        models.UserCourse.objects.filter(id__in=student_ids).delete()

    if not course_roles_enabled(tenant):
        try:
            mt = resolve_main_teacher_role()
        except MissingMainTeacherRole as exc:
            raise ValidationError({"assigned_as_role": str(exc)}) from exc
        for row in entities:
            if row.get("assigned_as") == models.UserCourse.AssignedAs.TEACHER:
                row["assigned_as_role"] = mt.id

    user_courses = models.UserCourse.objects.filter(
        user_id__in=[i["user"] for i in entities],
        course_id__in=[i["course"] for i in entities],
    )
    to_be_created = []
    to_be_updated = []
    for i in entities:
        existing = user_courses.filter(
            user_id=i["user"], course_id=i["course"]
        ).first()
        if existing is not None:
            m = existing
            for j in i.keys():
                if j == "user":
                    m.user_id = i[j]
                elif j == "course":
                    m.course_id = i[j]
                elif j == "assigned_as":
                    m.assigned_as = i[j]
                elif j == "assigned_as_role":
                    m.assigned_as_role_id = i[j]
                else:
                    setattr(m, j, i[j])
            to_be_updated.append(m)
        else:
            to_be_created.append(i)
    if to_be_updated:
        models.UserCourse.objects.bulk_update(
            to_be_updated, ["user", "assigned_as", "course", "assigned_as_role"]
        )

    created_entities = serializers.UserCourseSerializer(data=to_be_created, many=True)
    if not created_entities.is_valid():
        raise ValidationError(created_entities.errors)
    created_entities.save()
    joined_events = [
        MembershipEventInput(
            course_id=row["course"],
            user_id=row["user"],
            event_type=models.CourseMembershipEvent.EventType.JOINED,
            actor_id=actor.id,
            source=models.CourseMembershipEvent.Source.API,
        )
        for row in to_be_created
        if row.get("assigned_as") == models.UserCourse.AssignedAs.STUDENT
    ]
    if joined_events:
        record_membership_events_bulk(joined_events)
    if tenant_syncs_course_team_roster(tenant) and created_entities.data:
        return list(created_entities.data)
    return None
