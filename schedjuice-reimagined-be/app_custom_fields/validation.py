from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable
from urllib.parse import urlparse

import regex

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email as django_validate_email
from django.utils.dateparse import parse_date, parse_datetime
from utilitas.exceptions import field_validation_error

from app_custom_fields.constants import (
    ENTITY_TYPE_USER,
    FILLED_BY_ADMIN,
    FILLED_BY_USER,
    REQUIRED_AT_REGISTRATION,
    SOURCE_BUILTIN,
)
from app_custom_fields.models import CustomFieldAttachment, FieldDefinition

TEXT_DEFAULT_MAX_LENGTH = 100
MAX_PATTERN_LENGTH = 200
PATTERN_TIMEOUT_SECONDS = 0.1


def active_definitions_qs(entity_type: str):
    return (
        FieldDefinition.objects.filter(
            entity_type=entity_type,
            is_active=True,
        )
        .select_related("group")
        .order_by("sort_order", "id")
    )


def _is_empty_value(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and val.strip() == "":
        return True
    if isinstance(val, (list, dict)) and len(val) == 0:
        return True
    return False


def _choice_values(defn: FieldDefinition) -> list[str]:
    raw = defn.choices or []
    out = []
    for item in raw:
        if not isinstance(item, dict):
            field_validation_error(
                "choices", "Each choice must be an object with value and label."
            )
        v = item.get("value")
        if v is None or not isinstance(v, str):
            field_validation_error("choices", "Each choice must have a string value.")
        out.append(v)
    return out


def _apply_text_rules(defn: FieldDefinition, s: str, key: str) -> str:
    rules = defn.validation_rules or {}
    max_len = rules.get("max_length")
    if max_len is None:
        max_len = TEXT_DEFAULT_MAX_LENGTH
    min_len = rules.get("min_length")
    if min_len is not None and len(s) < int(min_len):
        field_validation_error(f"custom_data.{key}", f"Minimum length is {min_len}.")
    if len(s) > int(max_len):
        field_validation_error(f"custom_data.{key}", f"Maximum length is {max_len}.")
    pattern = rules.get("pattern")
    if pattern:
        pattern = str(pattern)
        if len(pattern) > MAX_PATTERN_LENGTH:
            field_validation_error(
                f"custom_data.{key}", "Validation pattern is too long."
            )
        try:
            matched = regex.search(pattern, s, timeout=PATTERN_TIMEOUT_SECONDS)
        except regex.error:
            field_validation_error(
                f"custom_data.{key}", "Invalid validation pattern."
            )
        except TimeoutError:
            field_validation_error(
                f"custom_data.{key}", "Validation pattern timed out."
            )
        if not matched:
            field_validation_error(
                f"custom_data.{key}", "Value does not match required pattern."
            )
    return s


def _existing_attachment_ids(existing: dict | None, key: str) -> set[int]:
    ids: set[int] = set()
    for item in (existing or {}).get(key) or []:
        if isinstance(item, dict) and item.get("id") is not None:
            try:
                ids.add(int(item["id"]))
            except (TypeError, ValueError):
                continue
    return ids


def _coerce_attachment(
    defn: FieldDefinition,
    raw: Any,
    key: str,
    *,
    existing_ids: set[int],
    actor_user,
) -> list[dict]:
    if not isinstance(raw, list):
        field_validation_error(f"custom_data.{key}", "Expected a list of attachments.")
    max_files = int((defn.validation_rules or {}).get("max_files") or 1)
    if len(raw) > max_files:
        field_validation_error(f"custom_data.{key}", f"At most {max_files} file(s).")

    ids: list[int] = []
    for item in raw:
        candidate = item.get("id") if isinstance(item, dict) else item
        try:
            ids.append(int(candidate))
        except (TypeError, ValueError):
            field_validation_error(f"custom_data.{key}", "Invalid attachment reference.")
    if len(set(ids)) != len(ids):
        field_validation_error(f"custom_data.{key}", "Duplicate attachment.")

    if not ids:
        return []

    links = {
        link.attachment_id: link
        for link in CustomFieldAttachment.objects.select_related("attachment").filter(
            attachment_id__in=ids,
            entity_type=defn.entity_type,
            field_key=defn.field_key,
            attachment__is_deleted=False,
        )
    }

    out: list[dict] = []
    for att_id in ids:
        link = links.get(att_id)
        owned = (
            link is not None
            and actor_user is not None
            and link.uploaded_by_id == getattr(actor_user, "id", None)
        )
        if link is None or not (owned or att_id in existing_ids):
            field_validation_error(f"custom_data.{key}", "Unknown attachment.")
        att = link.attachment
        out.append(
            {
                "id": att.id,
                "filename": att.filename,
                "size": att.size,
                "mime": att.file_type,
            }
        )
    return out


def _coerce_and_validate(
    defn: FieldDefinition,
    raw: Any,
    key: str,
    *,
    existing_ids: set[int] | None = None,
    actor_user=None,
) -> Any:
    ft = defn.field_type
    rules = defn.validation_rules or {}

    if ft == FieldDefinition.FieldType.BOOLEAN:
        if isinstance(raw, bool):
            return raw
        if raw in (1, "1", "true", "True"):
            return True
        if raw in (0, "0", "false", "False"):
            return False
        field_validation_error(f"custom_data.{key}", "Expected a boolean.")

    if ft == FieldDefinition.FieldType.NUMBER:
        try:
            n = Decimal(str(raw))
        except (InvalidOperation, TypeError, ValueError):
            field_validation_error(f"custom_data.{key}", "Expected a number.")
        if rules.get("integer_only") and n != n.to_integral_value():
            field_validation_error(f"custom_data.{key}", "Expected an integer.")
        if "min" in rules and n < Decimal(str(rules["min"])):
            field_validation_error(f"custom_data.{key}", f'Must be >= {rules["min"]}.')
        if "max" in rules and n > Decimal(str(rules["max"])):
            field_validation_error(f"custom_data.{key}", f'Must be <= {rules["max"]}.')
        return float(n) if not rules.get("integer_only") else int(n)

    if ft == FieldDefinition.FieldType.DATE:
        if isinstance(raw, dt.datetime):
            d = raw.date()
        elif isinstance(raw, dt.date):
            d = raw
        else:
            d = parse_date(str(raw))
        if not d:
            field_validation_error(f"custom_data.{key}", "Expected a date (YYYY-MM-DD).")
        min_rule = rules.get("min")
        if min_rule is not None:
            min_d = parse_date(str(min_rule))
            if min_d and d < min_d:
                field_validation_error(f"custom_data.{key}", "Date is before minimum.")
        max_rule = rules.get("max")
        if max_rule is not None:
            max_d = parse_date(str(max_rule))
            if max_d and d > max_d:
                field_validation_error(f"custom_data.{key}", "Date is after maximum.")
        return d.isoformat()

    if ft == FieldDefinition.FieldType.DATETIME:
        if isinstance(raw, dt.datetime):
            parsed = raw
        else:
            parsed = parse_datetime(str(raw).replace("Z", "+00:00"))
        if not parsed:
            field_validation_error(f"custom_data.{key}", "Expected a datetime (ISO 8601).")

        def _aware(value: dt.datetime) -> dt.datetime:
            if value.tzinfo is None:
                return value.replace(tzinfo=dt.timezone.utc)
            return value

        for rule_key, message, op in (
            ("min", "Datetime is before minimum.", lambda a, b: a < b),
            ("max", "Datetime is after maximum.", lambda a, b: a > b),
        ):
            bound_raw = rules.get(rule_key)
            if bound_raw is None:
                continue
            bound = parse_datetime(str(bound_raw).replace("Z", "+00:00"))
            if bound and op(_aware(parsed), _aware(bound)):
                field_validation_error(f"custom_data.{key}", message)
        return parsed.isoformat()

    if ft in (FieldDefinition.FieldType.TEXT, FieldDefinition.FieldType.TEXTAREA):
        s = str(raw)
        return _apply_text_rules(defn, s, key)

    if ft == FieldDefinition.FieldType.EMAIL:
        s = str(raw)
        s = _apply_text_rules(defn, s, key)
        try:
            django_validate_email(s)
        except DjangoValidationError:
            field_validation_error(f"custom_data.{key}", "Invalid email.")
        return s

    if ft == FieldDefinition.FieldType.URL:
        s = str(raw)
        s = _apply_text_rules(defn, s, key)
        parsed = urlparse(s)
        if not parsed.scheme or not parsed.netloc:
            field_validation_error(f"custom_data.{key}", "Invalid URL.")
        return s

    if ft == FieldDefinition.FieldType.CHOICE:
        allowed = _choice_values(defn)
        v = str(raw)
        if v not in allowed:
            field_validation_error(f"custom_data.{key}", "Invalid choice.")
        return v

    if ft == FieldDefinition.FieldType.MULTICHOICE:
        allowed = set(_choice_values(defn))
        if not isinstance(raw, list):
            field_validation_error(f"custom_data.{key}", "Expected a list of choices.")
        max_sel = (defn.validation_rules or {}).get("max_selections")
        if max_sel is not None and len(raw) > int(max_sel):
            field_validation_error(f"custom_data.{key}", "Too many selections.")
        out = []
        for item in raw:
            sv = str(item)
            if sv not in allowed:
                field_validation_error(f"custom_data.{key}", "Invalid multichoice value.")
            out.append(sv)
        return out

    if ft == FieldDefinition.FieldType.ATTACHMENT:
        return _coerce_attachment(
            defn,
            raw,
            key,
            existing_ids=existing_ids or set(),
            actor_user=actor_user,
        )

    field_validation_error(f"custom_data.{key}", f"Unsupported field type {ft}.")


def _roles_match(defn, subject_roles) -> bool:
    """True if the definition applies to the subject (empty roles = applies to all)."""
    roles = set(defn.roles or [])
    if not roles:
        return True
    if subject_roles is None:
        return True
    return bool(roles & set(subject_roles))


def validate_custom_data_for_write(
    *,
    entity_type: str,
    incoming: dict | None,
    existing: dict | None,
    partial: bool,
    stage: str = "edit",
    subject_roles=None,
    actor: str = "admin",
    definitions=None,
    allow_user_admin_keys: Iterable[str] | None = None,
    skip_registration_required: bool = False,
    actor_user=None,
) -> dict:
    """Validate a model's custom_data JSON against active FieldDefinitions.

    - Built-in rows (source=builtin) are ignored here: their values live in model
      columns, not custom_data.
    - Hard requiredness is enforced ONLY for required_at=registration fields whose
      roles match the subject. These are the floor: required on create AND not
      clearable on edit. profile_completion fields are never write-blocking; they
      only affect computed completeness.
    - actor: "user" self-service writes cannot set filled_by=admin fields.
    - skip_registration_required: when True (valid DVR verify write), do not enforce
      the registration floor — DVR requiredness is checked when marking verified.
    - partial: when True, registration-required is enforced only for keys present in
      incoming (section-scoped PATCH/PUT). Unrelated empty required fields are skipped.
    - stage is accepted for symmetry/intent and future use; it does not currently
      change which fields are hard-enforced (always the registration floor).
    """
    existing = dict(existing) if isinstance(existing, dict) else {}
    incoming = {} if incoming is None else incoming
    if not isinstance(incoming, dict):
        field_validation_error("custom_data", "Must be a JSON object.")

    source_defs = (
        definitions if definitions is not None else active_definitions_qs(entity_type)
    )
    all_defs = {d.field_key: d for d in source_defs}
    # Custom rows only; built-in keys are not stored in custom_data.
    defs = {k: d for k, d in all_defs.items() if d.source != SOURCE_BUILTIN}
    allow = set(allow_user_admin_keys or ())

    for k in incoming:
        if k not in defs:
            field_validation_error(f"custom_data.{k}", "Unknown custom field key.")
        if (
            actor == FILLED_BY_USER
            and defs[k].filled_by == FILLED_BY_ADMIN
            and k not in allow
        ):
            field_validation_error(
                f"custom_data.{k}", "This field can only be set by staff."
            )

    merged = {**existing, **incoming}

    if not skip_registration_required:
        for key, defn in defs.items():
            if defn.required_at != REQUIRED_AT_REGISTRATION:
                continue
            if not _roles_match(defn, subject_roles):
                continue
            if partial and key not in incoming:
                continue
            if _is_empty_value(merged.get(key)):
                field_validation_error(f"custom_data.{key}", "This field is required.")

    out: dict[str, Any] = {}
    for key, val in merged.items():
        if key not in defs:
            out[key] = val
            continue
        defn = defs[key]
        if _is_empty_value(val):
            continue
        existing_ids = _existing_attachment_ids(existing, key)
        out[key] = _coerce_and_validate(
            defn,
            val,
            key,
            existing_ids=existing_ids,
            actor_user=actor_user,
        )

    return out


def validate_user_custom_data_for_write(
    *,
    incoming: dict | None,
    existing: dict | None,
    partial: bool,
    stage: str = "edit",
    subject_roles=None,
    actor: str = "admin",
    allow_user_admin_keys: Iterable[str] | None = None,
    skip_registration_required: bool = False,
    definitions=None,
    actor_user=None,
) -> dict:
    """Validate User.custom_data (convenience wrapper)."""
    return validate_custom_data_for_write(
        entity_type=ENTITY_TYPE_USER,
        incoming=incoming,
        existing=existing,
        partial=partial,
        stage=stage,
        subject_roles=subject_roles,
        actor=actor,
        allow_user_admin_keys=allow_user_admin_keys,
        skip_registration_required=skip_registration_required,
        definitions=definitions,
        actor_user=actor_user,
    )


_CUSTOM_FIELD_REP_KEYS_CACHE_ATTR = "_schedjuice_custom_field_rep_keys"


def prime_custom_field_representation_cache(request) -> None:
    """Load all active custom-field keys once per request (avoids per-entity-type queries)."""
    if request is None:
        return
    cache = getattr(request, _CUSTOM_FIELD_REP_KEYS_CACHE_ATTR, None)
    if cache is not None and "__all__" in cache:
        return
    cache = {}
    for row in FieldDefinition.objects.filter(is_active=True).values(
        "entity_type", "field_key"
    ):
        cache.setdefault(row["entity_type"], set()).add(row["field_key"])
    for entity_type, keys in cache.items():
        cache[entity_type] = frozenset(keys)
    cache["__all__"] = True
    setattr(request, _CUSTOM_FIELD_REP_KEYS_CACHE_ATTR, cache)


def _rep_keys_cache(request) -> dict | None:
    """Return a real dict cache on request, or None when request cannot host one."""
    if request is None:
        return None
    cache = getattr(request, _CUSTOM_FIELD_REP_KEYS_CACHE_ATTR, None)
    if not isinstance(cache, dict):
        cache = {}
        setattr(request, _CUSTOM_FIELD_REP_KEYS_CACHE_ATTR, cache)
    return cache


def prime_representation_keys_from_definitions(
    request,
    entity_type: str,
    definitions,
) -> None:
    """Reuse an already-loaded definition list for representation filtering."""
    cache = _rep_keys_cache(request)
    if cache is None:
        return
    cache[entity_type] = frozenset(d.field_key for d in definitions)


def representation_custom_data(
    entity_type: str,
    instance_custom_data: dict | None,
    request=None,
) -> dict:
    """Return custom_data restricted to keys with active definitions for this entity type."""
    data = instance_custom_data if isinstance(instance_custom_data, dict) else {}
    keys: frozenset[str] | None = None
    cache = _rep_keys_cache(request)
    if cache is not None:
        if cache.get("__all__"):
            # Primed: missing entity_type means no active defs (do not re-query).
            keys = cache.get(entity_type, frozenset())
        else:
            keys = cache.get(entity_type)
            if keys is not None and not isinstance(keys, frozenset):
                keys = None
    if keys is None:
        keys = frozenset(d.field_key for d in active_definitions_qs(entity_type))
        if cache is not None:
            cache[entity_type] = keys
    return {k: v for k, v in data.items() if k in keys}
