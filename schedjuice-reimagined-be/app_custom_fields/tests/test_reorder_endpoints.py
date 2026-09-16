from unittest import mock

from django.test import SimpleTestCase

from app_custom_fields.reorder import ReorderError, apply_reorder


class ApplyReorderUnitTests(SimpleTestCase):
    """Pure validation of the reorder service (no DB)."""

    def test_rejects_non_list_items(self):
        with self.assertRaises(ReorderError):
            apply_reorder(
                model=mock.Mock(),
                entity_type="app_auth.User",
                items={"id": 1},
                group_model=mock.Mock(),
                allow_group=True,
            )

    def test_rejects_item_without_id(self):
        with self.assertRaises(ReorderError):
            apply_reorder(
                model=mock.Mock(),
                entity_type="app_auth.User",
                items=[{"sort_order": 1}],
                group_model=mock.Mock(),
                allow_group=True,
            )

    def test_rejects_bad_entity_type(self):
        with self.assertRaises(ReorderError):
            apply_reorder(
                model=mock.Mock(),
                entity_type="nope.Nope",
                items=[{"id": 1, "sort_order": 0}],
                group_model=mock.Mock(),
                allow_group=True,
            )
