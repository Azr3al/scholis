from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_custom_fields.management.commands.recompute_profile_completeness import (
    recompute_all,
)


class RecomputeAllTests(SimpleTestCase):
    def test_updates_changed_users_only(self):
        users = [
            SimpleNamespace(pk=1, roles=["student"], custom_data={}, profile_completeness=0),
            SimpleNamespace(pk=2, roles=["student"], custom_data={}, profile_completeness=100),
        ]
        updated = []

        def fake_compute(u, *a, **k):
            return {"percent": 100, "missing": []}

        manager = MagicMock()
        manager.iterator.return_value = iter(users)
        manager.filter.return_value.update.side_effect = lambda **kw: updated.append(kw)

        with patch(
            "app_custom_fields.management.commands.recompute_profile_completeness.compute_profile_completeness",
            side_effect=fake_compute,
        ):
            n = recompute_all(manager)

        # user 1 goes 0 -> 100 (updated); user 2 already 100 (skipped)
        self.assertEqual(n, 1)
