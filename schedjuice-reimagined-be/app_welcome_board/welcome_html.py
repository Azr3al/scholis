"""Sanitize TipTap HTML before persistence."""

from __future__ import annotations

import nh3
from django.utils.html import strip_tags


def sanitize_welcome_body_html(html: str | None) -> str | None:
    if html is None:
        return None
    s = str(html).strip()
    if not s:
        return None
    return nh3.clean(s)


def html_is_effectively_empty(html: str | None) -> bool:
    if not html or not str(html).strip():
        return True
    return not strip_tags(str(html)).strip()
