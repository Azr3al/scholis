from django.test import SimpleTestCase

from app_organization.mobile_version_policy import compare_versions, evaluate_version_status
from app_organization.models import MobileAppVersionPolicy

def _policy(**kwargs) -> MobileAppVersionPolicy:
    defaults = {
        "variant": MobileAppVersionPolicy.AppVariant.SCHEDJUICE,
        "platform": MobileAppVersionPolicy.Platform.IOS,
        "minimum_version": "1.0.0",
        "recommended_version": "1.1.0",
        "latest_version": "1.2.0",
        "store_url": "https://apps.apple.com/app/id6756487765",
        "message": "",
        "is_enabled": True,
    }
    defaults.update(kwargs)
    return MobileAppVersionPolicy(**defaults)

class CompareVersionsTests(SimpleTestCase):
    def test_equal_versions(self):
        self.assertEqual(compare_versions("1.2.0", "1.2.0"), 0)

    def test_less_than(self):
        self.assertEqual(compare_versions("1.1.9", "1.2.0"), -1)

    def test_greater_than(self):
        self.assertEqual(compare_versions("2.0.0", "1.9.9"), 1)

    def test_malformed_strings_compare_as_zero(self):
        self.assertEqual(compare_versions("bad", "also-bad"), 0)
        self.assertEqual(compare_versions("1.0", "1.0.0"), 0)

    def test_different_length_versions(self):
        self.assertEqual(compare_versions("1.2", "1.2.0"), 0)
        self.assertEqual(compare_versions("1.2.1", "1.2"), 1)

class EvaluateVersionStatusTests(SimpleTestCase):
    def test_no_policy_returns_none(self):
        self.assertEqual(evaluate_version_status(None, "1.0.0"), "none")

    def test_disabled_policy_returns_none(self):
        policy = _policy(is_enabled=False, minimum_version="9.9.9")
        self.assertEqual(evaluate_version_status(policy, "1.0.0"), "none")

    def test_below_minimum_returns_required(self):
        policy = _policy(minimum_version="1.2.0")
        self.assertEqual(evaluate_version_status(policy, "1.1.0"), "required")

    def test_between_minimum_and_recommended_returns_recommended(self):
        policy = _policy(minimum_version="1.0.0", recommended_version="1.2.0")
        self.assertEqual(evaluate_version_status(policy, "1.1.0"), "recommended")

    def test_at_or_above_latest_returns_none(self):
        policy = _policy(minimum_version="1.0.0", recommended_version="1.1.0")
        self.assertEqual(evaluate_version_status(policy, "1.2.0"), "none")

    def test_blank_recommended_skips_soft_tier(self):
        policy = _policy(
            minimum_version="1.0.0",
            recommended_version="",
            latest_version="1.2.0",
        )
        self.assertEqual(evaluate_version_status(policy, "1.1.0"), "none")

    def test_empty_installed_version_returns_none(self):
        policy = _policy(minimum_version="9.9.9")
        self.assertEqual(evaluate_version_status(policy, ""), "none")

class MobileAppVersionCheckViewTests(SimpleTestCase):
    def setUp(self):
        from rest_framework.test import APIRequestFactory

        self.factory = APIRequestFactory()

    def _get(self, params: dict):
        from app_organization.mobile_version_views import MobileAppVersionCheckView

        request = self.factory.get("/mobile/app-version", params)
        return MobileAppVersionCheckView.as_view()(request)

    def test_invalid_variant_fail_open(self):
        response = self._get(
            {
                "variant": "unknown",
                "platform": "ios",
                "version": "1.0.0",
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["isError"])
        self.assertEqual(response.data["data"]["status"], "none")

import unittest
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import MobileAppVersionPolicy

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MobileAppVersionCheckDbTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            MobileAppVersionPolicy.objects.all().delete()

    def _client(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_TENANT="xschedjuice")
        return client

    def _create_policy(self, **kwargs):
        defaults = {
            "variant": MobileAppVersionPolicy.AppVariant.SCHEDJUICE,
            "platform": MobileAppVersionPolicy.Platform.IOS,
            "minimum_version": "1.0.0",
            "recommended_version": "1.2.0",
            "latest_version": "1.3.0",
            "store_url": "https://apps.apple.com/app/id6756487765",
            "message": "Please update",
            "is_enabled": True,
        }
        defaults.update(kwargs)
        with schema_context(get_public_schema_name()):
            return MobileAppVersionPolicy.objects.create(**defaults)

    def test_recommended_status_between_thresholds(self):
        self._create_policy(minimum_version="1.0.0", recommended_version="1.2.0")
        resp = self._client().get(
            "/api/v1/mobile/app-version",
            {
                "variant": "schedjuice",
                "platform": "ios",
                "version": "1.1.0",
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["data"]["status"], "recommended")

    def test_disabled_policy_fail_open(self):
        self._create_policy(is_enabled=False, minimum_version="9.9.9")
        resp = self._client().get(
            "/api/v1/mobile/app-version",
            {
                "variant": "schedjuice",
                "platform": "ios",
                "version": "1.0.0",
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["data"]["status"], "none")
