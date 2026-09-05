"""Tests for student course join requests via join code."""

from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Category, Course, CourseJoinRequest, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


class StudentCourseJoinRequestTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()
            cls.cat = Category.objects.first() or Category.objects.create(
                name=f"JoinReqCat-{uuid4().hex[:6]}"
            )
            cls.course = Course.objects.create(
                title=f"Join Request Course {uuid4().hex[:6]}",
                description="Course",
                code=f"JR-{uuid4().hex[:6]}",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                join_code=f"JOIN-{uuid4().hex[:8]}",
                join_code_expiry_date=timezone.now() + timedelta(days=7),
            )
            cls.student = User.objects.create_user(
                email=f"student-join-{uuid4().hex[:6]}@join.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"student-join-{uuid4().hex[:6]}@join.example",
                name="Student",
                date_of_birth=date(1990, 1, 1),
                code=f"join-student-{uuid4().hex[:6]}",
                roles=[User.UserRole.STUDENT],
            )
            cls.teacher = User.objects.create_user(
                email=f"teacher-join-{uuid4().hex[:6]}@join.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"teacher-join-{uuid4().hex[:6]}@join.example",
                name="Teacher",
                date_of_birth=date(1990, 1, 1),
                code=f"join-teacher-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )

    def setUp(self):
        self.course = type(self).course
        self.student = type(self).student
        self.teacher = type(self).teacher

    def _client(self, user: User | None = None) -> APIClient:
        client = APIClient()
        if user is not None:
            token = AccessToken.for_user(user)
            token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
            client.credentials(
                HTTP_AUTHORIZATION=f"Bearer {token}",
                HTTP_X_DTS_SCHEMA=self.schema_name,
            )
        else:
            client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def _post(self, join_code: str, user: User | None = None):
        return self._client(user).post(
            f"/api/v1/courses/join/{join_code}/request",
            {},
            format="json",
        )

    def test_student_can_request_join_by_code(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 201, resp.content)
        with schema_context(self.schema_name):
            self.assertTrue(
                CourseJoinRequest.objects.filter(
                    user=self.student,
                    course=self.course,
                    status=CourseJoinRequest.Status.PENDING,
                ).exists()
            )

    def test_non_student_forbidden(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.teacher)
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_unauthenticated_forbidden(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code)
        self.assertIn(resp.status_code, (401, 403), resp.content)

    def test_invalid_join_code_returns_404(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post("INVALID-CODE-XYZ", self.student)
        self.assertEqual(resp.status_code, 404, resp.content)

    def test_expired_join_code_returns_400(self):
        with schema_context(self.schema_name):
            self.course.join_code_expiry_date = timezone.now() - timedelta(days=1)
            self.course.save(update_fields=["join_code_expiry_date"])
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(resp.json().get("message"), "join_code_expired")

    def test_already_enrolled_returns_200(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json().get("message"), "already_enrolled")

    def test_pending_request_is_idempotent(self):
        with schema_context(self.schema_name):
            CourseJoinRequest.objects.create(
                user=self.student,
                course=self.course,
                status=CourseJoinRequest.Status.PENDING,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.assertEqual(
                CourseJoinRequest.objects.filter(
                    user=self.student,
                    course=self.course,
                ).count(),
                1,
            )

    def test_rejected_request_reopens_to_pending(self):
        with schema_context(self.schema_name):
            join_request = CourseJoinRequest.objects.create(
                user=self.student,
                course=self.course,
                status=CourseJoinRequest.Status.REJECTED,
                reject_reason="Not eligible",
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._post(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            join_request.refresh_from_db()
            self.assertEqual(join_request.status, CourseJoinRequest.Status.PENDING)

    def _get(self, join_code: str, user: User | None = None):
        return self._client(user).get(f"/api/v1/courses/join/{join_code}")

    def test_lookup_with_null_expiry_succeeds(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Null Expiry Course {uuid4().hex[:6]}",
                description="Course",
                code=f"NE-{uuid4().hex[:6]}",
                category=self.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                join_code=f"NULL-{uuid4().hex[:8]}",
                join_code_expiry_date=None,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._get(course.join_code)
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["id"], course.id)
        self.assertNotIn("is_join_code_expired", data)

    def test_request_with_null_expiry_succeeds(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Null Expiry Request {uuid4().hex[:6]}",
                description="Course",
                code=f"NR-{uuid4().hex[:6]}",
                category=self.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                join_code=f"NREQ-{uuid4().hex[:8]}",
                join_code_expiry_date=None,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).post(
                f"/api/v1/courses/join/{course.join_code}/request",
                {},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        with schema_context(self.schema_name):
            self.assertTrue(
                CourseJoinRequest.objects.filter(
                    user=self.student,
                    course=course,
                    status=CourseJoinRequest.Status.PENDING,
                ).exists()
            )

    def test_lookup_is_case_insensitive(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._get(self.course.join_code.lower())
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"]["id"], self.course.id)

    def test_lookup_still_public_without_auth(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._get(self.course.join_code)
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["id"], self.course.id)
        self.assertFalse(data["has_user"])
        self.assertNotIn("previous_join_request", data)
        self.assertNotIn("is_already_joined", data)

    def test_lookup_returns_has_user_true_when_authenticated(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._get(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertTrue(data["has_user"])
        self.assertFalse(data["is_already_joined"])

    def test_lookup_returns_previous_join_request_when_authenticated(self):
        with schema_context(self.schema_name):
            CourseJoinRequest.objects.create(
                user=self.student,
                course=self.course,
                status=CourseJoinRequest.Status.PENDING,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._get(self.course.join_code, self.student)
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertTrue(data["has_user"])
        previous = data.get("previous_join_request")
        self.assertIsNotNone(previous)
        self.assertEqual(previous["status"], CourseJoinRequest.Status.PENDING)
        self.assertEqual(previous["course"], self.course.id)
        self.assertEqual(previous["user"], self.student.id)

    def test_disabled_join_code_lookup_marks_disabled(self):
        with schema_context(self.schema_name):
            self.course.is_join_code_enabled = False
            self.course.save(update_fields=["is_join_code_enabled"])
        try:
            with self.settings(RBAC_ENFORCE="enforce"):
                resp = self._get(self.course.join_code)
            self.assertEqual(resp.status_code, 200, resp.content)
            data = resp.json()["data"]
            self.assertFalse(data["is_join_code_enabled"])
            self.assertTrue(data["is_join_code_disabled"])
        finally:
            with schema_context(self.schema_name):
                self.course.is_join_code_enabled = True
                self.course.save(update_fields=["is_join_code_enabled"])

    def test_disabled_join_code_request_returns_400(self):
        with schema_context(self.schema_name):
            self.course.is_join_code_enabled = False
            self.course.save(update_fields=["is_join_code_enabled"])
        try:
            with self.settings(RBAC_ENFORCE="enforce"):
                resp = self._post(self.course.join_code, self.student)
            self.assertEqual(resp.status_code, 400, resp.content)
            self.assertEqual(resp.json().get("message"), "join_code_disabled")
        finally:
            with schema_context(self.schema_name):
                self.course.is_join_code_enabled = True
                self.course.save(update_fields=["is_join_code_enabled"])
