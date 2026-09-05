from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_CUSTOM
from app_custom_fields.form_config import build_form_config


class FakeGroup:
    def __init__(self, id: int, name: str, sort_order: int):
        self.id = id
        self.name = name
        self.sort_order = sort_order


def _def(
    key,
    *,
    group: FakeGroup | None = None,
    sort_order=0,
    surface_flags=None,
    roles=None,
):
    flags = surface_flags or {}
    return SimpleNamespace(
        id=None,
        source=SOURCE_CUSTOM,
        entity_type=ENTITY_TYPE_USER,
        field_key=key,
        field_label=key,
        field_type="text",
        choices=None,
        description=None,
        required_at="never",
        roles=roles or [],
        filled_by="both",
        is_filterable=False,
        sort_order=sort_order,
        validation_rules=None,
        is_active=True,
        show_on_create=flags.get("create", True),
        show_on_edit=flags.get("edit", True),
        show_on_detail=flags.get("detail", True),
        group_id=group.id if group is not None else None,
        group=group,
    )


class BuildFormConfigGroupOrderTests(SimpleTestCase):
    def _patch(self, defs):
        return patch("app_custom_fields.form_config.active_definitions_qs", return_value=defs)

    def test_group_order_respects_sort_order_not_definition_order(self):
        personal = FakeGroup(1, "Personal", sort_order=0)
        testing = FakeGroup(2, "Testing", sort_order=1)
        defs = [
            _def("testing_field", group=testing),
            _def("personal_field", group=personal),
        ]
        with self._patch(defs):
            cfg = build_form_config(
                ENTITY_TYPE_USER, surface="edit", roles=["student"]
            )
        names = [g["name"] for g in cfg["groups"]]
        self.assertEqual(names, ["Personal", "Testing"])
