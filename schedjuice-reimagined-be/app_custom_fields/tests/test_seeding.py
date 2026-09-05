from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_BUILTIN
from app_custom_fields.seeding import build_builtin_defaults, ensure_builtin_field_rows

class EnsureBuiltinRowsTests(SimpleTestCase):
    def test_only_missing_keys_created(self):
        model = MagicMock()
        # Pretend "date_of_birth" already exists (active), others do not.
        model.objects.filter.return_value.values_list.return_value = ["date_of_birth"]
        created = []
        model.objects.create.side_effect = lambda **kw: created.append(kw["field_key"])

        with patch("app_custom_fields.seeding._field_definition_model", return_value=model):
            n = ensure_builtin_field_rows(ENTITY_TYPE_USER)

        self.assertNotIn("date_of_birth", created)
        self.assertIn("gender", created)
        self.assertEqual(n, len(created))
        self.assertGreater(n, 0)
