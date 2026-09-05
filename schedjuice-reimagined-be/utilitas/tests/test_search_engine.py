from unittest.mock import MagicMock

from django.test import SimpleTestCase

from utilitas.search import UnknownSearchEntityError, apply_entity_search


class SearchEngineRegistryTests(SimpleTestCase):
    def test_unknown_entity_raises(self):
        with self.assertRaises(UnknownSearchEntityError):
            apply_entity_search("missing-entity-key", MagicMock(), "x")
