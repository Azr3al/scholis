from unittest.mock import MagicMock
from django.test import SimpleTestCase
from app_rbac import scoping


class ScopingTests(SimpleTestCase):
    def _user(self, perms):
        u = MagicMock()
        u.is_authenticated = True
        u._test_perms = set(perms)
        return u

    def test_has_all_breadth_returns_full_queryset(self):
        qs = MagicMock(name="qs")
        narrowed = MagicMock(name="narrowed")
        held = {"course.view_all"}
        result = scoping.scope("course", qs, held, lambda q: narrowed)
        self.assertIs(result, qs)  # view_all → unscoped

    def test_no_breadth_narrows(self):
        qs = MagicMock(name="qs")
        narrowed = MagicMock(name="narrowed")
        result = scoping.scope("course", qs, set(), lambda q: narrowed)
        self.assertIs(result, narrowed)

    def test_object_write_allowed_with_manage_all(self):
        self.assertTrue(scoping.can_write_object("course", {"course.manage_all"}, is_connected=False))

    def test_object_write_allowed_when_connected(self):
        self.assertTrue(scoping.can_write_object("course", set(), is_connected=True))

    def test_object_write_denied_otherwise(self):
        self.assertFalse(scoping.can_write_object("course", set(), is_connected=False))
