from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AITenantUsageMonthly
from app_auth.models import User
from app_finance.models import Billing
from app_organization.models import Organization, PlatformInvoice
from app_organization.platform_invoice import (
    PlatformInvoiceValidationError,
    build_platform_invoice_snapshot,
    create_platform_invoice,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PlatformInvoiceBuilderTests(TestCase):
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
                email=f"sa-inv-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)
            PlatformInvoice.objects.filter(organization=self.customer_org).delete()
            from app_organization.models import PlatformInvoiceCounter

            PlatformInvoiceCounter.objects.all().delete()

        with schema_context(self.customer_schema):
            Billing.objects.filter(
                billing_date__year=2026,
                billing_date__month=6,
            ).delete()
            Billing.objects.create(
                billing_date=date(2026, 6, 1),
                active_user_count=10,
                cost_per_account_at_creation=50,
            )
            Billing.objects.create(
                billing_date=date(2026, 6, 2),
                active_user_count=12,
                cost_per_account_at_creation=50,
            )

    def test_snapshot_platform_subtotal_matches_billing_payload(self):
        snapshot = build_platform_invoice_snapshot(self.customer_org, 2026, 6)
        self.assertEqual(snapshot["totals"]["platform_subtotal"], 1100)
        platform_line = next(
            li for li in snapshot["line_items"] if li["kind"] == "platform_seats"
        )
        self.assertEqual(platform_line["amount"], 1100)
        self.assertEqual(platform_line["quantity"], 22)

    def test_ai_line_absent_when_disabled(self):
        with schema_context(get_public_schema_name()):
            self.customer_org.is_ai_enabled = False
            self.customer_org.save(update_fields=["is_ai_enabled"])

        snapshot = build_platform_invoice_snapshot(self.customer_org, 2026, 6)
        kinds = {li["kind"] for li in snapshot["line_items"]}
        self.assertNotIn("ai_usage", kinds)
        self.assertNotIn("ai_subtotal_usd", snapshot["totals"])

    def test_ai_line_present_when_enabled_and_usage_exists(self):
        with schema_context(get_public_schema_name()):
            self.customer_org.is_ai_enabled = True
            self.customer_org.save(update_fields=["is_ai_enabled"])
            AITenantUsageMonthly.objects.create(
                tenant=self.customer_org,
                year=2026,
                month=6,
                model="gpt-test",
                total_billed_usd=Decimal("3.50"),
                total_tokens=1000,
                request_count=5,
            )

        snapshot = build_platform_invoice_snapshot(self.customer_org, 2026, 6)
        ai_lines = [li for li in snapshot["line_items"] if li["kind"] == "ai_usage"]
        self.assertEqual(len(ai_lines), 1)
        self.assertEqual(snapshot["totals"]["ai_subtotal_usd"], "3.50")

    def test_rejects_demo_org(self):
        with schema_context(get_public_schema_name()):
            self.customer_org.is_demo = True
            self.customer_org.save(update_fields=["is_demo"])
        with self.assertRaises(PlatformInvoiceValidationError):
            build_platform_invoice_snapshot(self.customer_org, 2026, 6)

    def test_rejects_empty_month(self):
        with schema_context(self.customer_schema):
            Billing.objects.filter(billing_date__year=2026, billing_date__month=7).delete()
        with schema_context(get_public_schema_name()):
            self.customer_org.is_ai_enabled = False
            self.customer_org.save(update_fields=["is_ai_enabled"])
        with self.assertRaises(PlatformInvoiceValidationError):
            build_platform_invoice_snapshot(self.customer_org, 2026, 7)

    def test_flat_rate_line_when_configured(self):
        with schema_context(get_public_schema_name()):
            self.customer_org.platform_monthly_flat_rate = 25000
            self.customer_org.save(update_fields=["platform_monthly_flat_rate"])

        snapshot = build_platform_invoice_snapshot(self.customer_org, 2026, 6)
        flat_line = next(
            li for li in snapshot["line_items"] if li["kind"] == "platform_flat_rate"
        )
        self.assertEqual(flat_line["amount"], 25000)
        self.assertEqual(snapshot["totals"]["flat_rate_subtotal"], 25000)
        self.assertEqual(snapshot["totals"]["platform_subtotal"], 0)
        kinds = {li["kind"] for li in snapshot["line_items"]}
        self.assertNotIn("platform_seats", kinds)

    def test_flat_rate_only_month_is_billable(self):
        with schema_context(self.customer_schema):
            Billing.objects.filter(billing_date__year=2026, billing_date__month=7).delete()
        with schema_context(get_public_schema_name()):
            self.customer_org.is_ai_enabled = False
            self.customer_org.platform_monthly_flat_rate = 50000
            self.customer_org.save(
                update_fields=["is_ai_enabled", "platform_monthly_flat_rate"]
            )

        snapshot = build_platform_invoice_snapshot(self.customer_org, 2026, 7)
        self.assertEqual(snapshot["totals"]["platform_subtotal"], 0)
        self.assertEqual(snapshot["totals"]["flat_rate_subtotal"], 50000)
        self.assertEqual(len(snapshot["line_items"]), 1)
        self.assertEqual(snapshot["line_items"][0]["kind"], "platform_flat_rate")

    def test_create_invoice_persists_and_assigns_number(self):
        invoice, created = create_platform_invoice(
            self.customer_org,
            2026,
            6,
            generated_by=self.superadmin,
        )
        self.assertTrue(created)
        self.assertEqual(invoice.invoice_number, 1)
        self.assertEqual(invoice.billing_year, 2026)
        self.assertEqual(invoice.billing_month, 6)
        self.assertEqual(invoice.generated_by_user_id, self.superadmin.pk)
        self.assertEqual(invoice.generated_by_email, self.superadmin.email)

    def test_create_invoice_stores_email_when_no_orm_user(self):
        invoice, created = create_platform_invoice(
            self.customer_org,
            2026,
            6,
            generated_by=None,
            generated_by_email="jwt-user@example.com",
        )
        self.assertTrue(created)
        self.assertIsNone(invoice.generated_by_user_id)
        self.assertEqual(invoice.generated_by_email, "jwt-user@example.com")

    def test_regenerate_replaces_existing_invoice_for_period(self):
        first, _ = create_platform_invoice(
            self.customer_org, 2026, 6, generated_by=self.superadmin
        )
        with schema_context(self.customer_schema):
            Billing.objects.create(
                billing_date=date(2026, 6, 3),
                active_user_count=20,
                cost_per_account_at_creation=50,
            )
        second, created = create_platform_invoice(
            self.customer_org, 2026, 6, generated_by=self.superadmin
        )
        self.assertFalse(created)
        self.assertEqual(second.pk, first.pk)
        self.assertEqual(second.invoice_number, first.invoice_number)
        self.assertEqual(second.totals["platform_subtotal"], 2100)
        with schema_context(get_public_schema_name()):
            count = PlatformInvoice.objects.filter(
                organization=self.customer_org,
                billing_year=2026,
                billing_month=6,
            ).count()
        self.assertEqual(count, 1)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PlatformInvoiceEndpointTests(TestCase):
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
                email=f"sa-api-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.admin = User.objects.create_user(
                email=f"adm-api-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)
            PlatformInvoice.objects.filter(organization=self.customer_org).delete()
            from app_organization.models import PlatformInvoiceCounter

            PlatformInvoiceCounter.objects.all().delete()

        with schema_context(self.customer_schema):
            Billing.objects.filter(
                billing_date__year=2026,
                billing_date__month=8,
            ).delete()
            Billing.objects.create(
                billing_date=date(2026, 8, 1),
                active_user_count=5,
                cost_per_account_at_creation=100,
            )

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_post_generates_invoice(self):
        resp = self._client(self.superadmin, self.admin_schema).post(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-invoices",
            {"year": 2026, "month": 8},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(body["data"]["billing_month"], 8)
        self.assertEqual(body["data"]["totals"]["platform_subtotal"], 500)

    def test_post_regenerate_updates_existing_invoice(self):
        client = self._client(self.superadmin, self.admin_schema)
        url = f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-invoices"
        first = client.post(url, {"year": 2026, "month": 8}, format="json")
        self.assertEqual(first.status_code, 201, first.content)
        first_number = first.json()["data"]["invoice_number"]
        second = client.post(url, {"year": 2026, "month": 8}, format="json")
        self.assertEqual(second.status_code, 200, second.content)
        body = second.json()
        self.assertFalse(body["isError"])
        self.assertEqual(body["data"]["invoice_number"], first_number)
        list_resp = client.get(url)
        self.assertEqual(len(list_resp.json()["data"]), 1)

    def test_list_invoices(self):
        client = self._client(self.superadmin, self.admin_schema)
        url = f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-invoices"
        client.post(url, {"year": 2026, "month": 8}, format="json")
        resp = client.get(url)
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(len(body["data"]), 1)

    def test_detail_invoice(self):
        client = self._client(self.superadmin, self.admin_schema)
        create_url = (
            f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-invoices"
        )
        created = client.post(
            create_url, {"year": 2026, "month": 8}, format="json"
        ).json()["data"]
        resp = client.get(f"{self.api_prefix}/platform-invoices/{created['id']}")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"]["invoice_number"], created["invoice_number"])

    def test_forbidden_without_permission(self):
        resp = self._client(self.admin, self.admin_schema).post(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-invoices",
            {"year": 2026, "month": 8},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_patch_platform_billing_config(self):
        client = self._client(self.superadmin, self.admin_schema)
        url = (
            f"{self.api_prefix}/organizations/{self.customer_org.id}/platform-billing-config"
        )
        resp = client.patch(url, {"platform_monthly_flat_rate": 75000}, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(body["data"]["platform_monthly_flat_rate"], 75000)
        with schema_context(get_public_schema_name()):
            self.customer_org.refresh_from_db()
            self.assertEqual(self.customer_org.platform_monthly_flat_rate, 75000)
