"""Unit tests for unlicensed Microsoft account tracking and bulk license repair."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.exceptions import ValidationError

from app_microsoft.provisioning import (
    STATUS_MISSING_LICENSE,
    assign_license_to_user,
    evaluate_unlicensed_user_candidate,
    provision_user_account,
)

def _tenant(**overrides):
    base = dict(
        is_microsoft_on=True,
        staff_license_id="staff-sku",
        student_license_id="student-sku",
    )
    base.update(overrides)
    merged = {**base, **overrides}
    return SimpleNamespace(**merged)

def _user(**overrides):
    base = dict(
        id=1,
        email="student@school.com",
        name="Student",
        microsoft_id="ms-1",
        microsoft_license_assigned=False,
        roles=["student"],
        save=MagicMock(),
    )
    base.update(overrides)
    return SimpleNamespace(**base)

def _ok_response(json_data=None, status_code=200):
    res = MagicMock()
    res.status_code = status_code
    res.json.return_value = json_data or {}
    res.text = ""
    return res

class EvaluateUnlicensedUserCandidateTests(unittest.TestCase):

    def test_missing_license_when_sku_not_configured(self):
        res = evaluate_unlicensed_user_candidate(
            _user(), _tenant(student_license_id=None)
        )
        self.assertEqual(res["status"], STATUS_MISSING_LICENSE)

    def test_already_linked_when_license_assigned(self):
        res = evaluate_unlicensed_user_candidate(
            _user(microsoft_license_assigned=True), _tenant()
        )
        self.assertEqual(res["status"], "already_linked")

class AssignLicenseToUserTests(unittest.TestCase):
    @patch("app_microsoft.provisioning.assert_license_available_for_user_type")
    @patch("app_microsoft.provisioning.MSUser")
    def test_assigns_and_flips_flag(self, ms_user_cls, assert_available):
        user = _user()
        ms_user_cls.return_value.assign_license.return_value = _ok_response()

        outcome = assign_license_to_user(user, _tenant())

        self.assertEqual(outcome["status"], "licensed")
        self.assertTrue(user.microsoft_license_assigned)
        user.save.assert_called_once_with(update_fields=["microsoft_license_assigned"])

    @patch("app_microsoft.provisioning.assert_license_available_for_user_type")
    def test_raises_when_no_seats(self, assert_available):
        assert_available.side_effect = ValidationError(
            {"license_blocked": True, "MS_ERROR": {"error": {"message": "no seats"}}}
        )
        with self.assertRaises(ValidationError):
            assign_license_to_user(_user(), _tenant())

class ProvisionUserAccountUnlicensedTests(unittest.TestCase):
    @patch("app_microsoft.provisioning.CreateUserFlow")
    def test_creates_without_license_when_requested(self, flow_cls):
        user = _user(microsoft_id=None)
        flow = MagicMock()
        flow.start.return_value = "ms-new"
        flow_cls.return_value = flow

        outcome = provision_user_account(user, _tenant(), assign_license=False)

        self.assertEqual(outcome["status"], "created")
        flow_cls.assert_called_once()
        self.assertFalse(flow_cls.call_args.kwargs["assign_license"])
        self.assertFalse(user.microsoft_license_assigned)
        user.save.assert_called_once_with(
            update_fields=["microsoft_id", "microsoft_license_assigned"]
        )

if __name__ == "__main__":
    unittest.main()
