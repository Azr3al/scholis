"""
Verification of inbound Scholis webhook deliveries.

Scholis signs ``"<timestamp>.<body>"`` with HMAC-SHA256 and sends the hex digest
as ``x-scholis-signature: v1=<hex>`` alongside ``x-scholis-timestamp`` in
milliseconds. This must agree with ``apps/api/server/webhook-signature.ts`` in
the Scholis repository byte for byte -- including signing the raw body rather
than a re-serialised one, because re-serialising changes whitespace and key
order and every legitimate delivery would then fail.

The timestamp is inside the signed material, not merely beside it. Verifying it
is what stops a captured delivery being replayed forever: the signature cannot
be moved to a fresh timestamp without the secret.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time

logger = logging.getLogger(__name__)

SIGNATURE_HEADER = "HTTP_X_SCHOLIS_SIGNATURE"
TIMESTAMP_HEADER = "HTTP_X_SCHOLIS_TIMESTAMP"

SCHEME = "v1"

# Five minutes. Generous enough to absorb a slow queue on their side and clock
# skew on ours, short enough that a captured delivery is not usable for long.
MAX_AGE_SECONDS = 300


def sign(secret: str, timestamp: str, body: str) -> str:
    """Reproduce Scholis's signature. Used by tests and to self-check a secret."""
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{SCHEME}={digest}"


class SignatureRejected(ValueError):
    """Carries the reason, which is logged but never returned to the caller."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def verify(
    secret: str,
    *,
    timestamp_header: str | None,
    signature_header: str | None,
    body: bytes,
    now_ms: int | None = None,
) -> None:
    """
    Raise ``SignatureRejected`` unless the delivery is authentic and fresh.

    ``body`` must be the exact bytes received. Decoding and re-encoding JSON here
    would be a subtle, total failure: the digest would never match.
    """
    if not secret:
        raise SignatureRejected("no signing secret recorded for this connection")
    if not timestamp_header or not signature_header:
        raise SignatureRejected("missing signature or timestamp header")

    try:
        timestamp_ms = int(timestamp_header)
    except (TypeError, ValueError):
        raise SignatureRejected("timestamp is not an integer") from None

    current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    age_seconds = abs(current_ms - timestamp_ms) / 1000
    if age_seconds > MAX_AGE_SECONDS:
        raise SignatureRejected(f"timestamp is {int(age_seconds)}s old")

    scheme, _, presented = signature_header.partition("=")
    if scheme != SCHEME or not presented:
        raise SignatureRejected(f"unsupported signature scheme {scheme!r}")

    expected = sign(secret, timestamp_header, body.decode("utf-8"))
    # compare_digest is constant time. A plain == would leak the digest one
    # character at a time to anybody able to measure our response times.
    if not hmac.compare_digest(expected, signature_header):
        raise SignatureRejected("signature does not match")
