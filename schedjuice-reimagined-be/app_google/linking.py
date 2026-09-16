"""Google account binding for tenant users."""

from __future__ import annotations

from django.utils import timezone

from app_auth.models import User
from app_google.google_auth import GoogleTokenVerificationError, verify_google_id_token
from app_organization.models import Organization


class GoogleLinkError(ValueError):
    pass


GOOGLE_BINDING_FIELDS = (
    "google_id",
    "google_linked_at",
)


def assert_google_enabled(org: Organization) -> None:
    if not org.is_google_on:
        raise GoogleLinkError("Google integration is not enabled for this organization.")


def assert_google_oauth_configured() -> None:
    from django.conf import settings

    if not (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip():
        raise GoogleLinkError("Google sign-in is not configured for this platform.")


def link_google_account(user: User, id_token: str, *, org: Organization) -> User:
    assert_google_enabled(org)
    assert_google_oauth_configured()

    try:
        claims = verify_google_id_token(id_token)
    except GoogleTokenVerificationError as exc:
        raise GoogleLinkError(str(exc)) from exc

    if not claims.get("email_verified"):
        raise GoogleLinkError("Google account email is not verified.")

    google_sub = str(claims.get("sub") or "").strip()
    if not google_sub:
        raise GoogleLinkError("Google account identifier is missing.")

    existing = User.objects.filter(google_id=google_sub).exclude(id=user.id).first()
    if existing:
        raise GoogleLinkError("This Google account is already linked to another user.")

    user.google_id = google_sub
    user.google_linked_at = timezone.now()
    user.save(update_fields=list(GOOGLE_BINDING_FIELDS))
    return user


def clear_google_binding(user: User) -> None:
    user.google_id = None
    user.google_linked_at = None
    user.save(update_fields=list(GOOGLE_BINDING_FIELDS))
