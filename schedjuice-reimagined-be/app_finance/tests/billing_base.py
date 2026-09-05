from datetime import date
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_finance.models import Billing
from app_organization.models import Organization


class BillingTenantAwareBaseTest(APITestCase):
    schema_name = "xschedjuice"
    teacher_email = "teacher@schedjuice.com"
    teacher_password = "password123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", schema_name=cls.schema_name, verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.teacher_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _get_access_token(self):
        res = self.client.post(
            reverse("login"),
            {"email": self.teacher_email, "password": self.teacher_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _auth_headers(self):
        token = self._get_access_token()
        return {
            "HTTP_AUTHORIZATION": f"Bearer {token}",
            "HTTP_X_DTS_SCHEMA": self.schema_name,
        }


