import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_ai.tools.get_unpaid_students import run_get_unpaid_students
from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import UserPayment
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class _UnpaidStudentsFixtureMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _mock_org(self):
        return Organization(timezone="UTC")

    def _create_course_with_unpaid_student(
        self,
        *,
        suffix: str,
        title: str,
        start_date: date,
        end_date: date,
        teacher: User | None = None,
        create_payment_for_paid_student: bool = True,
    ) -> tuple[Course, User, User | None]:
        with schema_context(self.schema_name):
            student_unpaid = User.objects.create_user(
                email=f"unpaid-{suffix}@e.com",
                password="x",
                name=f"Unpaid Student {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            student_paid = User.objects.create_user(
                email=f"paid-{suffix}@e.com",
                password="x",
                name=f"Paid Student {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=title,
                code=f"C-{suffix}",
                category=cat,
                program=prog,
                start_date=start_date,
                end_date=end_date,
            )
            if teacher is not None:
                UserCourse.objects.create(
                    user=teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            UserCourse.objects.create(
                user=student_unpaid,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=student_paid,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            if create_payment_for_paid_student:
                UserPayment.objects.create(
                    user=student_paid,
                    course=course,
                    status=UserPayment.Status.PENDING_PAYMENT,
                    issued_at=timezone.make_aware(
                        datetime(start_date.year, start_date.month, 1)
                    ),
                )
            return course, student_unpaid, student_paid


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class _UnpaidStudentsTestBase(_UnpaidStudentsFixtureMixin, TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._telegram_invite_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetUnpaidStudentsRbacTests(_UnpaidStudentsTestBase):
    def test_student_without_unpaid_permission_denied(self):
        with schema_context(self.schema_name):
            seed_rbac()
            student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            result = run_get_unpaid_students({}, student)
        self.assertEqual(result["error"], "permission_denied")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetUnpaidStudentsCourseCountTests(_UnpaidStudentsTestBase):
    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{suffix}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tchr-{suffix}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course, self.student_unpaid, _ = self._create_course_with_unpaid_student(
                suffix=suffix,
                title=f"CAE 35 WD {suffix}",
                start_date=self.today.replace(day=1),
                end_date=self.today + timedelta(days=60),
                teacher=self.teacher,
            )

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_teacher_sees_unpaid_count_for_connected_course(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students(
                {"course_id": self.course.id},
                self.teacher,
            )
        self.assertEqual(result["mode"], "course")
        self.assertEqual(result["unpaid_count"], 1)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_teacher_denied_for_unconnected_course(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            outsider = User.objects.create_user(
                email=f"out-{uuid4().hex[:4]}@e.com",
                password="x",
                name="Outsider",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            result = run_get_unpaid_students(
                {"course_id": self.course.id},
                outsider,
            )
        self.assertEqual(result["error"], "permission_denied")

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_include_names_returns_student_rows(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students(
                {"course_id": self.course.id, "include_names": True},
                self.admin,
            )
        self.assertEqual(result["unpaid_count"], 1)
        self.assertEqual(len(result["students"]), 1)
        self.assertIn("Unpaid Student", result["students"][0]["name"])
        self.assertEqual(result["students"][0]["payment_status"], "never_paid")

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_both_course_id_and_query_validation_error(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students(
                {"course_id": self.course.id, "query": "CAE 35"},
                self.admin,
            )
        self.assertEqual(result["error"], "validation_error")

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_all_paid_returns_zero_unpaid_count(self, mock_org):
        mock_org.return_value = self._mock_org()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            cat = Category.objects.create(name=f"Cat allpaid-{suffix}")
            prog = Program.objects.create(
                name=f"P allpaid-{suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=f"All Paid {suffix}",
                code=f"AP-{suffix}",
                category=cat,
                program=prog,
                start_date=self.today.replace(day=1),
                end_date=self.today + timedelta(days=60),
            )
            student = User.objects.create_user(
                email=f"only-{suffix}@e.com",
                password="x",
                name=f"Only Student {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                issued_at=timezone.make_aware(
                    datetime(self.today.year, self.today.month, 1)
                ),
            )
            result = run_get_unpaid_students({"course_id": course.id}, self.admin)
        self.assertEqual(result["unpaid_count"], 0)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetUnpaidStudentsOrgSummaryTests(_UnpaidStudentsTestBase):
    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{suffix}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tchr-{suffix}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            start = self.today.replace(day=1)
            end = self.today + timedelta(days=60)
            self.connected_course, _, _ = self._create_course_with_unpaid_student(
                suffix=f"a-{suffix}",
                title=f"Connected {suffix}",
                start_date=start,
                end_date=end,
                teacher=self.teacher,
            )
            self.other_course, _, _ = self._create_course_with_unpaid_student(
                suffix=f"b-{suffix}",
                title=f"Other {suffix}",
                start_date=start,
                end_date=end,
                teacher=None,
            )

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_admin_org_summary_includes_courses_with_unpaid(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({}, self.admin)
        self.assertEqual(result["mode"], "org_summary")
        self.assertGreater(result["courses_with_unpaid"], 0)
        self.assertGreater(result["total_unpaid_students"], 0)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_teacher_org_summary_only_connected_courses(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({}, self.teacher)
        course_ids = {
            course["course_id"]
            for group in result["groups"]
            for course in group["courses"]
        }
        self.assertIn(self.connected_course.id, course_ids)
        self.assertNotIn(self.other_course.id, course_ids)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_org_summary_include_names_sets_omitted_reason(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({"include_names": True}, self.admin)
        self.assertEqual(result["names_omitted_reason"], "org_wide_summary")
        self.assertNotIn("students", result)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_invalid_month_type_validation_error(self, mock_org):
        mock_org.return_value = self._mock_org()
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({"month_type": "XX"}, self.admin)
        self.assertEqual(result["error"], "validation_error")
