"""Atomic bulk reorder/regroup for FieldDefinition and FieldGroup rows.

Only sort_order (and, for definitions, group) are mutated. This deliberately
bypasses the full definition serializer: reordering must work for builtin rows
too, where source/field_key/field_type/entity_type are locked but group and
sort_order remain policy-controllable.
"""

from django.db import transaction

from app_custom_fields.constants import ALLOWED_DEFINITION_ENTITY_TYPES


class ReorderError(Exception):
    """Raised for malformed reorder payloads. Mapped to HTTP 400 by the view."""


def _coerce_items(items):
    if not isinstance(items, list):
        raise ReorderError("items must be a list.")
    cleaned = []
    for i, raw in enumerate(items):
        if not isinstance(raw, dict):
            raise ReorderError(f"items[{i}] must be an object.")
        if "id" not in raw:
            raise ReorderError(f"items[{i}] is missing id.")
        try:
            row = {"id": int(raw["id"]), "sort_order": int(raw.get("sort_order", i))}
        except (TypeError, ValueError):
            raise ReorderError(f"items[{i}] has a non-integer id or sort_order.")
        if "group_id" in raw:
            gid = raw["group_id"]
            row["group_id"] = None if gid in (None, "", "null") else int(gid)
        cleaned.append(row)
    return cleaned


def apply_reorder(*, model, entity_type, items, group_model, allow_group):
    if entity_type not in ALLOWED_DEFINITION_ENTITY_TYPES:
        raise ReorderError("Unsupported entity_type.")
    cleaned = _coerce_items(items)
    if not cleaned:
        return 0

    ids = [row["id"] for row in cleaned]
    objs = {
        o.id: o
        for o in model.objects.filter(
            id__in=ids, entity_type=entity_type, is_active=True
        )
    }
    missing = [i for i in ids if i not in objs]
    if missing:
        raise ReorderError(f"Unknown or inactive ids for this entity: {missing}.")

    if allow_group:
        wanted = {
            row["group_id"]
            for row in cleaned
            if "group_id" in row and row["group_id"] is not None
        }
        if wanted:
            valid_group_ids = set(
                group_model.objects.filter(
                    id__in=wanted, entity_type=entity_type, is_active=True
                ).values_list("id", flat=True)
            )
            bad = wanted - valid_group_ids
            if bad:
                raise ReorderError(f"Unknown or inactive group ids: {sorted(bad)}.")

    update_fields = {"sort_order", "updated_at"}
    with transaction.atomic():
        to_update = []
        for row in cleaned:
            obj = objs[row["id"]]
            obj.sort_order = row["sort_order"]
            if allow_group and "group_id" in row:
                obj.group_id = row["group_id"]
                update_fields.add("group_id")
            to_update.append(obj)
        model.objects.bulk_update(to_update, list(update_fields))
    return len(to_update)
