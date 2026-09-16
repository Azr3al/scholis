"""User teaching-assessments hub endpoint tests."""

from datetime import date, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context
from uuid import uuid4

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Assignment, Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_quiz_v3.models import Quiz


class UserTeachingAssessmentsViewTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            cls.cat = Category.objects.first() or Category.objects.create(name="CatTA")
            cls.course_a = Course.objects.create(
                title="Course A",
                description="A",
                code="TA1",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.course_b = Course.objects.create(
                title="Course B",
                description="B",
                code="TA2",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.course_other = Course.objects.create(
                title="Course Other",
                description="O",
                code="TAO",
                category=cls.cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            cls.teacher = User.objects.create_user(
                email="teacher@teach-assess.example",
                password="pw-test-123",
                phone_number="1",
                communication_email="teacher@teach-assess.example",
                name="Teacher",
                date_of_birth=date(1990, 1, 1),
                code="ta-teacher-1",
                roles=[User.UserRole.TEACHER],
            )
            cls.other_teacher = User.objects.create_user(
                email="other@teach-assess.example",
                password="pw-test-123",
                phone_number="2",
                communication_email="other@teach-assess.example",
                name="Other",
                date_of_birth=date(1990, 1, 1),
                code="ta-teacher-2",
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.create(
                user=cls.teacher,
                course=cls.course_a,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=cls.teacher,
                course=cls.course_b,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            now = timezone.now()
            cls.assignment_a = Assignment.objects.create(
                title="A Assignment",
                course=cls.course_a,
                instructions={"type": "doc", "content": []},
                due_datetime=now + timedelta(days=7),
                available_datetime=now - timedelta(days=1),
                available_score=10,
                max_attempts=1,
            )
            cls.assignment_other_course = Assignment.objects.create(
                title="Other Course Assignment",
                course=cls.course_other,
                instructions={"type": "doc", "content": []},
                due_datetime=now + timedelta(days=7),
                available_datetime=now - timedelta(days=1),
                available_score=10,
                max_attempts=1,
            )
            cls.quiz_b = Quiz.objects.create(
                title="B Quiz",
                course=cls.course_b,
                created_by=cls.other_teacher,
            )

    def setUp(self):
        self.org = Organization.objects.get(schema_name=self.schema_name)
        self.teacher = type(self).teacher
        self.other_teacher = type(self).other_teacher

    def _client(self, user: User) -> APIClient:
        at = AccessToken.for_user(user)
        at[JWT_TENANT_SCHEMA_CLAIM] = self.org.schema_name
        c = APIClient()
        c.credentials(
            HTTP_AUTHORIZATION=f"Bearer {at}",
            HTTP_X_DTS_SCHEMA=self.org.schema_name,
        )
        return c

    def test_teacher_sees_assessments_in_assigned_courses_only(self):
        c = self._client(self.teacher)
        res = c.get(f"/api/v1/users/{self.teacher.id}/teaching-assessments?size=50")
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertFalse(payload.get("isError"))
        data = payload.get("data", {})
        rows = data if isinstance(data, list) else data.get("data", [])
        titles = {r.get("title") for r in rows}
        self.assertIn("A Assignment", titles)
        self.assertIn("B Quiz", titles)
        self.assertNotIn("Other Course Assignment", titles)

    def test_user_without_teacher_enrollment_gets_empty_list(self):
        c = self._client(self.other_teacher)
        res = c.get(f"/api/v1/users/{self.other_teacher.id}/teaching-assessments")
        self.assertEqual(res.status_code, 200)
        body = res.json()["data"]
        count = body.get("count", 0) if isinstance(body, dict) else len(body)
        self.assertEqual(count, 0)

    def test_other_user_cannot_read_hub(self):
        c = self._client(self.other_teacher)
        res = c.get(f"/api/v1/users/{self.teacher.id}/teaching-assessments")
        self.assertEqual(res.status_code, 403)
