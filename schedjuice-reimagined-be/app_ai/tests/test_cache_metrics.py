from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from app_ai.pricing import cache_hit_rate, compute_cache_savings_usd


class CacheMetricsTests(SimpleTestCase):
    def test_hit_rate_zero_when_no_tokens(self):
        self.assertEqual(cache_hit_rate(input_tokens=0, cached_input_tokens=0), 0.0)

    def test_hit_rate_all_cached_when_no_fresh_input(self):
        self.assertEqual(cache_hit_rate(input_tokens=0, cached_input_tokens=100), 1.0)

    def test_hit_rate_computed(self):
        rate = cache_hit_rate(input_tokens=45000, cached_input_tokens=12000)
        self.assertAlmostEqual(rate, 12000 / 57000, places=4)

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_savings_for_known_model(self):
        savings = compute_cache_savings_usd(
            "gpt-5.6-luna",
            cached_input_tokens=1_000_000,
        )
        self.assertEqual(savings, Decimal("0.18000000"))

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_savings_zero_when_no_cached_tokens(self):
        savings = compute_cache_savings_usd("gpt-5.6-luna", cached_input_tokens=0)
        self.assertEqual(savings, Decimal("0"))
