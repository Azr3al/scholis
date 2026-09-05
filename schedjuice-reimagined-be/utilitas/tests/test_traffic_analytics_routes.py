from django.test import SimpleTestCase
from types import SimpleNamespace

from utilitas.traffic_analytics.routes import (
    resolve_route_template,
    should_track_api_path,
)

class RouteHelperTests(SimpleTestCase):
    def test_should_track_api_v1_only(self):
        self.assertTrue(should_track_api_path("/api/v1/courses"))
        self.assertFalse(should_track_api_path("/api/v1/health"))
        self.assertFalse(should_track_api_path("/admin/"))
        self.assertFalse(should_track_api_path("/silk/"))

    def test_fallback_strips_api_prefix(self):
        request = SimpleNamespace(path="/api/v1/unknown-path", resolver_match=None)
        self.assertEqual(resolve_route_template(request), "unknown-path")
