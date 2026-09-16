"""Normalize approved email domains from API payloads and legacy DB values."""

from __future__ import annotations

import json
import re
from typing import Any, Iterable

_DOMAIN_RE = re.compile(
    r"(?<![@\w])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)",
    re.IGNORECASE,
)


def _clean_domain_string(raw: str) -> str | None:
    s = str(raw).strip().lower()
    if not s:
        return None
    if "@" in s:
        s = s.split("@")[-1].strip()
    s = s.strip("\"'[]\\ ")
    if not s or " " in s or "." not in s:
        return None
    return s


def _flatten_entries(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        out: list[str] = []
        for item in value:
            out.extend(_flatten_entries(item))
        return out
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        current: Any = s
        for _ in range(12):
            if not isinstance(current, str):
                break
            stripped = current.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                try:
                    loaded = json.loads(stripped)
                except json.JSONDecodeError:
                    break
                if loaded == current:
                    break
                current = loaded
                continue
            break
        if isinstance(current, list):
            return _flatten_entries(current)
        if isinstance(current, str):
            return _domains_from_text(current)
        return []
    return []


def _domains_from_text(text: str) -> list[str]:
    cleaned = _clean_domain_string(text)
    if cleaned and not any(ch in cleaned for ch in '[]"\\'):
        return [cleaned]
    found: list[str] = []
    for match in _DOMAIN_RE.findall(text):
        domain = _clean_domain_string(match)
        if domain:
            found.append(domain)
    return found


def normalize_available_domains(value: Any) -> list[str]:
    """Return a deduplicated list of lowercase domain hostnames."""
    seen: set[str] = set()
    result: list[str] = []
    for entry in _flatten_entries(value):
        cleaned = _clean_domain_string(entry)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def get_organization_approved_domains(organization: Any) -> list[str]:
    """Approved domains for an organization, including legacy corrupted values."""
    raw = getattr(organization, "available_domains", None)
    return normalize_available_domains(raw)


def email_domain_allowed(email: str, approved_domains: Iterable[str]) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1].strip().lower()
    return domain in set(approved_domains)
