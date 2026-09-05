from django.core.cache import cache
from django.test import SimpleTestCase

from app_hr.school_overview_cache import (
    get_school_overview_snapshot,
    invalidate_school_overview_cache,
    set_school_overview_snapshot,
)

class SchoolOverviewCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_invalidate_removes_key(self):
        set_school_overview_snapshot("acme", 2026, 7, {"courses": []})
        invalidate_school_overview_cache("acme", 2026, 7)
        self.assertIsNone(get_school_overview_snapshot("acme", 2026, 7))
