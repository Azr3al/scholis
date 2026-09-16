"""Profile completeness over policy-required fields (built-in + custom)."""

from app_custom_fields.constants import (
    ENTITY_TYPE_USER,
    REQUIRED_AT_NEVER,
    SOURCE_BUILTIN,
)
from app_custom_fields.validation import _is_empty_value, active_definitions_qs


def _value_for(user, defn):
    if defn.source == SOURCE_BUILTIN:
        return getattr(user, defn.field_key, None)
    data = getattr(user, "custom_data", None) or {}
    return data.get(defn.field_key)


def compute_profile_completeness(
    user,
    entity_type: str = ENTITY_TYPE_USER,
    *,
    definitions=None,
) -> dict:
    """Return {"percent": int, "missing": [{"field_key","field_label","filled_by","source"}]}.

    Considers only active definitions whose required_at != never and whose roles
    (if any) intersect the user's roles.
    """
    subject_roles = set(getattr(user, "roles", []) or [])
    source_defs = (
        definitions if definitions is not None else active_definitions_qs(entity_type)
    )
    relevant = []
    for defn in source_defs:
        if defn.required_at == REQUIRED_AT_NEVER:
            continue
        roles = set(defn.roles or [])
        if roles and not (roles & subject_roles):
            continue
        relevant.append(defn)

    if not relevant:
        return {"percent": 100, "missing": []}

    missing = []
    for defn in relevant:
        if _is_empty_value(_value_for(user, defn)):
            missing.append(
                {
                    "field_key": defn.field_key,
                    "field_label": defn.field_label,
                    "filled_by": defn.filled_by,
                    "source": defn.source,
                }
            )

    filled = len(relevant) - len(missing)
    percent = round(filled * 100 / len(relevant))
    return {"percent": percent, "missing": missing}
