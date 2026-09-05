from datetime import timedelta

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization, ZoomAccount


@override_settings(ZOOM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class ZoomAccountModelTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        cls.org = Organization.objects.get(schema_name="xschedjuice")

    def test_unique_per_org_account_id(self):
        with schema_context(get_public_schema_name()):
            ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_unique_a",
                expires_at=timezone.now() + timedelta(hours=1),
            )
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    ZoomAccount.objects.create(
                        organization=self.org,
                        account_id="acct_unique_a",
                        expires_at=timezone.now() + timedelta(hours=1),
                    )

    def test_set_tokens_encrypts(self):
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_tokens",
                expires_at=timezone.now() + timedelta(hours=1),
            )
            za.set_tokens(access_token="ACCESS-PLAIN", refresh_token="REFRESH-PLAIN")
            za.refresh_from_db()
            self.assertNotIn("ACCESS-PLAIN", za.access_token_ct)
            self.assertNotIn("REFRESH-PLAIN", za.refresh_token_ct)
            self.assertEqual(za.access_token, "ACCESS-PLAIN")
            self.assertEqual(za.refresh_token, "REFRESH-PLAIN")

    def test_set_tokens_partial_does_not_clobber_other(self):
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_partial",
                expires_at=timezone.now() + timedelta(hours=1),
            )
            za.set_tokens(access_token="A1", refresh_token="R1")
            za.set_tokens(access_token="A2")
            za.refresh_from_db()
            self.assertEqual(za.access_token, "A2")
            self.assertEqual(za.refresh_token, "R1")

    def test_organization_has_active_zoom_account(self):
        with schema_context(get_public_schema_name()):
            self.assertFalse(self.org.has_active_zoom_account())
            ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_active",
                status=ZoomAccount.Status.ACTIVE,
                expires_at=timezone.now() + timedelta(hours=1),
            )
            self.assertTrue(self.org.has_active_zoom_account())

    def test_disconnected_does_not_count_as_active(self):
        with schema_context(get_public_schema_name()):
            self.assertFalse(self.org.has_active_zoom_account())
            ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_disconnected",
                status=ZoomAccount.Status.DISCONNECTED,
                expires_at=timezone.now() + timedelta(hours=1),
            )
            self.assertFalse(self.org.has_active_zoom_account())

    def test_zoom_s2s_configured_is_deprecated_and_returns_false(self):
        with schema_context(get_public_schema_name()):
            from schedjuice_backend.test_tenant_helpers import (
                _reset_organization_id_sequence,
            )

            _reset_organization_id_sequence()
            org = Organization.objects.create(
                name="Legacy Org",
                domain_url="legacy.example.com",
                schema_name="xlegacyorg",
                available_domains=["legacy.example.com"],
                zoom_account_id="legacy",
                zoom_client_id="legacy",
                zoom_client_secret="legacy",
            )
            self.assertFalse(org.zoom_s2s_configured())

    def test_has_default_host(self):
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.create(
                organization=self.org,
                account_id="acct_host_check",
                expires_at=timezone.now() + timedelta(hours=1),
            )
            self.assertFalse(za.has_default_host())
            za.default_host_zoom_user_id = "U1"
            za.save(update_fields=["default_host_zoom_user_id"])
            self.assertTrue(za.has_default_host())
