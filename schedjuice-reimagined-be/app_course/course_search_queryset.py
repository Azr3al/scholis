"""Query helpers for course list/search endpoints."""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING

from django.core.exceptions import BadRequest
from django.db.models import Count, OuterRef, Prefetch, Subquery

from app_auth.models import User
from app_course import models
from utilitas.queryset_mixins import expand_includes_prefix

_USER_COURSE_SORT_ALIASES = {
    "name": "user__name",
    "email": "user__email",
    "alternative_name": "user__alternative_name",
    "role": "assigned_as_role__name",
}

_ALLOWED_USER_COURSE_SORT_FIELDS = frozenset(_USER_COURSE_SORT_ALIASES.values())


def normalize_user_course_sorts(sorts: list[str]) -> list[str]:
    """Map client sort keys to valid UserCourse ORM paths; raise BadRequest if unknown."""
    normalized: list[str] = []
    for raw in sorts:
        if raw == "is_fully_paid":
            continue
        desc = raw.startswith("-")
        field = raw[1:] if desc else raw
        mapped = _USER_COURSE_SORT_ALIASES.get(field, field)
        if mapped not in _ALLOWED_USER_COURSE_SORT_FIELDS:
            raise BadRequest(f"Invalid sort field: {field}")
        normalized.append(f"-{mapped}" if desc else mapped)
    return normalized

if TYPE_CHECKING:
    from app_auth.models import User as UserModel


def annotate_course_queryset_first_event_times(queryset):
    """
    First event = earliest by calendar date, then time_from (matches typical schedule ordering).
    Annotates _first_event_time_from / _first_event_time_to for CourseSerializer.
    """
    ordered = models.Event.objects.filter(course_id=OuterRef("pk")).order_by(
        "date", "time_from"
    )
    return queryset.annotate(
        _first_event_time_from=Subquery(ordered.values("time_from")[:1]),
        _first_event_time_to=Subquery(ordered.values("time_to")[:1]),
    )


def annotate_program_queryset_intake_count(queryset):
    """Annotates _intake_count for ProgramSerializer.get_intake_count (avoids N+1)."""
    return queryset.annotate(_intake_count=Count("intakes"))


def optimized_course_queryset_for_serializer():
    """Course queryset with annotations/prefetches required by CourseSerializer list/detail fields."""
    return prefetch_course_teacher_roster_for_list_serializer(
        annotate_course_queryset_first_event_times(models.Course.objects.all())
    )


def prefetch_course_lookup(queryset, lookup: str):
    """Replace a course FK/M2M prefetch path with a CourseSerializer-safe queryset."""
    return queryset.prefetch_related(
        Prefetch(lookup, queryset=optimized_course_queryset_for_serializer())
    )


def build_user_queryset_for_roster_expand():
    """User queryset with M2M prefetches required by UserSerializer.to_representation."""
    return User.objects.prefetch_related("scoped_programs", "scoped_categories")


def build_user_course_queryset_for_roster_user_expand():
    """UserCourse queryset for course roster expand (user_courses.user)."""
    return models.UserCourse.objects.select_related("assigned_as_role").prefetch_related(
        Prefetch("user", queryset=build_user_queryset_for_roster_expand())
    )


def annotate_intake_queryset_courses_count(queryset):
    """Annotates _courses_count for IntakeSerializer.get_courses_count (avoids N+1)."""
    return queryset.annotate(_courses_count=Count("courses"))


def build_intake_queryset_for_course_expand():
    return annotate_intake_queryset_courses_count(models.Intake.objects.all())


def build_program_queryset_for_course_expand():
    return annotate_program_queryset_intake_count(models.Program.objects.all())


def build_course_subject_queryset_for_expand():
    return models.CourseSubject.objects.select_related("subject")


def prime_id_card_class_cache(request, users: Iterable[UserModel]) -> None:
    """Batch-resolve id_card_class for roster expands; no-op if request is None."""
    if request is None:
        return
    user_list = list(users)
    if not user_list:
        return
    from app_auth.id_card_class import resolve_id_card_class_names

    request._id_card_class_names = resolve_id_card_class_names(user_list)


def prime_course_roster_id_card_cache(request, courses, expand) -> None:
    """Prime id_card batch cache when clients expand user_courses on course list/search."""
    if request is None or not expand_includes_prefix(expand, "user_courses"):
        return
    users = []
    for course in courses:
        for uc in course.user_courses.all():
            if uc.user_id:
                users.append(uc.user)
    prime_id_card_class_cache(request, users)


def prime_user_course_roster_id_card_cache(request, user_courses, expand) -> None:
    """Prime id_card batch cache when clients expand user on user-courses search."""
    if request is None or not expand_includes_prefix(expand, "user"):
        return
    prime_id_card_class_cache(
        request, (uc.user for uc in user_courses if uc.user_id)
    )


def build_user_course_queryset_with_optimized_course():
    """UserCourse queryset whose nested .course is CourseSerializer-safe."""
    teacher_roster_qs = models.UserCourse.objects.filter(
        assigned_as=models.UserCourse.AssignedAs.TEACHER,
    ).select_related("user", "assigned_as_role")
    course_qs = annotate_course_queryset_first_event_times(
        models.Course.objects.select_related("program", "level", "section")
    ).prefetch_related(
        Prefetch(
            "user_courses",
            queryset=teacher_roster_qs,
            to_attr="_prefetched_teacher_user_courses",
        )
    )
    return models.UserCourse.objects.select_related("assigned_as_role").prefetch_related(
        Prefetch("course", queryset=course_qs)
    )


def build_assignment_queryset_with_optimized_course():
    return models.Assignment.objects.prefetch_related(
        Prefetch("course", queryset=optimized_course_queryset_for_serializer())
    )


def build_event_queryset_with_optimized_course():
    return models.Event.objects.prefetch_related(
        Prefetch("course", queryset=optimized_course_queryset_for_serializer())
    )


def attach_course_create_representation_caches(course) -> None:
    """
    Avoid N method-field queries on 201 create response.
    Fresh create has no events; teacher roster may be empty or just auto-MT.
    """
    if not hasattr(course, "_first_event_time_from"):
        course._first_event_time_from = None
    if not hasattr(course, "_first_event_time_to"):
        course._first_event_time_to = None
    if getattr(course, "_prefetched_teacher_user_courses", None) is None:
        teacher_qs = models.UserCourse.objects.filter(
            course_id=course.pk,
            assigned_as=models.UserCourse.AssignedAs.TEACHER,
        ).select_related("user", "assigned_as_role")
        course._prefetched_teacher_user_courses = list(teacher_qs)


def prefetch_course_teacher_roster_for_list_serializer(queryset):
    """
    Fills Course._prefetched_teacher_user_courses (see teams_organizer.get_course_primary_teacher_user).

    Avoids N+1 (and triple queries per course) from CourseSerializer:
    primary_teacher, has_teams_meeting_organizer, teams_meeting_organizer_unresolved.
    """
    teacher_qs = models.UserCourse.objects.filter(
        assigned_as=models.UserCourse.AssignedAs.TEACHER,
    ).select_related("user", "assigned_as_role")
    return queryset.prefetch_related(
        Prefetch(
            "user_courses",
            queryset=teacher_qs,
            to_attr="_prefetched_teacher_user_courses",
        )
    )
