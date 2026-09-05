"""Count courses linked to a Subject catalog entry."""
from __future__ import annotations

from typing import Any

from django.db.models import Q

from app_ai.links import get_current_org
from app_ai.org_datetime import org_today
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.rbac import require_course_read_breadth
from app_auth.models import User
from app_course.course_status import apply_effective_status_filter
from app_course.models import Course, Subject

COURSE_STATUS_ENUM = ["active", "planned", "ended", "paused", "all"]

COUNT_COURSES_BY_SUBJECT_SCHEMA = strict_object_schema(
    properties={
        "subject": {
            "type": "string",
            "description": "Exact subject name from the school Subject catalog.",
        },
        "course_status": {
            "type": "string",
            "enum": COURSE_STATUS_ENUM,
            "description": "Filter courses by status. Default active.",
        },
    },
    required=["subject"],
)


def run_count_courses_by_subject(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_course_read_breadth(user)
    if denied:
        return denied

    name = (args.get("subject") or "").strip()
    subject = Subject.objects.filter(name__iexact=name).first()
    if subject is None:
        sample = list(
            Subject.objects.order_by("name").values_list("name", flat=True)[:20]
        )
        return {
            "error": "unknown_subject",
            "message": f"No subject named {name!r}.",
            "sample_subjects": sample,
        }

    status = args.get("course_status") or "active"
    qs = Course.objects.filter(
        Q(subject_id=subject.id) | Q(course_subjects__subject_id=subject.id)
    ).distinct()
    if status != "all":
        org = get_current_org()
        reference = org_today(org) if org is not None else None
        qs = apply_effective_status_filter(qs, [status], reference=reference)

    return {
        "subject": subject.name,
        "count": qs.count(),
        "course_status": status,
    }


COUNT_COURSES_BY_SUBJECT_TOOL = Tool(
    name="count_courses_by_subject",
    description=(
        "Count courses linked to a subject from the school Subject catalog "
        "(matches Course.subject or CourseSubject rows)."
    ),
    parameters=COUNT_COURSES_BY_SUBJECT_SCHEMA,
    run=run_count_courses_by_subject,
    exposure="read",
)
