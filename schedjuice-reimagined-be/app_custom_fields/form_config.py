"""Build the resolved groups->fields payload for a surface and set of roles."""

from app_custom_fields.builtin_fields import get_builtin_field
from app_custom_fields.constants import ENTITY_TYPE_USER, FILLED_BY_ADMIN, SOURCE_BUILTIN
from app_custom_fields.validation import active_definitions_qs

_SURFACE_FLAG = {
    "create": "show_on_create",
    "edit": "show_on_edit",
    "detail": "show_on_detail",
}

_UNGROUPED_NAME = "General"


def _field_payload(defn, entity_type):
    field_type = defn.field_type
    choices = defn.choices
    label = defn.field_label
    if defn.source == SOURCE_BUILTIN:
        spec = get_builtin_field(entity_type, defn.field_key)
        if spec is not None:
            field_type = spec.field_type
            if not label:
                label = spec.default_label
            resolved = spec.resolve_choices()
            if resolved is not None:
                choices = resolved
    return {
        "id": defn.id,
        "source": defn.source,
        "field_key": defn.field_key,
        "field_label": label,
        "field_type": field_type,
        "choices": choices,
        "description": defn.description,
        "required_at": defn.required_at,
        "filled_by": defn.filled_by,
        "is_filterable": defn.is_filterable,
        "sort_order": defn.sort_order,
        "validation_rules": defn.validation_rules,
        "group_id": defn.group_id,
    }


def build_form_config(entity_type: str, *, surface: str, roles) -> dict:
    flag = _SURFACE_FLAG.get(surface, "show_on_edit")
    role_set = set(roles or [])

    selected = []
    for defn in active_definitions_qs(entity_type):
        if not getattr(defn, flag):
            continue
        defn_roles = set(defn.roles or [])
        if defn_roles and role_set and not (defn_roles & role_set):
            continue
        if defn_roles and not role_set:
            continue
        selected.append(defn)

    groups: dict = {}
    for defn in selected:
        gid = defn.group_id
        if gid not in groups:
            if gid is None:
                groups[gid] = {
                    "id": None,
                    "name": _UNGROUPED_NAME,
                    "sort_order": 10 ** 9,
                    "fields": [],
                }
            else:
                g = defn.group
                groups[gid] = {
                    "id": gid,
                    "name": getattr(g, "name", _UNGROUPED_NAME),
                    "sort_order": getattr(g, "sort_order", 0),
                    "fields": [],
                }
        groups[gid]["fields"].append(_field_payload(defn, entity_type))

    ordered_groups = sorted(groups.values(), key=lambda g: (g["sort_order"], g["id"] or 0))
    for g in ordered_groups:
        g["fields"].sort(key=lambda f: (f["sort_order"], f["id"] or 0))
    return {"entity_type": entity_type, "surface": surface, "groups": ordered_groups}


def _strip_admin_only_fields(config: dict) -> dict:
    """Remove staff-only fields from a resolved form-config payload."""
    groups = []
    for group in config.get("groups") or []:
        fields = [
            f for f in group.get("fields") or [] if f.get("filled_by") != FILLED_BY_ADMIN
        ]
        if fields:
            groups.append({**group, "fields": fields})
    return {**config, "groups": groups}


def build_registration_form_config() -> dict:
    """Public student self-registration form (create surface, student role)."""
    config = build_form_config(
        ENTITY_TYPE_USER,
        surface="create",
        roles=["student"],
    )
    return _strip_admin_only_fields(config)
