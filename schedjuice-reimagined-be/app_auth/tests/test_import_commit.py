import unittest
import uuid
from datetime import date
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from tenant_schemas.utils import get_public_schema_name
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.import_commit import (
    commit_import_rows,
    dedupe_prepared_rows,
    validate_import_rows,
)
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_auth.tests.import_test_helpers import TEST_SCHEMA, ensure_import_test_tenant
from app_custom_fields.models import FieldDefinition
from app_microsoft.models import MicrosoftRepairJob
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ValidateImportRowsTest(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()
        with schema_context(self.schema_name):
            FieldDefinition.objects.filter(
                source="custom", required_at="registration"
            ).update(required_at="never")

    def tearDown(self):
        connection.set_schema_to_public()

    def test_valid_rows_have_no_errors(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=f"guardian_{uid}",
                field_label="Guardian",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="never",
                roles=[],
                filled_by="both",
            )
            rows = [
                {
                    "email": f"new1-{uid}@ru.example",
                    "name": "New One",
                    "phone_number": "-",
                    "date_of_birth": "2001-05-02",
                    "custom_data": {f"guardian_{uid}": "Jane"},
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
        self.assertEqual(errors, [])
        self.assertEqual(prepared[0]["custom_data"], {f"guardian_{uid}": "Jane"})

    def test_invalid_date_reports_error(self):
        with schema_context(self.schema_name):
            rows = [
                {
                    "email": "x@ru.example",
                    "name": "X",
                    "phone_number": "-",
                    "date_of_birth": "not-a-date",
                    "custom_data": {},
                }
            ]
            errors, _prepared = validate_import_rows(rows=rows, role="student")
        self.assertTrue(any(e["field"] == "date_of_birth" for e in errors))

    def test_registration_required_custom_field_omitted_is_allowed(self):
        uid = uuid.uuid4().hex[:8]
        field_key = f"date_testing_{uid}"
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=field_key,
                field_label=f"Date testing {uid}",
                field_type=FieldDefinition.FieldType.DATETIME,
                required_at="registration",
                roles=["student"],
                filled_by="both",
            )
            rows = [
                {
                    "email": f"omit-{uid}@ru.example",
                    "name": "Omit Custom",
                    "phone_number": "-",
                    "date_of_birth": "2001-05-02",
                    "custom_data": {},
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
        self.assertEqual(errors, [])
        self.assertNotIn(field_key, prepared[0]["custom_data"])

    def test_invalid_custom_datetime_reports_error(self):
        uid = uuid.uuid4().hex[:8]
        field_key = f"date_testing_{uid}"
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=field_key,
                field_label=f"Date testing {uid}",
                field_type=FieldDefinition.FieldType.DATETIME,
                required_at="registration",
                roles=["student"],
                filled_by="both",
            )
            rows = [
                {
                    "email": f"bad-dt-{uid}@ru.example",
                    "name": "Bad Datetime",
                    "phone_number": "-",
                    "date_of_birth": "2001-05-02",
                    "custom_data": {field_key: "not-a-datetime"},
                },
            ]
            errors, _prepared = validate_import_rows(rows=rows, role="student")
        self.assertTrue(
            any(
                e["field"] == field_key
                and "Expected a datetime (ISO 8601)." in e["reason"]
                for e in errors
            )
        )

    def test_constant_query_count(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")

            def make_rows(n: int):
                return [
                    {
                        "email": f"u{i}-{uid}@ru.example",
                        "name": f"U{i}",
                        "phone_number": "-",
                        "date_of_birth": "2000-01-01",
                        "custom_data": {},
                    }
                    for i in range(n)
                ]

            from django.test.utils import CaptureQueriesContext
            from django.db import connection

            with CaptureQueriesContext(connection) as ctx_small:
                validate_import_rows(rows=make_rows(5), role="student")
            with CaptureQueriesContext(connection) as ctx_large:
                validate_import_rows(rows=make_rows(20), role="student")
        self.assertEqual(
            len(ctx_small.captured_queries), len(ctx_large.captured_queries)
        )
        self.assertEqual(len(ctx_small.captured_queries), 1)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CommitImportRowsTest(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()
        with schema_context(self.schema_name):
            FieldDefinition.objects.filter(
                source="custom", required_at="registration"
            ).update(required_at="never")

    def tearDown(self):
        connection.set_schema_to_public()

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _admin_user(self) -> User:
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email=f"admin-import-commit-{uuid.uuid4().hex[:8]}@ru.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _user_count(self) -> int:
        with schema_context(self.schema_name):
            return User.objects.count()

    def test_creates_new_and_fills_blanks_on_existing(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            User.objects.create_user(
                email=f"dup-{uid}@ru.example",
                password="x",
                name="Existing",
                phone_number="0911",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            rows = [
                {
                    "email": f"fresh-{uid}@ru.example",
                    "name": "Fresh",
                    "phone_number": "-",
                    "date_of_birth": "2002-03-04",
                    "custom_data": {},
                },
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "Should Not Overwrite",
                    "city": "Yangon",
                    "custom_data": {},
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            result = commit_import_rows(prepared=prepared, role="student")

            fresh = User.objects.get(email=f"fresh-{uid}@ru.example")
            existing = User.objects.get(email=f"dup-{uid}@ru.example")
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(len(result["created_user_ids"]), 1)
        self.assertEqual(result["created_user_ids"][0], fresh.id)
        self.assertFalse(fresh.is_staff)
        self.assertTrue(fresh.is_password_change_required)
        self.assertTrue(fresh.check_password(IMPORT_PASSWORD))
        self.assertEqual(existing.name, "Existing")
        self.assertEqual(existing.city, "Yangon")

    def test_commit_endpoint_aborts_atomically_on_error(self):
        uid = uuid.uuid4().hex[:8]
        admin = self._admin_user()
        before = self._user_count()
        res = self._client(admin).post(
            "/api/v1/imports/commit",
            {
                "role": "student",
                "rows": [
                    {
                        "email": f"ok-{uid}@ru.example",
                        "name": "OK",
                        "phone_number": "-",
                        "date_of_birth": "2001-01-01",
                        "custom_data": {},
                    },
                    {
                        "email": f"bad-{uid}@ru.example",
                        "name": "Bad",
                        "phone_number": "-",
                        "date_of_birth": "nope",
                        "custom_data": {},
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertTrue(res.json()["details"]["errors"])
        self.assertEqual(self._user_count(), before)

    def test_commit_endpoint_success(self):
        uid = uuid.uuid4().hex[:8]
        admin = self._admin_user()
        res = self._client(admin).post(
            "/api/v1/imports/commit",
            {
                "role": "student",
                "rows": [
                    {
                        "email": f"good-{uid}@ru.example",
                        "name": "Good",
                        "phone_number": "-",
                        "date_of_birth": "2001-01-01",
                        "custom_data": {},
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["data"]["created"], 1)
        self.assertIsNone(res.json()["data"].get("microsoft_job_id"))

    def test_dedupe_keep_first_creates_one_user(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            rows = [
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "First",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "custom_data": {},
                    "course_ids": [],
                },
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "Second",
                    "phone_number": "-",
                    "date_of_birth": "2002-02-02",
                    "custom_data": {},
                    "course_ids": [],
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            deduped = dedupe_prepared_rows(prepared, strategy="keep_first")
            self.assertEqual(len(deduped), 1)
            self.assertEqual(deduped[0]["identity"]["name"], "First")
            result = commit_import_rows(prepared=deduped, role="student")
            user = User.objects.get(email=f"dup-{uid}@ru.example")
        self.assertEqual(result["created"], 1)
        self.assertEqual(user.name, "First")

    def test_dedupe_keep_last_uses_last_row(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields")
            rows = [
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "First",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "custom_data": {},
                    "course_ids": [],
                },
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "Last",
                    "phone_number": "-",
                    "date_of_birth": "2002-02-02",
                    "custom_data": {},
                    "course_ids": [],
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            deduped = dedupe_prepared_rows(prepared, strategy="keep_last")
            result = commit_import_rows(prepared=deduped, role="student")
            user = User.objects.get(email=f"dup-{uid}@ru.example")
        self.assertEqual(result["created"], 1)
        self.assertEqual(user.name, "Last")

    def test_dedupe_merge_unions_course_ids(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            from app_course.models import Category, Course
            from app_course.program_helpers import get_default_program

            call_command("sync_builtin_fields")
            category = Category.objects.first()
            program = get_default_program()
            course_a = Course.objects.create(
                title=f"A-{uid}",
                code=f"A-{uid}",
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            course_b = Course.objects.create(
                title=f"B-{uid}",
                code=f"B-{uid}",
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            rows = [
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "First",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "custom_data": {},
                    "course_ids": [course_a.id],
                },
                {
                    "email": f"dup-{uid}@ru.example",
                    "name": "",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "city": "Yangon",
                    "custom_data": {},
                    "course_ids": [course_b.id],
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            deduped = dedupe_prepared_rows(prepared, strategy="merge")
            self.assertEqual(
                sorted(deduped[0]["course_ids"]), sorted([course_a.id, course_b.id])
            )
            self.assertEqual(deduped[0]["identity"]["name"], "First")
            self.assertEqual(deduped[0]["builtins"]["city"], "Yangon")
            result = commit_import_rows(prepared=deduped, role="student")
            user = User.objects.get(email=f"dup-{uid}@ru.example")
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["enrolled"], 2)
        self.assertEqual(user.name, "First")
        self.assertEqual(user.city, "Yangon")

    def _set_tenant_microsoft_on(self, enabled: bool) -> None:
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=enabled
            )

    def _commit_payload(self, uid: str, email_suffix: str = "good") -> dict:
        return {
            "role": "student",
            "rows": [
                {
                    "email": f"{email_suffix}-{uid}@ru.example",
                    "name": "Good",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "custom_data": {},
                },
            ],
        }

    @patch("app_utils.import_views.start_repair_job")
    def test_commit_endpoint_starts_microsoft_job_when_tenant_ms_on(
        self, mock_start_repair
    ):
        uid = uuid.uuid4().hex[:8]
        admin = self._admin_user()
        mock_job = MagicMock()
        mock_job.id = 42
        mock_start_repair.return_value = mock_job

        self._set_tenant_microsoft_on(True)
        try:
            res = self._client(admin).post(
                "/api/v1/imports/commit",
                self._commit_payload(uid, "ms-on"),
                format="json",
            )
        finally:
            self._set_tenant_microsoft_on(False)

        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]
        self.assertEqual(data["created"], 1)
        self.assertEqual(data["microsoft_job_id"], 42)
        mock_start_repair.assert_called_once()
        args = mock_start_repair.call_args[0]
        self.assertEqual(args[1], MicrosoftRepairJob.TargetType.USERS)
        candidate_ids = mock_start_repair.call_args[0][2]
        self.assertEqual(len(candidate_ids), 1)
        with schema_context(self.schema_name):
            user = User.objects.get(email=f"ms-on-{uid}@ru.example")
        self.assertEqual(candidate_ids[0], user.id)

    @patch("app_utils.import_views.start_repair_job")
    def test_commit_endpoint_skips_microsoft_job_when_tenant_ms_off(
        self, mock_start_repair
    ):
        uid = uuid.uuid4().hex[:8]
        admin = self._admin_user()
        self._set_tenant_microsoft_on(False)

        res = self._client(admin).post(
            "/api/v1/imports/commit",
            self._commit_payload(uid, "ms-off"),
            format="json",
        )

        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNone(res.json()["data"].get("microsoft_job_id"))
        mock_start_repair.assert_not_called()

    def test_reimport_existing_enrollment_does_not_create_joined_event(self):
        uid = uuid.uuid4().hex[:8]
        with schema_context(self.schema_name):
            from app_course.models import Category, Course, CourseMembershipEvent, UserCourse
            from app_course.program_helpers import get_default_program

            call_command("sync_builtin_fields")
            category = Category.objects.first()
            program = get_default_program()
            course = Course.objects.create(
                title=f"Reimport-{uid}",
                code=f"RI-{uid}",
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            user = User.objects.create_user(
                email=f"reimport-{uid}@ru.example",
                password="x",
                name="Enrolled",
                phone_number="-",
                date_of_birth=date(2001, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.bulk_create(
                [
                    UserCourse(
                        user=user,
                        course=course,
                        assigned_as=UserCourse.AssignedAs.STUDENT,
                    )
                ]
            )
            rows = [
                {
                    "email": f"reimport-{uid}@ru.example",
                    "name": "Enrolled",
                    "phone_number": "-",
                    "date_of_birth": "2001-01-01",
                    "custom_data": {},
                    "course_ids": [course.id],
                },
            ]
            errors, prepared = validate_import_rows(rows=rows, role="student")
            self.assertEqual(errors, [])
            result = commit_import_rows(prepared=prepared, role="student")
            event_count = CourseMembershipEvent.objects.filter(
                course_id=course.id,
                user_id=user.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
            ).count()
        self.assertEqual(result["enrolled"], 0)
        self.assertEqual(event_count, 0)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ImportMicrosoftJobStatusTests(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()
        with schema_context(self.schema_name):
            seed_rbac()

    def tearDown(self):
        connection.set_schema_to_public()

    def _client(self, user: User) -> APIClient:
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def _admin_user(self) -> User:
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email=f"admin-ms-job-{uuid.uuid4().hex[:8]}@ru.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _teacher_user(self) -> User:
        with schema_context(self.schema_name):
            return User.objects.create_user(
                email=f"teacher-ms-job-{uuid.uuid4().hex[:8]}@ru.example",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _create_import_job(self, *, created_by: User | None) -> MicrosoftRepairJob:
        with schema_context(self.schema_name):
            candidate = User.objects.create_user(
                email=f"candidate-{uuid.uuid4().hex[:8]}@ru.example",
                password="x",
                name="Candidate",
                phone_number="-",
                date_of_birth=date(2001, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            return MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.USERS,
                candidate_ids=[candidate.id],
                created_by=created_by,
                status=MicrosoftRepairJob.Status.SUCCEEDED,
                succeeded=1,
            )

    def test_import_microsoft_job_status_ok(self):
        admin = self._admin_user()
        job = self._create_import_job(created_by=admin)

        res = self._client(admin).get(
            f"/api/v1/imports/microsoft-jobs/{job.id}",
        )

        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]
        self.assertEqual(data["id"], job.id)
        self.assertEqual(data["status"], "succeeded")
        self.assertEqual(data["succeeded"], 1)
        self.assertNotIn("results", data)
        self.assertNotIn("candidate_ids", data)

    def test_import_microsoft_job_status_not_found_for_bulk_repair_job(self):
        admin = self._admin_user()
        job = self._create_import_job(created_by=None)

        res = self._client(admin).get(
            f"/api/v1/imports/microsoft-jobs/{job.id}",
        )

        self.assertEqual(res.status_code, 404, res.content)

    def test_import_microsoft_job_status_forbidden_without_import_permission(self):
        admin = self._admin_user()
        teacher = self._teacher_user()
        job = self._create_import_job(created_by=admin)

        res = self._client(teacher).get(
            f"/api/v1/imports/microsoft-jobs/{job.id}",
        )

        self.assertEqual(res.status_code, 403, res.content)
