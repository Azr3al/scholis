# app_rbac/tests/test_resolution.py
from unittest.mock import patch
from django.test import SimpleTestCase, override_settings
from django.core.cache import cache
from app_rbac import resolution, catalog

_CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "rbac-test"}}


@override_settings(CACHES=_CACHES)
class ResolutionTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_superadmin_gets_all_codes(self):
        perms = resolution.resolve_for_roles(["superadmin"], schema="t1")
        self.assertEqual(perms, catalog.ALL_CODES)

    def test_union_of_roles_from_db(self):
        with patch.object(resolution, "_db_codes_for_roles", return_value={"course.view", "payment.verify"}) as m:
            perms = resolution.resolve_for_roles(["finance"], schema="t1")
        self.assertEqual(perms, frozenset({"course.view", "payment.verify"}))
        m.assert_called_once()

    def test_platform_codes_filtered_for_non_superadmin(self):
        with patch.object(resolution, "_db_codes_for_roles", return_value={"course.view", "debug.access"}):
            perms = resolution.resolve_for_roles(["admin"], schema="t1")
        self.assertIn("course.view", perms)
        self.assertNotIn("debug.access", perms)  # platform-internal filtered out

    def test_second_call_is_cached(self):
        with patch.object(resolution, "_db_codes_for_roles", return_value={"course.view"}) as m:
            resolution.resolve_for_roles(["teacher"], schema="t1")
            resolution.resolve_for_roles(["teacher"], schema="t1")
        m.assert_called_once()  # cached on second call

    def test_generation_bump_busts_cache(self):
        with patch.object(resolution, "_db_codes_for_roles", side_effect=[{"course.view"}, {"course.view", "course.create"}]):
            first = resolution.resolve_for_roles(["teacher"], schema="t1")
            from app_rbac.cache import bump_matrix_generation
            bump_matrix_generation("t1")
            second = resolution.resolve_for_roles(["teacher"], schema="t1")
        self.assertNotEqual(first, second)
