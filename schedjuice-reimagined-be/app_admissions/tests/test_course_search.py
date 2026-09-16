import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, PostType
from app_auth.models import User
from app_course.models import Category, Course, Program
from app_rbac.cache import bump_matrix_generation
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdmissionsCourseSearchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.suffix = suffix
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            cat = Category.objects.create(name=f"Adm crs {suffix}")
            prog = Program.objects.create(
                name=f"Adm crs prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.teacher = User.objects.create_user(
                email=f"adm-crs-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.officer = self._admissions_only(suffix)
            self.course = Course.objects.create(
                title=f"Active unit {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            self.ended = Course.objects.create(
                title=f"Ended unit {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=40),
                end_date=today - timedelta(days=10),
            )
            older = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=5,
                data="<p>Unit 5</p>",
                html_data="<p>Unit 5</p>",
                course=self.course,
                created_by=self.officer,
            )
            newer = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=8,
                data="<p>Unit 8</p>",
                html_data="<p>Unit 8</p>",
                course=self.course,
                created_by=self.officer,
            )
            Announcement.objects.filter(pk=older.pk).update(
                created_at=datetime(2026, 6, 10, 10, 0, tzinfo=timezone.utc),
                updated_at=datetime(2026, 6, 10, 10, 0, tzinfo=timezone.utc),
            )
            Announcement.objects.filter(pk=newer.pk).update(
                created_at=datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc),
                updated_at=datetime(2026, 8, 3, 14, 0, tzinfo=timezone.utc),
            )

    def _admissions_only(self, suffix: str) -> User:
        role = Role.objects.create(
            slug=f"admissions-crs-{suffix}",
            display_name="Admissions desk",
            is_system=False,
        )
        RolePermission.objects.create(role=role, permission_code="admissions.view")
        bump_matrix_generation(self.schema_name)
        return User.objects.create_user(
            email=f"adm-crs-{suffix}@example.com",
            password="x",
            name="Officer",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[role.slug],
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "status",
                        "operator": "in",
                        "value": "active,paused",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_current_unit_from_latest_daily_lesson(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["id"] == self.course.id)
        self.assertEqual(row["current_unit"], 8)
        self.assertNotIn("student_count", row)
        self.assertCountEqual(
            row.keys(),
            [
                "id",
                "title",
                "start_date",
                "end_date",
                "status",
                "weekday_pattern",
                "time_pattern",
                "first_event_time_from",
                "first_event_time_to",
                "current_unit",
                "current_unit_updated_at",
            ],
        )

    def test_default_active_omits_ended(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/courses/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "status",
                        "operator": "in",
                        "value": "active,paused",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.ended.id, ids)
        self.assertIn(self.course.id, ids)
