from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_custom_fields.models import FieldDefinition
from app_custom_fields.serializers import CustomFieldDefinitionSerializer

class PolicySerializerValidationTests(SimpleTestCase):
    def setUp(self):
        self._dup_patcher = patch(
            "app_custom_fields.serializers._has_active_duplicate",
            return_value=False,
        )
        self._dup_patcher.start()
        self.addCleanup(self._dup_patcher.stop)

    def _attrs(self, **over):
        base = {
            "entity_type": "app_auth.User",
            "field_key": "guardian",
            "field_label": "Guardian",
            "field_type": "text",
            "required_at": "never",
            "roles": [],
            "filled_by": "both",
        }
        base.update(over)
        return base

    def test_invalid_role_rejected(self):
        ser = CustomFieldDefinitionSerializer()
        with self.assertRaises(ValidationError):
            ser.validate(self._attrs(roles=["not_a_role"]))

    def test_registration_requires_show_on_create(self):
        ser = CustomFieldDefinitionSerializer()
        with self.assertRaises(ValidationError):
            ser.validate(self._attrs(required_at="registration", show_on_create=False))

    def test_registration_defaults_show_on_create_true(self):
        ser = CustomFieldDefinitionSerializer()
        attrs = ser.validate(self._attrs(required_at="registration"))
        self.assertTrue(attrs["show_on_create"])

    def test_builtin_field_type_change_rejected(self):
        existing = FieldDefinition(
            source="builtin", entity_type="app_auth.User",
            field_key="date_of_birth", field_label="DOB", field_type=None,
        )
        ser = CustomFieldDefinitionSerializer(instance=existing)
        with self.assertRaises(ValidationError):
            ser.validate({"field_type": "text"})

class CompatibilityShimTests(SimpleTestCase):
    def test_representation_emits_legacy_fields(self):
        defn = FieldDefinition(
            source="custom", entity_type="app_auth.User",
            field_key="guardian", field_label="Guardian", field_type="text",
            required_at="registration", filled_by="admin", is_active=True,
        )
        data = CustomFieldDefinitionSerializer(defn).data
        self.assertTrue(data["is_required"])        # derived from required_at
        self.assertEqual(data["form_input_mode"], "read_only")  # derived from filled_by
        self.assertEqual(data["required_at"], "registration")
        self.assertEqual(data["filled_by"], "admin")
