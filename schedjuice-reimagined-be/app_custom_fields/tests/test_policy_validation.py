from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError as DRFValidationError

from app_custom_fields.constants import (
    FILLED_BY_ADMIN,
    REQUIRED_AT_PROFILE_COMPLETION,
    REQUIRED_AT_REGISTRATION,
    SOURCE_CUSTOM,
)
from app_custom_fields.models import FieldDefinition
from app_custom_fields.validation import (
    validate_custom_data_for_write,
    validate_user_custom_data_for_write,
)

def _def(key, *, required_at="never", roles=None, filled_by="both", source=SOURCE_CUSTOM):
    return FieldDefinition(
        source=source,
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.TEXT,
        required_at=required_at,
        roles=roles or [],
        filled_by=filled_by,
        is_active=True,
    )

class StageRoleActorTests(SimpleTestCase):
    def _patch(self, defs):
        return patch(
            "app_custom_fields.validation.active_definitions_qs", return_value=defs
        )

    def test_registration_field_required_on_create_for_matching_role(self):
        d = _def("guardian", required_at=REQUIRED_AT_REGISTRATION, roles=["student"])
        with self._patch([d]):
            with self.assertRaises(DRFValidationError):
                validate_custom_data_for_write(
                    entity_type="app_auth.User",
                    incoming={},
                    existing={},
                    partial=False,
                    stage="registration",
                    subject_roles=["student"],
                    actor="admin",
                )

    def test_registration_field_not_required_for_other_role(self):
        d = _def("guardian", required_at=REQUIRED_AT_REGISTRATION, roles=["student"])
        with self._patch([d]):
            out = validate_custom_data_for_write(
                entity_type="app_auth.User",
                incoming={},
                existing={},
                partial=False,
                stage="registration",
                subject_roles=["teacher"],
                actor="admin",
            )
            self.assertEqual(out, {})

    def test_profile_completion_field_not_required_at_registration(self):
        d = _def("bio", required_at=REQUIRED_AT_PROFILE_COMPLETION, roles=["student"])
        with self._patch([d]):
            out = validate_custom_data_for_write(
                entity_type="app_auth.User",
                incoming={},
                existing={},
                partial=False,
                stage="registration",
                subject_roles=["student"],
                actor="admin",
            )
            self.assertEqual(out, {})

    def test_admin_only_field_rejected_for_user_actor(self):
        d = _def("internal_note", filled_by=FILLED_BY_ADMIN)
        with self._patch([d]):
            with self.assertRaises(DRFValidationError):
                validate_custom_data_for_write(
                    entity_type="app_auth.User",
                    incoming={"internal_note": "x"},
                    existing={},
                    partial=True,
                    stage="edit",
                    subject_roles=["student"],
                    actor="user",
                )

    def test_admin_only_allowed_when_key_in_allowlist(self):
        d = _def("internal_note", filled_by=FILLED_BY_ADMIN)
        with self._patch([d]):
            out = validate_user_custom_data_for_write(
                incoming={"internal_note": "secret"},
                existing={},
                partial=True,
                actor="user",
                allow_user_admin_keys={"internal_note"},
            )
        self.assertEqual(out.get("internal_note"), "secret")

    def test_skip_registration_required_allows_unrelated_empty_floor(self):
        shirt = _def("t_shirt_size")
        other = _def(
            "testing_field",
            required_at=REQUIRED_AT_REGISTRATION,
            roles=["teacher"],
        )
        with self._patch([shirt, other]):
            out = validate_user_custom_data_for_write(
                incoming={"t_shirt_size": "M"},
                existing={},
                partial=True,
                subject_roles=["teacher"],
                actor="user",
                skip_registration_required=True,
            )
        self.assertEqual(out.get("t_shirt_size"), "M")
        self.assertNotIn("testing_field", out)

    def test_partial_update_skips_unrelated_registration_required(self):
        general = _def("testing_field")
        other = _def(
            "date_testing",
            required_at=REQUIRED_AT_REGISTRATION,
            roles=["teacher"],
        )
        with self._patch([general, other]):
            out = validate_user_custom_data_for_write(
                incoming={"testing_field": "saf"},
                existing={},
                partial=True,
                subject_roles=["teacher"],
                actor="admin",
            )
        self.assertEqual(out.get("testing_field"), "saf")
        self.assertNotIn("date_testing", out)

    def test_partial_update_rejects_clearing_required_field_in_payload(self):
        other = _def(
            "date_testing",
            required_at=REQUIRED_AT_REGISTRATION,
            roles=["teacher"],
        )
        with self._patch([other]):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"date_testing": ""},
                    existing={"date_testing": "2026-01-01"},
                    partial=True,
                    subject_roles=["teacher"],
                    actor="admin",
                )

    def test_admin_only_still_rejected_without_allowlist(self):
        d = _def("internal_note", filled_by=FILLED_BY_ADMIN)
        with self._patch([d]):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"internal_note": "secret"},
                    existing={},
                    partial=True,
                    actor="user",
                    allow_user_admin_keys=None,
                )

    def test_builtin_row_skips_type_coercion(self):
        d = _def("date_of_birth", source="builtin")
        d.field_type = None
        with self._patch([d]):
            out = validate_custom_data_for_write(
                entity_type="app_auth.User",
                incoming={},
                existing={},
                partial=False,
                stage="create",
                subject_roles=["student"],
                actor="admin",
            )
            self.assertEqual(out, {})

    def test_accepts_prefetched_definitions_without_query(self):
        d = _def("guardian")
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            side_effect=AssertionError("should not query DB"),
        ):
            out = validate_custom_data_for_write(
                entity_type="app_auth.User",
                incoming={"guardian": "Jane"},
                existing={},
                partial=False,
                definitions=[d],
            )
        self.assertEqual(out, {"guardian": "Jane"})
