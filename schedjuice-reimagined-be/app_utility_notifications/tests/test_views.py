from unittest.mock import patch

from django.test import SimpleTestCase

from app_utility_notifications.views import (
    _parse_limit,
    _tenant_timezone_for_request,
)

class ParseLimitTest(SimpleTestCase):
    def test_defaults_to_fifty(self):
        self.assertEqual(_parse_limit(None), 50)

    def test_caps_at_fifty(self):
        self.assertEqual(_parse_limit("100"), 50)

    def test_invalid_returns_default(self):
        self.assertEqual(_parse_limit("not-a-number"), 50)
        self.assertEqual(_parse_limit("0"), 50)
        self.assertEqual(_parse_limit("-3"), 50)

class TenantTimezoneForRequestTest(SimpleTestCase):
    @patch("app_utility_notifications.views.Organization")
    @patch("app_utility_notifications.views.connection")
    def test_returns_utc_when_org_missing(self, mock_connection, mock_org_model):
        mock_connection.schema_name = "xunknown"
        mock_org_model.objects.filter.return_value.first.return_value = None
        self.assertEqual(_tenant_timezone_for_request(), "UTC")

    @patch("app_utility_notifications.views.Organization")
    @patch("app_utility_notifications.views.connection")
    def test_returns_org_timezone_stripped(self, mock_connection, mock_org_model):
        mock_connection.schema_name = "xschedjuice"
        mock_org = mock_org_model.objects.filter.return_value.first.return_value
        mock_org.timezone = "  Asia/Yangon  "
        self.assertEqual(_tenant_timezone_for_request(), "Asia/Yangon")
