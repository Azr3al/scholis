"""Per-user AI preference storage and prompt assembly."""
from __future__ import annotations

import re

from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences
from app_organization.models import Organization

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

_LANGUAGE_LABELS = {
    UserAIPreferences.ResponseLanguage.EN: "English only",
    UserAIPreferences.ResponseLanguage.MY: "Burmese only",
}
_TONE_LABELS = {
    UserAIPreferences.Tone.FORMAL: "formal",
    UserAIPreferences.Tone.CASUAL: "casual",
}
_VERBOSITY_LABELS = {
    UserAIPreferences.Verbosity.BRIEF: "be brief",
    UserAIPreferences.Verbosity.DETAILED: "be detailed",
}


def normalize_preferred_name(value: str | None) -> str:
    text = (value or "").strip()
    if _CONTROL_CHARS.search(text):
        raise ValueError("preferred_name contains invalid characters")
    return text[:64]


def get_preferences_for_user(user: User) -> UserAIPreferences | None:
    return UserAIPreferences.objects.filter(user_id=user.pk).first()


def preferences_to_dict(
    prefs: UserAIPreferences | None,
    *,
    user_id: int,
    tenant: Organization | None = None,
) -> dict:
    base = {
        "user_id": user_id,
        "response_language": UserAIPreferences.ResponseLanguage.AUTO,
        "tone": UserAIPreferences.Tone.DEFAULT,
        "verbosity": UserAIPreferences.Verbosity.DEFAULT,
        "preferred_name": "",
        "monthly_usd_limit": None,
        "updated_at": None,
    }
    if prefs is not None:
        base.update(
            {
                "response_language": prefs.response_language,
                "tone": prefs.tone,
                "verbosity": prefs.verbosity,
                "preferred_name": prefs.preferred_name,
                "monthly_usd_limit": (
                    str(prefs.monthly_usd_limit)
                    if prefs.monthly_usd_limit is not None
                    else None
                ),
                "updated_at": prefs.updated_at.isoformat() if prefs.updated_at else None,
            }
        )
    if tenant is not None:
        from app_ai.quota import user_budget_snapshot

        snapshot = user_budget_snapshot(tenant, user_id)
        base["effective_monthly_usd_limit"] = snapshot["monthly_usd_limit"]
        base["limit_source"] = snapshot["limit_source"]
    return base


def upsert_preferences(user: User, **fields) -> UserAIPreferences:
    if fields.pop("clear_preferred_name", False):
        fields["preferred_name"] = ""
    if "preferred_name" in fields and fields["preferred_name"] is not None:
        fields["preferred_name"] = normalize_preferred_name(fields["preferred_name"])

    updates: dict = {}
    for key in ("response_language", "tone", "verbosity", "preferred_name", "monthly_usd_limit"):
        if key in fields:
            updates[key] = fields[key]
    if "preferred_name" in fields and fields["preferred_name"] == "":
        updates["preferred_name"] = ""

    prefs, _ = UserAIPreferences.objects.get_or_create(user=user)
    for key, value in updates.items():
        setattr(prefs, key, value)
    prefs.save()
    return prefs


def build_user_preferences_context(user: User) -> str:
    prefs = get_preferences_for_user(user)
    if prefs is None:
        return ""

    lines: list[str] = []
    if prefs.response_language != UserAIPreferences.ResponseLanguage.AUTO:
        lines.append(f"- Respond in: {_LANGUAGE_LABELS[prefs.response_language]}")
    tone = _TONE_LABELS.get(prefs.tone, "")
    if tone:
        lines.append(f"- Tone: {tone}")
    verbosity = _VERBOSITY_LABELS.get(prefs.verbosity, "")
    if verbosity:
        lines.append(f"- Verbosity: {verbosity}")
    if prefs.preferred_name.strip():
        lines.append(f"- Address the user as: {prefs.preferred_name.strip()}")

    if not lines:
        return ""
    return "User preferences:\n" + "\n".join(lines)
