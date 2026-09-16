from unittest.mock import patch

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM, issue_refresh_pair_for_tenant
from app_auth.models import User

class TenantBoundJwtSecurityTest(APITestCase):
    schema_name = "xschedjuice"
    other_schema = "xteachersu"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        call_command("load-data", schema=cls.other_schema, verbosity=0)
        with schema_context(cls.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_password_change_required=False,
                is_active=True,
            )

    def _tenant_headers(self, schema_name=None):
        return {"HTTP_X_DTS_SCHEMA": schema_name or self.schema_name}

    def _login_access(self):
        res = self.client.post(
            reverse("login"),
            {"email": "james@schedjuice.com", "password": "password123"},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def test_authenticated_request_rejects_cross_tenant_token(self):
        token = self._login_access()
        res = self.client.get(
            reverse("user-profile"),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            **self._tenant_headers(self.other_schema),
        )
        self.assertEqual(res.status_code, 401)

    def test_logout_all_rejects_cross_tenant_token(self):
        token = self._login_access()
        res = self.client.post(
            reverse("logout-all"),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            **self._tenant_headers(self.other_schema),
        )
        self.assertEqual(res.status_code, 401)

    def test_token_without_tenant_claim_is_rejected(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            token = str(AccessToken.for_user(user))
        res = self.client.post(
            reverse("logout-all"),
            HTTP_AUTHORIZATION=f"Bearer {token}",
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 401)

