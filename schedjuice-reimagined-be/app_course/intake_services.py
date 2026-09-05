"""Intake course preview and bulk generation."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, time
from typing import Any

from rest_framework.exceptions import ValidationError

from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_course.course_program_validation import validate_course_dates_within_intake
from app_course.models import (
    Course,
    Event,
    Intake,
    Program,
    ProgramLevel,
    ProgramLevelSection,
    ProgramSubject,
)

WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

PERSISTED_GENERATION_DEFAULT_KEYS = (
    "category_id",
    "payment_plan_id",
    "start_date",
    "end_date",
    "slots",
    "level_subject_ids",
    "level_section_names",
    "course_type",
    "description",
    "campus_id",
    "is_payment_enabled",
    "exam_session_date",
    "exam_board",
)


def sanitize_generation_defaults(defaults: dict[str, Any] | None) -> dict[str, Any]:
    if not defaults:
        return {}
    return {
        key: defaults[key]
        for key in PERSISTED_GENERATION_DEFAULT_KEYS
        if key in defaults
    }


def _override_map(overrides: list[dict] | None) -> dict[str, dict]:
    if not overrides:
        return {}
    return {str(o.get("key")): o for o in overrides if o.get("key")}


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _parse_time(value: str) -> time:
    if len(value.split(":")) == 2:
        return time.fromisoformat(f"{value}:00")
    return time.fromisoformat(value)


def _weekday_label(day: date | str) -> str:
    coerced = _parse_date(day) if not isinstance(day, date) else day
    if coerced is None:
        raise ValueError(f"Invalid date for weekday label: {day!r}")
    return WEEKDAYS[(coerced.weekday() + 1) % 7]


def _validate_slots(slots: list[dict] | None) -> None:
    if not slots:
        return
    seen: set[tuple[str, str, str]] = set()
    for slot in slots:
        weekday = slot.get("weekday")
        time_from = slot.get("time_from")
        time_to = slot.get("time_to")
        if weekday not in WEEKDAYS:
            raise ValueError(f"Unknown weekday: {weekday!r}")
        if not time_from or not time_to:
            raise ValueError("Each session slot requires time_from and time_to.")
        start = _parse_time(str(time_from))
        end = _parse_time(str(time_to))
        if end <= start:
            raise ValueError(
                f"Session end time must be after start time ({weekday} {time_from}-{time_to})."
            )
        key = (weekday, str(time_from), str(time_to))
        if key in seen:
            raise ValueError("Duplicate session slots are not allowed.")
        seen.add(key)

    by_weekday: dict[str, list[tuple[time, time, str, str]]] = defaultdict(list)
    for slot in slots:
        weekday = slot.get("weekday")
        time_from = str(slot.get("time_from"))
        time_to = str(slot.get("time_to"))
        start = _parse_time(time_from)
        end = _parse_time(time_to)
        by_weekday[weekday].append((start, end, time_from, time_to))

    for weekday, ranges in by_weekday.items():
        ordered = sorted(ranges, key=lambda item: item[0])
        for idx in range(1, len(ordered)):
            previous = ordered[idx - 1]
            current = ordered[idx]
            if current[0] < previous[1]:
                raise ValueError(
                    f"Overlapping session times on {weekday}: "
                    f"{previous[2]}\u2013{previous[3]} and {current[2]}\u2013{current[3]}."
                )


def _resolve_row_dates(
    row_key: str,
    row_override: dict,
    defaults: dict[str, Any],
    intake: Intake,
) -> tuple[date, date]:
    has_date_override = "start_date" in row_override or "end_date" in row_override
    if has_date_override:
        start = (
            _parse_date(row_override.get("start_date"))
            or _parse_date(defaults.get("start_date"))
            or intake.start_date
        )
        end = (
            _parse_date(row_override.get("end_date"))
            or _parse_date(defaults.get("end_date"))
            or intake.end_date
        )
    else:
        start = _parse_date(defaults.get("start_date")) or intake.start_date
        end = _parse_date(defaults.get("end_date")) or intake.end_date

    if start is None or end is None:
        raise ValueError(f"Missing start or end date for course row {row_key!r}.")
    if start > end:
        raise ValueError(
            f"Start date must be on or before end date for course row {row_key!r}."
        )

    try:
        validate_course_dates_within_intake(start, end, intake)
    except ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            msg = " ".join(
                str(v[0] if isinstance(v, list) else v) for v in detail.values()
            )
        else:
            msg = str(detail)
        raise ValueError(
            f"Course dates for row {row_key!r} are outside the intake window: {msg}"
        ) from exc

    return start, end


def _resolve_row_slots(
    row_override: dict, defaults: dict[str, Any]
) -> list[dict] | None:
    if "slots" in row_override:
        return row_override.get("slots") or []
    default_slots = defaults.get("slots")
    if default_slots is None:
        return None
    return default_slots or []


def _resolve_row_category_id(
    row_override: dict,
    defaults: dict[str, Any],
    level_id: int | None,
    fallback_category_id: int,
    *,
    levels_by_id: dict[int, ProgramLevel],
) -> int:
    if row_override.get("category_id"):
        return int(row_override["category_id"])

    default_category_id = defaults.get("category_id")
    if default_category_id:
        return int(default_category_id)

    if level_id:
        level_category_id = _resolve_category_id(level_id, levels_by_id=levels_by_id)
        if level_category_id:
            return level_category_id

    return fallback_category_id


def _resolve_row_payment_plan_id(
    row_override: dict,
    defaults: dict[str, Any],
) -> int | None:
    if row_override.get("payment_plan_id"):
        return int(row_override["payment_plan_id"])
    payment_plan_id = defaults.get("payment_plan_id")
    if payment_plan_id:
        return int(payment_plan_id)
    return None


def _generate_recurring_events(course: Course, slots: list[dict]) -> None:
    by_day: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for slot in slots:
        by_day[slot["weekday"]].append((slot["time_from"], slot["time_to"]))

    start = _parse_date(course.start_date) or course.start_date
    end = _parse_date(course.end_date) or course.end_date
    if not isinstance(start, date) or not isinstance(end, date):
        raise ValueError(
            f"Course {course.pk} needs valid start_date/end_date for recurring events."
        )

    events: list[Event] = []
    current = start
    while current <= end:
        label = _weekday_label(current)
        for time_from, time_to in by_day.get(label, []):
            events.append(
                Event(
                    title=course.title,
                    date=datetime.combine(current, _parse_time(str(time_from))),
                    time_from=_parse_time(str(time_from)),
                    time_to=_parse_time(str(time_to)),
                    course=course,
                )
            )
        current += timedelta(days=1)

    if events:
        Event.objects.bulk_create(events, batch_size=500)
        event_ids = [event.id for event in events if event.id]
        if not event_ids:
            event_ids = list(
                Event.objects.filter(course_id=course.id)
                .order_by("-id")[: len(events)]
                .values_list("id", flat=True)
            )
        ensure_teacher_userevents_for_events(course_id=course.id, event_ids=event_ids)


def _get_level_section_names_map(
    defaults: dict[str, Any] | None,
) -> dict[int, list[str] | None]:
    if not defaults:
        return {}
    raw = defaults.get("level_section_names") or {}
    result: dict[int, list[str] | None] = {}
    for level_key, names in raw.items():
        if names is None:
            result[int(level_key)] = None
        else:
            result[int(level_key)] = [str(n) for n in names]
    return result


def _resolve_sections_for_level(
    level: ProgramLevel,
    level_section_names: list[str] | None,
) -> list[dict[str, Any]]:
    """
    Resolve section specs for preview rows.

    level_section_names:
      None -> all active program sections for the level
      [] -> no sections
      ["A", "B"] -> one row per name; must match program section by name
    """
    program_sections = [s for s in level.sections.all() if s.is_active]
    program_sections.sort(key=lambda s: (s.sort_order, s.name))
    sections_by_name_lower = {s.name.strip().lower(): s for s in program_sections}

    if level_section_names is None:
        if program_sections:
            return [
                {
                    "key": f"level:{level.id}:section:{sec.id}",
                    "section_id": sec.id,
                    "section_name": sec.name,
                }
                for sec in program_sections
            ]
        return [{"key": f"level:{level.id}", "section_id": None, "section_name": None}]

    if not level_section_names:
        return []

    specs: list[dict[str, Any]] = []
    for name in level_section_names:
        matched = sections_by_name_lower.get(name.strip().lower())
        if not matched:
            raise ValueError(
                f"Unknown section {name!r} for level {level.name!r}. "
                "Add the section to the program before generating courses."
            )
        specs.append(
            {
                "key": f"level:{level.id}:section:{matched.id}",
                "section_id": matched.id,
                "section_name": matched.name,
            }
        )
    return specs


def _enrich_preview_rows_with_dates(
    rows: list[dict],
    omap: dict[str, dict],
    defaults: dict[str, Any] | None,
    intake: Intake,
) -> list[dict]:
    defaults = defaults or {}
    enriched: list[dict] = []
    for row in rows:
        row_key = row["key"]
        row_override = omap.get(row_key, {})
        start_date, end_date = _resolve_row_dates(
            row_key, row_override, defaults, intake
        )
        if isinstance(start_date, str):
            start_date = _parse_date(start_date)
        if isinstance(end_date, str):
            end_date = _parse_date(end_date)
        enriched.append(
            {
                **row,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
        )
    return enriched


def _apply_duplicate_subject_title_numbers(
    rows: list[dict],
    omap: dict[str, dict],
) -> None:
    subject_totals: dict[int, int] = defaultdict(int)
    for row in rows:
        subject_id = row.get("subject_id")
        if subject_id is not None:
            subject_totals[int(subject_id)] += 1

    subject_seen: dict[int, int] = defaultdict(int)
    for row in rows:
        subject_id = row.get("subject_id")
        if subject_id is None:
            continue
        subject_id = int(subject_id)
        if subject_totals[subject_id] <= 1:
            continue

        row_key = row["key"]
        if omap.get(row_key, {}).get("title"):
            continue

        subject_seen[subject_id] += 1
        if subject_seen[subject_id] == 1:
            continue

        base_title = row["title"]
        row["title"] = f"{base_title} ({subject_seen[subject_id]})"


def _build_extra_preview_rows(
    program: Program,
    intake: Intake,
    defaults: dict[str, Any] | None,
    omap: dict[str, dict],
    *,
    catalog_subject_ids: set[int],
) -> list[dict]:
    from app_course.models import Subject

    defaults = defaults or {}
    extra_courses = defaults.get("extra_courses") or []
    if not extra_courses:
        return []

    subject_ids = {
        int(extra["subject_id"])
        for extra in extra_courses
        if extra.get("subject_id") is not None
    }
    subjects_by_id = {
        subject.id: subject for subject in Subject.objects.filter(id__in=subject_ids)
    }

    rows: list[dict] = []
    for extra in extra_courses:
        key = extra.get("key")
        subject_id = extra.get("subject_id")
        if not key or subject_id is None:
            raise ValueError("Each extra course requires key and subject_id.")
        subject_id = int(subject_id)
        if subject_id not in catalog_subject_ids:
            raise ValueError(
                f"Subject {subject_id} is not in the program exam-paper catalog."
            )
        subject = subjects_by_id.get(subject_id)
        if subject is None:
            raise ValueError(f"No subject with id {subject_id!r}.")

        row_key = str(key)
        ov = omap.get(row_key, {})
        if ov.get("included") is False:
            continue

        default_title = (
            extra.get("title") or f"{program.name} {subject.name} - {intake.name}"
        )
        rows.append(
            {
                "key": row_key,
                "included": True,
                "title": ov.get("title") or default_title,
                "subject_id": subject_id,
                "subject_name": subject.name,
                "is_extra": True,
            }
        )
    return rows


def build_intake_course_preview(
    intake: Intake,
    overrides: list[dict] | None = None,
    *,
    defaults: dict[str, Any] | None = None,
) -> list[dict]:
    program = intake.program
    omap = _override_map(overrides)
    rows: list[dict] = []

    if program.subject_strategy == Program.SubjectStrategy.REQUIRED:
        qs = (
            ProgramSubject.objects.filter(program_id=program.id, is_active=True)
            .select_related("subject")
            .order_by("sort_order", "id")
        )
        catalog_subject_ids = set()
        for ps in qs:
            catalog_subject_ids.add(ps.subject_id)
            key = f"subject:{ps.subject_id}"
            default_title = f"{program.name} {ps.subject.name} - {intake.name}"
            ov = omap.get(key, {})
            if ov.get("included") is False:
                continue
            rows.append(
                {
                    "key": key,
                    "included": True,
                    "title": ov.get("title") or default_title,
                    "subject_id": ps.subject_id,
                    "subject_name": ps.subject.name,
                    "program_subject_id": ps.id,
                }
            )
        rows.extend(
            _build_extra_preview_rows(
                program,
                intake,
                defaults,
                omap,
                catalog_subject_ids=catalog_subject_ids,
            )
        )
        _apply_duplicate_subject_title_numbers(rows, omap)
        return _enrich_preview_rows_with_dates(rows, omap, defaults, intake)

    if program.subject_strategy == Program.SubjectStrategy.MULTI:
        level_section_names_map = _get_level_section_names_map(defaults)
        levels = (
            ProgramLevel.objects.filter(program_id=program.id, is_active=True)
            .prefetch_related("sections")
            .order_by("sort_order", "name")
        )
        for level in levels:
            level_names = level_section_names_map.get(level.id)
            section_specs = _resolve_sections_for_level(level, level_names)
            for spec in section_specs:
                section_name = spec.get("section_name")
                if section_name:
                    default_title = (
                        f"{level.name} Section {section_name} - {intake.name}"
                    )
                else:
                    default_title = f"{level.name} - {intake.name}"
                key = spec["key"]
                ov = omap.get(key, {})
                if ov.get("included") is False:
                    continue
                rows.append(
                    {
                        "key": key,
                        "included": True,
                        "title": ov.get("title") or default_title,
                        "level_id": level.id,
                        "section_id": spec.get("section_id"),
                    }
                )
        return _enrich_preview_rows_with_dates(rows, omap, defaults, intake)

    return rows


def _resolve_category_id(
    level_id: int | None,
    *,
    levels_by_id: dict[int, ProgramLevel],
    fallback_category_id: int | None = None,
) -> int | None:
    if level_id:
        level = levels_by_id.get(level_id)
        if level and level.default_category_id:
            return level.default_category_id
    return fallback_category_id


def _collect_intake_course_fk_ids(
    preview: list[dict],
    omap: dict[str, dict],
    defaults: dict[str, Any],
) -> tuple[set[int], set[int], set[int], set[int], set[int]]:
    level_ids: set[int] = set()
    section_ids: set[int] = set()
    subject_ids: set[int] = set()
    category_ids: set[int] = set()
    payment_plan_ids: set[int] = set()

    default_category_id = defaults.get("category_id")
    if default_category_id:
        category_ids.add(int(default_category_id))

    default_payment_plan_id = defaults.get("payment_plan_id")
    if default_payment_plan_id:
        payment_plan_ids.add(int(default_payment_plan_id))

    for row in preview:
        if row.get("level_id"):
            level_ids.add(int(row["level_id"]))
        if row.get("section_id"):
            section_ids.add(int(row["section_id"]))
        if row.get("subject_id"):
            subject_ids.add(int(row["subject_id"]))

    for row_override in omap.values():
        if row_override.get("category_id"):
            category_ids.add(int(row_override["category_id"]))
        if row_override.get("payment_plan_id"):
            payment_plan_ids.add(int(row_override["payment_plan_id"]))

    return level_ids, section_ids, subject_ids, category_ids, payment_plan_ids


def _prefetch_intake_course_fks(
    preview: list[dict],
    omap: dict[str, dict],
    defaults: dict[str, Any],
) -> dict[str, Any]:
    from app_course.models import Category, Campus, Subject
    from app_finance.models import PaymentPlan

    (
        level_ids,
        section_ids,
        subject_ids,
        category_ids,
        payment_plan_ids,
    ) = _collect_intake_course_fk_ids(preview, omap, defaults)

    levels_by_id = {
        level.id: level for level in ProgramLevel.objects.filter(id__in=level_ids)
    }
    for level in levels_by_id.values():
        if level.default_category_id:
            category_ids.add(level.default_category_id)

    fallback_category = Category.objects.order_by("sort_order", "id").first()
    fallback_category_id = fallback_category.id if fallback_category else None
    if fallback_category_id:
        category_ids.add(fallback_category_id)

    categories_by_id = {
        category.id: category
        for category in Category.objects.filter(id__in=category_ids)
    }

    campus = None
    campus_id = defaults.get("campus_id")
    if campus_id:
        campus = Campus.objects.filter(pk=campus_id).first()

    payment_plans_by_id = {
        plan.id: plan for plan in PaymentPlan.objects.filter(id__in=payment_plan_ids)
    }

    return {
        "levels_by_id": levels_by_id,
        "sections_by_id": {
            section.id: section
            for section in ProgramLevelSection.objects.filter(id__in=section_ids)
        },
        "subjects_by_id": {
            subject.id: subject
            for subject in Subject.objects.filter(id__in=subject_ids)
        },
        "categories_by_id": categories_by_id,
        "fallback_category_id": fallback_category_id,
        "campus": campus,
        "payment_plans_by_id": payment_plans_by_id,
    }


def _category_for_id(cat_id: int, categories_by_id: dict[int, Any]) -> Any:
    category = categories_by_id.get(cat_id)
    if category is not None:
        return category
    from app_course.models import Category

    category = Category.objects.filter(pk=cat_id).first()
    if category is None:
        raise ValueError(f"No category with id {cat_id!r}.")
    categories_by_id[cat_id] = category
    return category


def _compute_intake_course_search_text(
    *,
    subject: Any | None = None,
    level: Any | None = None,
    section: Any | None = None,
    category: Any,
    program: Any,
    campus: Any | None = None,
    intake: Any,
    extra_subject_names: list[str] | None = None,
) -> str:
    """Build search_text from prefetched FK objects (avoids post_save refresh queries)."""
    parts: list[str] = []
    if subject is not None and getattr(subject, "name", None):
        parts.append(subject.name)
    if level is not None and getattr(level, "name", None):
        parts.append(level.name)
    if section is not None and getattr(section, "name", None):
        parts.append(section.name)
    if category is not None and getattr(category, "name", None):
        parts.append(category.name)
    if program is not None and getattr(program, "name", None):
        parts.append(program.name)
    if campus is not None and getattr(campus, "name", None):
        parts.append(campus.name)
    if intake is not None and getattr(intake, "name", None):
        parts.append(intake.name)
    for name in extra_subject_names or []:
        if name:
            parts.append(name)
    return " ".join(parts)


def _payment_plan_for_id(plan_id: int, payment_plans_by_id: dict[int, Any]) -> Any:
    plan = payment_plans_by_id.get(plan_id)
    if plan is not None:
        return plan
    from app_finance.models import PaymentPlan

    plan = PaymentPlan.objects.filter(pk=plan_id).first()
    if plan is None:
        raise ValueError(f"No payment plan with id {plan_id!r}.")
    payment_plans_by_id[plan_id] = plan
    return plan


def generate_intake_courses(
    intake: Intake,
    *,
    overrides: list[dict] | None,
    defaults: dict[str, Any],
    course_serializer_create,
    created_by=None,
) -> list[int]:
    """
    Create courses for an intake. course_serializer_create is CourseSerializer(context=...).create.
    """
    from app_course.models import CourseSubject

    omap = _override_map(overrides)
    preview = build_intake_course_preview(intake, overrides, defaults=defaults)
    if not preview:
        return []

    default_slots = defaults.get("slots")
    if default_slots is not None:
        _validate_slots(default_slots)

    for row_override in omap.values():
        if "slots" in row_override:
            _validate_slots(row_override.get("slots") or [])

    program = intake.program
    level_subject_ids = defaults.get("level_subject_ids") or {}
    if program.subject_strategy == Program.SubjectStrategy.MULTI and defaults.get(
        "subject_ids"
    ):
        raise ValueError(
            "Use defaults.level_subject_ids for multi subject strategy; "
            "subject_ids is deprecated."
        )

    prefetched = _prefetch_intake_course_fks(preview, omap, defaults)
    levels_by_id = prefetched["levels_by_id"]
    sections_by_id = prefetched["sections_by_id"]
    subjects_by_id = prefetched["subjects_by_id"]
    categories_by_id = prefetched["categories_by_id"]
    fallback_category_id = prefetched["fallback_category_id"]
    campus = prefetched["campus"]
    payment_plans_by_id = prefetched["payment_plans_by_id"]

    category_id = defaults.get("category_id") or fallback_category_id
    if category_id is None:
        raise ValueError("No category available for generated courses.")

    created_ids: list[int] = []
    for row in preview:
        row_key = row["key"]
        row_override = omap.get(row_key, {})
        start_date, end_date = _resolve_row_dates(
            row_key, row_override, defaults, intake
        )

        level_id = row.get("level_id")
        cat_id = _resolve_row_category_id(
            row_override,
            defaults,
            level_id,
            category_id,
            levels_by_id=levels_by_id,
        )

        payload: dict[str, Any] = {
            "title": row["title"],
            "program": program,
            "intake": intake,
            "category": _category_for_id(cat_id, categories_by_id),
            "start_date": start_date,
            "end_date": end_date,
            "description": defaults.get("description") or "",
            "is_payment_enabled": defaults.get("is_payment_enabled", True),
        }
        if campus is not None:
            payload["campus"] = campus
        payment_plan_id = _resolve_row_payment_plan_id(row_override, defaults)
        if payment_plan_id is not None:
            payload["payment_plan"] = _payment_plan_for_id(
                payment_plan_id, payment_plans_by_id
            )
        if defaults.get("course_type"):
            payload["course_type"] = defaults["course_type"]
        if defaults.get("exam_session_date"):
            payload["exam_session_date"] = defaults["exam_session_date"]
        if defaults.get("exam_board"):
            payload["exam_board"] = defaults["exam_board"]

        subject_id = row.get("subject_id")
        if subject_id:
            payload["subject"] = subjects_by_id[subject_id]

        if level_id:
            payload["level"] = levels_by_id[level_id]

        section_id = row.get("section_id")
        if section_id:
            payload["section"] = sections_by_id[section_id]

        slots = _resolve_row_slots(row_override, defaults)
        if slots:
            weekdays = sorted({slot["weekday"] for slot in slots}, key=WEEKDAYS.index)
            payload["repeat_every"] = weekdays
            payload["is_recurring"] = True

        if created_by is not None:
            payload["created_by"] = created_by

        multi_subject_ids: list[int] = []
        if program.subject_strategy == Program.SubjectStrategy.MULTI:
            level_key = str(level_id) if level_id else None
            multi_subject_ids = (
                level_subject_ids.get(level_key)
                or level_subject_ids.get(level_id)
                or []
            )

        extra_subject_names = [
            subjects_by_id[int(sid)].name
            for sid in multi_subject_ids
            if int(sid) in subjects_by_id and subjects_by_id[int(sid)].name
        ]
        payload["search_text"] = _compute_intake_course_search_text(
            subject=payload.get("subject"),
            level=payload.get("level"),
            section=payload.get("section"),
            category=payload["category"],
            program=program,
            campus=campus,
            intake=intake,
            extra_subject_names=extra_subject_names,
        )

        course = course_serializer_create(payload)
        created_ids.append(course.id)

        if slots:
            _generate_recurring_events(course, slots)

        if (
            program.subject_strategy == Program.SubjectStrategy.MULTI
            and multi_subject_ids
        ):
            CourseSubject.objects.bulk_create(
                [
                    CourseSubject(
                        course_id=course.id,
                        subject_id=int(sid),
                        sort_order=i,
                    )
                    for i, sid in enumerate(multi_subject_ids)
                ]
            )

    intake.generation_defaults = sanitize_generation_defaults(defaults)
    intake.save(update_fields=["generation_defaults"])

    return created_ids
