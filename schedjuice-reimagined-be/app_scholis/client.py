"""
HTTP client for Scholis's integration API.

Every outbound call in this app goes through here, for three reasons: the bearer
credential is assembled in exactly one place, an error response is translated
into a typed exception in exactly one place, and a caller that needs to know what
Scholis can do reads one file rather than six.

Scholis speaks two tiers of credential. A ``platform`` key provisions schools and
can read nothing; an ``org`` key acts inside one school. Both are just bearer
tokens of the form ``sch_live_<keyId>.<secret>``, so this client does not care
which it is holding -- the scope check happens on their side and comes back as a
403, which becomes ``ScholisUnauthorizedError``.

There is deliberately no automatic retry. ``provision_org`` is idempotent on
``externalRef`` and ``launch_attempt`` is not (each call mints a fresh ticket), so
a blanket retry policy would be wrong for at least one of them. Callers that can
safely retry do so through Celery, where the attempt is recorded.
"""
from __future__ import annotations

import logging
from typing import Any

import requests

from app_scholis.conf import ScholisNotConfigured, get_settings
from app_scholis.errors import (
    ScholisConflictError,
    ScholisError,
    ScholisNotConfiguredError,
    ScholisNotFoundError,
    ScholisResponseError,
    ScholisUnauthorizedError,
    ScholisUnavailableError,
)

logger = logging.getLogger(__name__)

# Scholis mounts the integration surface under /api.
_PREFIX = "/api/integration"


class ScholisClient:
    """One caller's view of Scholis, bound to a single credential."""

    def __init__(
        self,
        *,
        token: str,
        base_url: str | None = None,
        timeout: float | None = None,
    ):
        if not token:
            raise ScholisNotConfiguredError("A Scholis API token is required.")
        configured = get_settings()
        self.token = token
        self.base_url = (base_url or configured.api_base).rstrip("/")
        self.timeout = timeout if timeout is not None else configured.request_timeout

    # -- transport ---------------------------------------------------------

    @classmethod
    def for_platform(cls) -> "ScholisClient":
        """
        The deployment-wide provisioning credential.

        It can create organisations and mint their keys, and it cannot read a
        paper or a mark. That is the whole point of it being deployment-wide
        configuration rather than a row in a tenant schema.
        """
        try:
            configured = get_settings()
        except ScholisNotConfigured as e:
            raise ScholisNotConfiguredError(str(e)) from e
        return cls(token=configured.platform_key, base_url=configured.api_base)

    def _url(self, path: str) -> str:
        return f"{self.base_url}{_PREFIX}{path}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        url = self._url(path)
        try:
            response = requests.request(
                method,
                url,
                headers=self._headers(),
                json=payload,
                params=params,
                timeout=self.timeout,
            )
        except requests.Timeout as e:
            # Logged without the token. A URL is safe to log; a header is not.
            logger.warning(
                "Scholis %s %s timed out after %ss", method, url, self.timeout
            )
            raise ScholisUnavailableError(f"Scholis did not respond ({e}).") from e
        except requests.RequestException as e:
            logger.warning("Scholis %s %s failed: %s", method, url, e)
            raise ScholisUnavailableError(f"Could not reach Scholis ({e}).") from e

        return self._unwrap(method, url, response)

    def _unwrap(self, method: str, url: str, response: requests.Response) -> Any:
        status = response.status_code
        body = _parse_json(response)

        if 200 <= status < 300:
            return body

        message, code = _error_detail(body, status)
        # The message is Scholis's own and is written to be shown to a person
        # ("That paper has closed."), so it is passed through rather than
        # replaced with a generic string.
        logger.info(
            "Scholis %s %s -> %s %s: %s", method, url, status, code or "-", message
        )

        if status in (401, 403):
            raise ScholisUnauthorizedError(message, status=status, code=code)
        if status == 404:
            raise ScholisNotFoundError(message, status=status, code=code)
        if status in (409, 422):
            raise ScholisConflictError(message, status=status, code=code)
        if status == 400:
            # Our bug, not theirs: a malformed request means this client and
            # Scholis disagree about the contract. Raised as a conflict so a
            # caller does not retry it.
            raise ScholisConflictError(message, status=status, code=code)
        if status >= 500:
            raise ScholisUnavailableError(message, status=status, code=code)
        raise ScholisResponseError(message, status=status, code=code)

    # -- platform tier -----------------------------------------------------

    def provision_org(self, *, external_ref: str, name: str) -> dict[str, Any]:
        """
        POST /orgs. Idempotent on ``external_ref``.

        The org key comes back only on the call that created the organisation. A
        retry returns ``key: null`` -- Scholis will not quietly mint a second
        live credential, so losing the first one is a human rotation, not
        something this client can paper over.
        """
        return self._request(
            "POST", "/orgs", payload={"externalRef": external_ref, "name": name}
        )

    # -- org tier ----------------------------------------------------------

    def launch_attempt(
        self, *, test_id: str, taker_ref: str, taker_name: str
    ) -> dict[str, Any]:
        """
        POST /launch. Mint a one-time link admitting one named student.

        ``taker_ref`` is this system's student id and is the only thing that
        makes the resulting mark routable back to a gradebook row. The name is
        display-only. Scholis seals both into the ticket, so a student cannot
        edit either in the address bar.
        """
        return self._request(
            "POST",
            "/launch",
            payload={"testId": test_id, "takerRef": taker_ref, "takerName": taker_name},
        )

    def mint_teacher_sso(
        self, *, email: str, external_ref: str | None = None
    ) -> dict[str, Any]:
        """
        POST /teacher-sso. Mint a sign-in link for a teacher who already has an
        account at Scholis.

        It cannot create one. A teacher with no Scholis user comes back as a 404
        and has to be invited through Scholis's own path first -- sign-in
        authenticates, it never provisions.

        Send a clean address: Scholis lower-cases before matching, but its schema
        rejects surrounding whitespace outright, so an address imported from a
        spreadsheet must be trimmed here.
        """
        payload: dict[str, Any] = {"email": email.strip()}
        if external_ref:
            payload["externalRef"] = external_ref
        return self._request("POST", "/teacher-sso", payload=payload)

    def list_scores(
        self,
        *,
        course_ref: str | None = None,
        released_from: str | None = None,
        released_to: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        GET /scores. Released marks only, flattened for a gradebook.

        Raw scores and maximums, with a per-section breakdown. No letter grades
        and no percentages: Scholis does not know a school's grade boundaries and
        refuses to guess them, which is why ``app_grading_reports.GradingScale``
        stays the authority on that side of the boundary.
        """
        params: dict[str, Any] = {}
        if course_ref:
            params["courseRef"] = course_ref
        if released_from:
            params["from"] = released_from
        if released_to:
            params["to"] = released_to
        result = self._request("GET", "/scores", params=params or None)
        return result if isinstance(result, list) else []

    def list_events(
        self, *, since: str | None = None, limit: int | None = None
    ) -> dict[str, Any]:
        """
        GET /events. Catch-up for deliveries that never arrived.

        ``since`` is exclusive: send the highest sequence number already
        processed. Scholis returns ``seq`` as a string because a JSON number
        cannot hold a 64-bit sequence faithfully.
        """
        params: dict[str, Any] = {}
        if since is not None:
            params["since"] = str(since)
        if limit is not None:
            params["limit"] = limit
        result = self._request("GET", "/events", params=params or None)
        return result if isinstance(result, dict) else {"events": []}

    def add_webhook(self, *, url: str) -> dict[str, Any]:
        """
        POST /webhooks. The signing secret is returned once and never again, so
        the caller must persist it in the same transaction that records the
        endpoint id -- there is no way to ask for it a second time.

        Scholis refuses a non-https URL except for localhost.
        """
        return self._request("POST", "/webhooks", payload={"url": url})

    def list_webhooks(self) -> list[dict[str, Any]]:
        result = self._request("GET", "/webhooks")
        return result if isinstance(result, list) else []

    def remove_webhook(self, *, endpoint_id: str) -> dict[str, Any]:
        return self._request(
            "POST", "/webhooks/delete", payload={"endpointId": endpoint_id}
        )


def _parse_json(response: requests.Response) -> Any:
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError:
        return None


def _error_detail(body: Any, status: int) -> tuple[str, str | None]:
    """
    Pull a message and code out of whatever came back.

    Scholis answers ``{"error": {"code", "message"}}``, but a proxy, a load
    balancer or an HTML error page can answer instead, and a crash here would
    turn a legible 403 into a 500 of our own.
    """
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            code = error.get("code")
            if isinstance(message, str) and message:
                return message, code if isinstance(code, str) else None
        message = body.get("message")
        if isinstance(message, str) and message:
            return message, None
    return f"Scholis returned HTTP {status}.", None


__all__ = ["ScholisClient", "ScholisError"]
