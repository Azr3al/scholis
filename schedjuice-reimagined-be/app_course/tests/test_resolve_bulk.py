import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import schema_context

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import Category, Course, Program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ResolveCoursesBulkTest(TestCase):
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

    def test_resolve_bulk_links_exact_and_flags_unknown(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email=f"admin@imp-{suffix}.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            category = Category.objects.create(name=f"Cat {suffix}")
            program = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            today = timezone.localdate()
            Course.objects.create(
                title="Year 2 Section R1 - Academic Year 2026-2027",
                code=f"Y2R1-{suffix}",
                start_date=today,
                end_date=today + timedelta(days=200),
                status=Course.CourseStatus.ACTIVE,
                category=category,
                program=program,
            )
        res = self._client(admin).post(
            "/api/v1/courses/resolve-bulk",
            {"names": ["Year 2 Section R1", "Totally Unknown"]},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertFalse(body.get("isError"))
        data = body["data"]
        self.assertEqual(data["Year 2 Section R1"]["status"], "linked")
        self.assertEqual(data["Totally Unknown"]["status"], "none")

    def test_resolve_bulk_scopes_to_program(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email=f"admin@scope-{suffix}.example",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            category = Category.objects.create(name=f"Cat {suffix}")
            program_a = Program.objects.create(
                name=f"PA {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            program_b = Program.objects.create(
                name=f"PB {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            today = timezone.localdate()
            for program in (program_a, program_b):
                Course.objects.create(
                    title=f"Year 2 Section R1 {suffix} p{program.id}",
                    code=f"Y2R1-{program.id}-{suffix}",
                    start_date=today,
                    end_date=today + timedelta(days=200),
                    status=Course.CourseStatus.ACTIVE,
                    category=category,
                    program=program,
                )
            program_b_id = program_b.id

        res = self._client(admin).post(
            "/api/v1/courses/resolve-bulk",
            {
                "names": [f"Year 2 Section R1 {suffix} p{program_b_id}"],
                "program_id": program_b_id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()["data"]
        lookup_name = f"Year 2 Section R1 {suffix} p{program_b_id}"
        entry = data[lookup_name]
        self.assertEqual(entry["status"], "linked")
        with schema_context(self.schema_name):
            matched = Course.objects.get(id=entry["match"]["id"])
            self.assertEqual(matched.program_id, program_b_id)

    def test_requires_admin(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"stud@imp-{suffix}.example",
                password="x",
                name="Stud",
                phone_number="-",
                date_of_birth=date(2005, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
        res = self._client(student).post(
            "/api/v1/courses/resolve-bulk", {"names": []}, format="json"
        )
        self.assertEqual(res.status_code, 403, res.content)
