import unittest
from datetime import date, datetime, time, timedelta
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SubstituteAssignEventsTests(TestCase):
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
                email=f"mgr-sub-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-sub-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat sub {suffix}")
            self.prog = Program.objects.create(
                name=f"P sub {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C sub {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.mt_role, _ = AssignedAsRole.objects.get_or_create(
                name=f"Main Teacher sub {suffix}",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            self.sub_role = AssignedAsRole.objects.create(
                name=f"Substitute MT {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            self.event = Event.objects.create(
                title=f"Session {suffix}",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )
            self.teacher_id = self.teacher.id
            self.course_id = self.course.id

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _set_flag(self, value: bool):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_substitute_teachers_enabled=value
            )

    def _assign(self, *, role_id, auto_remove_on=None):
        payload = {
            "user_id": self.teacher_id,
            "assigned_as_role_id": role_id,
            "new_events": [{"id": self.event.id}],
            "removed_events": [],
        }
        if auto_remove_on is not None:
            payload["substitute_auto_remove_on"] = auto_remove_on
        return self._client(self.manager).post(
            f"/api/v1/courses/{self.course_id}/assign-events",
            payload,
            format="json",
        )

    def test_auto_remove_date_rejected_for_non_substitute_role(self):
        self._set_flag(True)
        resp = self._assign(role_id=self.mt_role.id, auto_remove_on="2026-09-14")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("substitute_auto_remove_on", str(resp.json()))

    def test_auto_remove_date_rejected_when_org_flag_off(self):
        self._set_flag(False)
        resp = self._assign(role_id=self.sub_role.id, auto_remove_on="2026-09-14")
        self.assertEqual(resp.status_code, 400)

    def test_auto_remove_date_rejected_when_malformed(self):
        self._set_flag(True)
        resp = self._assign(role_id=self.sub_role.id, auto_remove_on="14-09-2026")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("substitute_auto_remove_on", str(resp.json()))

    def test_auto_remove_date_persists_for_substitute_role(self):
        self._set_flag(True)
        resp = self._assign(role_id=self.sub_role.id, auto_remove_on="2026-09-14")
        self.assertEqual(resp.status_code, 200, resp.json())
        with schema_context(self.schema_name):
            uc = UserCourse.objects.get(
                user_id=self.teacher_id, course_id=self.course_id
            )
            self.assertEqual(uc.substitute_auto_remove_on, date(2026, 9, 14))

    def test_substitute_assignment_without_auto_remove_stores_null(self):
        self._set_flag(True)
        resp = self._assign(role_id=self.sub_role.id, auto_remove_on=None)
        self.assertEqual(resp.status_code, 200, resp.json())
        with schema_context(self.schema_name):
            uc = UserCourse.objects.get(
                user_id=self.teacher_id, course_id=self.course_id
            )
            self.assertIsNone(uc.substitute_auto_remove_on)
