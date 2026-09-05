import unittest
from datetime import date, datetime, timedelta
from io import StringIO
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_attendance.orphan_userevent_cleanup import (
    delete_orphan_student_userevents,
    orphan_student_userevents_qs,
)
from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class OrphanUserEventCleanupTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command as django_call_command

        django_call_command("migrate_schemas", shared=True, verbosity=0)
        django_call_command("migrate_schemas", verbosity=0)
        django_call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student Active",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.removed_student = User.objects.create_user(
                email=f"rm-{suffix}@example.com",
                password="x",
                name="Student Removed",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ev_date = timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            self.enrolled_ue = UserEvent.objects.create(
                user=self.student,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            self.orphan_ue = UserEvent.objects.create(
                user=self.removed_student,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )
            self.teacher_ue = UserEvent.objects.create(
                user=self.teacher,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )

    def test_enrolled_student_not_orphan(self):
        with schema_context(self.schema_name):
            orphan_ids = set(orphan_student_userevents_qs().values_list("id", flat=True))
        self.assertNotIn(self.enrolled_ue.id, orphan_ids)

    def test_removed_student_is_orphan(self):
        with schema_context(self.schema_name):
            orphan_ids = set(orphan_student_userevents_qs().values_list("id", flat=True))
        self.assertIn(self.orphan_ue.id, orphan_ids)

    def test_teacher_userevent_not_in_orphan_qs(self):
        with schema_context(self.schema_name):
            orphan_ids = set(orphan_student_userevents_qs().values_list("id", flat=True))
        self.assertNotIn(self.teacher_ue.id, orphan_ids)

    def test_delete_orphans_removes_only_orphan(self):
        with schema_context(self.schema_name):
            deleted = delete_orphan_student_userevents(course_id=self.course.id)
            remaining_ids = set(UserEvent.objects.values_list("id", flat=True))
        self.assertEqual(deleted, 1)
        self.assertNotIn(self.orphan_ue.id, remaining_ids)
        self.assertIn(self.enrolled_ue.id, remaining_ids)
        self.assertIn(self.teacher_ue.id, remaining_ids)

    def test_orphan_with_checkin_not_hard_deleted(self):
        with schema_context(self.schema_name):
            self.orphan_ue.checkin_time = timezone.now()
            self.orphan_ue.save(update_fields=["checkin_time", "updated_at"])
            deleted = delete_orphan_student_userevents(course_id=self.course.id)
        self.assertEqual(deleted, 0)
        with schema_context(self.schema_name):
            self.assertTrue(UserEvent.objects.filter(id=self.orphan_ue.id).exists())

    def test_command_dry_run_does_not_delete(self):
        out = StringIO()
        call_command(
            "cleanup_orphan_student_userevents",
            schema_name=self.schema_name,
            course_id=self.course.id,
            stdout=out,
        )
        self.assertIn("DRY RUN", out.getvalue())
        with schema_context(self.schema_name):
            self.assertTrue(UserEvent.objects.filter(id=self.orphan_ue.id).exists())

    def test_command_execute_deletes_orphans(self):
        out = StringIO()
        call_command(
            "cleanup_orphan_student_userevents",
            schema_name=self.schema_name,
            course_id=self.course.id,
            execute=True,
            stdout=out,
        )
        self.assertIn("Deleted 1", out.getvalue())
        with schema_context(self.schema_name):
            self.assertFalse(UserEvent.objects.filter(id=self.orphan_ue.id).exists())
            self.assertTrue(UserEvent.objects.filter(id=self.enrolled_ue.id).exists())

    def test_command_unknown_schema_raises(self):
        with self.assertRaises(CommandError):
            call_command(
                "cleanup_orphan_student_userevents",
                schema_name="nonexistent_schema_xyz",
            )
