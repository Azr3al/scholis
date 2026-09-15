"""
Signing a teacher into Scholis from here.

A teacher who is already signed into Schedjuice should not have to prove it again
to Scholis. This mints the single-use link that does it; the browser follows the
link and Scholis exchanges it for its own session cookie.

Two things this deliberately does not do.

It cannot create an account. Scholis refuses a teacher it has never heard of, and
that refusal is correct: sign-in authenticates, it never provisions. A teacher
with no Scholis user has to be invited through Scholis's own path first, so the
error here says that rather than pretending the link is broken.

It does not keep an audit row of its own. Scholis already records who minted the
ticket (``minted_by_client_id``), the caller's own staff id (``externalRef``, sent
below), and when it was redeemed -- which is a better audit than a copy here,
because it includes the redemption this side never sees. Duplicating it would mean
two records that can disagree.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from app_scholis.errors import ScholisError, ScholisNotFoundError
from app_scholis.times import parse_when
from app_scholis.provisioning import org_client, require_active_connection

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TeacherLink:
    url: str
    expires_at: datetime | None
    email: str


class TeacherNotAtScholis(ScholisError):
    """The address is fine; Scholis has no such teacher, so there is nobody to sign in."""


def mint_teacher_link(*, teacher=None, email: str | None = None) -> TeacherLink:
    """
    Mint a sign-in link for one teacher.

    ``teacher`` is preferred over a bare address: it supplies both the email and
    the ``externalRef`` that Scholis records against the ticket, which is what
    lets their side answer "who did Schedjuice think this was?"
    """
    address = _resolve_email(teacher, email)
    connection = require_active_connection()
    client = org_client(connection)

    external_ref = str(teacher.pk) if teacher is not None and teacher.pk else None

    try:
        result = client.mint_teacher_sso(email=address, external_ref=external_ref)
    except ScholisNotFoundError as e:
        # Scholis answers 404 both for "no such teacher" and for "a teacher at
        # another school", on purpose -- telling them apart would let a caller
        # enumerate which addresses hold accounts elsewhere. So this message must
        # not claim to know which it was.
        raise TeacherNotAtScholis(
            "Scholis has no teacher at that address. They need to be invited at "
            "Scholis before they can be signed in from here."
        ) from e

    url = result.get("url")
    if not isinstance(url, str) or not url:
        raise ScholisError("Scholis did not return a sign-in URL.")

    logger.info("Scholis: minted teacher sign-in link for %s", address)
    return TeacherLink(
        url=url, expires_at=parse_when(result.get("expiresAt")), email=address
    )


def _resolve_email(teacher, email: str | None) -> str:
    address = (getattr(teacher, "email", "") or email or "").strip()
    if not address:
        raise ScholisError("A teacher email is required to mint a sign-in link.")
    # Trimmed here rather than left to Scholis. Scholis lower-cases before
    # matching, so case does not matter, but its schema rejects surrounding
    # whitespace outright with a 400 -- which reads like a broken integration to
    # somebody whose address came out of a spreadsheet with a trailing space.
    return address


__all__ = ["TeacherLink", "TeacherNotAtScholis", "mint_teacher_link"]
