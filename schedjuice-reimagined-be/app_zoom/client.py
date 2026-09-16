"""
Zoom REST API: OAuth-backed calls using ``ZoomAccount``, plus report helpers.

Legacy Server-to-Server (``account_credentials``) was removed; use
``app_organization.ZoomAccount`` and ``app_zoom.oauth.get_valid_access_token``.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Iterable
from urllib.parse import quote

import requests

from app_zoom.oauth import ZoomOAuthError, get_valid_access_token

logger = logging.getLogger(__name__)

ZOOM_API_BASE = "https://api.zoom.us/v2"


def _ok(status: int) -> bool:
    return 200 <= status < 300


def _bearer_headers(zoom_account) -> dict[str, str]:
    token = get_valid_access_token(zoom_account)
    return {"Authorization": f"Bearer {token}"}


def get_meeting(zoom_account, meeting_id: str) -> dict | None:
    """GET /meetings/{id}. Returns None if the meeting does not exist (404)."""
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom get_meeting auth failed: %s", e)
        return None
    encoded = quote(str(meeting_id), safe="")
    try:
        res = requests.get(
            f"{ZOOM_API_BASE}/meetings/{encoded}",
            headers=headers,
            timeout=30,
        )
    except requests.RequestException as e:
        logger.warning("Zoom get_meeting request failed: %s", e)
        return None
    if res.status_code == 404:
        return None
    if not _ok(res.status_code):
        logger.warning(
            "Zoom get_meeting %s for %s: %s",
            res.status_code,
            meeting_id,
            (res.text or "")[:500],
        )
        return None
    try:
        return res.json() or {}
    except ValueError:
        return None


def list_user_meetings(
    zoom_account,
    user_id: str,
    *,
    meeting_type: str = "upcoming",
) -> list[dict]:
    """GET /users/{userId}/meetings — paginated. ``meeting_type`` is Zoom's ``type`` query param."""
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom list_user_meetings auth failed: %s", e)
        return []
    out: list[dict] = []
    next_token = ""
    encoded_uid = quote(str(user_id), safe="")
    while True:
        params: dict[str, Any] = {"page_size": 300, "type": meeting_type}
        if next_token:
            params["next_page_token"] = next_token
        try:
            res = requests.get(
                f"{ZOOM_API_BASE}/users/{encoded_uid}/meetings",
                headers=headers,
                params=params,
                timeout=30,
            )
        except requests.RequestException as e:
            logger.warning("Zoom list_user_meetings request failed: %s", e)
            return out
        if not _ok(res.status_code):
            logger.warning(
                "Zoom list_user_meetings %s: %s",
                res.status_code,
                (res.text or "")[:500],
            )
            return out
        try:
            body = res.json() or {}
        except ValueError:
            return out
        out.extend(body.get("meetings") or [])
        next_token = body.get("next_page_token") or ""
        if not next_token:
            break
    return out


def create_user_meeting(zoom_account, user_id: str, payload: dict) -> dict:
    """POST /users/{userId}/meetings."""
    headers = _bearer_headers(zoom_account)
    headers["Content-Type"] = "application/json"
    encoded_uid = quote(str(user_id), safe="")
    res = requests.post(
        f"{ZOOM_API_BASE}/users/{encoded_uid}/meetings",
        headers=headers,
        json=payload,
        timeout=30,
    )
    if not _ok(res.status_code):
        raise RuntimeError(
            f"Zoom create_user_meeting {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        return res.json() or {}
    except ValueError as e:
        raise RuntimeError("Zoom create_user_meeting returned invalid JSON.") from e


def update_meeting(zoom_account, meeting_id: str, payload: dict) -> None:
    """PATCH /meetings/{id}."""
    headers = _bearer_headers(zoom_account)
    headers["Content-Type"] = "application/json"
    encoded = quote(str(meeting_id), safe="")
    res = requests.patch(
        f"{ZOOM_API_BASE}/meetings/{encoded}",
        headers=headers,
        json=payload,
        timeout=30,
    )
    if not _ok(res.status_code):
        raise RuntimeError(
            f"Zoom update_meeting {res.status_code}: {(res.text or '')[:500]}"
        )


def list_account_users(zoom_account) -> list[dict]:
    """GET /users — active users, paginated."""
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom list_account_users auth failed: %s", e)
        return []
    out: list[dict] = []
    next_token = ""
    while True:
        params: dict[str, Any] = {"page_size": 300, "status": "active"}
        if next_token:
            params["next_page_token"] = next_token
        try:
            res = requests.get(
                f"{ZOOM_API_BASE}/users",
                headers=headers,
                params=params,
                timeout=30,
            )
        except requests.RequestException as e:
            logger.warning("Zoom list_account_users request failed: %s", e)
            return out
        if not _ok(res.status_code):
            logger.warning(
                "Zoom list_account_users %s: %s",
                res.status_code,
                (res.text or "")[:500],
            )
            return out
        try:
            body = res.json() or {}
        except ValueError:
            return out
        out.extend(body.get("users") or [])
        next_token = body.get("next_page_token") or ""
        if not next_token:
            break
    return out


def fetch_zoom_oauth_user_profile(access_token: str) -> dict[str, Any]:
    """
    Call ``GET /users/me`` (+ optional account name) with a freshly issued OAuth
    access token before a ``ZoomAccount`` row exists.
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        res = requests.get(f"{ZOOM_API_BASE}/users/me", headers=headers, timeout=30)
    except requests.RequestException as e:
        raise RuntimeError(f"Zoom /users/me request failed: {e}") from e
    if not _ok(res.status_code):
        raise RuntimeError(
            f"Zoom /users/me error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        body = res.json() or {}
    except ValueError as e:
        raise RuntimeError("Zoom /users/me returned invalid JSON.") from e
    account_id = str(body.get("account_id") or "").strip()
    zoom_uid = str(body.get("id") or "").strip()
    email = str(body.get("email") or "").strip()
    first = str(body.get("first_name") or "").strip()
    last = str(body.get("last_name") or "").strip()
    display = str(body.get("display_name") or "").strip()
    authorized_display_name = (
        display or f"{first} {last}".strip() or email
    ).strip()
    account_name = ""
    if account_id:
        try:
            res_ac = requests.get(
                f"{ZOOM_API_BASE}/accounts/{quote(account_id, safe='')}",
                headers=headers,
                timeout=30,
            )
            if _ok(res_ac.status_code):
                ac_body = res_ac.json() or {}
                account_name = str(ac_body.get("name") or "").strip()
        except requests.RequestException:
            pass
    return {
        "account_id": account_id,
        "authorized_by_zoom_user_id": zoom_uid,
        "authorized_by_email": email,
        "account_name": account_name,
        "authorized_display_name": authorized_display_name,
    }


def get_zoom_user(zoom_account, user_id: str) -> dict[str, Any] | None:
    """GET /users/{userId} — single user detail for host resolution."""
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom get_zoom_user auth failed: %s", e)
        return None
    encoded = quote(str(user_id), safe="")
    try:
        res = requests.get(
            f"{ZOOM_API_BASE}/users/{encoded}",
            headers=headers,
            timeout=30,
        )
    except requests.RequestException as e:
        logger.warning("Zoom get_zoom_user request failed: %s", e)
        return None
    if res.status_code == 404:
        return None
    if not _ok(res.status_code):
        logger.warning(
            "Zoom get_zoom_user %s: %s", res.status_code, (res.text or "")[:500]
        )
        return None
    try:
        return res.json() or {}
    except ValueError:
        return None


def list_report_meeting_participants(
    zoom_account,
    meeting_id: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Paginate GET /report/meetings/{meetingId}/participants.
    ``meeting_id`` is URL-encoded (Zoom requires encoding for UUIDs with special chars).
    """
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom report participants auth failed: %s", e)
        return [], {}

    participants: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    encoded_mid = quote(str(meeting_id), safe="")
    next_token = ""

    while True:
        url = f"{ZOOM_API_BASE}/report/meetings/{encoded_mid}/participants"
        params: dict[str, str | int] = {"page_size": 300}
        if next_token:
            params["next_page_token"] = next_token
        try:
            res = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=60,
            )
        except requests.RequestException as e:
            logger.warning("Zoom participants request failed: %s", e)
            return [], {}

        if not _ok(res.status_code):
            logger.warning(
                "Zoom participants error %s for meeting %s: %s",
                res.status_code,
                meeting_id,
                (res.text or "")[:500],
            )
            return [], {}

        try:
            body = res.json()
        except ValueError:
            return [], {}
        if not meta:
            meta = {
                k: body.get(k)
                for k in ("uuid", "id", "start_time", "end_time")
                if k in body
            }
        batch = body.get("participants") or []
        participants.extend(batch)
        next_token = body.get("next_page_token") or ""
        if not next_token:
            break

    return participants, meta


def list_past_meeting_instances(zoom_account, meeting_id: str) -> list[dict[str, Any]]:
    """
    GET /past_meetings/{meetingId}/instances — ended instances for a scheduled meeting.

    Uses **Meeting** OAuth scopes (e.g. ``meeting:read:list_past_instances``), not
    ``report:`` scopes. Preferred for **user-managed** Zoom apps where Report API
    scopes are unavailable.
    """
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom past instances auth failed: %s", e)
        return []
    encoded_mid = quote(str(meeting_id), safe="")
    try:
        res = requests.get(
            f"{ZOOM_API_BASE}/past_meetings/{encoded_mid}/instances",
            headers=headers,
            timeout=60,
        )
    except requests.RequestException as e:
        logger.warning("Zoom past instances request failed: %s", e)
        return []
    if not _ok(res.status_code):
        logger.warning(
            "Zoom past instances error %s for meeting %s: %s",
            res.status_code,
            meeting_id,
            (res.text or "")[:500],
        )
        return []
    try:
        body = res.json() or {}
    except ValueError:
        return []
    return list(body.get("meetings") or [])


def list_past_meeting_participants(
    zoom_account,
    meeting_uuid: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Paginate GET /past_meetings/{meetingUUID}/participants.

    Uses **Meeting** scopes such as ``meeting:read:list_past_participants`` (user OAuth),
    unlike :func:`list_report_meeting_participants` which requires ``report:`` scopes.
    ``meeting_uuid`` is the instance UUID from ``list_past_meeting_instances`` (or
    occasionally ``Course.zoom_meeting_uuid``).
    """
    try:
        headers = _bearer_headers(zoom_account)
    except ZoomOAuthError as e:
        logger.warning("Zoom past participants auth failed: %s", e)
        return [], {}

    participants: list[dict[str, Any]] = []
    meta: dict[str, Any] = {"instance_uuid": str(meeting_uuid).strip()}
    encoded_uid = quote(str(meeting_uuid).strip(), safe="")
    next_token = ""

    while True:
        url = f"{ZOOM_API_BASE}/past_meetings/{encoded_uid}/participants"
        params: dict[str, str | int] = {"page_size": 300}
        if next_token:
            params["next_page_token"] = next_token
        try:
            res = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=60,
            )
        except requests.RequestException as e:
            logger.warning("Zoom past participants request failed: %s", e)
            return [], {}

        if not _ok(res.status_code):
            logger.warning(
                "Zoom past participants error %s for instance %s: %s",
                res.status_code,
                meeting_uuid,
                (res.text or "")[:500],
            )
            return [], {}

        try:
            body = res.json() or {}
        except ValueError:
            return [], {}
        batch = body.get("participants") or []
        participants.extend(batch)
        next_token = body.get("next_page_token") or ""
        if not next_token:
            break

    return participants, meta


def zoom_participants_fingerprint(
    meeting_id: str,
    participants: Iterable[dict[str, Any]],
) -> str:
    """Stable id for ProcessedVideoAttendanceReport (same snapshot = same fingerprint)."""
    lines = []
    for p in participants:
        lines.append(
            "|".join(
                [
                    str(p.get("user_email") or ""),
                    str(p.get("id") or ""),
                    str(p.get("user_id") or ""),
                    str(p.get("join_time") or ""),
                    str(p.get("leave_time") or ""),
                    str(p.get("duration") or ""),
                ]
            )
        )
    raw = f"{meeting_id}\n" + "\n".join(sorted(lines))
    return hashlib.sha256(raw.encode()).hexdigest()
