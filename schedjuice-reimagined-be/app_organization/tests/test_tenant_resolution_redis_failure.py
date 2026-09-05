from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_organization.tenant_resolution_cache import load_with_cache

_CACHES_TEST = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "tenant-resolution-redis-failure",
    }
}


@override_settings(CACHES=_CACHES_TEST, TENANT_RESOLUTION_CACHE_TIMEOUT=60)
class LoadWithCacheRedisFailureTests(SimpleTestCase):
    def test_cache_get_exception_falls_back_to_uncached_fetch(self):
        org = MagicMock()
        org.pk = 11
        tenant_model = MagicMock()
        tenant_model.DoesNotExist = Exception

        def uncached():
            return org

        with patch(
            "app_organization.tenant_resolution_cache.cache.get",
            side_effect=ConnectionError("redis down"),
        ):
            result = load_with_cache(tenant_model, "tr:dom:example.com", uncached)

        self.assertIs(result, org)
