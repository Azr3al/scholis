import unittest
from datetime import date

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class IdCardTokenTests(unittest.TestCase):
    def test_round_trip(self):
        from app_auth import id_card_tokens

        token = id_card_tokens.encode_id_verify_token(uid=42, schema="xschedjuice")
        payload = id_card_tokens.decode_id_verify_token(token)
        self.assertEqual(payload["uid"], 42)
        self.assertEqual(payload["schema"], "xschedjuice")
        self.assertEqual(payload["purpose"], "id-verify")

    def test_id_verify_code_pattern(self):
        from app_auth.id_verify_code import generate_id_verify_code, is_id_verify_code

        code = generate_id_verify_code()
        self.assertTrue(is_id_verify_code(code))
        self.assertFalse(is_id_verify_code("not-a-code"))
        self.assertFalse(is_id_verify_code("v_deadbeef!"))

    def test_tampered_token_rejected(self):
        from app_auth import id_card_tokens

        token = id_card_tokens.encode_id_verify_token(uid=42, schema="xschedjuice")
        with self.assertRaises(id_card_tokens.InvalidIdVerifyToken):
            id_card_tokens.decode_id_verify_token(token + "x")

    def test_wrong_purpose_rejected(self):
        import jwt
        from app_auth import id_card_tokens

        bad = jwt.encode(
            {"purpose": "recording-share", "uid": 1, "schema": "xschedjuice"},
            id_card_tokens._secret(),
            algorithm="HS256",
        )
        with self.assertRaises(id_card_tokens.InvalidIdVerifyToken):
            id_card_tokens.decode_id_verify_token(bad)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class IdCardTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email="card.teacher@example.com",
                password="Password1!",
                name="Thiri Kyaw",
                phone_number="+95 9 700000000",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.user.blood_type = User.BloodType.O_POS
            self.user.emergency_contact_name = "Su Su"
            self.user.emergency_contact_phone_number = "+95 9 711111111"
            self.user.emergency_contact_relationship = "Sister"
            self.user.save()

    def test_user_serializer_exposes_verify_token(self):
        from app_auth.id_card_tokens import decode_id_verify_token
        from app_auth.serializers import UserSerializer

        with schema_context(self.schema_name):
            user = User.objects.get(pk=self.user.pk)
            data = UserSerializer(user).data
        self.assertIn("id_verify_token", data)
        payload = decode_id_verify_token(data["id_verify_token"])
        self.assertEqual(payload["uid"], self.user.pk)
        self.assertEqual(payload["schema"], self.schema_name)

    def test_public_verify_returns_minimal_identity(self):
        from app_auth.id_card_tokens import encode_id_verify_token

        token = encode_id_verify_token(uid=self.user.pk, schema=self.schema_name)
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get(f"/api/v1/public/id-verify/{token}")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["name"], "Thiri Kyaw")
        self.assertEqual(data["user_id"], self.user.pk)
        self.assertTrue(data["verified"])
        self.assertIn("roles", data)
        self.assertNotIn("phone_number", data)
        self.assertNotIn("email", data)
        self.assertNotIn("emergency_contact_phone_number", data)

    def test_public_verify_rejects_invalid_token(self):
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get("/api/v1/public/id-verify/not-a-real-token")
        self.assertEqual(res.status_code, 400)

    def test_user_serializer_exposes_stable_verify_code(self):
        from app_auth.serializers import UserSerializer

        with schema_context(self.schema_name):
            user = User.objects.get(pk=self.user.pk)
            first = UserSerializer(user).data["id_verify_code"]
            second = UserSerializer(user).data["id_verify_code"]
        self.assertTrue(first.startswith("v_"))
        self.assertEqual(len(first), 10)
        self.assertEqual(first, second)

    def test_public_verify_resolves_short_code(self):
        from app_auth.id_verify_code import ensure_id_verify_code

        with schema_context(self.schema_name):
            user = User.objects.get(pk=self.user.pk)
            code = ensure_id_verify_code(user)
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get(f"/api/v1/public/id-verify/{code}")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["name"], "Thiri Kyaw")
        self.assertEqual(data["user_id"], self.user.pk)
        self.assertTrue(data["verified"])

    def test_public_verify_rejects_unknown_short_code(self):
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get("/api/v1/public/id-verify/v_deadbeef")
        self.assertEqual(res.status_code, 400)
