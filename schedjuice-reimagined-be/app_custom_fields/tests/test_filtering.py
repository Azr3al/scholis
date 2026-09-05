from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework import serializers

from app_custom_fields.filtering import (
    entity_type_for_model,
    validate_filter_param_for_custom_fields,
)

class EntityTypeForModelTests(SimpleTestCase):
    def test_unknown_model_returns_none(self):
        class Foo:
            pass

        self.assertIsNone(entity_type_for_model(Foo))

class FilterValidationTests(SimpleTestCase):
    def test_non_custom_field_is_ignored(self):
        # field_name without custom_data__ prefix should never raise.
        with patch(
            "app_custom_fields.filtering.entity_type_for_model",
            return_value="app_auth.User",
        ):
            validate_filter_param_for_custom_fields(model=MagicMock(), field_name="name")

    def test_unfilterable_custom_field_rejected(self):
        qs = MagicMock()
        qs.exists.return_value = False
        with patch(
            "app_custom_fields.filtering.entity_type_for_model",
            return_value="app_auth.User",
        ), patch(
            "app_custom_fields.filtering._filterable_keys_qs", return_value=qs
        ):
            with self.assertRaises(serializers.ValidationError):
                validate_filter_param_for_custom_fields(
                    model=MagicMock(), field_name="custom_data__secret"
                )

