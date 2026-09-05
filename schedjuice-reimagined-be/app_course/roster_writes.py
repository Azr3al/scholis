from __future__ import annotations

from typing import Any

from django.db import transaction
from requests.exceptions import RequestException

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_auth.models import User
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.course_role_policy import (
    MissingMainTeacherRole,
    course_roles_enabled,
    resolve_main_teacher_role,
)
from app_course.course_scoping import check_course_write, check_teacher_event_assignment
from app_course.membership_history import record_membership_event
from app_course.models import (
    AssignedAsRole,
    Course,
    CourseMembershipEvent,
    Event,
    UserCourse,
)
from app_course.rate_utils import get_rate_from_user_course_rates
from app_course.roster_event_weekdays import filter_events_for_weekdays
from app_course.user_course_lifecycle import close_teacher_user_course
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster
from app_tasks.models import Task
from app_microsoft.meeting_helpers import schedule_update_course_meeting_attendees


def _teams_link_required(subject: str) -> dict[str, Any]:
    return {
        "error": "teams_link_required",
        "message": (
            f"This {subject} is not linked to Microsoft 365 yet. "
            "Link their Microsoft account before roster changes for Teams classes."
        ),
    }


def _ms_team_required() -> dict[str, Any]:
    return {
        "error": "ms_team_required",
        "message": (
            "This class does not have a Microsoft team linked. "
            "Link or create the team before changing the roster."
        ),
    }


def _ms_gateway_error(exc: Exception) -> dict[str, Any]:
    return {
        "error": "ms_gateway_error",
        "message": (
            "Could not reach Microsoft to update the class team. "
            f"Try again in a moment. ({exc})"
        ),
    }


def _ensure_student_teams_ready(*, tenant, course: Course, user: User) -> dict[str, Any] | None:
    if not tenant_syncs_course_team_roster(tenant):
        return None
    if not user.microsoft_id:
        return _teams_link_required("student")
    if not course.microsoft_group_id:
        return _ms_team_required()
    return None


def _ensure_teacher_teams_ready(*, tenant, course: Course, user: User) -> dict[str, Any] | None:
    if not tenant_syncs_course_team_roster(tenant):
        return None
    if not user.microsoft_id:
        return _teams_link_required("teacher")
    if not course.microsoft_group_id:
        return _ms_team_required()
    return None


def _add_ms_member(*, tenant, course: Course, user: User, role: str) -> dict[str, Any] | None:
    try:
        MSGroup(tenant).add_member(user.microsoft_id, course.microsoft_group_id, role)
    except ValueError as exc:
        return {"error": "validation_error", "message": str(exc)}
    except RuntimeError as exc:
        return _ms_gateway_error(exc)
    except RequestException as exc:
        return _ms_gateway_error(exc)
    return None


def execute_enroll_student(
    *,
    actor: User,
    course: Course,
    student: User,
    source: str,
    tenant,
) -> dict[str, Any]:
    check_course_write(actor, course)
    if not student.is_student():
        return {"error": "validation_error", "message": "User is not a student."}
    if UserCourse.objects.filter(user_id=student.id, course_id=course.id).exists():
        return {"error": "already_enrolled", "message": "Student is already enrolled."}

    teams_error = _ensure_student_teams_ready(tenant=tenant, course=course, user=student)
    if teams_error:
        return teams_error
    if tenant_syncs_course_team_roster(tenant):
        ms_error = _add_ms_member(
            tenant=tenant,
            course=course,
            user=student,
            role="members",
        )
        if ms_error:
            return ms_error

    with transaction.atomic():
        student.is_waiting_for_activation = False
        student.save(update_fields=["is_waiting_for_activation"])
        _user_course, created = UserCourse.objects.get_or_create(
            user_id=student.id,
            course_id=course.id,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        if created:
            record_membership_event(
                course_id=course.id,
                user_id=student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=actor.id,
                source=source,
            )
    refresh_course_member_counts_now([course.id])
    return {
        "status": "ok",
        "action": "enroll_student",
        "student": {"id": student.id, "name": student.name},
        "course": {"id": course.id, "title": course.title},
    }


def execute_remove_student(
    *,
    actor: User,
    course: Course,
    student: User,
    source: str,
    tenant,
) -> dict[str, Any]:
    check_course_write(actor, course)
    user_course = UserCourse.objects.filter(
        course_id=course.id,
        user_id=student.id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course", "user").first()
    if not user_course:
        return {"error": "not_enrolled", "message": "Student is not enrolled in this course."}

    if tenant_syncs_course_team_roster(tenant):
        try:
            MSGroup(tenant).remove_member(
                user_course.course.microsoft_group_id,
                user_course.user.microsoft_id,
                "members",
            )
        except Exception:
            pass

    with transaction.atomic():
        record_membership_event(
            course_id=course.id,
            user_id=student.id,
            event_type=CourseMembershipEvent.EventType.REMOVED,
            actor_id=actor.id,
            source=source,
        )
        user_course.delete()
    refresh_course_member_counts_now([course.id])
    return {
        "status": "ok",
        "action": "remove_student",
        "student": {"id": student.id, "name": student.name},
        "course": {"id": course.id, "title": course.title},
    }


def execute_assign_staff(
    *,
    actor: User,
    course: Course,
    staff: User,
    assigned_as_role: AssignedAsRole,
    weekdays: list[int] | None,
    source: str,
    tenant,
) -> dict[str, Any]:
    check_teacher_event_assignment(actor, staff.id, course)
    if not course_roles_enabled(tenant):
        try:
            assigned_as_role = resolve_main_teacher_role()
        except MissingMainTeacherRole as exc:
            return {
                "error": "validation_error",
                "message": str(exc),
            }

    if UserCourse.objects.filter(user_id=staff.id, course_id=course.id).exists():
        return {
            "error": "already_assigned",
            "message": "Staff member is already assigned to this course.",
        }

    events = filter_events_for_weekdays(
        Event.objects.filter(course_id=course.id),
        weekdays=weekdays,
        tz_name=getattr(tenant, "timezone", None) or "UTC",
    )
    if not events:
        return {
            "error": "validation_error",
            "message": "No course sessions match the requested weekdays.",
        }

    teams_error = _ensure_teacher_teams_ready(tenant=tenant, course=course, user=staff)
    if teams_error:
        return teams_error
    if tenant_syncs_course_team_roster(tenant):
        ms_error = _add_ms_member(
            tenant=tenant,
            course=course,
            user=staff,
            role="owners",
        )
        if ms_error:
            return ms_error

    hourly_rate = get_rate_from_user_course_rates(staff, course)
    user_course = UserCourse(
        user=staff,
        course=course,
        assigned_as=UserCourse.AssignedAs.TEACHER,
        assigned_as_role=assigned_as_role,
        hourly_rate=hourly_rate,
    )
    new_event_ids = [event.id for event in events]

    with transaction.atomic():
        user_course.save()
        record_membership_event(
            course_id=course.id,
            user_id=staff.id,
            event_type=CourseMembershipEvent.EventType.JOINED,
            actor_id=actor.id,
            source=source,
        )
        ensure_teacher_userevents_for_events(
            course_id=course.id,
            event_ids=new_event_ids,
            user_ids=[staff.id],
        )

    refresh_course_member_counts_now([course.id])
    if tenant_syncs_course_team_roster(tenant):
        schedule_update_course_meeting_attendees(course, tenant)

    return {
        "status": "ok",
        "action": "assign_staff",
        "staff": {"id": staff.id, "name": staff.name},
        "course": {"id": course.id, "title": course.title},
        "role": {"id": assigned_as_role.id, "name": assigned_as_role.name},
        "sessions_assigned": len(new_event_ids),
    }


def execute_remove_staff(
    *,
    actor: User,
    course: Course,
    staff: User,
    source: str,
    tenant,
) -> dict[str, Any]:
    check_course_write(actor, course)
    user_course = UserCourse.objects.filter(
        course_id=course.id,
        user_id=staff.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).select_related("course", "user").first()
    if not user_course:
        return {
            "error": "not_on_roster",
            "message": "Staff member is not on this course roster.",
        }

    if tenant_syncs_course_team_roster(tenant):
        Task.objects.create(
            name=Task.TaskName.REMOVE_MS_MEMBER,
            data={
                "group_id": user_course.course.microsoft_group_id,
                "role": user_course.get_role_from_assigned_as(),
                "user_id": user_course.user.microsoft_id,
            },
        )

    with transaction.atomic():
        record_membership_event(
            course_id=course.id,
            user_id=staff.id,
            event_type=CourseMembershipEvent.EventType.REMOVED,
            actor_id=actor.id,
            source=source,
        )
        soft_delete_userevents(
            UserEvent.objects.filter(user_id=staff.id, event__course_id=course.id)
        )
        close_teacher_user_course(user_course)
    refresh_course_member_counts_now([course.id])
    return {
        "status": "ok",
        "action": "remove_staff",
        "staff": {"id": staff.id, "name": staff.name},
        "course": {"id": course.id, "title": course.title},
    }


def execute_roster_action(
    *,
    action: str,
    actor: User,
    tenant,
    payload: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    course = Course.objects.filter(id=payload["course_id"]).first()
    if course is None:
        return {"error": "not_found", "message": "Course not found."}

    if action == "enroll_student":
        student = User.objects.filter(id=payload["student_id"]).first()
        if student is None:
            return {"error": "not_found", "message": "Student not found."}
        return execute_enroll_student(
            actor=actor,
            course=course,
            student=student,
            source=source,
            tenant=tenant,
        )

    if action == "remove_student":
        student = User.objects.filter(id=payload["student_id"]).first()
        if student is None:
            return {"error": "not_found", "message": "Student not found."}
        return execute_remove_student(
            actor=actor,
            course=course,
            student=student,
            source=source,
            tenant=tenant,
        )

    if action == "assign_staff":
        staff = User.objects.filter(id=payload["staff_id"]).first()
        if staff is None:
            return {"error": "not_found", "message": "Staff member not found."}
        role = AssignedAsRole.objects.filter(id=payload["assigned_as_role_id"]).first()
        if role is None:
            return {"error": "not_found", "message": "Course role not found."}
        return execute_assign_staff(
            actor=actor,
            course=course,
            staff=staff,
            assigned_as_role=role,
            weekdays=payload.get("weekdays"),
            source=source,
            tenant=tenant,
        )

    if action == "remove_staff":
        staff = User.objects.filter(id=payload["staff_id"]).first()
        if staff is None:
            return {"error": "not_found", "message": "Staff member not found."}
        return execute_remove_staff(
            actor=actor,
            course=course,
            staff=staff,
            source=source,
            tenant=tenant,
        )

    return {"error": "validation_error", "message": f"Unknown roster action: {action}"}
