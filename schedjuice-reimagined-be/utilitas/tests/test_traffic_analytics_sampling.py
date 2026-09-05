from django.test import SimpleTestCase

from utilitas.traffic_analytics.sampling import should_sample_event

class SamplingTests(SimpleTestCase):
    def test_always_sample_errors(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=500,
                response_ms=10,
                db_query_count=1,
                sample_rate=0.5,
            )
        )

    def test_always_sample_slow(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=200,
                response_ms=1500,
                db_query_count=1,
                sample_rate=0.5,
            )
        )

    def test_always_sample_heavy_db(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=200,
                response_ms=10,
                db_query_count=25,
                sample_rate=0.5,
            )
        )

    def test_success_sampling_is_deterministic(self):
        key = "courses/<int:pk>:abc123"
        first = should_sample_event(key, 200, 10, 1, 0.5)
        second = should_sample_event(key, 200, 10, 1, 0.5)
        self.assertEqual(first, second)

