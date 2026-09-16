from __future__ import annotations

import hashlib
import secrets

from django.core import signing
import uuid
from typing import Any

from django.conf import settings
from django.db import IntegrityError, connection
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_consultation.models import ConsultationWeeklyWhitelist
from app_organization.models import Organization
from app_rbac.resolution import roles_for_user

CONSULTANT_ROLE_SLUG = "consultant"

READINESS_GOOGLE_IDENTITY = "google_identity"
READINESS_GOOGLE_CALENDAR = "google_calendar"
READINESS_WHITELIST = "whitelist"
READINESS_ORG_DISABLED = "org_booking_disabled"

BOOKING_SLUG_PREFIX = "c_"
BOOKING_SLUG_RANDOM_HEX_LEN = 8
MAX_BOOKING_SLUG_ATTEMPTS = 10


def get_organization_for_current_schema() -> Organization | None:
    schema_name = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def user_has_consultant_role(user: User) -> bool:
    return CONSULTANT_ROLE_SLUG in roles_for_user(user)


def get_consultant_from_request(request) -> User | None:
    """Resolve tenant User row and require the consultant role slug."""
    user = User.get_user_from_request(request)
    if user is None or not user_has_consultant_role(user):
        return None
    return user


def has_active_calendar_oauth(user: User) -> bool:
    oauth = UserGoogleCalendarOAuth.objects.filter(user_id=user.id).first()
    return oauth is not None and oauth.status == UserGoogleCalendarOAuth.Status.ACTIVE


def get_google_calendar_connection(user: User) -> dict[str, Any]:
    oauth = UserGoogleCalendarOAuth.objects.filter(user_id=user.id).first()
    if oauth is None or oauth.status != UserGoogleCalendarOAuth.Status.ACTIVE:
        return {
            "connected": False,
            "authorized_email": "",
            "authorized_display_name": "",
        }
    return {
        "connected": True,
        "authorized_email": oauth.authorized_email or "",
        "authorized_display_name": oauth.authorized_display_name or "",
    }


def is_whitelist_configured(consultant: User) -> bool:
    try:
        whitelist = ConsultationWeeklyWhitelist.objects.get(consultant=consultant)
    except ConsultationWeeklyWhitelist.DoesNotExist:
        return False
    schedule = whitelist.schedule or {}
    for day_config in schedule.values():
        if not isinstance(day_config, dict):
            continue
        if day_config.get("enabled") and (day_config.get("windows") or []):
            return True
    return False


def compute_readiness(consultant: User, org: Organization | None = None) -> dict[str, Any]:
    org = org or get_organization_for_current_schema()
    missing: list[str] = []

    google_identity_linked = bool(consultant.google_id)
    if not google_identity_linked:
        missing.append(READINESS_GOOGLE_IDENTITY)

    google_calendar_connected = has_active_calendar_oauth(consultant)
    if not google_calendar_connected:
        missing.append(READINESS_GOOGLE_CALENDAR)

    whitelist_configured = is_whitelist_configured(consultant)
    if not whitelist_configured:
        missing.append(READINESS_WHITELIST)

    org_enabled = bool(org and org.is_consultation_booking_on)
    if not org_enabled:
        missing.append(READINESS_ORG_DISABLED)

    is_bookable = (
        user_has_consultant_role(consultant)
        and google_identity_linked
        and google_calendar_connected
        and whitelist_configured
        and bool(consultant.consultation_booking_slug)
        and org_enabled
    )

    return {
        "google_identity_linked": google_identity_linked,
        "google_calendar_connected": google_calendar_connected,
        "is_bookable": is_bookable,
        "missing": missing,
    }


def is_consultant_bookable(consultant: User, org: Organization | None = None) -> bool:
    if not user_has_consultant_role(consultant):
        return False
    return compute_readiness(consultant, org=org)["is_bookable"]


def resolve_consultant_by_slug(slug: str) -> User | None:
    if not slug:
        return None
    return User.objects.filter(consultation_booking_slug=slug).first()


def generate_consultation_booking_slug() -> str:
    return f"{BOOKING_SLUG_PREFIX}{uuid.uuid4().hex[:BOOKING_SLUG_RANDOM_HEX_LEN]}"


def ensure_consultation_booking_slug(consultant: User) -> bool:
    """
    Assign consultation_booking_slug if missing. Returns True if a new slug was set.
    """
    if not user_has_consultant_role(consultant) or consultant.consultation_booking_slug:
        return False

    for _ in range(MAX_BOOKING_SLUG_ATTEMPTS):
        consultant.consultation_booking_slug = generate_consultation_booking_slug()
        try:
            consultant.save(update_fields=["consultation_booking_slug"])
            return True
        except IntegrityError:
            consultant.consultation_booking_slug = None

    raise ValidationError("Could not generate a unique consultation booking link.")


def rotate_consultation_booking_slug(consultant: User) -> str:
    """Replace consultation_booking_slug with a new value. Returns the new slug."""
    if not user_has_consultant_role(consultant):
        raise ValidationError("Consultant role required.")

    for _ in range(MAX_BOOKING_SLUG_ATTEMPTS):
        consultant.consultation_booking_slug = generate_consultation_booking_slug()
        try:
            consultant.save(update_fields=["consultation_booking_slug"])
            return consultant.consultation_booking_slug
        except IntegrityError:
            consultant.consultation_booking_slug = None

    raise ValidationError("Could not generate a unique consultation booking link.")


def resolve_bookable_consultant_by_slug(slug: str) -> User | None:
    consultant = resolve_consultant_by_slug(slug)
    if consultant is None:
        return None
    if not is_consultant_bookable(consultant):
        return None
    return consultant


CANCEL_TOKEN_SIGNING_SALT = "consultation-booking-cancel-v1"


def generate_cancel_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_cancel_token(token)


def sign_cancel_token(token: str) -> str:
    return signing.dumps(token, salt=CANCEL_TOKEN_SIGNING_SALT)


def unsign_cancel_token(signed: str) -> str:
    return signing.loads(signed, salt=CANCEL_TOKEN_SIGNING_SALT)


def resolve_booking_manage_token(booking) -> str | None:
    signed = getattr(booking, "cancel_token_signed", "") or ""
    if not signed:
        return None
    try:
        return unsign_cancel_token(signed)
    except signing.BadSignature:
        return None


def rotate_booking_cancel_token(booking) -> str:
    from app_consultation.models import ConsultationBooking

    if not isinstance(booking, ConsultationBooking):
        raise TypeError("booking must be a ConsultationBooking instance.")

    token, token_hash = generate_cancel_token()
    booking.cancel_token_hash = token_hash
    booking.cancel_token_signed = sign_cancel_token(token)
    booking.save(
        update_fields=["cancel_token_hash", "cancel_token_signed", "updated_at"]
    )
    return token


def hash_cancel_token(token: str) -> str:
    secret = getattr(settings, "JWT", "") or getattr(settings, "DJANGO_SECRET", "")
    return hashlib.sha256(f"{token}:{secret}".encode()).hexdigest()


def verify_cancel_token(token: str, token_hash: str) -> bool:
    if not token or not token_hash:
        return False
    return hash_cancel_token(token) == token_hash


def build_booking_url(slug: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    if base:
        return f"{base}/book-consultation/{slug}"
    return f"/book-consultation/{slug}"


def build_booking_manage_url(token: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    if base:
        return f"{base}/book-consultation/booking?token={token}"
    return f"/book-consultation/booking?token={token}"


def build_consultant_consultation_url(consultant: User) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    path = f"/users/{consultant.id}?section=consultation"
    if base:
        return f"{base}{path}"
    return path


def build_cancel_url(token: str) -> str:
    """Deprecated alias — use build_booking_manage_url."""
    return build_booking_manage_url(token)
