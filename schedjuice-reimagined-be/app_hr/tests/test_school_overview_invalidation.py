from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase

from app_hr.school_overview_cache import (
    get_school_overview_snapshot,
    set_school_overview_snapshot,
)
from app_hr.school_overview_invalidation import (
    invalidate_school_overview_for_event_date,
    invalidate_school_overview_for_user_event,
)


class SchoolOverviewInvalidationTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_event_date_invalidates_local_month(self):
        set_school_overview_snapshot("acme", 2026, 7, {"courses": []})
        with patch(
            "app_hr.school_overview_invalidation._schema_name",
            return_value="acme",
        ):
            invalidate_school_overview_for_event_date(
                datetime(2026, 7, 15, 10, 0, tzinfo=timezone.utc),
                schema_name="acme",
                timezone_code="UTC",
            )
        self.assertIsNone(get_school_overview_snapshot("acme", 2026, 7))

    def test_user_event_uses_event_date(self):
        set_school_overview_snapshot("acme", 2026, 3, {"courses": []})
        ue = MagicMock()
        ue.event.date = datetime(2026, 3, 5, 8, 0, tzinfo=timezone.utc)
        with patch(
            "app_hr.school_overview_invalidation._schema_name",
            return_value="acme",
        ):
            invalidate_school_overview_for_user_event(
                ue, schema_name="acme", timezone_code="UTC"
            )
        self.assertIsNone(get_school_overview_snapshot("acme", 2026, 3))
