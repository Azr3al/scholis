from __future__ import annotations

from app_consultation.strategies import lwtp as lwtp_strategy
from app_consultation.strategies.lwtp import BookingDetailsValidationError
from app_consultation.consultant_helpers import (
    build_booking_manage_url,
    resolve_booking_manage_token,
)
from app_organization.models import Organization

STRATEGY_LWTP = Organization.ConsultationStrategy.LWTP


def _non_empty_details(raw: dict | None) -> bool:
    if not isinstance(raw, dict):
        return False
    return any(str(value).strip() for value in raw.values() if value is not None)


def _reject_unknown_lwtp_keys(raw: dict) -> None:
    unknown = set(raw.keys()) - lwtp_strategy.LWTP_INPUT_KEYS
    if unknown:
        raise BookingDetailsValidationError(
            f"Unsupported details fields: {', '.join(sorted(unknown))}."
        )


def parse_booking_details(raw: dict | None, *, strategy: str) -> dict:
    if strategy == STRATEGY_LWTP:
        return lwtp_strategy.parse_lwtp_details(raw)

    if raw and _non_empty_details(raw):
        if isinstance(raw, dict):
            _reject_unknown_lwtp_keys(raw)
        raise BookingDetailsValidationError(
            "Extra booking details are not supported for this consultation strategy."
        )
    return {}


def booking_detail_rows(booking) -> list[tuple[str, str]]:
    details = booking.details or {}
    stored_strategy = details.get("strategy")
    if stored_strategy == lwtp_strategy.STRATEGY_KEY:
        return lwtp_strategy.lwtp_detail_rows(details)
    return []


def format_calendar_description(
    booking,
    *,
    booking_manage_url: str | None = None,
) -> str:
    details = booking.details or {}
    if details.get("strategy") == lwtp_strategy.STRATEGY_KEY:
        description = lwtp_strategy.format_lwtp_calendar_description(
            details,
            student_name=booking.student_name,
            student_email=booking.student_email,
        )
    else:
        description = (
            f"Consultation with {booking.student_name} ({booking.student_email})"
        )

    if not booking_manage_url:
        token = resolve_booking_manage_token(booking)
        if token:
            booking_manage_url = build_booking_manage_url(token)

    if booking_manage_url:
        description = f"{description}\n\nView or cancel booking:\n{booking_manage_url}"

    return description


def grouped_subject_options_for_strategy(strategy: str) -> dict[str, list[dict[str, object]]]:
    if strategy != STRATEGY_LWTP:
        return {}
    return lwtp_strategy.grouped_subject_options()
