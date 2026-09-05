import json
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_grading_reports.mark_sheet_services import (
    _filter_match_results_to_roster,
    _match_roster_names,
    match_roster_students,
    roster_user_refs,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class RosterMatchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.course = Course.objects.first()
            self.roster_student = User.objects.create_user(
                email=f"roster-{self.suffix}@example.com",
                password="x",
                name="Paul Herbold",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"roster-{self.suffix}@example.com",
                code=f"roster-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
            User.objects.create_user(
                email=f"outsider-{self.suffix}@example.com",
                password="x",
                name="Paul Herbold",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"outsider-{self.suffix}@example.com",
                code=f"outsider-{self.suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.roster_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_match_prefers_roster_student_with_same_name(self):
        with schema_context(self.schema_name):
            results = match_roster_students(
                self.course.id,
                [
                    {
                        "key": "name",
                        "type": "name",
                        "fuzzy": True,
                        "values": ["Paul Herbold"],
                    }
                ],
            )
            match = results["name"]["Paul Herbold"]
            self.assertEqual(match["kind"], "exact")
            self.assertEqual(match["user"]["id"], self.roster_student.id)

    def test_roster_user_refs_json_serializable_without_profile_image(self):
        with schema_context(self.schema_name):
            self.assertFalse(self.roster_student.profile_image)
            refs = roster_user_refs(self.course.id)
            self.assertTrue(any(ref["id"] == self.roster_student.id for ref in refs))
            json.dumps(refs)
            results = match_roster_students(
                self.course.id,
                [
                    {
                        "key": "name",
                        "type": "name",
                        "fuzzy": True,
                        "values": ["Paul Herbold"],
                    }
                ],
            )
            json.dumps(results)

    def test_email_match_excludes_user_not_on_roster(self):
        with schema_context(self.schema_name):
            outsider_email = f"outsider-{self.suffix}@example.com"
            results = match_roster_students(
                self.course.id,
                [
                    {
                        "key": "email",
                        "type": "email",
                        "fuzzy": False,
                        "values": [outsider_email],
                    }
                ],
            )
            match = results["email"][outsider_email]
            self.assertEqual(match["kind"], "none")
            self.assertIsNone(match["user"])

    def test_unknown_email_not_on_roster_is_none(self):
        with schema_context(self.schema_name):
            unknown_email = f"unknown-{self.suffix}@example.com"
            results = match_roster_students(
                self.course.id,
                [
                    {
                        "key": "email",
                        "type": "email",
                        "fuzzy": False,
                        "values": [unknown_email],
                    }
                ],
            )
            match = results["email"][unknown_email]
            self.assertEqual(match["kind"], "none")


class MatchRosterNamesUnitTests(unittest.TestCase):
    @staticmethod
    def _ref(uid: int, name: str) -> dict:
        return {
            "id": uid,
            "name": name,
            "email": f"u{uid}@example.com",
            "code": f"c{uid}",
            "profile_image": None,
            "roles": [],
            "alternative_name": "",
        }

    @staticmethod
    def _ref_with_alt(uid: int, name: str, alternative_name: str = "") -> dict:
        ref = MatchRosterNamesUnitTests._ref(uid, name)
        ref["alternative_name"] = alternative_name
        return ref

    def test_exact_match_on_roster_name_when_spec_field_is_alternative_name(self):
        refs = [self._ref_with_alt(1, "Kyaw Thu", "")]
        out = _match_roster_names(
            ["Kyaw Thu"], refs, field="alternative_name", fuzzy=True
        )
        match = out["Kyaw Thu"]
        self.assertEqual(match["kind"], "exact")
        self.assertEqual(match["user"]["id"], 1)
        self.assertEqual(match["field"], "name")

    def test_exact_match_on_alternative_name_when_spec_field_is_name(self):
        refs = [self._ref_with_alt(1, "English Label", "ဍ")]
        out = _match_roster_names(["ဍ"], refs, field="name", fuzzy=True)
        match = out["ဍ"]
        self.assertEqual(match["kind"], "exact")
        self.assertEqual(match["field"], "alternative_name")

    def test_no_exact_when_value_matches_neither_field(self):
        refs = [self._ref_with_alt(1, "Alice", "Bob")]
        out = _match_roster_names(["Carol"], refs, field="name", fuzzy=False)
        self.assertEqual(out["Carol"]["kind"], "none")

    def test_short_name_does_not_fuzzy_match_partial_roster_name(self):
        refs = [self._ref(1, "Su Su Hlaing")]
        out = _match_roster_names(["Su Su"], refs, field="name", fuzzy=True)
        self.assertEqual(out["Su Su"]["kind"], "none")

    def test_single_weak_candidate_stays_fuzzy_not_exact(self):
        refs = [self._ref(1, "Benjamin Franklin")]
        out = _match_roster_names(
            ["Benjamen Franklin"],
            refs,
            field="name",
            fuzzy=True,
        )
        match = out["Benjamen Franklin"]
        self.assertEqual(match["kind"], "fuzzy")
        self.assertIsNone(match["user"])
        self.assertGreaterEqual(len(match["candidates"]), 1)
        self.assertLess(match["score"], 95)


class FilterMatchResultsToRosterUnitTests(unittest.TestCase):
    @staticmethod
    def _user(uid: int) -> dict:
        return {
            "id": uid,
            "name": f"User {uid}",
            "email": f"u{uid}@example.com",
            "code": f"c{uid}",
            "profile_image": None,
            "roles": [],
        }

    def test_single_weak_roster_candidate_stays_fuzzy(self):
        raw = {
            "email": {
                "test@example.com": {
                    "kind": "fuzzy",
                    "user": None,
                    "field": "email",
                    "score": 90.0,
                    "candidates": [
                        {
                            "user": self._user(1),
                            "score": 90.0,
                            "field": "email",
                        }
                    ],
                }
            }
        }
        out = _filter_match_results_to_roster(raw, {1})
        match = out["email"]["test@example.com"]
        self.assertEqual(match["kind"], "fuzzy")
        self.assertIsNone(match["user"])

    def test_single_strong_roster_candidate_promoted_to_exact(self):
        raw = {
            "email": {
                "test@example.com": {
                    "kind": "fuzzy",
                    "user": None,
                    "field": "email",
                    "score": 97.0,
                    "candidates": [
                        {
                            "user": self._user(1),
                            "score": 97.0,
                            "field": "email",
                        }
                    ],
                }
            }
        }
        out = _filter_match_results_to_roster(raw, {1})
        match = out["email"]["test@example.com"]
        self.assertEqual(match["kind"], "exact")
        self.assertEqual(match["user"]["id"], 1)

    def test_non_roster_exact_email_becomes_none(self):
        raw = {
            "email": {
                "outsider@example.com": {
                    "kind": "exact",
                    "user": self._user(999),
                    "field": "email",
                    "score": 100.0,
                    "candidates": [],
                }
            }
        }
        out = _filter_match_results_to_roster(raw, {1})
        match = out["email"]["outsider@example.com"]
        self.assertEqual(match["kind"], "none")
        self.assertIsNone(match["user"])
