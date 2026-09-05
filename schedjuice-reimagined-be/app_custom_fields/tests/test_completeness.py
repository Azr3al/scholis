from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from app_custom_fields.completeness import compute_profile_completeness
from app_custom_fields.constants import (
    FILLED_BY_ADMIN,
    FILLED_BY_USER,
    REQUIRED_AT_PROFILE_COMPLETION,
    REQUIRED_AT_REGISTRATION,
    SOURCE_BUILTIN,
    SOURCE_CUSTOM,
)
from app_custom_fields.models import FieldDefinition


def _def(key, *, required_at, filled_by="both", roles=None, source=SOURCE_CUSTOM):
    return FieldDefinition(
        source=source,
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.TEXT,
        required_at=required_at,
        filled_by=filled_by,
        roles=roles or [],
        is_active=True,
    )


class CompletenessTests(SimpleTestCase):
    def _patch(self, defs):
        return patch(
            "app_custom_fields.completeness.active_definitions_qs", return_value=defs
        )

    def test_never_fields_are_ignored(self):
        defs = [_def("opt", required_at="never")]
        user = SimpleNamespace(roles=["student"], custom_data={})
        with self._patch(defs):
            result = compute_profile_completeness(user)
        self.assertEqual(result["percent"], 100)
        self.assertEqual(result["missing"], [])

    def test_role_scoping(self):
        defs = [_def("guardian", required_at=REQUIRED_AT_REGISTRATION, roles=["student"])]
        teacher = SimpleNamespace(roles=["teacher"], custom_data={})
        with self._patch(defs):
            result = compute_profile_completeness(teacher)
        self.assertEqual(result["percent"], 100)

    def test_missing_partitioned_by_filled_by(self):
        defs = [
            _def("guardian", required_at=REQUIRED_AT_REGISTRATION,
                 filled_by=FILLED_BY_USER, roles=["student"]),
            _def("note", required_at=REQUIRED_AT_PROFILE_COMPLETION,
                 filled_by=FILLED_BY_ADMIN, roles=["student"]),
        ]
        user = SimpleNamespace(roles=["student"], custom_data={})
        with self._patch(defs):
            result = compute_profile_completeness(user)
        self.assertEqual(result["percent"], 0)
        keys = {m["field_key"]: m for m in result["missing"]}
        self.assertEqual(keys["guardian"]["filled_by"], FILLED_BY_USER)
        self.assertEqual(keys["note"]["filled_by"], FILLED_BY_ADMIN)

    def test_builtin_value_read_from_model_attr(self):
        defs = [_def("date_of_birth", required_at=REQUIRED_AT_REGISTRATION,
                     roles=["student"], source=SOURCE_BUILTIN)]
        filled = SimpleNamespace(roles=["student"], custom_data={}, date_of_birth="2000-01-01")
        empty = SimpleNamespace(roles=["student"], custom_data={}, date_of_birth=None)
        with self._patch(defs):
            self.assertEqual(compute_profile_completeness(filled)["percent"], 100)
            self.assertEqual(compute_profile_completeness(empty)["percent"], 0)
