import json

from django.test import RequestFactory, SimpleTestCase
from django.urls import reverse

from utilitas.health import health


class HealthEndpointTests(SimpleTestCase):
    def test_health_returns_ok_envelope_without_auth(self):
        response = health(RequestFactory().get("/api/v1/health"))
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content.decode())
        self.assertFalse(payload["isError"])
        self.assertEqual(payload["data"]["status"], "ok")

    def test_health_url_is_mounted_at_api_v1(self):
        self.assertEqual(reverse("api-health"), "/api/v1/health")
