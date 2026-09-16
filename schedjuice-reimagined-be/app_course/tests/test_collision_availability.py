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

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.collision_availability import (
    collision_check_disabled_for_role,
    fetch_busy_collisions_for_course_sessions,
    fetch_busy_user_ids_for_course_sessions,
    fetch_busy_user_ids_for_timeslot,
)
from app_course.course_status import end_course
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
class CollisionAvailabilityTests(TestCase):
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
                email=f"mgr-col-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"t-col-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat col {suffix}")
            self.prog = Program.objects.create(
                name=f"P col {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C col {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.other_course = Course.objects.create(
                title=f"C other col {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT col {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_collision_enabled=True,
            )
            self.sub_at_role = AssignedAsRole.objects.create(
                name=f"Sub AT col {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                is_collision_enabled=False,
            )
            session_date = timezone.make_aware(datetime.combine(self.today, time(9, 0)))
            self.course_event = Event.objects.create(
                title="target",
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
            self.course_id = self.course.id
            self.tenant_tz = "Asia/Rangoon"

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _jwt_client(self, user: User) -> APIClient:
        """Simulate JWT auth where request.user.id is email."""
        token_user = type(
            "TokenUser",
            (),
            {"id": user.email, "is_authenticated": True},
        )()
        client = APIClient()
        client.force_authenticate(user=token_user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_fetch_busy_user_ids_ignores_collision_disabled_role(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.sub_at_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            busy = fetch_busy_user_ids_for_course_sessions(
                course_id=self.course_id,
                tenant_tz=self.tenant_tz,
            )
        self.assertNotIn(self.teacher.id, busy)

    def test_fetch_busy_user_ids_includes_collision_enabled_overlap(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            busy = fetch_busy_user_ids_for_course_sessions(
                course_id=self.course_id,
                tenant_tz=self.tenant_tz,
            )
        self.assertIn(self.teacher.id, busy)

    def test_fetch_busy_user_ids_for_timeslot_ignores_collision_disabled(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.sub_at_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            busy = fetch_busy_user_ids_for_timeslot(
                tenant_tz=self.tenant_tz,
                candidate_dates=[self.today],
                slot_time_from=time(9, 0),
                slot_time_to=time(11, 0),
            )
        self.assertNotIn(self.teacher.id, busy)

    def test_collision_check_disabled_for_role(self):
        with schema_context(self.schema_name):
            self.assertTrue(
                collision_check_disabled_for_role(self.sub_at_role.id)
            )
            self.assertFalse(collision_check_disabled_for_role(self.mt_role.id))
            self.assertFalse(collision_check_disabled_for_role(None))

    def test_available_for_timeslot_excludes_collision_enabled_only(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
        resp = self._jwt_client(self.manager).get(
            "/api/v1/users/available-for-timeslot"
            f"?year_month={self.today:%Y-%m}"
            "&time_from=09:00&time_to=11:00&weekdays="
            f"{self.today.isoweekday()}"
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        body = resp.json()
        ids = {row["id"] for row in body["data"]}
        self.assertNotIn(self.teacher.id, ids)
        self.assertIn("count", body)
        self.assertIn("total_pages", body)

    def test_available_for_timeslot_lists_teachers_only(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            admin_only = User.objects.create_user(
                email=f"adm-only-{suffix}@example.com",
                password="x",
                name="Admin Only",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            free_teacher = User.objects.create_user(
                email=f"free-t-{suffix}@example.com",
                password="x",
                name="Free Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
        resp = self._jwt_client(self.manager).get(
            "/api/v1/users/available-for-timeslot"
            f"?year_month={self.today:%Y-%m}"
            "&time_from=09:00&time_to=11:00&weekdays="
            f"{self.today.isoweekday()}&page=1&size=10"
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertIn(free_teacher.id, ids)
        self.assertNotIn(admin_only.id, ids)

    def test_available_for_timeslot_day_parity_narrows_busy_dates(self):
        """Teacher busy on one Monday: excluded when parity includes that day, included otherwise."""
        year, month = self.today.year, self.today.month
        busy_date = None
        for d in range(1, 32):
            try:
                candidate = date(year, month, d)
            except ValueError:
                break
            if candidate.isoweekday() == 1 and candidate.day % 2 == 1:
                busy_date = candidate
                break
        if busy_date is None:
            self.skipTest("No odd Monday in current month")

        with schema_context(self.schema_name):
            busy_event = Event.objects.create(
                title="busy monday",
                date=timezone.make_aware(datetime.combine(busy_date, time(9, 0))),
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=self.other_course,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=busy_event)

        base = (
            "/api/v1/users/available-for-timeslot"
            f"?year_month={year:04d}-{month:02d}"
            "&time_from=09:00&time_to=11:00&weekdays=1"
        )
        resp_odd = self._jwt_client(self.manager).get(f"{base}&day_parity=odd")
        self.assertEqual(resp_odd.status_code, 200, resp_odd.json())
        odd_ids = {row["id"] for row in resp_odd.json()["data"]}
        self.assertNotIn(self.teacher.id, odd_ids)

        resp_even = self._jwt_client(self.manager).get(f"{base}&day_parity=even")
        self.assertEqual(resp_even.status_code, 200, resp_even.json())
        even_ids = {row["id"] for row in resp_even.json()["data"]}
        self.assertIn(self.teacher.id, even_ids)

    def test_ended_course_overlap_not_busy(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            end_course(course=self.other_course, user=self.manager)
            busy = fetch_busy_user_ids_for_course_sessions(
                course_id=self.course_id,
                tenant_tz=self.tenant_tz,
            )
        self.assertNotIn(self.teacher.id, busy)

    def test_reserve_overlap_busy_reason(self):
        with schema_context(self.schema_name):
            self.other_event.is_substitution_reserve = True
            self.other_event.save(update_fields=["is_substitution_reserve"])
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            collisions = fetch_busy_collisions_for_course_sessions(
                course_id=self.course_id,
                tenant_tz=self.tenant_tz,
            )
        by_user = {row.user_id: row.reason for row in collisions}
        self.assertEqual(by_user[self.teacher.id], "substitution_reserve")

    def test_teaching_overlap_busy_reason(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.other_event)
            collisions = fetch_busy_collisions_for_course_sessions(
                course_id=self.course_id,
                tenant_tz=self.tenant_tz,
            )
        by_user = {row.user_id: row.reason for row in collisions}
        self.assertEqual(by_user[self.teacher.id], "schedule_conflict")

