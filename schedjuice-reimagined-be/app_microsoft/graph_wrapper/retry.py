"""Shared Microsoft Graph retry/backoff helpers and conflict detection.

These are used by the user and group Graph wrappers so that mutating calls
(create user, create team, assign license, etc.) survive transient Entra
throttling / concurrency errors before surfacing a failure to the caller.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

import requests

logger = logging.getLogger(__name__)

GRAPH_CALL_MAX_ATTEMPTS = 4


def retry_after_seconds(response: requests.Response, attempt: int) -> float:
    ra = response.headers.get("Retry-After")
    if ra and str(ra).isdigit():
        return min(int(ra), 30)
    return min(0.5 * (2**attempt), 8.0)


def is_transient_microsoft_error(response: requests.Response) -> bool:
    c = response.status_code
    if c == 429:
        return True
    if c in (502, 503, 504):
        return True
    if c in (200, 201, 202, 204):
        return False
    text = ""
    err_obj = None
    try:
        j = response.json()
        if isinstance(j, dict):
            err_obj = j.get("error")
            if isinstance(err_obj, dict):
                em = err_obj.get("message") or ""
                ec = err_obj.get("code") or ""
                if isinstance(em, str):
                    text = em.lower()
                if isinstance(ec, str) and "thrott" in ec.lower():
                    return True
    except (TypeError, ValueError):
        pass
    body = response.text or ""
    if not text and body:
        text = body[:2000].lower()
    if "concurrent" in text or "try again" in text or "throttl" in text:
        return True
    if c == 409 and ("concurrent" in text or "conflict" in text):
        return True
    return False


def graph_call_with_retry(
    log_label: str, run: Callable[[], requests.Response]
) -> requests.Response:
    last: requests.Response | None = None
    for attempt in range(GRAPH_CALL_MAX_ATTEMPTS):
        last = run()
        if last.status_code in range(199, 300):
            return last
        if attempt < GRAPH_CALL_MAX_ATTEMPTS - 1 and is_transient_microsoft_error(last):
            wait = retry_after_seconds(last, attempt)
            logger.warning(
                "MS Graph %s failed (status=%s), retry %s/%s after %.1fs: %s",
                log_label,
                last.status_code,
                attempt + 1,
                GRAPH_CALL_MAX_ATTEMPTS,
                wait,
                (last.text or "")[:400],
            )
            time.sleep(wait)
            continue
        return last
    return last  # pragma: no cover


def response_indicates_already_exists(response: requests.Response) -> bool:
    """True when Graph rejects a create because the object already exists.

    Entra returns this as HTTP 400/409 with messages mentioning that another
    object with the same userPrincipalName / proxyAddress / value already exists.
    """
    if response.status_code not in (400, 409):
        return False
    text = ""
    code = ""
    try:
        body = response.json()
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict):
                text = str(err.get("message") or "").lower()
                code = str(err.get("code") or "").lower()
    except (TypeError, ValueError):
        pass
    if not text:
        text = (response.text or "")[:2000].lower()
    needles = (
        "already exist",
        "already exists",
        "already a member",
        "another object with the same value",
        "values already exist",
        "proxyaddresses already exist",
    )
    if any(n in text for n in needles):
        return True
    if code in ("request_badrequest",) and "userprincipalname" in text:
        return True
    return False
