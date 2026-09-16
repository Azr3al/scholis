from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_auth.dvr import (
    normalize_dvr_fields,
    pick_banner_user_dvr,
    required_field_names,
    user_missing_required_fields,
    validate_dvr_fields,
)
from app_auth.models import DataVerificationRequest, User, UserDataVerificationRequest
from app_auth.serializers import (
    DataVerificationRequestSerializer,
    UserDataVerificationRequestSerializer,
    UserSerializer,
)
from app_custom_fields.constants import ENTITY_TYPE_USER, FILLED_BY_ADMIN, SOURCE_CUSTOM
from app_custom_fields.models import FieldDefinition
from app_tasks.models import Task


class NormalizeDvrFieldsTests(SimpleTestCase):
    def test_legacy_strings_become_optional_objects(self):
        self.assertEqual(
            normalize_dvr_fields(["phone_number", "city"]),
            [
                {"name": "phone_number", "required": False},
                {"name": "city", "required": False},
            ],
        )


class ValidateDvrFieldsTests(SimpleTestCase):
    def test_rejects_empty(self):
        with self.assertRaises(ValidationError):
            validate_dvr_fields([], custom_keys=set())

    def test_rejects_unknown_field(self):
        with self.assertRaises(ValidationError):
            validate_dvr_fields(
                [{"name": "not_a_field", "required": False}],
                custom_keys=set(),
            )

    def test_accepts_catalog_fields(self):
        out = validate_dvr_fields(
            [{"name": "phone_number", "required": True}],
            custom_keys=set(),
        )
        self.assertEqual(out[0]["name"], "phone_number")

    def test_accepts_active_custom_key_when_provided(self):
        out = validate_dvr_fields(
            [{"name": "employee_id", "required": False}],
            custom_keys={"employee_id"},
        )
        self.assertEqual(out[0]["name"], "employee_id")

    def test_rejects_custom_key_not_in_provided_set(self):
        with self.assertRaises(ValidationError):
            validate_dvr_fields(
                [{"name": "employee_id", "required": False}],
                custom_keys=set(),
            )

    def test_builtin_still_allowed_when_custom_keys_empty(self):
        out = validate_dvr_fields(
            [{"name": "phone_number", "required": True}],
            custom_keys=set(),
        )
        self.assertEqual(out[0]["name"], "phone_number")


class RequiredFieldChecksTests(SimpleTestCase):
    def test_required_names(self):
        fields = [
            {"name": "phone_number", "required": True},
            {"name": "city", "required": False},
        ]
        self.assertEqual(required_field_names(fields), ["phone_number"])

    def test_missing_required(self):
        user = SimpleNamespace(phone_number="", city="Yangon")
        fields = [
            {"name": "phone_number", "required": True},
            {"name": "city", "required": False},
        ]
        self.assertEqual(
            user_missing_required_fields(user, fields, active_custom_keys=set()),
            ["phone_number"],
        )

    def test_missing_required_custom_reads_custom_data(self):
        user = SimpleNamespace(custom_data={})
        fields = [{"name": "employee_id", "required": True}]
        self.assertEqual(
            user_missing_required_fields(
                user, fields, active_custom_keys={"employee_id"}
            ),
            ["employee_id"],
        )

    def test_present_custom_not_missing(self):
        user = SimpleNamespace(custom_data={"employee_id": "E-1"})
        fields = [{"name": "employee_id", "required": True}]
        self.assertEqual(
            user_missing_required_fields(
                user, fields, active_custom_keys={"employee_id"}
            ),
            [],
        )

    def test_inactive_required_custom_skipped(self):
        user = SimpleNamespace(custom_data={})
        fields = [{"name": "employee_id", "required": True}]
        self.assertEqual(
            user_missing_required_fields(user, fields, active_custom_keys=set()),
            [],
        )


class PickBannerUserDvrTests(SimpleTestCase):
    def test_picks_soonest_unexpired_pending(self):
        today = date(2026, 7, 18)
        a = SimpleNamespace(
            id=1,
            status="pending",
            data_verification_request=SimpleNamespace(
                expires_on=today + timedelta(days=10)
            ),
        )
        b = SimpleNamespace(
            id=2,
            status="pending",
            data_verification_request=SimpleNamespace(
                expires_on=today + timedelta(days=2)
            ),
        )
        expired = SimpleNamespace(
            id=3,
            status="pending",
            data_verification_request=SimpleNamespace(
                expires_on=today - timedelta(days=1)
            ),
        )
        verified = SimpleNamespace(
            id=4,
            status="verified",
            data_verification_request=SimpleNamespace(
                expires_on=today + timedelta(days=1)
            ),
        )
        picked = pick_banner_user_dvr([a, b, expired, verified], today)
        self.assertIs(picked, b)

    def test_none_when_all_expired_or_verified(self):
        today = date(2026, 7, 18)
        rows = [
            SimpleNamespace(
                id=1,
                status="pending",
                data_verification_request=SimpleNamespace(
                    expires_on=today - timedelta(days=1)
                ),
            ),
            SimpleNamespace(
                id=2,
                status="verified",
                data_verification_request=SimpleNamespace(
                    expires_on=today + timedelta(days=1)
                ),
            ),
        ]
        self.assertIsNone(pick_banner_user_dvr(rows, today))


class DataVerificationRequestCreateTests(TestCase):
    schema_name = "xschedjuice"

    def _user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"dvr-{uuid4().hex[:8]}",
            roles=roles,
        )

    def test_create_snapshots_overlapping_roles_without_email_tasks(self):
        with schema_context(self.schema_name):
            teacher = self._user(f"t-{uuid4().hex[:8]}@x.io", ["teacher"])
            student = self._user(f"s-{uuid4().hex[:8]}@x.io", ["student"])
            admin = self._user(f"a-{uuid4().hex[:8]}@x.io", ["admin"])
            request = MagicMock()
            request.user = admin

            expires = date.today() + timedelta(days=7)
            ser = DataVerificationRequestSerializer(
                data={
                    "name": f"dvr-{uuid4().hex[:8]}",
                    "fields": [
                        {"name": "phone_number", "required": True},
                        {"name": "city", "required": False},
                    ],
                    "requested_user_types": ["teacher"],
                    "expires_on": expires.isoformat(),
                },
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            dvr = ser.save()

            self.assertEqual(dvr.expires_on, expires)
            user_ids = set(
                UserDataVerificationRequest.objects.filter(
                    data_verification_request=dvr
                ).values_list("user_id", flat=True)
            )
            self.assertIn(teacher.id, user_ids)
            self.assertNotIn(student.id, user_ids)
            self.assertEqual(
                Task.objects.filter(
                    name=Task.TaskName.CREATE_DVR_AND_SEND_EMAIL,
                    data__dvr_id=dvr.id,
                ).count(),
                0,
            )

    def test_create_rejects_empty_fields(self):
        with schema_context(self.schema_name):
            admin = self._user(f"a-{uuid4().hex[:8]}@x.io", ["admin"])
            request = MagicMock()
            request.user = admin
            ser = DataVerificationRequestSerializer(
                data={
                    "name": f"dvr-{uuid4().hex[:8]}",
                    "fields": [],
                    "requested_user_types": ["teacher"],
                    "expires_on": (date.today() + timedelta(days=7)).isoformat(),
                },
                context={"request": request},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("fields", ser.errors)


class UserDataVerificationRequestVerifyTests(TestCase):
    schema_name = "xschedjuice"

    def test_cannot_verify_when_required_field_empty(self):
        with schema_context(self.schema_name):
            user = User.objects.create(
                email=f"u-{uuid4().hex[:8]}@x.io",
                name="U",
                phone_number="",
                communication_email=f"u-{uuid4().hex[:8]}@x.io",
                code=f"dvr-{uuid4().hex[:8]}",
                roles=["teacher"],
            )
            dvr = DataVerificationRequest.objects.create(
                name=f"dvr-{uuid4().hex[:8]}",
                fields=[{"name": "phone_number", "required": True}],
                requested_user_types=["teacher"],
                expires_on=date.today() + timedelta(days=7),
            )
            udvr = UserDataVerificationRequest.objects.create(
                user=user,
                data_verification_request=dvr,
                status=UserDataVerificationRequest.Status.PENDING,
            )
            ser = UserDataVerificationRequestSerializer(
                udvr,
                data={"status": "verified"},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("status", ser.errors)


class UserDvrVerifyCustomWriteTests(TestCase):
    schema_name = "xschedjuice"

    def _teacher(self) -> User:
        email = f"u-{uuid4().hex[:8]}@x.io"
        return User.objects.create(
            email=email,
            name="U",
            phone_number="1",
            communication_email=email,
            code=f"dvr-{uuid4().hex[:8]}",
            roles=["teacher"],
            custom_data={},
        )

    def test_dvr_verify_id_allows_admin_filled_custom_key(self):
        with schema_context(self.schema_name):
            key = f"note_{uuid4().hex[:8]}"
            FieldDefinition.objects.create(
                source=SOURCE_CUSTOM,
                entity_type=ENTITY_TYPE_USER,
                field_key=key,
                field_label="Internal",
                field_type="text",
                filled_by=FILLED_BY_ADMIN,
                is_active=True,
            )
            user = self._teacher()
            dvr = DataVerificationRequest.objects.create(
                name=f"dvr-{uuid4().hex[:8]}",
                fields=[{"name": key, "required": False}],
                requested_user_types=["teacher"],
                expires_on=date.today() + timedelta(days=7),
            )
            UserDataVerificationRequest.objects.create(
                user=user,
                data_verification_request=dvr,
                status=UserDataVerificationRequest.Status.PENDING,
            )
            request = MagicMock()
            request.user = user
            request.tenant = MagicMock(is_microsoft_on=False)
            ser = UserSerializer(
                user,
                data={"custom_data": {key: "from-verify"}, "dvr_verify_id": dvr.id},
                partial=True,
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            user.refresh_from_db()
            self.assertEqual((user.custom_data or {}).get(key), "from-verify")

    def test_dvr_verify_skips_unrelated_registration_required_custom(self):
        """DVR verify must not force empty registration-floor fields off the form.

        Uses a JWT-shaped request.user (id=email) so self-edit actor detection
        matches production auth, not an ORM User stub.
        """
        with schema_context(self.schema_name):
            shirt = f"shirt_{uuid4().hex[:8]}"
            other = f"testing_{uuid4().hex[:8]}"
            FieldDefinition.objects.create(
                source=SOURCE_CUSTOM,
                entity_type=ENTITY_TYPE_USER,
                field_key=shirt,
                field_label="T-shirt",
                field_type="text",
                is_active=True,
            )
            FieldDefinition.objects.create(
                source=SOURCE_CUSTOM,
                entity_type=ENTITY_TYPE_USER,
                field_key=other,
                field_label="Testing",
                field_type="text",
                required_at="registration",
                roles=["teacher"],
                is_active=True,
            )
            user = self._teacher()
            dvr = DataVerificationRequest.objects.create(
                name=f"dvr-{uuid4().hex[:8]}",
                fields=[{"name": shirt, "required": False}],
                requested_user_types=["teacher"],
                expires_on=date.today() + timedelta(days=7),
            )
            UserDataVerificationRequest.objects.create(
                user=user,
                data_verification_request=dvr,
                status=UserDataVerificationRequest.Status.PENDING,
            )
            jwt_user = SimpleNamespace(id=user.email, is_authenticated=True)
            request = MagicMock()
            request.user = jwt_user
            request.tenant = MagicMock(is_microsoft_on=False)
            # MagicMock auto-attrs would short-circuit get_user_from_request caching.
            request._schedjuice_cached_user = None
            ser = UserSerializer(
                user,
                data={"custom_data": {shirt: "M"}, "dvr_verify_id": dvr.id},
                partial=True,
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            user.refresh_from_db()
            self.assertEqual((user.custom_data or {}).get(shirt), "M")
            self.assertNotIn(other, user.custom_data or {})

    def test_dvr_verify_custom_write_keeps_query_count_low(self):
        """Regression: DVR custom_data PUT should not re-query definitions/scopes/id-card."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with schema_context(self.schema_name):
            shirt = f"shirt_{uuid4().hex[:8]}"
            FieldDefinition.objects.create(
                source=SOURCE_CUSTOM,
                entity_type=ENTITY_TYPE_USER,
                field_key=shirt,
                field_label="T-shirt",
                field_type="text",
                is_active=True,
            )
            user = self._teacher()
            dvr = DataVerificationRequest.objects.create(
                name=f"dvr-{uuid4().hex[:8]}",
                fields=[{"name": shirt, "required": False}],
                requested_user_types=["teacher"],
                expires_on=date.today() + timedelta(days=7),
            )
            UserDataVerificationRequest.objects.create(
                user=user,
                data_verification_request=dvr,
                status=UserDataVerificationRequest.Status.PENDING,
            )
            jwt_user = SimpleNamespace(id=user.email, is_authenticated=True)
            request = MagicMock()
            request.user = jwt_user
            request.tenant = MagicMock(is_microsoft_on=False)
            request._schedjuice_cached_user = None

            with CaptureQueriesContext(connection) as ctx:
                ser = UserSerializer(
                    user,
                    data={"custom_data": {shirt: "M"}, "dvr_verify_id": dvr.id},
                    partial=True,
                    context={"request": request},
                )
                self.assertTrue(ser.is_valid(), ser.errors)
                ser.save()
                _ = ser.data

            sqls = [" ".join(q["sql"].split()) for q in ctx.captured_queries]
            field_def_loads = sum(
                1
                for s in sqls
                if "app_custom_fields_customfielddefinition" in s
                and s.lstrip().upper().startswith("SELECT")
            )
            self.assertLessEqual(
                field_def_loads,
                1,
                msg=f"expected ≤1 FieldDefinition SELECT, got {field_def_loads}: {sqls}",
            )
            self.assertFalse(
                any("app_course_course" in s for s in sqls),
                msg=f"unexpected course queries on staff DVR write: {sqls}",
            )
            # acting_user + UDVR + 1 defs + UPDATE + scoped_*_ids (×2) ≈ 6
            self.assertLessEqual(
                len(ctx.captured_queries),
                8,
                msg=f"expected ≤8 queries, got {len(ctx.captured_queries)}: {sqls}",
            )

    def test_self_edit_rejects_admin_filled_without_dvr_verify_id(self):
        with schema_context(self.schema_name):
            key = f"note_{uuid4().hex[:8]}"
            FieldDefinition.objects.create(
                source=SOURCE_CUSTOM,
                entity_type=ENTITY_TYPE_USER,
                field_key=key,
                field_label="Internal",
                field_type="text",
                filled_by=FILLED_BY_ADMIN,
                is_active=True,
            )
            user = self._teacher()
            request = MagicMock()
            request.user = user
            request.tenant = MagicMock(is_microsoft_on=False)
            ser = UserSerializer(
                user,
                data={"custom_data": {key: "blocked"}},
                partial=True,
                context={"request": request},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("custom_data", str(ser.errors).lower() + str(ser.errors))
