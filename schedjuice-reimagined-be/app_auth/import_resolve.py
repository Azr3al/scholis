"""Bulk email -> user resolution for the Import Wizard (single query)."""
from __future__ import annotations

from app_auth.models import User
from app_organization.acca_spreadsheet_import import normalize_email

USER_REF_FIELDS = ("id", "name", "email", "code", "profile_image", "roles")


def resolve_users_by_email(emails: list[str]) -> dict[str, dict | None]:
    normalized: dict[str, str] = {}
    for email in emails:
        norm = normalize_email(email)
        if norm:
            normalized[norm] = email

    if not normalized:
        return {}

    found = {
        normalize_email(row["email"]): row
        for row in User.objects.filter(email__in=list(normalized.keys())).values(
            *USER_REF_FIELDS
        )
    }
    return {original: found.get(norm) for norm, original in normalized.items()}
