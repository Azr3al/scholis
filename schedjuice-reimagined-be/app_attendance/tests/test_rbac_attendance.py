import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_attendance.models import UserEvent
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
class AttendanceRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name), patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        ), patch("app_telegram.signals.remove_telegram_member.delay"):
            seed_rbac()
            self.hr_user = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.admin_user = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.other_student = User.objects.create_user(
                email=f"stu2-{suffix}@example.com",
                password="x",
                name="Other Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
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
            self.other_course = Course.objects.create(
                title=f"C2 {suffix}",
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
                user=self.other_teacher,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.other_student,
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
            self.user_event = UserEvent.objects.create(
                user=self.student,
                event=self.event,
            )
            UserEvent.objects.create(
                user=self.other_student,
                event=self.event,
            )

    def _bulk_update_payload(self):
        return [
            {
                "id": self.user_event.id,
                "attendance_status": UserEvent.AttendanceStatus.PRESENT,
            }
        ]

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_forbidden_on_god_view_search(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/attendances/god-view/search",
                {"mode": "risk", "date_from": self.today.isoformat(), "date_to": self.today.isoformat()},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_unassigned_teacher_forbidden_on_attendance_by_event(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.other_teacher).get(
                f"/api/v1/attendances/get-by-event/{self.event.id}?page=1&size=24"
            )
        self.assertEqual(resp.status_code, 403)

    def test_assigned_teacher_can_bulk_update_attendance(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).put(
                "/api/v1/attendances",
                self._bulk_update_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.user_event.refresh_from_db()
            self.assertEqual(
                self.user_event.attendance_status,
                UserEvent.AttendanceStatus.PRESENT,
            )

    def test_unassigned_teacher_forbidden_on_bulk_update(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.other_teacher).put(
                "/api/v1/attendances",
                self._bulk_update_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_admin_can_bulk_update_without_usercourse(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin_user).put(
                "/api/v1/attendances",
                self._bulk_update_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.user_event.refresh_from_db()
            self.assertEqual(
                self.user_event.attendance_status,
                UserEvent.AttendanceStatus.PRESENT,
            )

    def test_student_forbidden_on_bulk_update(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).put(
                "/api/v1/attendances",
                self._bulk_update_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_forbidden_on_bulk_update_even_in_log_only(self):
        with self.settings(RBAC_ENFORCE="log_only"):
            resp = self._client(self.student).put(
                "/api/v1/attendances",
                self._bulk_update_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_monthly_attendance_scoped_to_own_row(self):
        month = self.today.strftime("%Y-%m")
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).get(
                f"/api/v1/attendances/monthly-attendance/{self.course.id}/{month}"
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        table = body["data"]["data"]
        students = body["data"]["students"]
        self.assertEqual(len(students), 1)
        self.assertEqual(students[0]["id"], self.student.id)
        self.assertEqual(len(table), 2)
        self.assertEqual(table[1][0], "Student")

    def test_teacher_monthly_attendance_includes_all_students(self):
        month = self.today.strftime("%Y-%m")
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get(
                f"/api/v1/attendances/monthly-attendance/{self.course.id}/{month}"
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        table = body["data"]["data"]
        students = body["data"]["students"]
        self.assertEqual(len(students), 2)
        self.assertEqual(len(table), 3)
