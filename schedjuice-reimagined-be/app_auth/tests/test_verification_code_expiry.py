import datetime
from unittest.mock import patch

import pytz
from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User, VerificationCode


class VerificationCodeExpiryTest(APITestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_expired_verification_code_is_rejected(self):
        email = "student@schedjuice.com"
        with schema_context(self.schema_name):
            code = VerificationCode.objects.create(
                email=email,
                digit_code="123456",
                source=VerificationCode.Source.EMAIL_VERIFICATION,
            )
            VerificationCode.objects.filter(pk=code.pk).update(
                created_at=datetime.datetime.now(tz=pytz.UTC)
                - datetime.timedelta(hours=3)
            )
        res = self.client.post(
            reverse("verification-code-validate"),
            {"email": email, "code": "123456"},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["message"], "invalid_code")
