from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM, issue_refresh_pair_for_tenant
from app_auth.models import User
from app_chat.middleware import _get_user_from_token

class WebSocketTenantAuthTests(TestCase):
    schema_name = "xschedjuice"
    other_schema = "xteachersu"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_rejects_token_when_tenant_claim_mismatches_connect_schema(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            _, access = issue_refresh_pair_for_tenant(user, self.schema_name)
        result = _get_user_from_token(access, self.other_schema)
        self.assertIsNone(result)

    def test_rejects_token_without_tenant_claim(self):
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            token = str(AccessToken.for_user(user))
        result = _get_user_from_token(token, self.schema_name)
        self.assertIsNone(result)
