from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.models import Role
from app_rbac.realtime import (
    RBAC_UPDATED_PAYLOAD,
    broadcast_rbac_updated_to_tenant,
    tenant_rbac_group_name,
)
from app_rbac.seeding import seed_rbac


class RbacRealtimeBroadcastTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.founder = User.objects.create(
                email="f@x.io",
                name="founder",
                phone_number="1",
                communication_email="f@x.io",
                code="rbac-broadcast-founder",
                roles=["admin"],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    @patch("app_rbac.api_views.broadcast_rbac_updated_to_tenant")
    @override_settings(RBAC_ENFORCE="enforce")
    def test_permission_put_broadcasts_rbac_updated_to_tenant(self, mock_broadcast):
        with schema_context(self.schema_name):
            role = Role.objects.get(slug="teacher")
            role_id = role.id

        response = self._client(self.founder).put(
            f"{self.api_prefix}/rbac/roles/{role_id}/permissions",
            {"codes": ["course.view"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mock_broadcast.assert_called_once_with(self.schema_name)

    @patch("app_rbac.realtime.get_channel_layer")
    def test_broadcast_rbac_updated_to_tenant_group_send(self, mock_get_layer):
        layer = MagicMock()
        mock_get_layer.return_value = layer

        broadcast_rbac_updated_to_tenant(self.schema_name)

        layer.group_send.assert_called_once()
        group_name, message = layer.group_send.call_args[0]
        self.assertEqual(group_name, tenant_rbac_group_name(self.schema_name))
        self.assertEqual(message, RBAC_UPDATED_PAYLOAD)
