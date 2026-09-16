from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from utilitas.traffic_analytics.middleware import TrafficAnalyticsMiddleware

class TrafficAnalyticsMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.queue_mock = patch("utilitas.traffic_analytics.middleware.get_event_queue").start()
        self.queue = self.queue_mock.return_value
        self.addCleanup(patch.stopall)

    @override_settings(POSTHOG_ENABLED=True, POSTHOG_API_SAMPLE_RATE=1.0)
    def test_skips_non_api_paths(self):
        middleware = TrafficAnalyticsMiddleware(lambda request: HttpResponse("ok"))
        middleware(self.factory.get("/admin/"))
        self.queue.enqueue.assert_not_called()

    @override_settings(POSTHOG_ENABLED=True, POSTHOG_API_SAMPLE_RATE=1.0)
    def test_enqueue_failure_does_not_break_response(self):
        self.queue.enqueue.side_effect = RuntimeError("boom")

        middleware = TrafficAnalyticsMiddleware(lambda request: HttpResponse("ok"))
        request = self.factory.get("/api/v1/home")
        request.resolver_match = type("Match", (), {"route": "home"})()

        response = middleware(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(POSTHOG_ENABLED=False)
    def test_disabled_via_settings(self):
        middleware = TrafficAnalyticsMiddleware(lambda request: HttpResponse("ok"))
        request = self.factory.get("/api/v1/home")
        request.resolver_match = type("Match", (), {"route": "home"})()
        middleware(request)
        self.queue.enqueue.assert_not_called()
