import unittest
from datetime import date

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.import_user_match import match_users, normalize_phone_digits
from app_auth.models import User
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class NormalizePhoneDigitsTest(unittest.TestCase):
    def test_strips_non_digits(self):
        self.assertEqual(normalize_phone_digits("+95 9-123 456"), "959123456")

    def test_none_and_blank(self):
        self.assertEqual(normalize_phone_digits(None), "")
        self.assertEqual(normalize_phone_digits("   "), "")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MatchUsersExactEmailTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_matches_primary_and_communication_email(self):
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="primary@ru.example",
                password="x",
                name="Primary Person",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            User.objects.create_user(
                email="other@ru.example",
                password="x",
                name="Comm Person",
                phone_number="-",
                communication_email="comm@ru.example",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            out = match_users(
                [
                    {
                        "key": "email",
                        "type": "email",
                        "fuzzy": False,
                        "values": [
                            "Primary@ru.example",
                            "comm@ru.example",
                            "no@ru.example",
                        ],
                    }
                ]
            )
        res = out["email"]
        self.assertEqual(res["Primary@ru.example"]["kind"], "exact")
        self.assertEqual(res["Primary@ru.example"]["field"], "email")
        self.assertEqual(res["comm@ru.example"]["kind"], "exact")
        self.assertEqual(res["comm@ru.example"]["field"], "communication_email")
        self.assertEqual(res["no@ru.example"]["kind"], "none")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MatchUsersExactPhoneTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_matches_phone_ignoring_formatting(self):
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="phone@ru.example",
                password="x",
                name="Phone Person",
                phone_number="+95 9 123 456",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            out = match_users(
                [
                    {
                        "key": "phone",
                        "type": "phone",
                        "fuzzy": False,
                        "values": ["0000"],
                    }
                ]
            )
        self.assertEqual(out["phone"]["0000"]["kind"], "none")
        with schema_context(self.schema_name):
            out2 = match_users(
                [
                    {
                        "key": "p",
                        "type": "phone",
                        "fuzzy": False,
                        "values": ["+95 9 123 456"],
                    }
                ]
            )
        self.assertEqual(out2["p"]["+95 9 123 456"]["kind"], "exact")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MatchUsersFuzzyEmailTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_typo_surfaces_candidate_only_when_fuzzy_enabled(self):
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="jonathan@ru.example",
                password="x",
                name="Jonathan",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            off = match_users(
                [
                    {
                        "key": "e",
                        "type": "email",
                        "fuzzy": False,
                        "values": ["jonathon@ru.example"],
                    }
                ]
            )["e"]
            on = match_users(
                [
                    {
                        "key": "e",
                        "type": "email",
                        "fuzzy": True,
                        "values": ["jonathon@ru.example"],
                    }
                ]
            )["e"]
        self.assertEqual(off["jonathon@ru.example"]["kind"], "none")
        self.assertEqual(on["jonathon@ru.example"]["kind"], "fuzzy")
        self.assertTrue(on["jonathon@ru.example"]["candidates"])
        self.assertGreaterEqual(on["jonathon@ru.example"]["score"], 88.0)

    def test_unrelated_email_stays_none(self):
        with schema_context(self.schema_name):
            User.objects.create_user(
                email="alice@ru.example",
                password="x",
                name="Alice",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            out = match_users(
                [
                    {
                        "key": "e",
                        "type": "email",
                        "fuzzy": True,
                        "values": ["zzzqqq@ru.example"],
                    }
                ]
            )["e"]
        self.assertEqual(out["zzzqqq@ru.example"]["kind"], "none")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MatchUsersFuzzyPhoneTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserMatchBulkViewTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def test_endpoint_returns_results(self):
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email="admin@ru.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            User.objects.create_user(
                email="known@ru.example",
                password="x",
                name="Known",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
        res = self._client(admin).post(
            "/api/v1/users/match-bulk",
            {
                "specs": [
                    {
                        "key": "email",
                        "type": "email",
                        "fuzzy": False,
                        "values": ["known@ru.example", "missing@ru.example"],
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]["results"]["email"]
        self.assertEqual(data["known@ru.example"]["kind"], "exact")
        self.assertEqual(data["missing@ru.example"]["kind"], "none")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CommitMatchUserIdTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_match_user_id_updates_existing_not_create(self):
        from app_auth.import_commit import commit_import_rows, validate_import_rows

        with schema_context(self.schema_name):
            existing = User.objects.create_user(
                email="real@ru.example",
                password="x",
                name="Real",
                phone_number="09111222333",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            rows = [
                {
                    "email": "typo@ru.example",
                    "name": "Real Updated",
                    "match_user_id": existing.id,
                    "custom_data": {},
                    "course_ids": [],
                }
            ]
            errors, prepared = validate_import_rows(
                rows=rows, role=User.UserRole.STUDENT
            )
            self.assertEqual(errors, [])
            result = commit_import_rows(
                prepared=prepared, role=User.UserRole.STUDENT
            )
            self.assertEqual(result["created"], 0)
            self.assertFalse(User.objects.filter(email="typo@ru.example").exists())
