from unittest.mock import MagicMock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from app_organization.tenant_resolution_cache import (
    domain_cache_key,
    load_with_cache,
    normalize_domain_for_tenant_lookup,
)

_CACHES_TEST = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "tenant-resolution-test",
    }
}


class NormalizeDomainTests(SimpleTestCase):
    def test_strips_scheme_and_port(self):
        self.assertEqual(
            normalize_domain_for_tenant_lookup("https://school.example.com:8443/path"),
            "school.example.com",
        )

    def test_public_passthrough(self):
        self.assertEqual(normalize_domain_for_tenant_lookup("public"), "public")

    def test_alias_hosts(self):
        self.assertEqual(
            normalize_domain_for_tenant_lookup("suconnect.thiha.net"),
            "suconnect.teachersucenter.com",
        )


@override_settings(CACHES=_CACHES_TEST, TENANT_RESOLUTION_CACHE_TIMEOUT=60)
class LoadWithCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_miss_then_hit_uses_pk_hydrate(self):
        org = MagicMock()
        org.pk = 7
        fetches = []

        def uncached():
            fetches.append(1)
            return org

        tenant_model = MagicMock()
        tenant_model.DoesNotExist = Exception
        tenant_model.objects.get.return_value = org

        first = load_with_cache(tenant_model, "tr:sch:demo", uncached)
        self.assertIs(first, org)
        self.assertEqual(fetches, [1])

        tenant_model.objects.get.reset_mock()
        second = load_with_cache(tenant_model, "tr:sch:demo", uncached)
        self.assertIs(second, org)
        tenant_model.objects.get.assert_called_once_with(pk=7)
        self.assertEqual(fetches, [1])

    def test_stale_pk_refetches(self):
        cache.set(domain_cache_key("school.example.com"), 999, timeout=60)

        org = MagicMock()
        org.pk = 7
        fetches = []

        def uncached():
            fetches.append(1)
            return org

        tenant_model = MagicMock()
        tenant_model.DoesNotExist = type("DoesNotExist", (Exception,), {})

        def get_side_effect(**kwargs):
            pk = kwargs.get("pk")
            if pk == 999:
                raise tenant_model.DoesNotExist()
            if pk == 7:
                return org
            raise AssertionError(kwargs)

        tenant_model.objects.get.side_effect = get_side_effect

        result = load_with_cache(
            tenant_model,
            domain_cache_key("school.example.com"),
            uncached,
        )
        self.assertIs(result, org)
        self.assertEqual(fetches, [1])
