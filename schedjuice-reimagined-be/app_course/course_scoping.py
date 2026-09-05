"""RBAC helpers for course list/search/suggest querysets and object access."""
from __future__ import annotations

from django.db.models import Q, QuerySet
from rest_framework.exceptions import PermissionDenied, ValidationError

from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_auth.models import User
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.course_role_policy import (
    MissingMainTeacherRole,
    is_exclusive_teacher,
    resolve_main_teacher_role,
)
from app_course.models import Course, Event, UserAttendance, UserCourse
from app_rbac import scoping
from app_rbac.resolution import effective_permissions


def acting_user(request) -> User | None:
    """Tenant User for RBAC/scoping (JWT stateless vs ORM-authenticated requests)."""
    candidate = getattr(request, "user", None)
    if candidate is None or not getattr(candidate, "is_authenticated", False):
        return None
    if isinstance(candidate, User):
        return candidate
    return User.get_user_from_request(request)


def user_has_course_scope(user: User, course: Course) -> bool:
    """Program/category oversight scope (not teaching roster)."""
    if course.program_id and user.scoped_programs.filter(pk=course.program_id).exists():
        return True
    if course.category_id and user.scoped_categories.filter(pk=course.category_id).exists():
        return True
    return False


def user_is_connected_to_course(user: User, course: Course) -> bool:
    """Roster member, scoped overseer, or course creator (not global read breadth)."""
    if course.created_by_id == user.id:
        return True
    if user_has_course_scope(user, course):
        return True
    return UserCourse.objects.filter(user_id=user.id, course_id=course.id).exists()


def user_can_access_course(user: User, course: Course) -> bool:
    """Users with read breadth, scope, roster members, and creators may access a course."""
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("course", held):
        return True
    return user_is_connected_to_course(user, course)


def check_course_read(user: User, course: Course) -> None:
    if not user_can_access_course(user, course):
        raise PermissionDenied("Not allowed for this course.")


def check_course_write(user: User, course: Course) -> None:
    held = set(effective_permissions(user))
    if not scoping.can_write_object(
        "course", held, is_connected=user_is_connected_to_course(user, course)
    ):
        raise PermissionDenied("Not allowed for this course.")


SELF_ASSIGN_EVENTS = "course.assign_self_events"


def can_assign_self_to_course_events(user: User) -> bool:
    held = set(effective_permissions(user))
    if "course.manage_all" in held:
        return True
    return SELF_ASSIGN_EVENTS in held


def check_teacher_event_assignment(
    actor: User, target_user_id: int, course: Course
) -> None:
    check_course_write(actor, course)
    if target_user_id == actor.id and not can_assign_self_to_course_events(actor):
        raise PermissionDenied(
            "You don't have permission to assign yourself to course events."
        )


def _scoped_course_ids(user: User) -> set[int]:
    program_ids = list(user.scoped_programs.values_list("id", flat=True))
    category_ids = list(user.scoped_categories.values_list("id", flat=True))
    if not program_ids and not category_ids:
        return set()
    q = Q()
    if program_ids:
        q |= Q(program_id__in=program_ids)
    if category_ids:
        q |= Q(category_id__in=category_ids)
    return set(Course.objects.filter(q).values_list("id", flat=True))


def _narrow_courses_for_user(queryset: QuerySet, user: User) -> QuerySet:
    assigned_ids = UserCourse.objects.filter(user_id=user.id).values_list(
        "course_id", flat=True
    )
    created_ids = Course.objects.filter(created_by_id=user.id).values_list(
        "id", flat=True
    )
    course_ids = set(assigned_ids) | set(created_ids) | _scoped_course_ids(user)
    return queryset.filter(id__in=course_ids)


def scope_courses_for_user(user: User, queryset: QuerySet | None = None) -> QuerySet:
    """Users with read breadth see all courses; others see assigned, scoped, + created."""
    qs = queryset if queryset is not None else Course.objects.all()
    held = set(effective_permissions(user))
    return scoping.scope(
        "course", qs, held, lambda q: _narrow_courses_for_user(q, user)
    )


def _assigned_course_ids(user: User):
    return UserCourse.objects.filter(user_id=user.id).values_list("course_id", flat=True)


def scope_events_for_user(user: User, queryset: QuerySet | None = None) -> QuerySet:
    qs = queryset if queryset is not None else Event.objects.all()
    held = set(effective_permissions(user))
    return scoping.scope(
        "course",
        qs,
        held,
        lambda q: q.filter(
            course_id__in=scope_courses_for_user(user).values_list("id", flat=True)
        ),
    )


def scope_user_courses_for_user(user: User, queryset: QuerySet | None = None) -> QuerySet:
    qs = queryset if queryset is not None else UserCourse.objects.all()
    held = set(effective_permissions(user))

    def narrow(q):
        course_ids = scope_courses_for_user(user).values_list("id", flat=True)
        return q.filter(course_id__in=course_ids)

    return scoping.scope("course", qs, held, narrow)


def check_user_course_read(user: User, user_course: UserCourse) -> None:
    check_course_read(user, user_course.course)


def check_user_course_write(user: User, user_course: UserCourse) -> None:
    check_course_write(user, user_course.course)


def scope_user_attendances_for_user(
    user: User, queryset: QuerySet | None = None
) -> QuerySet:
    qs = queryset if queryset is not None else UserAttendance.objects.all()
    held = set(effective_permissions(user))
    if "payroll.view_all" in held:
        return qs
    if "payroll.view" in held:
        return qs.filter(user_id=user.id)
    return qs.none()


def check_user_attendance_read(user: User, attendance: UserAttendance) -> None:
    held = set(effective_permissions(user))
    if "payroll.view_all" in held:
        return
    if "payroll.view" in held and attendance.user_id == user.id:
        return
    raise PermissionDenied("You don't have permission to view this payroll record.")


def require_superadmin_or_admin(user: User) -> None:
    roles = user.roles or []
    if User.UserRole.SUPERADMIN in roles or User.UserRole.ADMIN in roles:
        return
    raise PermissionDenied("You don't have permission to perform this action.")


def assign_creator_as_teacher_if_applicable(
    creator: User | None,
    course: Course,
    tenant=None,
) -> None:
    """Optionally roster the course creator as teacher / main teacher."""
    if creator is None:
        return

    flag_on = bool(getattr(tenant, "auto_assign_creator_as_main_teacher", False))
    if flag_on:
        if not is_exclusive_teacher(creator):
            return
        try:
            mt_role = resolve_main_teacher_role()
        except MissingMainTeacherRole as exc:
            raise ValidationError({"detail": exc.message}) from exc

        uc, created = UserCourse.objects.get_or_create(
            user_id=creator.id,
            course_id=course.id,
            defaults={
                "assigned_as": UserCourse.AssignedAs.TEACHER,
                "assigned_as_role": mt_role,
            },
        )
        if not created:
            update_fields: list[str] = []
            if uc.assigned_as != UserCourse.AssignedAs.TEACHER:
                uc.assigned_as = UserCourse.AssignedAs.TEACHER
                update_fields.append("assigned_as")
            if uc.assigned_as_role_id != mt_role.id:
                uc.assigned_as_role = mt_role
                update_fields.append("assigned_as_role")
            if update_fields:
                uc.save(update_fields=update_fields)

        event_ids = list(
            Event.objects.filter(course_id=course.id).values_list("id", flat=True)
        )
        if event_ids:
            ensure_teacher_userevents_for_events(
                course_id=course.id,
                event_ids=event_ids,
                user_ids=[creator.id],
            )
        refresh_course_member_counts_now([course.id])
        return

    if not creator.is_teacher() or creator.is_admin():
        return
    _, created = UserCourse.objects.get_or_create(
        user_id=creator.id,
        course_id=course.id,
        defaults={"assigned_as": UserCourse.AssignedAs.TEACHER},
    )
    if created:
        refresh_course_member_counts_now([course.id])
