"""
Errors raised by the Scholis client and services.

Callers branch on these rather than on HTTP status codes or message text, so a
change in Scholis's wording cannot silently turn a handled 404 into a 500.
"""
from __future__ import annotations


class ScholisError(Exception):
    """Base class. Carries a message safe to show a teacher."""

    def __init__(
        self, message: str, *, status: int | None = None, code: str | None = None
    ):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class ScholisNotConfiguredError(ScholisError):
    """Missing deployment configuration."""


class ScholisUnauthorizedError(ScholisError):
    """401/403: the key is wrong, revoked, or lacks the scope for this call."""


class ScholisNotFoundError(ScholisError):
    """404: the paper, teacher or organisation does not exist on their side."""


class ScholisConflictError(ScholisError):
    """409/422: the request is well formed but cannot be satisfied right now."""


class ScholisUnavailableError(ScholisError):
    """Network failure, timeout, or 5xx. Retrying may succeed."""


class ScholisResponseError(ScholisError):
    """Anything else that came back from Scholis."""
