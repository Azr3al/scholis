"""Tests for User.microsoft_display_name create/update/link/provision behavior."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_auth.serializers import UserSerializer


def _tenant(microsoft_on=True):
    return SimpleNamespace(
        is_microsoft_on=microsoft_on,
        is_student_login_disabled=True,
        schema_name="xschedjuice",
    )


def _request(tenant):
    return SimpleNamespace(
        tenant=tenant,
        query_params=SimpleNamespace(getlist=lambda _field: []),
    )


def _instance(**overrides):
    base = dict(
        pk=42,
        id=42,
        name="Local Name",
        microsoft_id="ms-uuid-1",
        microsoft_display_name="Old Teams Name",
        roles=[User.UserRole.TEACHER],
        custom_data={},
        public_profile_slug=None,
        scoped_programs=MagicMock(values_list=MagicMock(return_value=[])),
        scoped_categories=MagicMock(values_list=MagicMock(return_value=[])),
        refresh_from_db=MagicMock(),
        save=MagicMock(),
        set_password=MagicMock(),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class UserMicrosoftDisplayNameUpdateTests(unittest.TestCase):
    def _run_update(self, instance, attrs, *, tenant=None):
        tenant = tenant or _tenant()
        ser = UserSerializer(
            instance=instance,
            data=attrs,
            context={"request": _request(tenant)},
            partial=True,
        )
        validated = ser.validate(attrs)
        with patch(
            "app_auth.serializers.validate_user_custom_data_for_write",
            return_value=validated.get("custom_data", {}),
        ), patch(
            "utilitas.serializers.BaseModelSerializer.update",
            return_value=instance,
        ) as super_update, patch(
            "app_auth.serializers.refresh_profile_completeness"
        ), patch(
            "app_auth.serializers.should_assign_public_profile_slug",
            return_value=False,
        ), patch(
            "app_microsoft.graph_wrapper.user.MSUser"
        ) as ms_user_cls:
            ms_user_cls.return_value.update_name.return_value = MagicMock(
                status_code=200,
                json=MagicMock(return_value={}),
            )
            ser.update(instance, validated)
        return ms_user_cls, super_update

    def test_update_patches_entra_before_save(self):
        instance = _instance()
        ms_user_cls, super_update = self._run_update(
            instance,
            {"microsoft_display_name": "New Teams Name"},
        )
        ms_user_cls.return_value.update_name.assert_called_once_with(
            "ms-uuid-1", "New Teams Name"
        )
        super_update.assert_called_once()
        self.assertEqual(
            super_update.call_args[0][1]["microsoft_display_name"],
            "New Teams Name",
        )

    def test_graph_patch_failure_blocks_local_save(self):
        instance = _instance()
        ser = UserSerializer(
            instance=instance,
            data={"microsoft_display_name": "New Teams Name"},
            context={"request": _request(_tenant())},
            partial=True,
        )
        validated = ser.validate({"microsoft_display_name": "New Teams Name"})
        with patch(
            "app_auth.serializers.should_assign_public_profile_slug",
            return_value=False,
        ), patch(
            "app_microsoft.graph_wrapper.user.MSUser"
        ) as ms_user_cls, patch(
            "utilitas.serializers.BaseModelSerializer.update"
        ) as super_update:
            ms_user_cls.return_value.update_name.return_value = MagicMock(
                status_code=400,
                json=MagicMock(return_value={"error": "bad"}),
            )
            with self.assertRaises(ValidationError) as ctx:
                ser.update(instance, validated)
            self.assertIn("MS_ERROR", ctx.exception.detail)
            super_update.assert_not_called()

    def test_update_name_only_does_not_patch_entra(self):
        instance = _instance()
        ms_user_cls, _ = self._run_update(instance, {"name": "Renamed Local"})
        ms_user_cls.return_value.update_name.assert_not_called()

    def test_update_without_microsoft_id_skips_graph(self):
        instance = _instance(microsoft_id=None)
        ms_user_cls, super_update = self._run_update(
            instance,
            {"microsoft_display_name": "Pre-link Name"},
        )
        ms_user_cls.return_value.update_name.assert_not_called()
        self.assertEqual(
            super_update.call_args[0][1]["microsoft_display_name"],
            "Pre-link Name",
        )

    def test_blank_display_name_rejected_on_update(self):
        instance = _instance()
        ser = UserSerializer(
            instance=instance,
            data={"microsoft_display_name": "   "},
            context={"request": _request(_tenant())},
            partial=True,
        )
        with self.assertRaises(ValidationError) as ctx:
            ser.validate({"microsoft_display_name": "   "})
        self.assertIn("microsoft_display_name", ctx.exception.detail)


class UserMicrosoftDisplayNameValidateTests(unittest.TestCase):
    def test_validate_pops_display_name_when_ms_off(self):
        ser = UserSerializer(
            data={"microsoft_display_name": "Teams Display"},
            context={"request": _request(_tenant(microsoft_on=False))},
        )
        with patch("app_auth.serializers.active_definitions_qs", return_value=[]), patch(
            "app_auth.serializers.validate_user_custom_data_for_write",
            return_value={},
        ):
            attrs = ser.validate({"microsoft_display_name": "Teams Display"})
        self.assertNotIn("microsoft_display_name", attrs)


class ProvisionUserDisplayNameTests(unittest.TestCase):
    def test_provision_uses_stored_display_name_not_name(self):
        user = SimpleNamespace(
            id=1,
            email="teacher@good.com",
            name="Local Name",
            microsoft_display_name="Teams Display",
            microsoft_id=None,
            roles=["teacher"],
            check_password=MagicMock(return_value=False),
            save=MagicMock(),
        )
        flow = MagicMock()
        flow.start.return_value = "ms-new"
        with patch(
            "app_microsoft.provisioning.CreateUserFlow", return_value=flow
        ) as flow_cls:
            from app_microsoft.provisioning import provision_user_account

            provision_user_account(
                user,
                SimpleNamespace(
                    is_microsoft_on=True,
                    staff_license_id="staff-lic",
                    student_license_id="student-lic",
                ),
            )
        self.assertEqual(flow_cls.call_args[0][3], "Teams Display")


class LinkUserDisplayNameTests(unittest.TestCase):
    def test_link_copies_graph_display_name(self):
        user = SimpleNamespace(
            pk=1,
            email="teacher@good.com",
            name="Local Name",
            microsoft_id=None,
            microsoft_display_name="",
            save=MagicMock(),
        )
        graph_body = {
            "id": "ms-linked",
            "displayName": "Graph Display Name",
            "userPrincipalName": "teacher@good.com",
        }
        ok = MagicMock(status_code=200, json=MagicMock(return_value=graph_body))
        with patch(
            "app_microsoft.provisioning.MSUser"
        ) as ms_user_cls, patch(
            "app_microsoft.provisioning.User.objects.filter"
        ) as filter_cls, patch(
            "app_microsoft.provisioning.get_organization_approved_domains",
            return_value=["good.com"],
        ), patch(
            "app_microsoft.provisioning.email_domain_allowed",
            return_value=True,
        ):
            ms_user_cls.return_value.find_by_upn.return_value = ok
            filter_cls.return_value.exclude.return_value.first.return_value = None
            from app_microsoft.provisioning import link_user_account

            link_user_account(user, SimpleNamespace(), "teacher@good.com")
        self.assertEqual(user.microsoft_id, "ms-linked")
        self.assertEqual(user.microsoft_display_name, "Graph Display Name")
        user.save.assert_called_once()


if __name__ == "__main__":
    unittest.main()
