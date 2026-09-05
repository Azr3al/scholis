from django.core.cache import cache
from django.test import TestCase, override_settings

from app_ai.guardrails.rate_limit import check_ai_rate_limit


@override_settings(AI_RATE_LIMIT_PER_USER=2, AI_RATE_LIMIT_WINDOW_SECONDS=3600)
class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_allows_under_limit(self):
        allowed, retry = check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        self.assertTrue(allowed)
        self.assertEqual(retry, 0)

    def test_blocks_over_limit(self):
        check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        allowed, retry = check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        self.assertFalse(allowed)
        self.assertGreater(retry, 0)
