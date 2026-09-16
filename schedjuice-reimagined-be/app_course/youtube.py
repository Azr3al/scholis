"""YouTube URL parsing helpers for user-uploaded recordings."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_YOUTUBE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{11}$")

# Path-based patterns: youtu.be/{id}, /embed/{id}, /shorts/{id}, /v/{id}
_PATH_PATTERNS = (
    re.compile(r"(?:youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})"),
    re.compile(r"youtube\.com/live/([a-zA-Z0-9_-]{11})"),
)


def extract_youtube_video_id(url: str | None) -> str | None:
    """Return an 11-character YouTube video id from a URL, or None if invalid."""
    if not url or not isinstance(url, str):
        return None

    trimmed = url.strip()
    if not trimmed:
        return None

    if _YOUTUBE_ID_RE.fullmatch(trimmed):
        return trimmed

    parsed = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
    host = (parsed.netloc or "").lower().removeprefix("www.")
    path = parsed.path or ""

    if host in {"youtu.be", "youtube.com", "m.youtube.com", "music.youtube.com"}:
        if host == "youtu.be":
            candidate = path.strip("/").split("/")[0]
            if _YOUTUBE_ID_RE.fullmatch(candidate):
                return candidate

        if host.endswith("youtube.com"):
            query = parse_qs(parsed.query)
            for key in ("v", "vi"):
                values = query.get(key) or []
                if values and _YOUTUBE_ID_RE.fullmatch(values[0]):
                    return values[0]

            for pattern in _PATH_PATTERNS:
                match = pattern.search(f"youtube.com{path}")
                if match and _YOUTUBE_ID_RE.fullmatch(match.group(1)):
                    return match.group(1)

    return None


def normalize_youtube_url(url: str, video_id: str | None = None) -> str:
    """Canonical watch URL for storage/display."""
    vid = video_id or extract_youtube_video_id(url)
    if not vid:
        return url.strip()
    return f"https://www.youtube.com/watch?v={vid}"
