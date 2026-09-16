"""Google login user resolution."""

from __future__ import annotations

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_organization.models import Organization


def _validation_error(message: str, details: str) -> ValidationError:
    return ValidationError(
        {
            "is_error": True,
            "message": message,
            "details": details,
        }
    )


def assert_google_login_enabled(org: Organization) -> None:
    from django.conf import settings

    if not org.is_google_login_on:
        raise _validation_error(
            "google_login_disabled",
            "Google login is not enabled for this school.",
        )
    if not org.is_google_on:
        raise _validation_error(
            "google_login_disabled",
            "Google integration is not enabled for this school.",
        )
    if not (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip():
        raise _validation_error(
            "google_login_disabled",
            "Google sign-in is not configured for this platform.",
        )


def resolve_google_login_user(org: Organization, claims: dict) -> User:
    google_sub = str(claims.get("sub") or "").strip()
    if not google_sub:
        raise _validation_error(
            "google_auth_invalid",
            "Google sign-in could not be verified. Try again.",
        )

    user = User.objects.filter(google_id=google_sub).first()
    if not user:
        raise _validation_error(
            "google_not_linked",
            (
                "No account is linked to this Google user. "
                "Sign in another way, then connect Google on your profile."
            ),
        )
    if not user.is_active:
        if user.is_waiting_for_activation:
            raise _validation_error(
                "awaiting_activation",
                (
                    "Your registration is pending administrator approval. "
                    "You will receive an email when your account is activated."
                ),
            )
        raise _validation_error(
            "inactive_user",
            (
                "Your account is currently disabled. "
                "Please contact your administrator."
            ),
        )
    if org.is_microsoft_on and not user.microsoft_id:
        raise _validation_error(
            "microsoft_link_required",
            (
                "Link your Microsoft account on your profile before "
                "signing in with Google."
            ),
        )
    return user


def verify_token_and_resolve_user(org: Organization, id_token: str) -> User:
    from app_google.google_auth import GoogleTokenVerificationError, verify_google_id_token

    assert_google_login_enabled(org)
    try:
        claims = verify_google_id_token(id_token)
    except GoogleTokenVerificationError as exc:
        raise _validation_error(
            "google_auth_invalid",
            str(exc),
        ) from exc

    if not claims.get("email_verified"):
        raise _validation_error(
            "google_auth_invalid",
            "Google account email is not verified.",
        )

    return resolve_google_login_user(org, claims)
