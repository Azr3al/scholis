from django.db.models import Count
from rest_framework.exceptions import ValidationError

from app_course.models import Course, Program

SUBSTITUTION_RESERVE_DAYS_MAX = 10


def substitution_reserve_cap(program) -> int:
    """Max substitution-reserve sessions allowed for courses in this program."""
    if program is None or not program.is_session_credit_scheduling:
        return 0
    if not program.is_substitution_reserve_enabled:
        return 0
    return int(program.default_substitution_reserve_days or 0)


def validate_session_credit_program_attrs(attrs: dict, instance) -> None:
    method = attrs.get(
        "course_creation_method",
        getattr(instance, "course_creation_method", None),
    )
    credit = attrs.get(
        "is_session_credit_scheduling",
        getattr(instance, "is_session_credit_scheduling", False),
    )
    if credit and method == Program.CourseCreationMethod.INTAKE_BASED:
        raise ValidationError(
            {
                "is_session_credit_scheduling": (
                    "Session-credit scheduling is only valid for manual programs."
                )
            }
        )
    default_max = attrs.get(
        "default_max_sessions",
        getattr(instance, "default_max_sessions", 8),
    )
    if default_max is not None and (default_max < 1 or default_max > 365):
        raise ValidationError(
            {"default_max_sessions": "Must be between 1 and 365."}
        )

    reserve_enabled = attrs.get(
        "is_substitution_reserve_enabled",
        getattr(instance, "is_substitution_reserve_enabled", False),
    )
    reserve_days = attrs.get(
        "default_substitution_reserve_days",
        getattr(instance, "default_substitution_reserve_days", 0),
    )

    if not credit:
        attrs["is_substitution_reserve_enabled"] = False
        attrs["default_substitution_reserve_days"] = 0
        attrs["allow_multiple_sessions_per_day"] = False
        return

    if reserve_enabled and method == Program.CourseCreationMethod.INTAKE_BASED:
        raise ValidationError(
            {
                "is_substitution_reserve_enabled": (
                    "Substitution reserve is only valid for manual programs."
                )
            }
        )

    if reserve_days is not None and (
        reserve_days < 0 or reserve_days > SUBSTITUTION_RESERVE_DAYS_MAX
    ):
        raise ValidationError(
            {
                "default_substitution_reserve_days": (
                    f"Must be between 0 and {SUBSTITUTION_RESERVE_DAYS_MAX}."
                )
            }
        )

    if not reserve_enabled:
        attrs["default_substitution_reserve_days"] = 0


def backfill_max_sessions_for_program(program: Program) -> int:
    qs = Course.objects.filter(
        program_id=program.id, max_sessions__isnull=True
    ).annotate(event_count=Count("events"))
    updated = 0
    for course in qs:
        course.max_sessions = course.event_count
        course.save(update_fields=["max_sessions"])
        updated += 1
    return updated


def _event_calendar_date(event):
    from datetime import date, datetime

    value = getattr(event, "date", None)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise ValidationError({"date": "Invalid session date."})


def span_dates_from_events(events):
    if not events:
        return None
    days = sorted(_event_calendar_date(event) for event in events)
    return days[0], days[-1]


def simulate_remaining_events(
    *,
    course_id: int,
    delete_ids: list,
    update_payloads: list[dict],
    update_validated: list[dict],
    create_validated: list[dict],
):
    from copy import copy

    from app_course.models import Event

    delete_id_set = {int(event_id) for event_id in delete_ids}
    events_map = {
        event.id: copy(event)
        for event in Event.objects.filter(course_id=course_id)
        if event.id not in delete_id_set
    }
    for payload, validated in zip(update_payloads, update_validated):
        event = events_map[payload["id"]]
        for key, value in validated.items():
            if hasattr(event, key):
                setattr(event, key, value)
    model_fields = {field.name for field in Event._meta.fields}
    created = []
    for data in create_validated:
        row = {key: value for key, value in data.items() if key in model_fields}
        created.append(Event(**row))
    return list(events_map.values()) + created


def _event_is_substitution_reserve(event) -> bool:
    return bool(getattr(event, "is_substitution_reserve", False))


def validate_session_credit_simulated_events(
    events,
    effective_max,
    *,
    program=None,
) -> None:
    if effective_max is None:
        raise ValidationError(
            {"max_sessions": "This program requires a max session count."}
        )
    if effective_max < 0:
        raise ValidationError({"max_sessions": "Must be at least 0."})

    teaching = [e for e in events if not _event_is_substitution_reserve(e)]
    reserve = [e for e in events if _event_is_substitution_reserve(e)]
    reserve_cap = substitution_reserve_cap(program)

    if reserve and reserve_cap <= 0:
        raise ValidationError(
            {
                "events": (
                    "Substitution reserve sessions are not enabled for this program."
                )
            }
        )
    if len(reserve) > reserve_cap:
        raise ValidationError(
            {
                "default_substitution_reserve_days": (
                    "Cannot save more substitution reserve sessions than the program allows."
                )
            }
        )

    allow_multi = bool(
        program is not None and program.allow_multiple_sessions_per_day
    )
    if not allow_multi:
        seen = set()
        for event in events:
            day = _event_calendar_date(event)
            if day in seen:
                raise ValidationError(
                    {"events": "Each calendar date can have only one session."}
                )
            seen.add(day)

    if len(teaching) > effective_max:
        raise ValidationError(
            {
                "max_sessions": (
                    "Cannot save more sessions than the max session count."
                )
            }
        )
