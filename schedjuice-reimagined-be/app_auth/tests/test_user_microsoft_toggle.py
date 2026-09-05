"""Tests for the admin-only ``create_microsoft_account`` toggle on user create.

Strict-create semantics are preserved: when the toggle is on (default) and the
tenant has Microsoft enabled, creation provisions an Entra account. Only
superadmin/admin actors may opt out; lower roles / hidden clients are coerced
back to the default-on behavior.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app_auth.models import User
from app_auth.serializers import UserSerializer


def _tenant(microsoft_on=True):
    return SimpleNamespace(
        is_microsoft_on=microsoft_on,
        is_student_login_disabled=True,  # skip the welcome-email branch
        schema_name="xschedjuice",
    )


def _request(tenant):
    # rest_flex_fields reads request.query_params.getlist(...) at serializer init.
    return SimpleNamespace(
        tenant=tenant,
        query_params=SimpleNamespace(getlist=lambda _field: []),
    )


def _admin_actor():
    return SimpleNamespace(roles=[User.UserRole.ADMIN])


def _plain_actor():
    return SimpleNamespace(roles=[User.UserRole.TEACHER])


class UserCreateMicrosoftToggleTests(unittest.TestCase):
    def _run_create(self, *, toggle, actor, tenant, extra=None):
        """Drive UserSerializer.create with all DB/Graph side effects mocked.

        Returns the validated_data dict captured by the patched base create so
        callers can assert whether ``microsoft_id`` was populated.
        """
        captured = {}
        created_user = MagicMock()

        def fake_super_create(validated_data):
            captured.update(validated_data)
            return created_user

        ser = UserSerializer(context={"request": _request(tenant)})
        validated_data = {
            "email": "person@good.com",
            "name": "Person",
            "password": "pw-12345",
            "roles": [User.UserRole.TEACHER],
            "custom_data": {},
        }
        if toggle is not None:
            validated_data["create_microsoft_account"] = toggle
        if extra:
            validated_data.update(extra)

        with patch.object(User, "get_user_from_request", return_value=actor), patch(
            "app_auth.serializers.refresh_profile_completeness"
        ), patch("app_auth.serializers.validate_user_custom_data_for_write"), patch(
            "app_auth.serializers.CreateUserFlow"
        ) as flow_cls, patch(
            "utilitas.serializers.BaseModelSerializer.create",
            side_effect=fake_super_create,
        ), patch(
            "app_auth.serializers.Visibility"
        ), patch(
            "app_auth.serializers.async_task"
        ):
            flow_cls.return_value.start.return_value = "ms-created"
            ser.create(validated_data)

        return captured, flow_cls

    def test_default_toggle_provisions_microsoft_account(self):
        captured, flow_cls = self._run_create(
            toggle=None, actor=_admin_actor(), tenant=_tenant()
        )
        flow_cls.assert_called_once()
        self.assertEqual(captured.get("microsoft_id"), "ms-created")

    def test_admin_opt_out_skips_microsoft_account(self):
        captured, flow_cls = self._run_create(
            toggle=False, actor=_admin_actor(), tenant=_tenant()
        )
        flow_cls.assert_not_called()
        self.assertIsNone(captured.get("microsoft_id"))

    def test_non_admin_cannot_opt_out(self):
        captured, flow_cls = self._run_create(
            toggle=False, actor=_plain_actor(), tenant=_tenant()
        )
        flow_cls.assert_called_once()
        self.assertEqual(captured.get("microsoft_id"), "ms-created")

    def test_microsoft_off_never_provisions(self):
        captured, flow_cls = self._run_create(
            toggle=True, actor=_admin_actor(), tenant=_tenant(microsoft_on=False)
        )
        flow_cls.assert_not_called()
        self.assertIsNone(captured.get("microsoft_id"))

    def test_omit_display_name_defaults_to_name(self):
        captured, flow_cls = self._run_create(
            toggle=None, actor=_admin_actor(), tenant=_tenant()
        )
        self.assertEqual(flow_cls.call_args[0][3], "Person")
        self.assertEqual(captured.get("microsoft_display_name"), "Person")

    def test_override_display_name_on_create(self):
        captured, flow_cls = self._run_create(
            toggle=None,
            actor=_admin_actor(),
            tenant=_tenant(),
            extra={"microsoft_display_name": "Teams Display"},
        )
        self.assertEqual(flow_cls.call_args[0][3], "Teams Display")
        self.assertEqual(captured.get("microsoft_display_name"), "Teams Display")

    def test_ms_off_ignores_display_name_in_payload(self):
        captured, flow_cls = self._run_create(
            toggle=True,
            actor=_admin_actor(),
            tenant=_tenant(microsoft_on=False),
            extra={"microsoft_display_name": "Teams Display"},
        )
        flow_cls.assert_not_called()
        self.assertNotIn("microsoft_display_name", captured)


if __name__ == "__main__":
    unittest.main()
