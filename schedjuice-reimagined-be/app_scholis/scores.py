"""
Pulling released marks from Scholis into the gradebook.

Two stages, and separating them is the point.

``store_score_rows`` writes what Scholis reported into ``ScholisScore``, exactly
as reported: decimal scores, decimal maximums, the per-section breakdown. That is
the authoritative copy and it is never lossy.

``sync_to_gradebook`` projects those rows into ``ResultCell.marks``, which is a
``PositiveIntegerField``. A rubric tier can be worth 2.5 and that column cannot
hold it, so the projection rounds half-up and records both what it wrote and when.
Nothing is discarded: the exact value stays in ``ScholisScore``, so the rounding
policy can change and every cell can be recomputed without asking Scholis again.

Letter grades and percentages are never computed here. Scholis returns raw marks
and refuses to guess a school's bands, and ``app_grading_reports.GradingScale`` is
already the authority on them -- a second opinion in an integration layer would be
the one that silently disagrees.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import transaction

from app_scholis.errors import ScholisError
from app_scholis.models import ScholisPaperLink, ScholisScore
from app_scholis.times import parse_when
from app_scholis.papers import link_from_score_row, resolve_course, to_decimal
from app_scholis.provisioning import org_client, require_active_connection

logger = logging.getLogger(__name__)


@dataclass
class SyncReport:
    """What a pull did, in counts. Every skip is accounted for, not dropped."""

    fetched: int = 0
    stored: int = 0
    written_to_gradebook: int = 0
    # A score row for a paper nobody has bound to a column yet. The marks are
    # kept; they simply have nowhere to go until a teacher links the paper.
    unlinked_papers: int = 0
    # A walk-in attempt: Scholis has marks but no student reference of ours, so
    # there is no row to attribute them to.
    without_student: int = 0
    column_written: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def pull_scores(
    *, course_ref: str | None = None, since: str | None = None, sync: bool = True
) -> SyncReport:
    """
    Fetch released scores, store them, and optionally project them into the
    gradebook.

    ``since`` is an ISO timestamp filtered on release time, so a periodic pull can
    ask only for what changed. Omitting it re-reads everything, which is safe --
    scores upsert on ``attempt_id`` -- and is the right thing to do after a gap
    whose length is unknown.
    """
    report = SyncReport()
    connection = require_active_connection()
    client = org_client(connection)

    rows = client.list_scores(course_ref=course_ref, released_from=since)
    report.fetched = len(rows)
    if not rows:
        return report

    store_score_rows(rows, report=report)
    if sync:
        sync_to_gradebook(report=report)
    return report


def store_score_rows(
    rows: list[dict[str, Any]], *, report: SyncReport | None = None
) -> int:
    """
    Upsert one ``ScholisScore`` per released attempt.

    Keyed on ``attempt_id``, which Scholis guarantees unique, so a re-release
    updates the row rather than duplicating it. That matters because releasing is
    something a teacher does more than once: marks get amended, and an amended
    mark must replace the old one everywhere.
    """
    own_report = report if report is not None else SyncReport()
    stored = 0

    for row in rows:
        attempt_id = row.get("attemptId")
        test_id = row.get("testId")
        if not attempt_id or not test_id:
            own_report.errors.append(
                "a score row arrived without an attempt or test id"
            )
            continue

        link = _ensure_link(row, report=own_report)
        if link is None:
            continue

        # A row whose studentRef is absent or resolves to nobody is stored
        # anyway, with no student: the mark exists and dropping it would hide a
        # result. It is deliberately not counted here. sync_to_gradebook counts
        # it, once, when the mark actually fails to reach a cell -- counting it
        # at both stages reported one walk-in attempt as two, and a skip count
        # larger than the number of rows stored makes the whole report
        # untrustworthy. The skips are meant to partition the stored rows:
        # written + unlinked_papers + without_student == stored.
        student = _resolve_student(row.get("studentRef"))

        try:
            with transaction.atomic():
                _upsert_score(row, link=link, student=student)
            stored += 1
        except Exception as e:  # noqa: BLE001 - one bad row must not lose the class
            logger.warning(
                "Scholis: could not store score for attempt %s: %s", attempt_id, e
            )
            own_report.errors.append(f"attempt {attempt_id}: {e}")

    own_report.stored += stored
    return stored


def _ensure_link(row: dict[str, Any], *, report: SyncReport) -> ScholisPaperLink | None:
    """
    Find or create the paper binding for a score row.

    A row for an unbound paper still creates the binding -- with no column -- so
    the marks are stored and a teacher can see the paper is waiting to be placed.
    Dropping the row instead would lose marks that already exist.
    """
    test_id = str(row.get("testId"))
    existing = ScholisPaperLink.objects.filter(scholis_test_id=test_id).first()
    if existing is not None:
        return existing

    course = resolve_course(row.get("courseRef"))
    binding = link_from_score_row(row, course=course)
    if binding is None:
        # No test id: nothing to bind to, and the row is dropped. That is an
        # error worth surfacing, not an "unlinked paper" -- the two look the same
        # in a report and mean opposite things.
        report.errors.append(
            f"score row for attempt {row.get('attemptId')} arrived without a test id"
        )
        return None
    # A binding with no column is counted once, by sync_to_gradebook, when the
    # marks actually fail to reach the gradebook. Counting it here as well made
    # the report claim two skips for one row, and a skip count larger than the
    # number of rows fetched makes the whole report untrustworthy.
    return binding.link


def _resolve_student(student_ref: Any):
    """
    Turn Scholis's echoed ``studentRef`` back into a User.

    The reference is this system's own student id, sent at launch, so it
    round-trips exactly. A reference that does not resolve yields None rather than
    a guess: attributing a mark to the wrong student is the one mistake here that
    cannot be undone by re-running.
    """
    if not student_ref:
        return None
    try:
        pk = int(str(student_ref).strip())
    except (TypeError, ValueError):
        return None
    from app_auth.models import User

    return User.objects.filter(pk=pk).first()


def _upsert_score(
    row: dict[str, Any], *, link: ScholisPaperLink, student
) -> ScholisScore:
    score = to_decimal(row.get("score"))
    max_score = to_decimal(row.get("maxScore"))
    if score is None or max_score is None:
        raise ScholisError("score row is missing a score or a maximum")

    values = {
        # The binding is what makes this row findable later -- without it the
        # insert fails outright, and a score with no paper is meaningless.
        "link": link,
        "student": student,
        "student_ref": str(row.get("studentRef") or ""),
        "taker_name": str(row.get("takerName") or ""),
        "score": score,
        "max_score": max_score,
        "sections": row.get("sections") or [],
        "submitted_at": parse_when(row.get("submittedAt")),
        "released_at": parse_when(row.get("releasedAt")),
        # A re-release changes the mark, so the projection has to be redone.
        "synced_at": None,
        "synced_marks": None,
    }
    obj, _created = ScholisScore.objects.update_or_create(
        attempt_id=str(row["attemptId"]), defaults=values
    )
    return obj


def sync_to_gradebook(*, report: SyncReport | None = None) -> int:
    """
    Write stored scores into ``ResultCell``, rounding to the column's integer.

    Only rows that have not been projected since they were last stored are
    touched, so a re-run after a partial failure finishes the job without
    rewriting the whole gradebook.
    """
    own_report = report if report is not None else SyncReport()
    pending = (
        ScholisScore.objects.filter(synced_at__isnull=True)
        .select_related("link", "link__column", "student")
        .order_by("id")
    )

    written = 0
    now = datetime.now(timezone.utc)

    for score in pending:
        link = score.link
        # No student is checked before no column, and the order matters. A row
        # missing both is counted once, as missing a student, because placing the
        # paper would not make it writable -- reporting "no column" there would
        # send a teacher to fix something that was never the obstacle.
        if score.student_id is None:
            own_report.without_student += 1
            continue
        if link is None or link.column_id is None or not link.is_active:
            # Nowhere to put it. Counted rather than silently skipped, because
            # "the marks are here but not in the gradebook" is a thing a teacher
            # needs to be able to see.
            own_report.unlinked_papers += 1
            continue

        marks = score.rounded_marks
        try:
            with transaction.atomic():
                _write_cell(link=link, student=score.student, marks=marks)
                score.synced_at = now
                score.synced_marks = marks
                score.save(update_fields=["synced_at", "synced_marks", "updated_at"])
            written += 1
            own_report.column_written += 1
        except Exception as e:  # noqa: BLE001 - keep going for the rest of the class
            logger.warning(
                "Scholis: could not write gradebook cell for attempt %s: %s",
                score.attempt_id,
                e,
            )
            own_report.errors.append(f"attempt {score.attempt_id}: {e}")

    own_report.written_to_gradebook += written
    return written


def _write_cell(*, link: ScholisPaperLink, student, marks: int) -> None:
    """
    One student's mark in one column.

    ``ResultCell`` is unique on ``(column, student)``, so this upserts: re-releasing
    a paper amends the mark rather than adding a second row that the grid would
    have to choose between.
    """
    from app_grading_reports.models import ResultCell

    ResultCell.objects.update_or_create(
        column=link.column, student=student, defaults={"marks": marks}
    )

    # Fill the column's maximum from Scholis, but only when it is empty. A
    # teacher may have set it deliberately, and an integration overwriting a
    # human's input is the kind of surprise that costs more than it saves.
    column = link.column
    if column is not None and column.max_marks is None and link.max_score is not None:
        column.max_marks = int(
            link.max_score.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
        column.save(update_fields=["max_marks", "updated_at"])


__all__ = ["SyncReport", "pull_scores", "store_score_rows", "sync_to_gradebook"]
