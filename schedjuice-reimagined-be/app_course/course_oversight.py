from __future__ import annotations

from django.db.models import Q

from app_auth.models import User
from app_course.models import Course


def get_course_scope_overseers(course: Course) -> list[dict]:
    """Users with program/category scope covering this course (not roster-based)."""
    q = Q()
    if course.program_id:
        q |= Q(scoped_programs=course.program_id)
    if course.category_id:
        q |= Q(scoped_categories=course.category_id)
    if not q:
        return []

    users = (
        User.objects.filter(q)
        .distinct()
        .prefetch_related("scoped_programs", "scoped_categories")
        .order_by("name", "id")
    )

    rows: list[dict] = []
    for user in users:
        reasons: list[dict] = []
        if course.program_id and user.scoped_programs.filter(
            pk=course.program_id
        ).exists():
            prog = user.scoped_programs.filter(pk=course.program_id).first()
            if prog:
                reasons.append({"type": "program", "id": prog.id, "name": prog.name})
        if course.category_id and user.scoped_categories.filter(
            pk=course.category_id
        ).exists():
            cat = user.scoped_categories.filter(pk=course.category_id).first()
            if cat:
                reasons.append({"type": "category", "id": cat.id, "name": cat.name})
        if not reasons:
            continue
        rows.append(
            {
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                },
                "scope_reasons": reasons,
            }
        )
    return rows
