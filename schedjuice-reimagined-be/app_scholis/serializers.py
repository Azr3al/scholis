"""
Request parsing and response shaping for the Scholis endpoints.

Deliberately plain functions rather than ``ModelSerializer`` classes. The one
model that would be natural to serialise directly is ``ScholisConnection``, and
doing that would put an encrypted API secret and an encrypted webhook signing
secret into an HTTP response -- DRF serialises every field unless told otherwise,
and "unless told otherwise" is a rule somebody forgets once. Building the
response by hand makes omission the default and inclusion the deliberate act.
"""
from __future__ import annotations

import logging
from typing import Any

from app_scholis.models import ScholisConnection, ScholisPaperLink, ScholisScore

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# responses
# ---------------------------------------------------------------------------


def connection_status(connection: ScholisConnection) -> dict[str, Any]:
    """
    What an administrator needs to see about the connection, and nothing secret.

    ``api_key_id`` is included because it identifies the key in Scholis's
    dashboard and in their audit log. The secret half is not, and neither is the
    ciphertext: a support screen that shows an encrypted blob invites somebody to
    paste it into a ticket.
    """
    return {
        "connected": connection.has_credentials,
        "external_ref": connection.external_ref,
        "school_name": connection.school_name,
        "scholis_org_id": str(connection.scholis_org_id)
        if connection.scholis_org_id
        else None,
        "api_key_id": connection.api_key_id,
        "webhook_registered": connection.webhook_endpoint_id is not None,
        "webhook_endpoint_id": (
            str(connection.webhook_endpoint_id)
            if connection.webhook_endpoint_id
            else None
        ),
        "webhook_url": _webhook_url(connection),
        "last_event_seq": connection.last_event_seq,
        "connected_at": connection.connected_at.isoformat()
        if connection.connected_at
        else None,
    }


def _webhook_url(connection: ScholisConnection) -> str | None:
    """
    The registered delivery URL, or None if it cannot be built.

    Safe to show: the URL routes a delivery but does not authenticate it. The
    signing secret does that, and it is not here.
    """
    if connection.webhook_endpoint_id is None:
        return None
    try:
        from app_scholis.provisioning import webhook_url

        return webhook_url(connection)
    except Exception as e:  # noqa: BLE001 - a display value must not break the response
        logger.debug("Scholis: could not build webhook URL for display: %s", e)
        return None


def paper_link(link: ScholisPaperLink) -> dict[str, Any]:
    return {
        "id": link.pk,
        "scholis_test_id": str(link.scholis_test_id),
        "scholis_test_title": link.scholis_test_title,
        "max_score": str(link.max_score) if link.max_score is not None else None,
        "sections": link.sections,
        "is_active": link.is_active,
        "column": _column(link.column),
        "course_id": link.course_id,
        "score_count": link.scores.count(),
    }


def _column(column) -> dict[str, Any] | None:
    if column is None:
        return None
    return {
        "id": column.pk,
        "title": column.title,
        "max_marks": column.max_marks,
        "sheet_id": column.sheet_id,
    }


def score(row: ScholisScore) -> dict[str, Any]:
    """
    One stored result. Decimal values go out as strings.

    A JSON number would round-trip through JavaScript as a double, and 12.5
    survives that while 12.55 does not necessarily. Marks are the one place where
    a display artefact and a real value must not be distinguishable only by luck.
    """
    return {
        "attempt_id": str(row.attempt_id),
        "student_id": row.student_id,
        "student_ref": row.student_ref,
        "taker_name": row.taker_name,
        "score": str(row.score),
        "max_score": str(row.max_score),
        "sections": row.sections,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "released_at": row.released_at.isoformat() if row.released_at else None,
        "synced_at": row.synced_at.isoformat() if row.synced_at else None,
        "synced_marks": row.synced_marks,
        # Surfaced so a teacher can see that the gradebook holds a rounded copy
        # and what it was rounded from. Hidden rounding is what turns into a
        # disputed report card.
        "rounded_marks": row.rounded_marks,
        "scholis_test_id": str(row.link.scholis_test_id) if row.link_id else None,
        "column_id": row.link.column_id if row.link_id else None,
    }


def sync_report(report) -> dict[str, Any]:
    return {
        "fetched": report.fetched,
        "stored": report.stored,
        "written_to_gradebook": report.written_to_gradebook,
        # Papers whose marks are stored but have no column to land in yet, and
        # attempts with no student of ours to attribute them to. Both are counts a
        # teacher needs: they are the difference between "nothing was released"
        # and "it was released and is waiting to be placed".
        "unlinked_papers": report.unlinked_papers,
        "without_student": report.without_student,
        "errors": report.errors,
        "ok": report.ok,
    }


# ---------------------------------------------------------------------------
# requests
# ---------------------------------------------------------------------------


def parse_paper_link_request(data: Any) -> dict[str, Any] | None:
    """
    Validate a paper-link request, or return None if it cannot be satisfied.

    A ``column_id`` that does not exist is a failure rather than a silent unlinked
    binding: the caller asked for marks to land somewhere specific, and quietly
    landing them nowhere is the outcome that gets noticed a term later.
    """
    if not isinstance(data, dict):
        return None

    test_id = str(data.get("scholis_test_id") or "").strip()
    if not test_id:
        return None

    column = None
    column_id = data.get("column_id")
    if column_id not in (None, ""):
        from app_grading_reports.models import ResultColumn

        column = ResultColumn.objects.filter(pk=column_id).first()
        if column is None:
            return None

    course = None
    course_id = data.get("course_id")
    if course_id not in (None, ""):
        from app_course.models import Course

        course = Course.objects.filter(pk=course_id).first()

    title = str(data.get("title") or "").strip()

    return {
        "scholis_test_id": test_id,
        "column": column,
        "course": course,
        "title": title or None,
    }


def resolve_student(student_id: Any):
    """A student User, or None. Never creates one."""
    return _resolve_user(student_id, require_student=True)


def resolve_teacher(teacher_id: Any, email: Any = None):
    """
    A teacher User by id, falling back to an exact email match.

    The email fallback exists because a teacher may not yet have an id in this
    system's UI state when somebody pastes an address into a field. It matches
    exactly and case-insensitively, and it never creates: Scholis refuses a
    teacher it does not know, and so does this.
    """
    user = _resolve_user(teacher_id, require_student=False)
    if user is not None:
        return user

    address = str(email or "").strip()
    if not address:
        return None
    from app_auth.models import User

    return User.objects.filter(email__iexact=address).first()


def _resolve_user(user_id: Any, *, require_student: bool):
    if user_id in (None, ""):
        return None
    from app_auth.models import User

    try:
        pk = int(str(user_id).strip())
    except (TypeError, ValueError):
        return None

    user = User.objects.filter(pk=pk).first()
    if user is None:
        return None
    if require_student and not _is_student(user):
        return None
    return user


def _is_student(user) -> bool:
    """
    Whether a user is a student.

    Checked rather than assumed, because ``taker_ref`` becomes the identity a mark
    is attributed to. Launching a teacher into a paper as a taker would produce a
    score row that maps back to a staff account, and the gradebook would write
    into a column for somebody who was never in the class.
    """
    roles = getattr(user, "roles", None) or []
    role = (getattr(user, "role", "") or "").lower()
    if "student" in role:
        return True
    return any("student" in str(r).lower() for r in roles)


__all__ = [
    "connection_status",
    "paper_link",
    "parse_paper_link_request",
    "resolve_student",
    "resolve_teacher",
    "score",
    "sync_report",
]
