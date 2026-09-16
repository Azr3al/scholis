from django.test import SimpleTestCase

from app_custom_fields.builtin_fields import (
    BuiltinField,
    builtin_fields_for_entity,
    get_builtin_field,
    reserved_keys_for_entity,
)
from app_custom_fields.constants import ENTITY_TYPE_USER


class BuiltinRegistryTests(SimpleTestCase):
    def test_user_registry_is_nonempty_and_typed(self):
        fields = builtin_fields_for_entity(ENTITY_TYPE_USER)
        self.assertIn("date_of_birth", fields)
        self.assertIsInstance(fields["date_of_birth"], BuiltinField)
        self.assertEqual(fields["date_of_birth"].field_type, "date")

    def test_get_builtin_field_returns_none_for_unknown(self):
        self.assertIsNone(get_builtin_field(ENTITY_TYPE_USER, "not_a_real_field"))

    def test_reserved_keys_includes_registry_and_identity_floor(self):
        reserved = reserved_keys_for_entity(ENTITY_TYPE_USER)
        self.assertIn("date_of_birth", reserved)  # registry
        self.assertIn("email", reserved)          # identity floor
        self.assertIn("roles", reserved)          # identity floor

    def test_unknown_entity_returns_empty(self):
        self.assertEqual(builtin_fields_for_entity("app_foo.Bar"), {})
        self.assertEqual(reserved_keys_for_entity("app_foo.Bar"), frozenset())

    def test_choice_builtin_resolves_choices(self):
        gender = get_builtin_field(ENTITY_TYPE_USER, "gender")
        self.assertEqual(gender.field_type, "choice")
        values = {c["value"] for c in gender.resolve_choices()}
        self.assertEqual(values, {"MALE", "FEMALE", "NON_BINARY", "OTHER"})
