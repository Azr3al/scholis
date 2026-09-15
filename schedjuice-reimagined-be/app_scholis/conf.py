"""
Deployment configuration for the Scholis integration.

Read from settings rather than module-level constants so tests can override them
with ``override_settings`` and so nothing secret has a default value. A default
for a secret is a secret everybody shares.
"""
from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings


class ScholisNotConfigured(RuntimeError):
    """A required setting is absent. Raised, never defaulted."""


@dataclass(frozen=True)
class ScholisSettings:
    api_base: str
    platform_key: str
    public_base: str
    request_timeout: float


def get_settings() -> ScholisSettings:
    api_base = (getattr(settings, "SCHOLIS_API_BASE", "") or "").rstrip("/")
    if not api_base:
        raise ScholisNotConfigured("SCHOLIS_API_BASE is not set.")

    # The platform-tier credential. It can create an organisation and mint that
    # organisation's key, and it cannot read a single paper or mark -- which is
    # why it is safe for it to be deployment-wide configuration rather than
    # per-tenant data.
    platform_key = getattr(settings, "SCHOLIS_PLATFORM_KEY", "") or ""
    if not platform_key:
        raise ScholisNotConfigured("SCHOLIS_PLATFORM_KEY is not set.")

    # Where Scholis should send webhooks, and the base of the sign-in links a
    # teacher is redirected to. Must be publicly reachable over https: Scholis
    # refuses to register an http webhook URL.
    public_base = (getattr(settings, "SCHOLIS_WEBHOOK_PUBLIC_BASE", "") or "").rstrip(
        "/"
    )

    timeout = getattr(settings, "SCHOLIS_REQUEST_TIMEOUT", 15.0)

    return ScholisSettings(
        api_base=api_base,
        platform_key=platform_key,
        public_base=public_base,
        request_timeout=float(timeout),
    )
