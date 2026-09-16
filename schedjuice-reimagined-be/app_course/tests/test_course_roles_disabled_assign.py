import unittest
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import User
from app_course.models import (
    AssignedAsRole,
    Category,
    Course,
    CourseMembershipEvent,
    Event,
    Program,
    UserCourse,
)
from app_course.roster_writes import execute_assign_staff
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class CourseRolesDisabledAssignTests(TestCase):
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

    def setUp(self):
        self.today = timezone.localdate()
        self.suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_course_role_enabled=False,
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-{self.suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="1",
                communication_email=f"mgr-{self.suffix}@example.com",
                date_of_birth=date(1990, 1, 1),
                code=f"mgr-{self.suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{self.suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="2",
                communication_email=f"tch-{self.suffix}@example.com",
                date_of_birth=date(1990, 1, 1),
                code=f"tch-{self.suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.mt_role = AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).order_by("id").first()
            if self.mt_role is None:
                self.mt_role = AssignedAsRole.objects.create(
                    name=f"MT-{self.suffix}",
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                )
            self.at_role = AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER
            ).order_by("id").first()
            if self.at_role is None:
                self.at_role = AssignedAsRole.objects.create(
                    name=f"AT-{self.suffix}",
                    seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                )
            self.event = Event.objects.create(
                title=f"Ev {self.suffix}",
                date=datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        token = AccessToken.for_user(user)
        token[JWT_TENANT_SCHEMA_CLAIM] = self.schema_name
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_TENANT=self.schema_name,
        )
        return client

    def test_roster_management_forces_mt_when_roles_disabled(self):
        with schema_context(self.schema_name):
            resp = self._client(self.manager).post(
                "/api/v1/user-courses/management",
                [
                    {
                        "user": self.teacher.id,
                        "course": self.course.id,
                        "assigned_as": UserCourse.AssignedAs.TEACHER,
                        "assigned_as_role": self.at_role.id,
                    }
                ],
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            uc = UserCourse.objects.get(
                user_id=self.teacher.id, course_id=self.course.id
            )
            self.assertEqual(uc.assigned_as_role_id, self.mt_role.id)

    def test_roster_management_400_when_no_mt(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).delete()
            resp = self._client(self.manager).post(
                "/api/v1/user-courses/management",
                [
                    {
                        "user": self.teacher.id,
                        "course": self.course.id,
                        "assigned_as": UserCourse.AssignedAs.TEACHER,
                        "assigned_as_role": self.at_role.id,
                    }
                ],
                format="json",
            )
            self.assertEqual(resp.status_code, 400, resp.content)
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=self.teacher.id, course_id=self.course.id
                ).exists()
            )

    def test_teacher_assign_view_forces_mt(self):
        with schema_context(self.schema_name):
            resp = self._client(self.manager).post(
                f"/api/v1/courses/{self.course.id}/assign-events",
                {
                    "user_id": self.teacher.id,
                    "assigned_as_role_id": self.at_role.id,
                    "new_events": [{"id": self.event.id}],
                    "removed_events": [],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            uc = UserCourse.objects.get(
                user_id=self.teacher.id, course_id=self.course.id
            )
            self.assertEqual(uc.assigned_as_role_id, self.mt_role.id)
            self.assertTrue(
                UserEvent.objects.filter(
                    user_id=self.teacher.id, event_id=self.event.id
                ).exists()
            )

    def test_execute_assign_staff_forces_mt(self):
        with schema_context(self.schema_name):
            result = execute_assign_staff(
                actor=self.manager,
                course=self.course,
                staff=self.teacher,
                assigned_as_role=self.at_role,
                weekdays=None,
                source=CourseMembershipEvent.Source.API,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok", result)
            self.assertEqual(result["role"]["id"], self.mt_role.id)
            uc = UserCourse.objects.get(
                user_id=self.teacher.id, course_id=self.course.id
            )
            self.assertEqual(uc.assigned_as_role_id, self.mt_role.id)
