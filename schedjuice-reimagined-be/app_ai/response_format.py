"""Channel-agnostic cleanup for AI assistant replies."""
from __future__ import annotations

import re

_USER_ID_SUFFIX_RE = re.compile(r"\s*\(ID:\s*\d+\)", re.IGNORECASE)
_COURSE_ID_SUFFIX_RE = re.compile(r"\s*\(Course ID:\s*\d+\)", re.IGNORECASE)


def cleanup_ai_response_text(text: str) -> str:
    if not text:
        return ""
    text = _USER_ID_SUFFIX_RE.sub("", text)
    text = _COURSE_ID_SUFFIX_RE.sub("", text)
    return text
