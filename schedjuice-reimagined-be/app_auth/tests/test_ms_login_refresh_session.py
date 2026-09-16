from unittest.mock import patch

from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import RefreshSession, User


class MSLoginRefreshSessionTest(APITestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            User.objects.filter(email="james@schedjuice.com").update(
                is_password_change_required=False,
                is_active=True,
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    @patch(
        "app_auth.serializers.connect_personal_teams_from_login_token",
        return_value=(False, None),
    )
    @patch("app_auth.serializers.get_user_from_MS_token")
    def test_ms_login_remember_creates_refresh_session(self, mock_get_user, _mock_teams):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
        mock_get_user.return_value = user

        res = self.client.post(
            reverse("ms-login"),
            {"token": "fake-ms-token", "remember": True},
            **self._tenant_headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertIn("session_id", res.data)

        with schema_context(self.schema_name):
            session = RefreshSession.objects.get(session_id=res.data["session_id"])
            self.assertTrue(session.remembered)
            remembered_days = (session.expires_at - timezone.now()).days
            self.assertGreaterEqual(remembered_days, 85)
            self.assertLessEqual(remembered_days, 91)
