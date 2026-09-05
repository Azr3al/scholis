"""Pure helpers for Zoom scheduling — no DB, no HTTP."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz
from typing import Iterable


def build_create_meeting_payload(
    *,
    topic: str,
    start_local: datetime,
    duration_minutes: int,
    timezone_name: str,
) -> dict:
    """Type 2 (scheduled) meeting payload for POST /users/{id}/meetings."""
    if start_local.tzinfo is not None:
        start_local = start_local.replace(tzinfo=None)
    return {
        "topic": topic,
        "type": 2,
        "start_time": start_local.isoformat(timespec="seconds"),
        "duration": int(duration_minutes),
        "timezone": timezone_name,
        "settings": {
            "join_before_host": False,
            "waiting_room": False,
            "approval_type": 2,
        },
    }


def _parse_zoom_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return (
            datetime.fromisoformat(s.replace("Z", "+00:00"))
            .astimezone(dt_tz.utc)
            .replace(tzinfo=None)
        )
    except ValueError:
        return None


def detect_conflicts(
    meetings: Iterable[dict],
    *,
    start_utc: datetime,
    duration_minutes: int,
) -> list[dict]:
    end_utc = start_utc + timedelta(minutes=duration_minutes)
    out: list[dict] = []
    for m in meetings:
        m_start = _parse_zoom_dt(m.get("start_time"))
        m_dur = int(m.get("duration") or 0)
        if not m_start or m_dur <= 0:
            continue
        m_end = m_start + timedelta(minutes=m_dur)
        if m_start < end_utc and m_end > start_utc:
            out.append(m)
    return out


def apply_meeting_response_to_course(course, *, response: dict) -> None:
    course.zoom_meeting_id = str(response.get("id") or "")
    course.zoom_meeting_uuid = str(response.get("uuid") or "")
    course.zoom_meeting_host_id = str(response.get("host_id") or "")
    join = response.get("join_url") or ""
    if join:
        course.meeting_link = join
