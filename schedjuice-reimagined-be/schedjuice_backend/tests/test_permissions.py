from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from schedjuice_backend.permissions import IsMemberOfOrganization


class IsMemberOfOrganizationTests(SimpleTestCase):
    def test_schema_name_must_match_request_tenant(self):
        permission = IsMemberOfOrganization()
        request = MagicMock()
        request.user.id = "admin@example.com"
        request.tenant = MagicMock(schema_name="tenant_a")

        obj = MagicMock(schema_name="tenant_b")
        with patch(
            "schedjuice_backend.permissions.get_user", return_value=MagicMock()
        ):
            self.assertFalse(permission.has_object_permission(request, None, obj))

        obj.schema_name = "tenant_a"
        with patch(
            "schedjuice_backend.permissions.get_user", return_value=MagicMock()
        ):
            self.assertTrue(permission.has_object_permission(request, None, obj))

    def test_denies_when_user_missing(self):
        permission = IsMemberOfOrganization()
        request = MagicMock()
        request.user.id = "missing@example.com"
        request.tenant = MagicMock(schema_name="tenant_a")
        obj = MagicMock(schema_name="tenant_a")

        with patch("schedjuice_backend.permissions.get_user", return_value=None):
            self.assertFalse(permission.has_object_permission(request, None, obj))
