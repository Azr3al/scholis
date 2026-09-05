"""Unit tests for CreateUserFlow license pre-check and rollback behavior."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.exceptions import ValidationError

from app_microsoft.flows import CreateUserFlow

def _tenant(**overrides):
    base = dict(
        staff_license_id="staff-sku",
        student_license_id="student-sku",
    )
    base.update(overrides)
    return SimpleNamespace(**base)

def _ok_response(json_data=None, status_code=200):
    res = MagicMock()
    res.status_code = status_code
    res.json.return_value = json_data or {}
    res.text = ""
    return res

class CreateUserFlowLicensePrecheckTests(unittest.TestCase):
    def _flow(self, user_type="student", tenant=None):
        return CreateUserFlow(
            "student@school.com",
            "Password1!",
            user_type,
            "Student One",
            tenant or _tenant(),
        )

    @patch("app_microsoft.flows.assert_license_available_for_user_type")
    @patch("app_microsoft.flows.MSUser")
    def test_blocks_before_create_when_no_licenses_available(
        self, ms_user_cls, assert_available
    ):
        assert_available.side_effect = ValidationError(
            {
                "MS_ERROR": {
                    "error": {
                        "message": (
                            "Subscription with SKU student-sku does not have "
                            "any available licenses."
                        )
                    }
                },
                "step": "license availability check",
            }
        )
        flow = self._flow()

        with self.assertRaises(ValidationError) as ctx:
            flow.start()

        assert_available.assert_called_once_with(flow.tenant, "student")
        ms_user_cls.return_value.create.assert_not_called()

        detail = ctx.exception.detail
        self.assertIn("MS_ERROR", detail)
        self.assertIn("does not have any available licenses", str(detail))

    @patch("app_microsoft.flows.assert_license_available_for_user_type")
    @patch("app_microsoft.flows.MSUser")
    def test_blocks_before_create_when_license_not_configured(
        self, ms_user_cls, assert_available
    ):
        assert_available.side_effect = ValidationError(
            {
                "MS_ERROR": {
                    "error": {
                        "message": "No student license configured for this organization."
                    }
                },
                "step": "license availability check",
            }
        )
        flow = self._flow(tenant=_tenant(student_license_id=None))

        with self.assertRaises(ValidationError):
            flow.start()

        ms_user_cls.return_value.create.assert_not_called()

    @patch("app_microsoft.flows.time.sleep")
    @patch("app_microsoft.flows.assert_license_available_for_user_type")
    @patch("app_microsoft.flows.MSUser")
    def test_unlicensed_flow_skips_precheck_and_license_assignment(
        self, ms_user_cls, assert_available, sleep_mock
    ):
        ms_user = ms_user_cls.return_value
        ms_user.create.return_value = _ok_response({"id": "ms-user-1"})
        ms_user.enable_mail.return_value = _ok_response()

        flow = CreateUserFlow(
            "student@school.com",
            "Password1!",
            "student",
            "Student One",
            _tenant(),
            assign_license=False,
        )
        result = flow.start()

        self.assertEqual(result, "ms-user-1")
        assert_available.assert_not_called()
        ms_user.assign_license.assert_not_called()

    @patch("app_microsoft.flows._rollback_entra_user")
    @patch("app_microsoft.flows.time.sleep")
    @patch("app_microsoft.flows.assert_license_available_for_user_type")
    @patch("app_microsoft.flows.MSUser")
    def test_license_assign_failure_triggers_rollback(
        self, ms_user_cls, assert_available, sleep_mock, rollback_mock
    ):
        ms_user = ms_user_cls.return_value
        ms_user.create.return_value = _ok_response({"id": "ms-user-1"})
        ms_user.enable_mail.return_value = _ok_response()
        ms_user.assign_license.return_value = _ok_response(
            {"error": {"message": "no licenses"}}, status_code=400
        )

        flow = self._flow()
        with self.assertRaises(ValidationError) as ctx:
            flow.start()

        rollback_mock.assert_called_once_with(ms_user, "ms-user-1")
        self.assertEqual(ctx.exception.detail.get("step"), "license assignment")

    @patch("app_microsoft.flows._rollback_entra_user")
    @patch("app_microsoft.flows.time.sleep")
    @patch("app_microsoft.flows.assert_license_available_for_user_type")
    @patch("app_microsoft.flows.MSUser")
    def test_mail_enable_failure_triggers_rollback(
        self, ms_user_cls, assert_available, sleep_mock, rollback_mock
    ):
        ms_user = ms_user_cls.return_value
        ms_user.create.return_value = _ok_response({"id": "ms-user-1"})
        ms_user.enable_mail.return_value = _ok_response(
            {"error": {"message": "mail failed"}}, status_code=400
        )

        flow = self._flow()
        with self.assertRaises(ValidationError):
            flow.start()

        rollback_mock.assert_called_once_with(ms_user, "ms-user-1")
        ms_user.assign_license.assert_not_called()

class MSLicenseAvailabilityTests(unittest.TestCase):
    @patch("app_microsoft.graph_wrapper.license.graph_call_with_retry")
    @patch("app_microsoft.graph_wrapper.license.BaseMSRequest.get_token")
    def test_available_units_for_sku(self, get_token_mock, retry_mock):
        from app_microsoft.graph_wrapper.license import MSLicense

        retry_mock.return_value = _ok_response(
            {
                "value": [
                    {
                        "skuId": "student-sku",
                        "prepaidUnits": {"enabled": 10},
                        "consumedUnits": 7,
                    }
                ]
            }
        )
        tenant = _tenant()
        available = MSLicense(tenant).available_units_for_sku("student-sku")
        self.assertEqual(available, 3)

    @patch("app_microsoft.graph_wrapper.license.graph_call_with_retry")
    @patch("app_microsoft.graph_wrapper.license.BaseMSRequest.get_token")
    def test_available_units_returns_zero_when_sku_missing(
        self, get_token_mock, retry_mock
    ):
        from app_microsoft.graph_wrapper.license import MSLicense

        retry_mock.return_value = _ok_response({"value": []})
        tenant = _tenant()
        available = MSLicense(tenant).available_units_for_sku("missing-sku")
        self.assertEqual(available, 0)

    @patch("app_microsoft.graph_wrapper.license.graph_call_with_retry")
    @patch("app_microsoft.graph_wrapper.license.BaseMSRequest.get_token")
    def test_assert_raises_when_no_seats_available(self, get_token_mock, retry_mock):
        from app_microsoft.graph_wrapper.license import (
            assert_license_available_for_user_type,
        )

        retry_mock.return_value = _ok_response(
            {
                "value": [
                    {
                        "skuId": "student-sku",
                        "prepaidUnits": {"enabled": 5},
                        "consumedUnits": 5,
                    }
                ]
            }
        )
        tenant = _tenant()
        with self.assertRaises(ValidationError) as ctx:
            assert_license_available_for_user_type(tenant, "student")

        self.assertIn("does not have any available licenses", str(ctx.exception.detail))
        self.assertTrue(ctx.exception.detail.get("license_blocked"))

    @patch("app_microsoft.graph_wrapper.license.graph_call_with_retry")
    @patch("app_microsoft.graph_wrapper.license.BaseMSRequest.get_token")
    def test_available_units_returns_none_on_403(self, get_token_mock, retry_mock):
        from app_microsoft.graph_wrapper.license import (
            MSLicense,
            assert_license_available_for_user_type,
        )

        retry_mock.return_value = _ok_response(status_code=403)
        tenant = _tenant()
        available = MSLicense(tenant).available_units_for_sku("student-sku")
        self.assertIsNone(available)
        # Pre-check should skip (not raise) when inventory cannot be read.
        assert_license_available_for_user_type(tenant, "student")

class RollbackEntraUserTests(unittest.TestCase):
    @patch("app_microsoft.flows.logger")
    def test_logs_error_when_delete_fails(self, logger_mock):
        from app_microsoft.flows import _rollback_entra_user

        ms_user = MagicMock()
        ms_user.delete_with_retry.return_value = _ok_response(
            {"error": {"message": "forbidden"}}, status_code=403
        )

        _rollback_entra_user(ms_user, "ms-user-1")

        ms_user.delete_with_retry.assert_called_once_with("ms-user-1")
        logger_mock.error.assert_called_once()

if __name__ == "__main__":
    unittest.main()
