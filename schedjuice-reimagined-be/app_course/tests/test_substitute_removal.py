import unittest
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
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
from app_course.program_helpers import get_default_program
from app_course.substitute_removal import expire_substitute_assignments
from app_rbac.seeding import seed_rbac
from app_tasks.models import Task


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SubstituteRemovalTests(TestCase):
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
            self.substitute = User.objects.create_user(
                email=f"sub-{suffix}@example.com",
                password="x",
                name="Substitute",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.first()
            self.prog = get_default_program()
            self.course = Course.objects.create(
                title=f"Sub removal {suffix}",
                code=f"SR-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.sub_role = AssignedAsRole.objects.create(
                name=f"Sub MT {suffix}",
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
            self.tenant_ms_off = SimpleNamespace(
                is_microsoft_on=False,
                is_teams_creation_enabled=True,
                schema_name=self.schema_name,
            )
            self.tenant_ms_on = SimpleNamespace(
                is_microsoft_on=True,
                is_teams_creation_enabled=True,
                schema_name=self.schema_name,
            )

    def _assign_substitute(self, *, auto_remove_on):
        uc = UserCourse.objects.create(
            user=self.substitute,
            course=self.course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role=self.sub_role,
            substitute_auto_remove_on=auto_remove_on,
        )
        UserEvent.objects.create(user=self.substitute, event=self.event)
        return uc

    def test_removes_assignment_after_last_session_date(self):
        with schema_context(self.schema_name):
            uc = self._assign_substitute(auto_remove_on=date(2026, 9, 14))
            result = expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2026, 9, 15)
            )
            self.assertEqual(result["count"], 1)
            self.assertFalse(UserCourse.objects.filter(id=uc.id).exists())
            ended = UserCourse.including_ended.get(id=uc.id)
            self.assertIsNotNone(ended.left_at)
            self.assertTrue(
                UserEvent.all_objects.filter(
                    user_id=self.substitute.id,
                    event__course_id=self.course.id,
                    is_deleted=True,
                ).exists()
            )
            self.assertTrue(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.substitute.id,
                    event_type=CourseMembershipEvent.EventType.REMOVED,
                    source="cron",
                ).exists()
            )

    def test_keeps_assignment_on_the_last_session_day(self):
        with schema_context(self.schema_name):
            uc = self._assign_substitute(auto_remove_on=date(2026, 9, 14))
            result = expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2026, 9, 14)
            )
            self.assertEqual(result["count"], 0)
            self.assertTrue(UserCourse.objects.filter(id=uc.id).exists())

    def test_ignores_assignments_without_auto_remove_date(self):
        with schema_context(self.schema_name):
            uc = self._assign_substitute(auto_remove_on=None)
            result = expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2030, 1, 1)
            )
            self.assertEqual(result["count"], 0)
            self.assertTrue(UserCourse.objects.filter(id=uc.id).exists())

    def test_is_idempotent_on_second_run(self):
        with schema_context(self.schema_name):
            self._assign_substitute(auto_remove_on=date(2026, 9, 14))
            expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2026, 9, 15)
            )
            second = expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2026, 9, 15)
            )
            self.assertEqual(second["count"], 0)
            self.assertEqual(
                CourseMembershipEvent.objects.filter(
                    course_id=self.course.id,
                    user_id=self.substitute.id,
                    event_type=CourseMembershipEvent.EventType.REMOVED,
                ).count(),
                1,
            )

    def test_queues_teams_removal_when_tenant_syncs_roster(self):
        with schema_context(self.schema_name):
            self.course.microsoft_group_id = "group-1"
            self.course.save(update_fields=["microsoft_group_id"])
            self.substitute.microsoft_id = "ms-user-1"
            self.substitute.save(update_fields=["microsoft_id"])
            self._assign_substitute(auto_remove_on=date(2026, 9, 14))
            expire_substitute_assignments(
                tenant=self.tenant_ms_on, today=date(2026, 9, 15)
            )
            task = Task.objects.filter(name=Task.TaskName.REMOVE_MS_MEMBER).first()
            self.assertIsNotNone(task)
            self.assertEqual(task.data["group_id"], "group-1")
            self.assertEqual(task.data["user_id"], "ms-user-1")
            self.assertEqual(task.data["role"], "owners")

    def test_does_not_queue_teams_removal_when_microsoft_off(self):
        with schema_context(self.schema_name):
            self._assign_substitute(auto_remove_on=date(2026, 9, 14))
            expire_substitute_assignments(
                tenant=self.tenant_ms_off, today=date(2026, 9, 15)
            )
            self.assertFalse(
                Task.objects.filter(name=Task.TaskName.REMOVE_MS_MEMBER).exists()
            )
