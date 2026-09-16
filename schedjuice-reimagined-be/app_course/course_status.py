"""Effective course status: date-derived with manual pause/end overrides."""
from __future__ import annotations

from datetime import date

from django.db import transaction
from django.db.models import Case, CharField, Q, QuerySet, Value, When
from django.utils import timezone

from app_auth.models import User
from app_attendance.models import UserEvent
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.models import Course, CourseHistory, Event, UserCourse


def reference_date(reference: date | None = None) -> date:
    return reference or timezone.localdate()


def compute_effective_status(
    course: Course,
    *,
    reference: date | None = None,
) -> str:
    """Return effective status string for a course instance."""
    ref = reference_date(reference)
    override = course.status_override
    if override == Course.StatusOverride.PAUSED:
        return Course.CourseStatus.PAUSED
    if override == Course.StatusOverride.ENDED:
        return Course.CourseStatus.ENDED
    if course.start_date > ref:
        return Course.CourseStatus.PLANNED
    if course.start_date <= ref <= course.end_date:
        return Course.CourseStatus.ACTIVE
    return Course.CourseStatus.ENDED


def annotate_effective_status(
    queryset: QuerySet,
    *,
    reference: date | None = None,
) -> QuerySet:
    ref = reference_date(reference)
    return queryset.annotate(
        effective_status=Case(
            When(
                status_override=Course.StatusOverride.PAUSED,
                then=Value(Course.CourseStatus.PAUSED),
            ),
            When(
                status_override=Course.StatusOverride.ENDED,
                then=Value(Course.CourseStatus.ENDED),
            ),
            When(start_date__gt=ref, then=Value(Course.CourseStatus.PLANNED)),
            When(
                start_date__lte=ref,
                end_date__gte=ref,
                then=Value(Course.CourseStatus.ACTIVE),
            ),
            default=Value(Course.CourseStatus.ENDED),
            output_field=CharField(max_length=16),
        )
    )


def _no_manual_override_q() -> Q:
    return Q(status_override__isnull=True) | ~Q(
        status_override__in=[
            Course.StatusOverride.PAUSED,
            Course.StatusOverride.ENDED,
        ]
    )


def effective_status_q(*statuses: str, reference: date | None = None) -> Q:
    """Q object matching courses whose effective status is in `statuses`."""
    ref = reference_date(reference)
    combined = Q()
    for status in statuses:
        if status == Course.CourseStatus.PAUSED:
            clause = Q(status_override=Course.StatusOverride.PAUSED)
        elif status == Course.CourseStatus.ENDED:
            clause = Q(status_override=Course.StatusOverride.ENDED) | (
                _no_manual_override_q() & Q(end_date__lt=ref)
            )
        elif status == Course.CourseStatus.PLANNED:
            clause = _no_manual_override_q() & Q(start_date__gt=ref)
        elif status == Course.CourseStatus.ACTIVE:
            clause = _no_manual_override_q() & Q(
                start_date__lte=ref,
                end_date__gte=ref,
            )
        else:
            continue
        combined |= clause
    return combined


def apply_effective_status_filter(
    queryset: QuerySet,
    statuses: list[str],
    *,
    reference: date | None = None,
) -> QuerySet:
    if not statuses:
        return queryset
    return queryset.filter(effective_status_q(*statuses, reference=reference))


def extract_status_filter_values(filter_params: list | None) -> list[str] | None:
    if not filter_params:
        return None
    values: list[str] = []
    for fp in filter_params:
        if fp.get("field_name") != "status":
            continue
        raw = fp.get("value") or ""
        if fp.get("operator") == "in":
            values.extend(part.strip() for part in raw.split(",") if part.strip())
        elif raw:
            values.append(raw.strip())
    return values or None


def filter_params_without_status(filter_params: list | None) -> list:
    if not filter_params:
        return []
    return [fp for fp in filter_params if fp.get("field_name") != "status"]


def user_can_edit_course_status(user: User, course: Course) -> bool:
    if user.is_admin():
        return True
    if course.created_by_id == user.id:
        return True
    return UserCourse.objects.filter(
        course=course,
        user=user,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def _sync_legacy_status_column(course: Course) -> None:
    course.status = compute_effective_status(course)
    course.save(update_fields=["status", "updated_at"])


def pause_course(*, course: Course, user: User, reason: str | None = None) -> Course:
    now = timezone.now()
    course.status_override = Course.StatusOverride.PAUSED
    course.status_override_reason = reason
    course.status_override_at = now
    course.status_override_by = user
    course.save(
        update_fields=[
            "status_override",
            "status_override_reason",
            "status_override_at",
            "status_override_by",
            "updated_at",
        ]
    )
    _sync_legacy_status_column(course)
    remove_course_history_if_not_ended(course)
    return course


def resume_course(*, course: Course, user: User) -> Course:
    if course.status_override != Course.StatusOverride.PAUSED:
        raise ValueError("Course is not paused.")
    course.status_override = None
    course.status_override_reason = None
    course.status_override_at = None
    course.status_override_by = None
    course.save(
        update_fields=[
            "status_override",
            "status_override_reason",
            "status_override_at",
            "status_override_by",
            "updated_at",
        ]
    )
    _sync_legacy_status_column(course)
    effective = compute_effective_status(course)
    if effective == Course.CourseStatus.ENDED:
        ensure_course_history_for_ended_course(course)
    else:
        remove_course_history_if_not_ended(course)
    return course


def end_course(*, course: Course, user: User, reason: str | None = None) -> Course:
    now = timezone.now()
    course.status_override = Course.StatusOverride.ENDED
    course.status_override_reason = reason
    course.status_override_at = now
    course.status_override_by = user
    course.save(
        update_fields=[
            "status_override",
            "status_override_reason",
            "status_override_at",
            "status_override_by",
            "updated_at",
        ]
    )
    _sync_legacy_status_column(course)
    ensure_course_history_for_ended_course(course)
    return course


def clear_ended_override_on_date_change(course: Course) -> None:
    if course.status_override != Course.StatusOverride.ENDED:
        return
    _clear_status_override_fields(course)
    _sync_legacy_status_column(course)
    effective = compute_effective_status(course)
    if effective == Course.CourseStatus.ENDED:
        ensure_course_history_for_ended_course(course)
    else:
        remove_course_history_if_not_ended(course)


def _clear_status_override_fields(course: Course) -> None:
    course.status_override = None
    course.status_override_reason = None
    course.status_override_at = None
    course.status_override_by = None
    course.save(
        update_fields=[
            "status_override",
            "status_override_reason",
            "status_override_at",
            "status_override_by",
            "updated_at",
        ]
    )


def delete_events_outside_date_range(
    course_id: int,
    start_date: date,
    end_date: date,
) -> int:
    outside_event_ids = list(
        Event.objects.filter(course_id=course_id)
        .filter(Q(date__lt=start_date) | Q(date__gt=end_date))
        .values_list("id", flat=True)
    )
    if not outside_event_ids:
        return 0

    blocked = (
        UserEvent.objects.filter(
            event_id__in=outside_event_ids,
            checkin_time__isnull=False,
        )
        .values_list("event_id", flat=True)
        .distinct()
    )
    if blocked:
        raise ValueError(
            "Cannot change course dates — some sessions outside the new range "
            "have check-in records."
        )

    deleted, _ = Event.objects.filter(id__in=outside_event_ids).delete()
    return deleted


def reactivate_course(
    *,
    course: Course,
    user: User,
    start_date: date,
    end_date: date,
) -> Course:
    if end_date < start_date:
        raise ValueError("End date cannot be before start date.")
    if compute_effective_status(course) != Course.CourseStatus.ENDED:
        raise ValueError("Course is not ended.")

    with transaction.atomic():
        if course.status_override is not None:
            _clear_status_override_fields(course)

        course.start_date = start_date
        course.end_date = end_date
        course.save(update_fields=["start_date", "end_date", "updated_at"])

        delete_events_outside_date_range(course.id, start_date, end_date)
        remove_course_history_if_not_ended(course)
        _sync_legacy_status_column(course)
        refresh_course_member_counts_now([course.id])

    course.refresh_from_db()
    return course


def ensure_course_history_for_ended_course(course: Course) -> int:
    """Insert CourseHistory rows for enrollments on ended courses (idempotent)."""
    if compute_effective_status(course) != Course.CourseStatus.ENDED:
        return 0
    created = 0
    now = timezone.now()
    existing_user_ids = set(
        CourseHistory.objects.filter(course_id=course.id).values_list(
            "user_id", flat=True
        )
    )
    to_create = []
    for uc in UserCourse.objects.filter(course_id=course.id):
        if uc.user_id in existing_user_ids:
            continue
        to_create.append(
            CourseHistory(
                course_id=course.id,
                user_id=uc.user_id,
                created_at=now,
                updated_at=now,
            )
        )
    if to_create:
        CourseHistory.objects.bulk_create(to_create)
        created = len(to_create)
    return created


def remove_course_history_if_not_ended(course: Course) -> int:
    if compute_effective_status(course) == Course.CourseStatus.ENDED:
        return 0
    deleted, _ = CourseHistory.objects.filter(course_id=course.id).delete()
    return deleted


def repair_course_history_for_schema() -> tuple[int, int]:
    """Ensure history matches effective ended status for all courses in current schema."""
    ref = reference_date()
    created_total = 0
    deleted_total = 0
    with transaction.atomic():
        ended_qs = Course.objects.filter(
            effective_status_q(Course.CourseStatus.ENDED, reference=ref)
        )
        for course in ended_qs.iterator():
            created_total += ensure_course_history_for_ended_course(course)

        not_ended_ids = Course.objects.exclude(
            id__in=ended_qs.values("id")
        ).values_list("id", flat=True)
        if not_ended_ids:
            deleted, _ = CourseHistory.objects.filter(
                course_id__in=list(not_ended_ids)
            ).delete()
            deleted_total = deleted
    return created_total, deleted_total


def effective_active_course_sql(alias: str = "c") -> str:
    """SQL fragment: course row is effectively active (for raw queries)."""
    return f"""(
        ({alias}.status_override IS NULL OR {alias}.status_override NOT IN ('paused', 'ended'))
        AND {alias}.start_date <= CURRENT_DATE
        AND {alias}.end_date >= CURRENT_DATE
    )"""


def effective_planned_or_active_course_sql(alias: str = "c") -> str:
    """SQL: course is effectively PLANNED or ACTIVE (not paused/ended)."""
    return effective_status_in_sql(
        alias,
        [Course.CourseStatus.PLANNED, Course.CourseStatus.ACTIVE],
    )


def effective_status_in_sql(alias: str, statuses: list[str]) -> str:
    parts = []
    ref = "CURRENT_DATE"
    for status in statuses:
        if status == Course.CourseStatus.PAUSED:
            parts.append(f"{alias}.status_override = 'paused'")
        elif status == Course.CourseStatus.ENDED:
            parts.append(
                f"({alias}.status_override = 'ended' OR "
                f"(({alias}.status_override IS NULL OR {alias}.status_override NOT IN ('paused', 'ended')) "
                f"AND {alias}.end_date < {ref}))"
            )
        elif status == Course.CourseStatus.PLANNED:
            parts.append(
                f"(({alias}.status_override IS NULL OR {alias}.status_override NOT IN ('paused', 'ended')) "
                f"AND {alias}.start_date > {ref})"
            )
        elif status == Course.CourseStatus.ACTIVE:
            parts.append(effective_active_course_sql(alias))
    if not parts:
        return "TRUE"
    return "(" + " OR ".join(parts) + ")"


def course_is_effectively_active(course: Course, *, reference: date | None = None) -> bool:
    return compute_effective_status(course, reference=reference) == Course.CourseStatus.ACTIVE


def course_is_effectively_planned_or_active(
    course: Course,
    *,
    reference: date | None = None,
) -> bool:
    effective = compute_effective_status(course, reference=reference)
    return effective in (
        Course.CourseStatus.PLANNED,
        Course.CourseStatus.ACTIVE,
    )
