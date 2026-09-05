import unittest
from datetime import date, datetime, timedelta, time
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory
from tenant_schemas.utils import schema_context

from app_attendance.attendance_summary import (
    build_course_attendance_summary,
    build_monthly_attendance_matrix,
    list_course_students_for_attendance,
)
from app_attendance.marking_services import build_marking_roster
from app_attendance.models import UserEvent
from app_attendance.removed_students import (
    get_removed_course_student_ids,
    parse_include_removed_students,
)
from app_auth.models import User
from app_course.membership_history import record_membership_event
from app_course.models import (
    Category,
    Course,
    CourseMembershipEvent,
    Event,
    Program,
    UserCourse,
)
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _grant_removed_permission():
    role = Role.objects.filter(slug="teacher", is_system=True).first()
    RolePermission.objects.get_or_create(
        role=role,
        permission_code="attendance.view_removed_students",
    )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class RemovedStudentAttendanceTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.factory = APIRequestFactory()
        self.today = timezone.localdate()
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
            self.student_active = User.objects.create_user(
                email=f"stu-a-{suffix}@example.com",
                password="x",
                name="Active Student",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.student_removed = User.objects.create_user(
                email=f"stu-r-{suffix}@example.com",
                password="x",
                name="Removed Student",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student_active,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student_removed,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            record_membership_event(
                course_id=self.course.id,
                user_id=self.student_removed.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
                actor_id=self.teacher.id,
            )
            UserCourse.objects.filter(
                user=self.student_removed,
                course=self.course,
            ).delete()
            ev_date = timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            )
            self.event = Event.objects.create(
                title="Session",
                course=self.course,
                date=ev_date,
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=self.student_removed,
                event=self.event,
                attendance_status=UserEvent.AttendanceStatus.PRESENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_get_removed_course_student_ids_excludes_active(self):
        with schema_context(self.schema_name):
            removed = get_removed_course_student_ids(self.course.id)
        self.assertEqual(removed, {self.student_removed.id})

    def test_parse_include_removed_raises_without_permission(self):
        request = Request(
            self.factory.get("/", {"include_removed_students": "true"})
        )
        with schema_context(self.schema_name):
            role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=role,
                permission_code="attendance.view_removed_students",
            ).delete()
            with self.assertRaises(PermissionDenied):
                parse_include_removed_students(request, self.teacher)

    def test_list_course_students_active_only_by_default(self):
        with schema_context(self.schema_name):
            students = list_course_students_for_attendance(self.course.id)
        ids = {s["id"] for s in students}
        self.assertIn(self.student_active.id, ids)
        self.assertNotIn(self.student_removed.id, ids)

    def test_list_course_students_includes_removed_when_flag_on(self):
        with schema_context(self.schema_name):
            students = list_course_students_for_attendance(
                self.course.id, include_removed=True
            )
        ids = {s["id"] for s in students}
        self.assertIn(self.student_active.id, ids)
        self.assertIn(self.student_removed.id, ids)
        removed = next(s for s in students if s["id"] == self.student_removed.id)
        self.assertTrue(removed["is_removed"])

    def test_matrix_includes_removed_student_row(self):
        with schema_context(self.schema_name):
            table = build_monthly_attendance_matrix(
                self.course.id,
                year=self.event.date.year,
                month=self.event.date.month,
                include_removed=True,
            )
        names = [row[0] for row in table[1:]]
        self.assertIn("Removed Student", names)

    def test_summary_marks_removed_and_includes_in_denominator(self):
        with schema_context(self.schema_name):
            summary = build_course_attendance_summary(
                self.course.id, course=self.course, include_removed=True
            )
        removed = next(
            s for s in summary["students"] if s["id"] == self.student_removed.id
        )
        self.assertTrue(removed["is_removed"])
        anchor = f"{self.event.date.year:04d}-{self.event.date.month:02d}-01"
        month_total = summary["class_aggregate"]["by_month"][anchor]["total"]
        self.assertGreaterEqual(month_total, 2)

    def test_marking_roster_includes_removed_with_preserved_userevent(self):
        with schema_context(self.schema_name):
            roster = build_marking_roster(self.event.id, include_removed=True)
        user_ids = {row["user"]["id"] for row in roster}
        self.assertIn(self.student_active.id, user_ids)
        self.assertIn(self.student_removed.id, user_ids)
        removed_row = next(
            r for r in roster if r["user"]["id"] == self.student_removed.id
        )
        self.assertTrue(removed_row["is_removed"])

    def test_marking_roster_does_not_create_userevent_for_removed(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(
                user=self.student_removed, event=self.event
            ).delete()
            roster = build_marking_roster(self.event.id, include_removed=True)
        user_ids = {row["user"]["id"] for row in roster}
        self.assertNotIn(self.student_removed.id, user_ids)

    def test_monthly_attendance_403_without_permission(self):
        with schema_context(self.schema_name):
            role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=role,
                permission_code="attendance.view_removed_students",
            ).delete()
        month = f"{self.event.date.year:04d}-{self.event.date.month:02d}-01"
        url = (
            f"/api/v1/attendances/monthly-attendance/"
            f"{self.course.id}/{month}?include_removed_students=true"
        )
        resp = self._client(self.teacher).get(url)
        self.assertEqual(resp.status_code, 403)

    def test_monthly_attendance_includes_removed_with_permission(self):
        with schema_context(self.schema_name):
            _grant_removed_permission()
        month = f"{self.event.date.year:04d}-{self.event.date.month:02d}-01"
        url = (
            f"/api/v1/attendances/monthly-attendance/"
            f"{self.course.id}/{month}?include_removed_students=true"
        )
        resp = self._client(self.teacher).get(url)
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        matrix = body["data"]
        students = body["students"]
        student_names = [row[0] for row in matrix[1:]]
        self.assertIn("Removed Student", student_names)
        self.assertTrue(any(s["is_removed"] for s in students))
