from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from app_organization.throttling import OrganizationPublicAnonThrottle
from app_organization.views import OrganizationPublicView

_CACHES_TEST = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "org-public-throttle-test",
    }
}

_RF = deepcopy(settings.REST_FRAMEWORK)
_RF["DEFAULT_THROTTLE_RATES"] = {"organization_public": "2/minute"}


def _anon_request(ip: str = "203.0.113.9"):
    request = APIRequestFactory().get("/api/v1/organizations/public")
    request.user = AnonymousUser()
    request.META["REMOTE_ADDR"] = ip
    return request


@override_settings(CACHES=_CACHES_TEST, REST_FRAMEWORK=_RF)
class OrganizationPublicThrottleTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.throttle = OrganizationPublicAnonThrottle()
        self.view = OrganizationPublicView()

    def test_third_anon_request_in_window_is_denied(self):
        request = _anon_request()
        self.assertTrue(self.throttle.allow_request(request, self.view))
        self.assertTrue(self.throttle.allow_request(request, self.view))
        self.assertFalse(self.throttle.allow_request(request, self.view))


@override_settings(
    CACHES=_CACHES_TEST,
    TENANT_RESOLUTION_CACHE_TIMEOUT=60,
)
class OrganizationPublicCacheHeaderTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_cached_payload_sets_s_maxage_cache_control(self):
        view = OrganizationPublicView()
        request = APIRequestFactory().get("/api/v1/organizations/public")
        request.tenant = SimpleNamespace(pk=7, schema_name="xschedjuice")
        cached = {"id": 7, "schema_name": "xschedjuice"}

        with patch("app_organization.views.cache.get", return_value=cached):
            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["id"], 7)
        self.assertIn("s-maxage=60", response["Cache-Control"])
        self.assertIn("public", response["Cache-Control"])
