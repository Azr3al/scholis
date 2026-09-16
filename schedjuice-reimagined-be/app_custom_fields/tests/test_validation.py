import datetime

from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError as DRFValidationError

from rest_framework.exceptions import ValidationError as SerializerValidationError

from app_custom_fields.models import FieldDefinition
from app_custom_fields.serializers import CustomFieldDefinitionSerializer
from app_custom_fields.validation import (
    TEXT_DEFAULT_MAX_LENGTH,
    validate_user_custom_data_for_write,
)

def _text_def(key="note", required=False):
    return FieldDefinition(
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.TEXT,
        is_required=required,
        required_at=("registration" if required else "never"),
        is_filterable=False,
        sort_order=0,
        is_active=True,
    )

class ValidateUserCustomDataTests(SimpleTestCase):
    def test_rejects_unknown_key(self):
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"orphan": "x"},
                    existing={},
                    partial=False,
                )

    def test_text_default_max_length(self):
        d = _text_def()
        long_str = "a" * (TEXT_DEFAULT_MAX_LENGTH + 1)
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"note": long_str},
                    existing={},
                    partial=False,
                )

    def test_required_missing_on_create(self):
        d = _text_def(required=True)
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={},
                    existing={},
                    partial=False,
                )

def _date_def(key="when", rules=None):
    return FieldDefinition(
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.DATE,
        is_required=False,
        is_filterable=False,
        sort_order=0,
        validation_rules=rules,
        is_active=True,
    )

class DateValidationTests(SimpleTestCase):
    def test_date_object_respects_max(self):
        d = _date_def(rules={"max": "2026-01-01"})
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"when": datetime.date(2027, 5, 1)},
                    existing={},
                    partial=False,
                )

    def test_datetime_object_coerced_to_date(self):
        d = _date_def()
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            out = validate_user_custom_data_for_write(
                incoming={"when": datetime.datetime(2025, 3, 4, 10, 30)},
                existing={},
                partial=False,
            )
            self.assertEqual(out, {"when": "2025-03-04"})

def _datetime_def(key="at", rules=None):
    return FieldDefinition(
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.DATETIME,
        is_required=False,
        is_filterable=False,
        sort_order=0,
        validation_rules=rules,
        is_active=True,
    )

class DatetimeValidationTests(SimpleTestCase):
    def test_mixed_timezone_min_enforced(self):
        # 10:00+09:00 is 01:00Z, before the 02:00Z minimum — but a string
        # comparison ("...T10" > "...T02") would wrongly accept it.
        d = _datetime_def(rules={"min": "2026-01-01T02:00:00Z"})
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"at": "2026-01-01T10:00:00+09:00"},
                    existing={},
                    partial=False,
                )

    def test_naive_value_treated_as_utc(self):
        d = _datetime_def(rules={"min": "2026-01-01T02:00:00Z"})
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            out = validate_user_custom_data_for_write(
                incoming={"at": "2026-01-01T03:00:00"},
                existing={},
                partial=False,
            )
            self.assertIn("at", out)

    def test_invalid_datetime_rejected(self):
        d = _datetime_def()
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"at": "not-a-datetime"},
                    existing={},
                    partial=False,
                )

def _email_def(key="contact"):
    return FieldDefinition(
        entity_type="app_auth.User",
        field_key=key,
        field_label=key,
        field_type=FieldDefinition.FieldType.EMAIL,
        is_required=False,
        is_filterable=False,
        sort_order=0,
        is_active=True,
    )

class EmailValidationTests(SimpleTestCase):
    def test_double_at_rejected(self):
        d = _email_def()
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"contact": "user@@example.com"},
                    existing={},
                    partial=False,
                )

class PatternSafetyTests(SimpleTestCase):
    def _text_def_with_pattern(self, pattern):
        d = _text_def()
        d.validation_rules = {"pattern": pattern}
        return d

    def test_pattern_too_long_rejected_at_value_validation(self):
        d = self._text_def_with_pattern("a" * 201)
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"note": "aaa"},
                    existing={},
                    partial=False,
                )

    def test_catastrophic_pattern_times_out(self):
        # (a+)+$ against "aaa...b" backtracks exponentially; the timeout
        # must convert that into a validation error, not a hung worker.
        d = self._text_def_with_pattern(r"(a+)+$")
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"note": "a" * 64 + "b"},
                    existing={},
                    partial=False,
                )

    def test_valid_pattern_still_enforced(self):
        d = self._text_def_with_pattern(r"^\d+$")
        with patch(
            "app_custom_fields.validation.active_definitions_qs",
            return_value=[d],
        ):
            with self.assertRaises(DRFValidationError):
                validate_user_custom_data_for_write(
                    incoming={"note": "not-digits"},
                    existing={},
                    partial=False,
                )
            out = validate_user_custom_data_for_write(
                incoming={"note": "12345"},
                existing={},
                partial=False,
            )
            self.assertEqual(out, {"note": "12345"})

class DefinitionPatternValidationTests(SimpleTestCase):
    def setUp(self):
        self._dup_patcher = patch(
            "app_custom_fields.serializers._has_active_duplicate",
            return_value=False,
        )
        self._dup_patcher.start()
        self.addCleanup(self._dup_patcher.stop)

    def _attrs(self, pattern):
        return {
            "entity_type": "app_auth.User",
            "field_key": "note",
            "field_label": "Note",
            "field_type": "text",
            "validation_rules": {"pattern": pattern},
        }

    def test_invalid_pattern_rejected_on_save(self):
        ser = CustomFieldDefinitionSerializer()
        with self.assertRaises(SerializerValidationError):
            ser.validate(self._attrs("("))

    def test_overlong_pattern_rejected_on_save(self):
        ser = CustomFieldDefinitionSerializer()
        with self.assertRaises(SerializerValidationError):
            ser.validate(self._attrs("a" * 201))

class FieldTypeImmutabilityTests(SimpleTestCase):
    def setUp(self):
        self._dup_patcher = patch(
            "app_custom_fields.serializers._has_active_duplicate",
            return_value=False,
        )
        self._dup_patcher.start()
        self.addCleanup(self._dup_patcher.stop)

    def test_field_type_change_rejected(self):
        existing = _text_def()
        ser = CustomFieldDefinitionSerializer(instance=existing)
        with self.assertRaises(SerializerValidationError):
            ser.validate({"field_type": "number"})

