import unittest
from datetime import date, datetime, time, timedelta
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_attendance.models import UserEvent
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AvailableUsersSearchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = mock.patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = mock.patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-av-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.audrey = User.objects.create_user(
                email=f"audrey-{suffix}@example.com",
                password="x",
                name="Audrey",
                alternative_name="nickname",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.bruce = User.objects.create_user(
                email=f"bruce-{suffix}@example.com",
                password="x",
                name="Bruce",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.busy = User.objects.create_user(
                email=f"busy-{suffix}@example.com",
                password="x",
                name="Busy Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat av {suffix}")
            self.prog = Program.objects.create(
                name=f"P av {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C av {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.other_course = Course.objects.create(
                title=f"C other {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            mt_role, _ = AssignedAsRole.objects.get_or_create(
                name=f"MT av {suffix}",
                defaults={
                    "seniority": AssignedAsRole.Seniority.MAIN_TEACHER,
                    "is_collision_enabled": True,
                },
            )
            self.sub_at_role = AssignedAsRole.objects.create(
                name=f"Sub AT av {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                is_collision_enabled=False,
            )
            session_date = timezone.make_aware(datetime.combine(self.today, time(9, 0)))
            self.course_event = Event.objects.create(
                title="mine",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(11, 0),
                course=self.course,
            )
            self.other_event = Event.objects.create(
                title="other",
                date=session_date,
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=self.other_course,
            )
            UserCourse.objects.create(
                user=self.busy,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=mt_role,
            )
            UserEvent.objects.create(user=self.busy, event=self.other_event)
            self.mt_role_id = mt_role.id
            self.sub_at_role_id = self.sub_at_role.id
            self.course_id = self.course.id
            self.audrey_id = self.audrey.id
            self.plain_teacher = User.objects.create_user(
                email=f"plain-{suffix}@example.com",
                password="x",
                name="Plain",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_q_filters_candidates_by_name(self):
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users?q=audrey",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        names = [row["name"] for row in resp.json()["data"]]
        self.assertIn("Audrey", names)
        self.assertNotIn("Bruce", names)

    def test_q_matches_alternative_name(self):
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users?q=nickname",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            [row["id"] for row in resp.json()["data"]], [self.audrey_id]
        )

    def test_still_marks_colliding_candidates_as_not_free(self):
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users?q=busy",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        row = resp.json()["data"][0]
        self.assertFalse(row["isFree"])

    def test_collision_disabled_role_on_overlapping_course_stays_free(self):
        sub_busy = User.objects.create_user(
            email=f"sub-busy-{uuid4().hex[:6]}@example.com",
            password="x",
            name="Sub Busy",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.TEACHER],
        )
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=sub_busy,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.sub_at_role,
            )
            UserEvent.objects.create(user=sub_busy, event=self.other_event)
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users?q=Sub Busy",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        row = resp.json()["data"][0]
        self.assertTrue(row["isFree"])

    def test_only_free_excludes_collision_enabled_busy_teacher(self):
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users?onlyFree=true",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertNotIn(self.busy.id, ids)

    def test_assigned_as_role_id_skips_busy_when_collision_disabled(self):
        resp = self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/available-users"
            f"?q=busy&assigned_as_role_id={self.sub_at_role_id}",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        row = resp.json()["data"][0]
        self.assertTrue(row["isFree"])

    def test_forbidden_without_manage_members_permission(self):
        resp = self._client(self.plain_teacher).post(
            f"/api/v1/courses/{self.course_id}/available-users",
            {"filter_params": [], "exclude_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
