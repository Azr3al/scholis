from unittest.mock import patch

from django.test import SimpleTestCase

from app_custom_fields.constants import ENTITY_TYPE_USER, FILLED_BY_ADMIN, SOURCE_BUILTIN, SOURCE_CUSTOM
from app_custom_fields.form_config import (
    build_form_config,
    build_registration_form_config,
)
from app_custom_fields.models import FieldDefinition


def _def(key, *, source=SOURCE_CUSTOM, field_type="text", surface_flags=None,
         roles=None, filled_by="both", sort_order=0):
    flags = surface_flags or {}
    return FieldDefinition(
        source=source, entity_type=ENTITY_TYPE_USER, field_key=key, field_label=key,
        field_type=field_type, roles=roles or [], filled_by=filled_by,
        sort_order=sort_order, is_active=True,
        show_on_create=flags.get("create", True),
        show_on_edit=flags.get("edit", True),
        show_on_detail=flags.get("detail", True),
    )


class BuildFormConfigTests(SimpleTestCase):
    def _patch(self, defs):
        return patch("app_custom_fields.form_config.active_definitions_qs", return_value=defs)

    def test_surface_filtering_create(self):
        defs = [
            _def("a", surface_flags={"create": True}),
            _def("b", surface_flags={"create": False, "edit": True}),
        ]
        with self._patch(defs):
            cfg = build_form_config(ENTITY_TYPE_USER, surface="create", roles=["student"])
        keys = [f["field_key"] for g in cfg["groups"] for f in g["fields"]]
        self.assertEqual(keys, ["a"])

    def test_role_filtering(self):
        defs = [_def("guardian", roles=["student"]), _def("cert", roles=["teacher"])]
        with self._patch(defs):
            cfg = build_form_config(ENTITY_TYPE_USER, surface="edit", roles=["teacher"])
        keys = [f["field_key"] for g in cfg["groups"] for f in g["fields"]]
        self.assertEqual(keys, ["cert"])

    def test_builtin_hydrated_from_registry(self):
        d = _def("date_of_birth", source=SOURCE_BUILTIN, field_type=None)
        with self._patch([d]):
            cfg = build_form_config(ENTITY_TYPE_USER, surface="edit", roles=["student"])
        field = cfg["groups"][0]["fields"][0]
        self.assertEqual(field["field_type"], "date")  # from registry
        self.assertEqual(field["source"], SOURCE_BUILTIN)

    def test_empty_roles_field_applies_to_all(self):
        defs = [_def("global_note", roles=[])]
        with self._patch(defs):
            cfg = build_form_config(ENTITY_TYPE_USER, surface="edit", roles=["teacher"])
        keys = [f["field_key"] for g in cfg["groups"] for f in g["fields"]]
        self.assertEqual(keys, ["global_note"])

    def test_registration_config_excludes_admin_only_fields(self):
        defs = [
            _def("qa_test_field", roles=["student"], filled_by="both"),
            _def("internal_note", roles=["student"], filled_by=FILLED_BY_ADMIN),
        ]
        with self._patch(defs):
            cfg = build_registration_form_config()
        keys = [f["field_key"] for g in cfg["groups"] for f in g["fields"]]
        self.assertEqual(keys, ["qa_test_field"])
        self.assertEqual(cfg["surface"], "create")
        self.assertEqual(cfg["entity_type"], ENTITY_TYPE_USER)
