"""Validate-then-bulk-write commit for the user import wizard."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import ValidationError as DRFValidationError

from app_auth.models import User
from app_auth.user_code import assign_code_if_blank, reconcile_counters_from_existing_codes
from app_course.membership_history import MembershipEventInput, record_membership_events_bulk
from app_course.models import Course, UserCourse
from app_custom_fields.builtin_fields import builtin_fields_for_entity, get_builtin_field
from app_custom_fields.completeness import compute_profile_completeness
from app_custom_fields.constants import ENTITY_TYPE_USER
from app_custom_fields.models import FieldDefinition
from app_custom_fields.validation import (
    active_definitions_qs,
    validate_custom_data_for_write,
)
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD, normalize_email

IDENTITY_FIELDS = ("email", "name", "phone_number", "communication_email")
BULK_BATCH_SIZE = 500
VALID_DUPLICATE_STRATEGIES = frozenset({"keep_first", "keep_last", "merge"})

_BUILTIN_KEYS = tuple(builtin_fields_for_entity(ENTITY_TYPE_USER).keys())


def _parse_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    s = str(value).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _coerce_builtin_value(field_key: str, raw) -> tuple[object | None, str | None]:
    """Return (coerced_value, error_reason)."""
    if raw is None or raw == "":
        return None, None
    spec = get_builtin_field(ENTITY_TYPE_USER, field_key)
    if spec is None:
        return raw, None
    ft = spec.field_type
    if ft == "date":
        parsed = _parse_date(raw)
        if parsed is None:
            return None, "Invalid date."
        return parsed, None
    if ft == "choice":
        choices = spec.resolve_choices() or []
        s = str(raw).strip()
        for c in choices:
            if s.lower() == c["value"].lower() or s.lower() == c["label"].lower():
                return c["value"], None
        return None, "Not an allowed choice."
    if ft == "boolean":
        s = str(raw).strip().lower()
        if s in ("true", "1", "yes", "y"):
            return True, None
        if s in ("false", "0", "no", "n"):
            return False, None
        return None, "Invalid boolean."
    if ft == "number":
        try:
            return float(Decimal(str(raw).replace(",", ""))), None
        except (InvalidOperation, ValueError):
            return None, "Not a number."
    return str(raw).strip(), None


def _builtin_values(row: dict) -> tuple[dict, list[dict]]:
    errors: list[dict] = []
    out: dict = {}
    for key in _BUILTIN_KEYS:
        if key not in row or row[key] in (None, ""):
            continue
        coerced, reason = _coerce_builtin_value(key, row[key])
        if reason:
            errors.append({"field": key, "reason": reason})
        elif coerced is not None:
            out[key] = coerced
    return out, errors


def validate_import_rows(*, rows: list[dict], role: str):
    """Return (errors, prepared). errors: [{row, field, reason}]."""
    errors: list[dict] = []
    prepared: list[dict] = []
    defs = list(active_definitions_qs(ENTITY_TYPE_USER))

    defs = list(active_definitions_qs(ENTITY_TYPE_USER))
    attachment_keys = {
        d.field_key
        for d in defs
        if d.field_type == FieldDefinition.FieldType.ATTACHMENT
    }

    for index, row in enumerate(rows):
        row_errors: list[dict] = []
        email = normalize_email(row.get("email"))
        if not email:
            row_errors.append(
                {"row": index, "field": "email", "reason": "Email is required."}
            )

        identity = {
            k: row.get(k)
            for k in IDENTITY_FIELDS
            if row.get(k) not in (None, "")
        }
        identity["email"] = email
        if not identity.get("phone_number"):
            identity["phone_number"] = "-"
        if not identity.get("communication_email") and email:
            identity["communication_email"] = email
        if row.get("code") not in (None, ""):
            identity["code"] = str(row.get("code")).strip()

        builtins, builtin_errors = _builtin_values(row)
        for be in builtin_errors:
            row_errors.append({"row": index, "field": be["field"], "reason": be["reason"]})

        probe = User(roles=[role], **identity, **builtins)
        for field_name, value in {**identity, **builtins}.items():
            if field_name == "roles":
                continue
            try:
                User._meta.get_field(field_name).clean(value, probe)
            except DjangoValidationError as exc:
                row_errors.append(
                    {
                        "row": index,
                        "field": field_name,
                        "reason": " ".join(exc.messages),
                    }
                )

        custom_data = {}
        try:
            incoming_cd = {
                k: v
                for k, v in (row.get("custom_data") or {}).items()
                if k not in attachment_keys
            }
            custom_data = validate_custom_data_for_write(
                entity_type=ENTITY_TYPE_USER,
                incoming=incoming_cd,
                existing={},
                partial=False,
                subject_roles=[role],
                actor="admin",
                definitions=defs,
                skip_registration_required=True,
            )
        except DRFValidationError as exc:
            for field, detail in exc.detail.items():
                reason = detail[0] if isinstance(detail, list) else str(detail)
                key = field.split(".", 1)[-1]
                row_errors.append({"row": index, "field": key, "reason": str(reason)})

        course_ids = row.get("course_ids") or []
        if not isinstance(course_ids, list):
            row_errors.append(
                {
                    "row": index,
                    "field": "courses",
                    "reason": "course_ids must be a list.",
                }
            )
        else:
            for cid in course_ids:
                if not isinstance(cid, int):
                    row_errors.append(
                        {
                            "row": index,
                            "field": "courses",
                            "reason": "Invalid course id.",
                        }
                    )
                    break

        if row_errors:
            errors.extend(row_errors)
            continue

        prepared.append(
            {
                "row": index,
                "email": email,
                "identity": identity,
                "builtins": builtins,
                "custom_data": custom_data,
                "course_ids": [int(c) for c in course_ids],
                "match_user_id": (
                    int(row["match_user_id"])
                    if isinstance(row.get("match_user_id"), int)
                    or (
                        isinstance(row.get("match_user_id"), str)
                        and str(row["match_user_id"]).isdigit()
                    )
                    else None
                ),
            }
        )

    return errors, prepared


def _is_blank(value) -> bool:
    return value in (None, "")


def _merge_prepared_rows(group: list[dict]) -> dict:
    """Merge duplicate prepared rows: fill-blank fields, union course ids."""
    merged = {
        "row": group[0]["row"],
        "email": group[0]["email"],
        "identity": dict(group[0]["identity"]),
        "builtins": dict(group[0]["builtins"]),
        "custom_data": dict(group[0]["custom_data"]),
        "course_ids": list(group[0]["course_ids"]),
    }
    seen_courses = set(merged["course_ids"])

    for row in group[1:]:
        for key, value in row["identity"].items():
            if key == "email":
                continue
            if _is_blank(merged["identity"].get(key)) and not _is_blank(value):
                merged["identity"][key] = value
        for key, value in row["builtins"].items():
            if _is_blank(merged["builtins"].get(key)) and not _is_blank(value):
                merged["builtins"][key] = value
        for key, value in row["custom_data"].items():
            if _is_blank(merged["custom_data"].get(key)) and not _is_blank(value):
                merged["custom_data"][key] = value
        for cid in row["course_ids"]:
            if cid not in seen_courses:
                seen_courses.add(cid)
                merged["course_ids"].append(cid)

    return merged


def dedupe_prepared_rows(
    prepared: list[dict],
    *,
    strategy: str = "keep_first",
) -> list[dict]:
    """Collapse in-file duplicate emails before commit."""
    if strategy not in VALID_DUPLICATE_STRATEGIES:
        strategy = "keep_first"

    by_email: dict[str, list[dict]] = {}
    order: list[str] = []
    for row in prepared:
        email = row["email"].lower()
        if email not in by_email:
            by_email[email] = []
            order.append(email)
        by_email[email].append(row)

    result: list[dict] = []
    for email in order:
        group = by_email[email]
        if len(group) == 1:
            result.append(group[0])
            continue
        if strategy == "keep_last":
            result.append(group[-1])
        elif strategy == "merge":
            result.append(_merge_prepared_rows(group))
        else:
            result.append(group[0])
    return result


def commit_import_rows(*, prepared: list[dict], role: str) -> dict:
    emails = [p["email"] for p in prepared]
    course_ids = {cid for p in prepared for cid in p["course_ids"]}

    is_staff = role != User.UserRole.STUDENT
    hashed = make_password(IMPORT_PASSWORD)

    with transaction.atomic():
        existing = {u.email.lower(): u for u in User.objects.filter(email__in=emails)}
        match_ids = [p.get("match_user_id") for p in prepared if p.get("match_user_id")]
        existing_by_id = (
            {u.id: u for u in User.objects.filter(id__in=match_ids)} if match_ids else {}
        )
        valid_course_ids = set(
            Course.objects.filter(id__in=course_ids).values_list("id", flat=True)
        )
        existing_enroll = {
            (email.lower(), cid)
            for email, cid in UserCourse.objects.filter(
                user__email__in=emails, course_id__in=valid_course_ids
            ).values_list("user__email", "course_id")
        }

        to_create: list[User] = []
        to_update: list[User] = []
        update_fields: set[str] = set()

        for p in prepared:
            current = existing_by_id.get(p.get("match_user_id")) or existing.get(
                p["email"].lower()
            )
            if current is None:
                user = User(
                    password=hashed,
                    roles=[role],
                    is_active=True,
                    is_staff=is_staff,
                    is_password_change_required=True,
                    custom_data=p["custom_data"],
                    **p["identity"],
                    **p["builtins"],
                )
                assign_code_if_blank(user)
                to_create.append(user)
            else:
                changed = False
                for key, value in {**p["identity"], **p["builtins"]}.items():
                    if key == "email":
                        continue
                    if getattr(current, key, None) in (None, "") and value not in (
                        None,
                        "",
                    ):
                        setattr(current, key, value)
                        update_fields.add(key)
                        changed = True
                merged_cd = dict(current.custom_data or {})
                for k, v in p["custom_data"].items():
                    if merged_cd.get(k) in (None, "") and v not in (None, ""):
                        merged_cd[k] = v
                        changed = True
                if merged_cd != (current.custom_data or {}):
                    current.custom_data = merged_cd
                    update_fields.add("custom_data")
                if changed:
                    to_update.append(current)

        if to_create:
            User.objects.bulk_create(to_create, batch_size=BULK_BATCH_SIZE)
            reconcile_counters_from_existing_codes()
        if to_update:
            User.objects.bulk_update(
                to_update, list(update_fields), batch_size=BULK_BATCH_SIZE
            )

        users_by_email = {
            u.email.lower(): u for u in User.objects.filter(email__in=emails)
        }
        for p in prepared:
            mid = p.get("match_user_id")
            if mid and mid in existing_by_id:
                users_by_email[p["email"].lower()] = existing_by_id[mid]
        new_enroll: list[UserCourse] = []
        seen = set(existing_enroll)
        for p in prepared:
            user = users_by_email.get(p["email"].lower())
            if user is None:
                continue
            for cid in p["course_ids"]:
                if cid not in valid_course_ids:
                    continue
                key = (p["email"].lower(), cid)
                if key in seen:
                    continue
                seen.add(key)
                new_enroll.append(
                    UserCourse(
                        user_id=user.id,
                        course_id=cid,
                        assigned_as=UserCourse.AssignedAs.STUDENT,
                    )
                )
        if new_enroll:
            enroll_user_ids = {uc.user_id for uc in new_enroll}
            enroll_course_ids = {uc.course_id for uc in new_enroll}
            before_pairs = set(
                UserCourse.objects.filter(
                    user_id__in=enroll_user_ids,
                    course_id__in=enroll_course_ids,
                ).values_list("user_id", "course_id")
            )
            UserCourse.objects.bulk_create(
                new_enroll, batch_size=BULK_BATCH_SIZE, ignore_conflicts=True
            )
            after_pairs = set(
                UserCourse.objects.filter(
                    user_id__in=enroll_user_ids,
                    course_id__in=enroll_course_ids,
                ).values_list("user_id", "course_id")
            )
            newly_created_pairs = after_pairs - before_pairs
            joined_events = [
                MembershipEventInput(
                    course_id=uc.course_id,
                    user_id=uc.user_id,
                    event_type="joined",
                    actor_id=None,
                    source="import",
                )
                for uc in new_enroll
                if (uc.user_id, uc.course_id) in newly_created_pairs
            ]
            if joined_events:
                record_membership_events_bulk(
                    joined_events,
                    batch_size=BULK_BATCH_SIZE,
                )
            new_enroll = [
                uc
                for uc in new_enroll
                if (uc.user_id, uc.course_id) in newly_created_pairs
            ]

        completeness_updates = []
        for user in users_by_email.values():
            percent = compute_profile_completeness(user)["percent"]
            if user.profile_completeness != percent:
                user.profile_completeness = percent
                completeness_updates.append(user)
        if completeness_updates:
            User.objects.bulk_update(
                completeness_updates,
                ["profile_completeness"],
                batch_size=BULK_BATCH_SIZE,
            )

    def _is_new(p: dict) -> bool:
        if p.get("match_user_id") and p["match_user_id"] in existing_by_id:
            return False
        return p["email"].lower() not in existing

    created = sum(1 for p in prepared if _is_new(p))
    updated = len(to_update)
    created_user_ids = [
        users_by_email[p["email"].lower()].id
        for p in prepared
        if _is_new(p) and p["email"].lower() in users_by_email
    ]
    return {
        "created": created,
        "updated": updated,
        "enrolled": len(new_enroll),
        "created_user_ids": created_user_ids,
    }
