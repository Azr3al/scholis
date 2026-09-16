"""Shared helpers for stripping intake/program boilerplate from course titles."""
from __future__ import annotations

import re

_ACADEMIC_YEAR_SUFFIX = re.compile(
    r"\s*-\s*academic year\s*\d{4}\s*-\s*\d{4}\s*$", re.IGNORECASE
)


def strip_scope_names(
    title: str,
    *,
    program_name: str | None = None,
    intake_name: str | None = None,
) -> str:
    """Remove intake-generated title prefix/suffix when they match known scope names."""
    s = (title or "").strip()
    if intake_name:
        suffix = f" - {intake_name}"
        if s.lower().endswith(suffix.lower()):
            s = s[: -len(suffix)].rstrip()
    if program_name:
        prefix = f"{program_name} "
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix) :].lstrip()
    return s


def normalize_course_title(
    value: str | None,
    *,
    program_name: str | None = None,
    intake_name: str | None = None,
) -> str:
    s = (value or "").strip().lower()
    s = _ACADEMIC_YEAR_SUFFIX.sub("", s)
    s = strip_scope_names(s, program_name=program_name, intake_name=intake_name)
    s = re.sub(r"\s+", " ", s).strip()
    return s
