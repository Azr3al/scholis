"""
Binding a Scholis paper to a gradebook column.

The binding is explicit and stored. It is not inferred from a matching title,
because a title can be edited on either side and a mark written into the wrong
column is worse than a mark not written at all.

A constraint worth stating plainly: Scholis's integration surface exposes
provisioning, launches, teacher sign-in, released scores, events and webhooks --
but no "list the papers" endpoint. ``tests:read`` exists as a scope, and no route
here uses it. So a paper cannot be discovered by browsing; it arrives one of two
ways, and both are supported below:

  * a teacher supplies the id, copied from Scholis (``link_paper``);
  * released scores mention it, and the binding is offered from what came back
    (``link_from_score_row``).

That is a deliberate asymmetry in Scholis rather than an oversight -- an
integration credential that can enumerate every paper in a school is a bigger
blast radius than one that can only read results it is already entitled to. If
browsing is ever needed it should be a new scope on their side, not a scrape
here.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from app_scholis.errors import ScholisError
from app_scholis.models import ScholisPaperLink
from app_scholis.provisioning import require_active_connection

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PaperBinding:
    link: ScholisPaperLink
    created: bool


def link_paper(
    *,
    scholis_test_id: str,
    column=None,
    course=None,
    title: str | None = None,
    max_score: Decimal | float | str | None = None,
    sections: list[dict[str, Any]] | None = None,
    linked_by=None,
) -> PaperBinding:
    """
    Bind a paper to a column, creating the binding or updating the existing one.

    Idempotent on ``(connection, scholis_test_id)``: re-linking the same paper to
    a different column moves it, rather than leaving two bindings that would both
    try to write marks.
    """
    connection = require_active_connection()
    test_id = str(scholis_test_id).strip()
    if not test_id:
        raise ScholisError("A Scholis paper id is required.")

    with transaction.atomic():
        link, created = ScholisPaperLink.objects.update_or_create(
            connection=connection,
            scholis_test_id=test_id,
            defaults={
                "column": column,
                "course": course,
                "scholis_test_title": (title or "").strip(),
                "max_score": to_decimal(max_score),
                "sections": sections or [],
                "linked_by": linked_by,
                "is_active": True,
            },
        )

    logger.info(
        "Scholis: %s paper %s -> column %s",
        "linked" if created else "relinked",
        test_id,
        getattr(column, "pk", None),
    )
    return PaperBinding(link=link, created=created)


def link_from_score_row(
    row: dict[str, Any], *, column=None, course=None
) -> PaperBinding | None:
    """
    Bind a paper discovered in a released score row.

    Returns None rather than raising when the row has no test id, because a score
    pull should not abort over one malformed row -- the rest of the class's marks
    are still worth writing.
    """
    test_id = row.get("testId")
    if not test_id:
        return None

    existing = ScholisPaperLink.objects.filter(scholis_test_id=test_id).first()
    if existing is not None:
        # Already bound by a teacher. Refresh the cached title and maximum, which
        # Scholis owns, but leave the column alone: where the marks go is a
        # decision made here, not something a score row should silently move.
        refresh_from_row(existing, row)
        return PaperBinding(link=existing, created=False)

    return link_paper(
        scholis_test_id=str(test_id),
        column=column,
        course=course,
        title=row.get("testTitle"),
        max_score=row.get("maxScore"),
        sections=row.get("sections") or [],
    )


def refresh_from_row(link: ScholisPaperLink, row: dict[str, Any]) -> None:
    changed = False
    title = row.get("testTitle")
    if isinstance(title, str) and title and title != link.scholis_test_title:
        link.scholis_test_title = title
        changed = True

    max_score = to_decimal(row.get("maxScore"))
    if max_score is not None and max_score != link.max_score:
        link.max_score = max_score
        changed = True

    course_ref = row.get("courseRef")
    if link.course_id is None and course_ref:
        resolved = resolve_course(course_ref)
        if resolved is not None:
            link.course = resolved
            changed = True

    if changed:
        link.save()


def resolve_course(course_ref: Any):
    """
    Turn Scholis's echoed ``courseRef`` back into a Course.

    The reference is this system's own course id, sent when the paper was created
    at Scholis, so it round-trips. Anything that is not an integer primary key is
    ignored rather than guessed at: a stale or foreign reference must not bind
    marks to the wrong course.
    """
    try:
        pk = int(str(course_ref).strip())
    except (TypeError, ValueError):
        return None
    from app_course.models import Course

    return Course.objects.filter(pk=pk).first()


def to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, ValueError, TypeError):
        return None


__all__ = [
    "PaperBinding",
    "link_from_score_row",
    "link_paper",
    "refresh_from_row",
    "resolve_course",
    "to_decimal",
]
