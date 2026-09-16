"""Tenant branding helpers for quiz v3 (take preview, author preview, submit payload)."""

from __future__ import annotations


def organization_logo_url(request) -> str | None:
    """Absolute URL for the current tenant organization logo, or None."""
    org = getattr(request, "tenant", None)
    if org is None:
        return None
    logo = getattr(org, "logo", None)
    if not logo:
        return None
    try:
        url = logo.url
    except (ValueError, AttributeError):
        return None
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return request.build_absolute_uri(url)


def organization_display_name(request) -> str:
    org = getattr(request, "tenant", None)
    if org is None:
        return ""
    return getattr(org, "name", "") or ""
