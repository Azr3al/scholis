"""
Sending a student into a Scholis paper.

The ticket Scholis returns is a bearer credential: anybody holding the URL is
admitted, as that student, to that exam, for fifteen minutes. So it is handed
straight back to the caller and never written to the database -- ``ScholisLaunch``
records that a link was issued, for whom, and when it expired, which is what an
audit needs. Storing the URL would turn every reader of this table into somebody
who can sit an exam as somebody else.

``taker_ref`` is this system's student id and is the load-bearing part. Scholis
seals it into the ticket and echoes it back on the released score, which is what
makes a mark routable to a gradebook row without trusting anything a student
typed. The name is display-only.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from django.db import transaction

from app_scholis.client import ScholisClient
from app_scholis.errors import ScholisError
from app_scholis.models import ScholisLaunch, ScholisPaperLink
from app_scholis.provisioning import org_client, require_active_connection
from app_scholis.times import parse_when

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StudentTicket:
    url: str
    expires_at: datetime | None
    taker_ref: str
    taker_name: str
    scholis_test_id: str


def mint_student_ticket(
    *,
    student,
    scholis_test_id: str | None = None,
    paper_link: ScholisPaperLink | None = None,
    created_by=None,
) -> StudentTicket:
    """
    Mint a one-time link admitting ``student`` to a paper.

    Either ``paper_link`` or ``scholis_test_id`` identifies the paper. Passing a
    link is preferred: it is the binding a teacher made deliberately, and it lets
    the launch be attributed to that binding in the audit row.
    """
    if student is None:
        raise ScholisError("A student is required to mint a launch ticket.")

    test_id = _resolve_test_id(scholis_test_id, paper_link)
    connection = require_active_connection()

    taker_ref = str(student.pk)
    taker_name = (getattr(student, "name", "") or "").strip() or getattr(
        student, "email", ""
    )
    if not taker_name:
        raise ScholisError("That student has no name to show on the paper.")

    client: ScholisClient = org_client(connection)
    result = client.launch_attempt(
        test_id=test_id, taker_ref=taker_ref, taker_name=taker_name
    )

    url = result.get("url")
    if not isinstance(url, str) or not url:
        raise ScholisError("Scholis did not return a launch URL.")

    expires_at = parse_when(result.get("expiresAt"))

    with transaction.atomic():
        ScholisLaunch.objects.create(
            connection=connection,
            link=paper_link,
            student=student,
            scholis_test_id=test_id,
            taker_ref=taker_ref,
            taker_name=taker_name,
            expires_at=expires_at,
            created_by=created_by,
        )

    logger.info(
        "Scholis: minted launch for student %s into test %s", taker_ref, test_id
    )
    return StudentTicket(
        url=url,
        expires_at=expires_at,
        taker_ref=taker_ref,
        taker_name=taker_name,
        scholis_test_id=test_id,
    )


def _resolve_test_id(
    scholis_test_id: str | None, paper_link: ScholisPaperLink | None
) -> str:
    if paper_link is not None:
        return str(paper_link.scholis_test_id)
    if scholis_test_id:
        return str(scholis_test_id).strip()
    raise ScholisError("A paper is required: pass a paper link or a Scholis test id.")


__all__ = ["StudentTicket", "mint_student_ticket"]
