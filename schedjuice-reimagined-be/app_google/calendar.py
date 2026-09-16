"""Google Calendar API helpers for consultation scheduling."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import requests
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_google.oauth import GoogleOAuthError, get_valid_access_token

GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"
GOOGLE_FREEBUSY_URL = f"{GOOGLE_CALENDAR_API_BASE}/freeBusy"
PRIMARY_CALENDAR_ID = "primary"


class GoogleCalendarError(RuntimeError):
    pass


@dataclass(frozen=True)
class BusyBlock:
    start: datetime
    end: datetime


def _calendar_oauth_for_user(user: User) -> UserGoogleCalendarOAuth:
    oauth_row = UserGoogleCalendarOAuth.objects.filter(user_id=user.id).first()
    if not oauth_row:
        raise GoogleCalendarError("Google Calendar is not connected for this user.")
    if oauth_row.status != UserGoogleCalendarOAuth.Status.ACTIVE:
        raise GoogleCalendarError("Google Calendar connection requires reconnect.")
    return oauth_row


def _authorized_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _parse_api_datetime(raw: str) -> datetime:
    parsed = parse_datetime(raw)
    if parsed is None:
        raise GoogleCalendarError(f"Invalid Google Calendar datetime: {raw!r}")
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.utc)
    return parsed


def _ensure_utc(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.utc)
    return dt.astimezone(timezone.utc)


def fetch_free_busy(
    user: User,
    time_min: datetime,
    time_max: datetime,
) -> list[BusyBlock]:
    oauth_row = _calendar_oauth_for_user(user)
    try:
        access_token = get_valid_access_token(oauth_row)
    except GoogleOAuthError as exc:
        raise GoogleCalendarError(str(exc)) from exc

    payload = {
        "timeMin": _ensure_utc(time_min).isoformat().replace("+00:00", "Z"),
        "timeMax": _ensure_utc(time_max).isoformat().replace("+00:00", "Z"),
        "items": [{"id": PRIMARY_CALENDAR_ID}],
    }
    try:
        res = requests.post(
            GOOGLE_FREEBUSY_URL,
            headers=_authorized_headers(access_token),
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google freeBusy request failed: {exc}") from exc

    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google freeBusy error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        raise GoogleCalendarError("Google freeBusy response was not valid JSON.") from exc

    calendar_data = (data.get("calendars") or {}).get(PRIMARY_CALENDAR_ID) or {}
    busy_items = calendar_data.get("busy") or []
    blocks: list[BusyBlock] = []
    for item in busy_items:
        start_raw = item.get("start")
        end_raw = item.get("end")
        if not start_raw or not end_raw:
            continue
        blocks.append(
            BusyBlock(
                start=_parse_api_datetime(str(start_raw)),
                end=_parse_api_datetime(str(end_raw)),
            )
        )
    return blocks


def create_consultation_event(
    user: User,
    *,
    scheduled_at: datetime,
    duration_minutes: int,
    student_name: str,
    student_email: str,
    summary: str | None = None,
    description: str | None = None,
    booking_id: int | None = None,
) -> dict[str, str]:
    oauth_row = _calendar_oauth_for_user(user)
    try:
        access_token = get_valid_access_token(oauth_row)
    except GoogleOAuthError as exc:
        raise GoogleCalendarError(str(exc)) from exc

    start = _ensure_utc(scheduled_at)
    end = start + timedelta(minutes=duration_minutes)
    event_summary = summary or f"Consultation with {student_name}"
    event_body: dict[str, Any] = {
        "summary": event_summary,
        "description": description or "",
        "start": {"dateTime": start.isoformat().replace("+00:00", "Z"), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat().replace("+00:00", "Z"), "timeZone": "UTC"},
        "attendees": [{"email": student_email, "displayName": student_name}],
        "conferenceData": {
            "createRequest": {
                "requestId": uuid.uuid4().hex,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    if booking_id is not None:
        event_body["extendedProperties"] = {
            "private": {"schedjuice_booking_id": str(booking_id)},
        }

    url = (
        f"{GOOGLE_CALENDAR_API_BASE}/calendars/{PRIMARY_CALENDAR_ID}/events"
        "?conferenceDataVersion=1"
    )
    try:
        res = requests.post(
            url,
            headers=_authorized_headers(access_token),
            json=event_body,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar event request failed: {exc}") from exc

    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar event error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        raise GoogleCalendarError("Google Calendar event response was not valid JSON.") from exc

    event_id = str(data.get("id") or "").strip()
    if not event_id:
        raise GoogleCalendarError("Google Calendar did not return an event id.")

    meeting_link = str(data.get("hangoutLink") or "").strip()
    if not meeting_link:
        conference_data = data.get("conferenceData") or {}
        for entry in conference_data.get("entryPoints") or []:
            if entry.get("entryPointType") == "video" and entry.get("uri"):
                meeting_link = str(entry["uri"]).strip()
                break

    if not meeting_link:
        raise GoogleCalendarError("Google Calendar did not return a Meet link.")

    return {"meeting_link": meeting_link, "event_id": event_id}


def delete_calendar_event(user: User, event_id: str) -> None:
    if not event_id:
        return
    oauth_row = _calendar_oauth_for_user(user)
    try:
        access_token = get_valid_access_token(oauth_row)
    except GoogleOAuthError as exc:
        raise GoogleCalendarError(str(exc)) from exc

    url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/{PRIMARY_CALENDAR_ID}/events/{event_id}"
    try:
        res = requests.delete(
            url,
            headers=_authorized_headers(access_token),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar delete request failed: {exc}") from exc

    if res.status_code == 404:
        return
    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar delete error {res.status_code}: {(res.text or '')[:500]}"
        )


def _access_token_for_user(user: User) -> str:
    oauth_row = _calendar_oauth_for_user(user)
    try:
        return get_valid_access_token(oauth_row)
    except GoogleOAuthError as exc:
        raise GoogleCalendarError(str(exc)) from exc


def get_calendar_event(user: User, event_id: str) -> dict[str, Any] | None:
    if not event_id:
        return None
    access_token = _access_token_for_user(user)
    url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/{PRIMARY_CALENDAR_ID}/events/{event_id}"
    try:
        res = requests.get(
            url,
            headers=_authorized_headers(access_token),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar get request failed: {exc}") from exc

    if res.status_code == 404:
        return None
    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar get error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        return res.json() or {}
    except ValueError as exc:
        raise GoogleCalendarError("Google Calendar get response was not valid JSON.") from exc


def register_calendar_watch(
    user: User,
    *,
    webhook_url: str,
    channel_id: str,
    expiration_ms: int | None = None,
) -> dict[str, Any]:
    access_token = _access_token_for_user(user)
    body: dict[str, Any] = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
    }
    if expiration_ms is not None:
        body["expiration"] = expiration_ms

    url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/{PRIMARY_CALENDAR_ID}/events/watch"
    try:
        res = requests.post(
            url,
            headers=_authorized_headers(access_token),
            json=body,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar watch request failed: {exc}") from exc

    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar watch error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        raise GoogleCalendarError("Google Calendar watch response was not valid JSON.") from exc

    resource_id = str(data.get("resourceId") or "").strip()
    if not resource_id:
        raise GoogleCalendarError("Google Calendar watch did not return a resource id.")
    return data


def stop_calendar_watch(user: User, *, channel_id: str, resource_id: str) -> None:
    if not channel_id or not resource_id:
        return
    access_token = _access_token_for_user(user)
    url = f"{GOOGLE_CALENDAR_API_BASE}/channels/stop"
    body = {"id": channel_id, "resourceId": resource_id}
    try:
        res = requests.post(
            url,
            headers=_authorized_headers(access_token),
            json=body,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar channel stop failed: {exc}") from exc

    if res.status_code == 404:
        return
    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar channel stop error {res.status_code}: {(res.text or '')[:500]}"
        )


def list_calendar_event_changes(
    user: User,
    sync_token: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    access_token = _access_token_for_user(user)
    params: dict[str, Any] = {
        "showDeleted": "true",
        "singleEvents": "true",
    }
    if sync_token:
        params["syncToken"] = sync_token

    url = f"{GOOGLE_CALENDAR_API_BASE}/calendars/{PRIMARY_CALENDAR_ID}/events"
    try:
        res = requests.get(
            url,
            headers=_authorized_headers(access_token),
            params=params,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleCalendarError(f"Google Calendar events list failed: {exc}") from exc

    if res.status_code == 410:
        return list_calendar_event_changes(user, None)

    if res.status_code not in range(200, 300):
        raise GoogleCalendarError(
            f"Google Calendar events list error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        raise GoogleCalendarError("Google Calendar events list was not valid JSON.") from exc

    items = list(data.get("items") or [])
    next_sync_token = str(data.get("nextSyncToken") or "").strip() or None
    return items, next_sync_token
