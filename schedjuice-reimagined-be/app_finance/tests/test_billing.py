from datetime import date
from unittest.mock import MagicMock, patch
import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_finance.models import Billing
from app_finance.tests.billing_base import BillingTenantAwareBaseTest
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class BillingMonthlyEndpointTest(BillingTenantAwareBaseTest):
    def test_date_query_param_is_required(self):
        res = self.client.get(reverse("billing"), **self._auth_headers())
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data["isError"])

    def test_invalid_date_format_returns_400(self):
        res = self.client.get(
            reverse("billing"),
            {"date": "2026-03"},
            **self._auth_headers(),
        )
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data["isError"])

    def test_filters_by_month_and_returns_total(self):
        with schema_context(self.schema_name):
            Billing.objects.create(
                billing_date=date(2026, 3, 1),
                active_user_count=3,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 3, 2),
                active_user_count=4,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 4, 1),
                active_user_count=99,
                cost_per_account_at_creation=10,
            )

        res = self.client.get(
            reverse("billing"),
            {"date": "2026-03-18"},
            **self._auth_headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["isError"])
        self.assertEqual(res.data["month"], 3)
        self.assertEqual(res.data["year"], 2026)
        self.assertEqual(res.data["total_payment"], 350)
        self.assertEqual(len(res.data["data"]), 2)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class OrganizationBillingEndpointTest(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.admin_schema):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(self.customer_schema):
            seed_rbac()
            self.customer_superadmin = User.objects.create_user(
                email=f"csa-{suffix}@example.com",
                password="x",
                name="Customer Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)

        with schema_context(self.admin_schema):
            Billing.objects.filter(
                billing_date__year=2026,
                billing_date__month=6,
            ).delete()
            Billing.objects.create(
                billing_date=date(2026, 6, 1),
                active_user_count=10,
                cost_per_account_at_creation=50,
            )

        with schema_context(self.customer_schema):
            Billing.objects.filter(
                billing_date__year=2026,
                billing_date__month=6,
            ).delete()
            Billing.objects.create(
                billing_date=date(2026, 6, 1),
                active_user_count=77,
                cost_per_account_at_creation=50,
            )

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_superadmin_on_admin_tenant_fetches_customer_org_billing(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/billing",
            {"date": "2026-06-15"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(body["total_payment"], 3850)
        self.assertEqual(len(body["data"]), 1)
        self.assertEqual(body["data"][0]["active_user_count"], 77)

    def test_admin_without_permission_forbidden(self):
        resp = self._client(self.admin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/billing",
            {"date": "2026-06-15"},
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_superadmin_on_customer_tenant_forbidden(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/billing",
            {"date": "2026-06-15"},
        )
        self.assertEqual(resp.status_code, 403, resp.content)

class RecordDailyBillingIdempotencyTest(BillingTenantAwareBaseTest):
    def test_record_daily_billing_is_idempotent_per_billing_date(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                cost_per_account_per_day=50
            )

        fixed_day = date(2026, 3, 11)
        with schema_context(self.schema_name):
            Billing.objects.all().delete()
        with patch(
            "app_tasks.management.commands.record_daily_billing.timezone.localdate",
            return_value=fixed_day,
        ):
            with schema_context(self.schema_name):
                call_command("record_daily_billing")
                call_command("record_daily_billing")

        with schema_context(self.schema_name):
            rows = Billing.objects.filter(billing_date=fixed_day)
            self.assertEqual(rows.count(), 1)

class RecordDailyBillingGapFillTest(BillingTenantAwareBaseTest):
    def test_fills_missing_dates_using_average_and_live_today(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                cost_per_account_per_day=50
            )

        fixed_today = date(2026, 3, 8)
        with schema_context(self.schema_name):
            Billing.objects.all().delete()
            Billing.objects.create(
                billing_date=date(2026, 3, 1),
                active_user_count=10,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 3, 5),
                active_user_count=20,
                cost_per_account_at_creation=50,
            )

        mock_qs = MagicMock()
        mock_qs.count.return_value = 50
        with patch(
            "app_tasks.management.commands.record_daily_billing.timezone.localdate",
            return_value=fixed_today,
        ):
            with patch(
                "app_tasks.management.commands.record_daily_billing.User.objects.filter",
                return_value=mock_qs,
            ):
                with schema_context(self.schema_name):
                    call_command("record_daily_billing")

        with schema_context(self.schema_name):
            self.assertEqual(Billing.objects.count(), 8)
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 3, 2)).active_user_count,
                15,
            )
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 3, 3)).active_user_count,
                17,
            )
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 3, 4)).active_user_count,
                18,
            )
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 3, 6)).active_user_count,
                20,
            )
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 3, 7)).active_user_count,
                20,
            )
            self.assertEqual(
                Billing.objects.get(billing_date=fixed_today).active_user_count,
                50,
            )

class BackfillDailyBillingTest(BillingTenantAwareBaseTest):
    def test_dry_run_does_not_create_rows(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                cost_per_account_per_day=50
            )

        with schema_context(self.schema_name):
            Billing.objects.all().delete()
            Billing.objects.create(
                billing_date=date(2026, 4, 1),
                active_user_count=10,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 4, 5),
                active_user_count=20,
                cost_per_account_at_creation=50,
            )
            before = Billing.objects.count()

        mock_qs = MagicMock()
        mock_qs.count.return_value = 40
        with patch(
            "app_tasks.management.commands.backfill_daily_billing.timezone.localdate",
            return_value=date(2026, 4, 8),
        ):
            with patch(
                "app_tasks.management.commands.backfill_daily_billing.User.objects.filter",
                return_value=mock_qs,
            ):
                call_command(
                    "backfill_daily_billing",
                    from_date="2026-04-01",
                    to_date="2026-04-08",
                    schema=self.schema_name,
                    dry_run=True,
                )

        with schema_context(self.schema_name):
            self.assertEqual(Billing.objects.count(), before)

    def test_backfill_creates_missing_rows(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                cost_per_account_per_day=50
            )

        with schema_context(self.schema_name):
            Billing.objects.all().delete()
            Billing.objects.create(
                billing_date=date(2026, 5, 1),
                active_user_count=10,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 5, 5),
                active_user_count=20,
                cost_per_account_at_creation=50,
            )

        mock_qs = MagicMock()
        mock_qs.count.return_value = 50
        with patch(
            "app_tasks.management.commands.backfill_daily_billing.timezone.localdate",
            return_value=date(2026, 5, 8),
        ):
            with patch(
                "app_tasks.management.commands.backfill_daily_billing.User.objects.filter",
                return_value=mock_qs,
            ):
                call_command(
                    "backfill_daily_billing",
                    from_date="2026-05-01",
                    to_date="2026-05-08",
                    schema=self.schema_name,
                )

        with schema_context(self.schema_name):
            self.assertEqual(Billing.objects.count(), 8)
            self.assertEqual(
                Billing.objects.get(billing_date=date(2026, 5, 2)).active_user_count,
                15,
            )
