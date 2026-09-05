"""Unit tests for the shared Microsoft provisioning service.

These avoid the database by passing lightweight stand-ins for the user/course
records and the tenant, and by mocking the Graph-backed flows. They cover
candidate classification, idempotency, and conflict propagation.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app_microsoft.flows import MicrosoftAlreadyExistsError
from app_microsoft.provisioning import (
    STATUS_ALREADY_LINKED,
    STATUS_INVALID_DOMAIN,
    STATUS_MICROSOFT_OFF,
    STATUS_MISSING_LICENSE,
    STATUS_MISSING_OWNER,
    STATUS_TEAMS_DISABLED,
    evaluate_course_candidate,
    evaluate_user_candidate,
    provision_course_team_for,
    provision_user_account,
    suggest_microsoft_matches,
    user_type_for_roles,
)
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD

def _tenant(**overrides):
    base = dict(
        is_microsoft_on=True,
        is_teams_creation_enabled=True,
        staff_license_id="staff-lic",
        student_license_id="student-lic",
        default_owner_id="owner-1",
    )
    base.update(overrides)
    return SimpleNamespace(**base)

def _user(**overrides):
    base = dict(
        id=1,
        email="teacher@good.com",
        name="Teacher One",
        microsoft_id=None,
        microsoft_display_name="",
        roles=["teacher"],
        save=MagicMock(),
    )
    base.update(overrides)
    return SimpleNamespace(**base)

def _course(**overrides):
    base = dict(id=7, title="Algebra", microsoft_group_id=None)
    base.update(overrides)
    return SimpleNamespace(**base)

APPROVED = ["good.com"]

class UserTypeForRolesTests(unittest.TestCase):
    def test_student_only_maps_to_student(self):
        self.assertEqual(user_type_for_roles(["student"]), "student")

    def test_mixed_or_staff_maps_to_staff(self):
        self.assertEqual(user_type_for_roles(["teacher"]), "staff")
        self.assertEqual(user_type_for_roles(["student", "teacher"]), "staff")
        self.assertEqual(user_type_for_roles([]), "staff")
        self.assertEqual(user_type_for_roles(None), "staff")

class EvaluateUserCandidateTests(unittest.TestCase):
    def test_microsoft_off(self):
        res = evaluate_user_candidate(_user(), _tenant(is_microsoft_on=False), APPROVED)
        self.assertEqual(res["status"], STATUS_MICROSOFT_OFF)

    def test_already_linked(self):
        res = evaluate_user_candidate(
            _user(microsoft_id="ms-1"), _tenant(), APPROVED
        )
        self.assertEqual(res["status"], STATUS_ALREADY_LINKED)

    def test_invalid_domain(self):
        res = evaluate_user_candidate(
            _user(email="teacher@bad.com"), _tenant(), APPROVED
        )
        self.assertEqual(res["status"], STATUS_INVALID_DOMAIN)

    def test_missing_staff_license(self):
        res = evaluate_user_candidate(
            _user(roles=["teacher"]), _tenant(staff_license_id=None), APPROVED
        )
        self.assertEqual(res["status"], STATUS_MISSING_LICENSE)

    def test_missing_student_license(self):
        res = evaluate_user_candidate(
            _user(roles=["student"]), _tenant(student_license_id=None), APPROVED
        )
        self.assertEqual(res["status"], STATUS_MISSING_LICENSE)

class EvaluateCourseCandidateTests(unittest.TestCase):
    def test_microsoft_off(self):
        res = evaluate_course_candidate(_course(), _tenant(is_microsoft_on=False))
        self.assertEqual(res["status"], STATUS_MICROSOFT_OFF)

    def test_teams_disabled(self):
        res = evaluate_course_candidate(
            _course(), _tenant(is_teams_creation_enabled=False)
        )
        self.assertEqual(res["status"], STATUS_TEAMS_DISABLED)

    def test_already_linked(self):
        res = evaluate_course_candidate(
            _course(microsoft_group_id="grp-1"), _tenant()
        )
        self.assertEqual(res["status"], STATUS_ALREADY_LINKED)

    def test_missing_owner(self):
        res = evaluate_course_candidate(_course(), _tenant(default_owner_id=None))
        self.assertEqual(res["status"], STATUS_MISSING_OWNER)

class ProvisionUserAccountTests(unittest.TestCase):
    def test_idempotent_when_already_linked(self):
        user = _user(microsoft_id="ms-existing")
        user.check_password = MagicMock(return_value=False)
        with patch("app_microsoft.provisioning.CreateUserFlow") as flow_cls:
            res = provision_user_account(user, _tenant())
        self.assertEqual(res["status"], STATUS_ALREADY_LINKED)
        self.assertEqual(res["microsoft_id"], "ms-existing")
        flow_cls.assert_not_called()

    def test_creates_and_persists_microsoft_id(self):
        user = _user()
        user.check_password = MagicMock(return_value=False)
        flow = MagicMock()
        flow.start.return_value = "ms-new"
        with patch(
            "app_microsoft.provisioning.CreateUserFlow", return_value=flow
        ) as flow_cls:
            res = provision_user_account(user, _tenant())
        self.assertEqual(res["status"], "created")
        self.assertEqual(res["microsoft_id"], "ms-new")
        self.assertEqual(user.microsoft_id, "ms-new")
        user.save.assert_called_once()
        flow_cls.assert_called_once()

    def test_uses_import_password_when_local_hash_matches(self):
        user = _user()
        user.check_password = MagicMock(
            side_effect=lambda candidate: candidate == IMPORT_PASSWORD
        )
        flow = MagicMock()
        flow.start.return_value = "ms-new"
        with patch(
            "app_microsoft.provisioning.CreateUserFlow", return_value=flow
        ) as flow_cls:
            provision_user_account(user, _tenant())
        self.assertEqual(flow_cls.call_args[0][1], IMPORT_PASSWORD)

    def test_conflict_propagates_already_exists(self):
        user = _user()
        user.check_password = MagicMock(return_value=False)
        flow = MagicMock()
        flow.start.side_effect = MicrosoftAlreadyExistsError(
            kind="user", identifier="person@good.com", detail="exists"
        )
        with patch("app_microsoft.provisioning.CreateUserFlow", return_value=flow):
            with self.assertRaises(MicrosoftAlreadyExistsError):
                provision_user_account(user, _tenant())
        # Local record must not be mutated on conflict.
        self.assertIsNone(user.microsoft_id)
        user.save.assert_not_called()

class ProvisionCourseTeamForTests(unittest.TestCase):
    def test_idempotent_when_already_linked(self):
        course = _course(microsoft_group_id="grp-existing")
        with patch("app_microsoft.provisioning.provision_course_team") as prov:
            res = provision_course_team_for(course, _tenant())
        self.assertEqual(res["status"], STATUS_ALREADY_LINKED)
        self.assertEqual(res["microsoft_group_id"], "grp-existing")
        prov.assert_not_called()

class SuggestMicrosoftMatchesTests(unittest.TestCase):
    def _response(self, status_code, json_body):
        res = MagicMock()
        res.status_code = status_code
        res.json.return_value = json_body
        return res

    @patch("app_microsoft.provisioning.User.objects")
    @patch("app_microsoft.provisioning.MSUser")
    def test_returns_exact_and_fuzzy_matches(self, ms_user_cls, user_objects):
        user = _user(email="student@good.com")
        ms_user = MagicMock()
        ms_user_cls.return_value = ms_user
        ms_user.find_by_upn.return_value = self._response(
            200,
            {
                "id": "ms-exact",
                "displayName": "Student One",
                "userPrincipalName": "student@good.com",
                "mail": "student@good.com",
            },
        )
        ms_user.search.return_value = self._response(
            200,
            {
                "value": [
                    {
                        "id": "ms-exact",
                        "displayName": "Student One",
                        "userPrincipalName": "student@good.com",
                        "mail": "student@good.com",
                    },
                    {
                        "id": "ms-fuzzy",
                        "displayName": "Student Fuzzy",
                        "userPrincipalName": "student.fuzzy@good.com",
                        "mail": "student.fuzzy@good.com",
                    },
                ]
            },
        )
        user_objects.filter.return_value.values_list.return_value = []

        res = suggest_microsoft_matches(user, _tenant())

        self.assertEqual(len(res), 2)
        self.assertEqual(res[0]["match_type"], "exact_email")
        self.assertEqual(res[0]["microsoft_id"], "ms-exact")
        self.assertEqual(res[1]["match_type"], "search")
        self.assertEqual(res[1]["microsoft_id"], "ms-fuzzy")

    @patch("app_microsoft.provisioning.User.objects")
    @patch("app_microsoft.provisioning.MSUser")
    def test_excludes_already_linked_accounts(self, ms_user_cls, user_objects):
        user = _user(email="student@good.com")
        ms_user = MagicMock()
        ms_user_cls.return_value = ms_user
        ms_user.find_by_upn.return_value = self._response(
            200,
            {
                "id": "ms-linked",
                "displayName": "Linked Student",
                "userPrincipalName": "linked@good.com",
                "mail": "linked@good.com",
            },
        )
        ms_user.search.return_value = self._response(200, {"value": []})
        user_objects.filter.return_value.values_list.return_value = ["ms-linked"]

        res = suggest_microsoft_matches(user, _tenant())

        self.assertEqual(res, [])

    @patch("app_microsoft.provisioning.MSUser")
    def test_returns_empty_when_user_already_linked(self, ms_user_cls):
        user = _user(microsoft_id="ms-existing")
        res = suggest_microsoft_matches(user, _tenant())
        self.assertEqual(res, [])
        ms_user_cls.assert_not_called()

if __name__ == "__main__":
    unittest.main()
