from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_custom_fields.models import FieldDefinition
from app_custom_fields.serializers import reactivate_or_conflict

def _inactive_def(field_type=FieldDefinition.FieldType.TEXT):
    return FieldDefinition(
        entity_type="app_auth.User",
        field_key="legacy",
        field_label="Legacy",
        field_type=field_type,
        is_active=False,
    )

def _patched_objects(first_result):
    """Patch the serializer-module queryset chain: filter().order_by().first()."""
    objects = MagicMock()
    objects.filter.return_value.order_by.return_value.first.return_value = first_result
    return patch.object(FieldDefinition, "objects", objects), objects

class KeyReuseTests(SimpleTestCase):
    def test_no_inactive_match_returns_none(self):
        patcher, _ = _patched_objects(None)
        with patcher:
            result = reactivate_or_conflict(
                entity_type="app_auth.User",
                field_key="brand_new",
                field_type="text",
                validated_data={},
            )
        self.assertIsNone(result)

    def test_same_type_reactivates(self):
        inactive = _inactive_def()
        patcher, _ = _patched_objects(inactive)
        with patcher, patch.object(inactive, "save") as mock_save:
            result = reactivate_or_conflict(
                entity_type="app_auth.User",
                field_key="legacy",
                field_type="text",
                validated_data={"field_label": "Legacy v2"},
            )
        self.assertIs(result, inactive)
        self.assertTrue(result.is_active)
        self.assertEqual(result.field_label, "Legacy v2")
        mock_save.assert_called_once()

    def test_different_type_rejected(self):
        inactive = _inactive_def(field_type=FieldDefinition.FieldType.NUMBER)
        patcher, _ = _patched_objects(inactive)
        with patcher, patch.object(inactive, "save") as mock_save:
            with self.assertRaises(ValidationError):
                reactivate_or_conflict(
                    entity_type="app_auth.User",
                    field_key="legacy",
                    field_type="text",
                    validated_data={},
                )
        mock_save.assert_not_called()

