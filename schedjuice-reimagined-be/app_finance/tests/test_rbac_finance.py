import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import UserPayment
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _month_filter_bounds(day: date):
    start = timezone.make_aware(datetime(day.year, day.month, 1, 0, 0, 0))
    if day.month == 12:
        end_day = date(day.year + 1, 1, 1) - timedelta(days=1)
    else:
        end_day = date(day.year, day.month + 1, 1) - timedelta(days=1)
    end = timezone.make_aware(
        datetime(end_day.year, end_day.month, end_day.day, 23, 59, 59)
    )
    return start, end

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class FinanceRBACTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
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
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.other_course = Course.objects.create(
                title=f"C-other {suffix}",
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
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.own_payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                status=UserPayment.Status.PENDING_PAYMENT,
            )
            self.month_start, self.month_end = _month_filter_bounds(self.today)
            pay_only_slug = f"qa-payonly-{suffix}"
            pay_only_role = Role.objects.create(
                slug=pay_only_slug,
                display_name="Payment view all only",
                is_system=False,
            )
            RolePermission.objects.create(
                role=pay_only_role,
                permission_code="payment.view_all",
            )
            self.payment_view_all_only = User.objects.create_user(
                email=f"pvo-{suffix}@example.com",
                password="x",
                name="PayViewAllOnly",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[pay_only_slug],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _admin_report_payload(self, course_id: int):
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": str(course_id),
                },
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": self.month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": self.month_end.isoformat(),
                },
            ]
        }

    def _upload_payload(self, course_id: int, student_id: int | None = None):
        return {
            "user": student_id or self.student.id,
            "course": course_id,
            "issued_at": self.month_start.isoformat(),
            "billing_start_date": self.month_start.isoformat(),
            "billing_end_date": self.month_end.isoformat(),
        }

    def _unpaid_payload(self, course_id: int):
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": str(course_id),
                },
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": self.month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": self.month_end.isoformat(),
                },
            ]
        }

    def _unpaid_summary_payload(self):
        return {
            "filter_params": [
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": self.month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": self.month_end.isoformat(),
                },
            ]
        }

    def test_manager_can_access_admin_payment_report(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).post(
                "/api/v1/user-payments/admin-report",
                self._admin_report_payload(self.course.id),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertGreater(len(data), 0)
        self.assertIn("screenshot", data[0])

    def test_teacher_can_access_admin_report_for_assigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/user-payments/admin-report",
                self._admin_report_payload(self.course.id),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        course_ids = {row["course"]["id"] for row in data}
        self.assertEqual(course_ids, {self.course.id})

    def test_teacher_admin_report_requires_course_filter(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/user-payments/admin-report",
                {"filter_params": []},
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("course_id", str(resp.json()))

    def test_teacher_cannot_access_admin_report_for_unassigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/user-payments/admin-report",
                self._admin_report_payload(self.other_course.id),
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_cannot_record_payment_for_unassigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/scan-transaction-screenshots",
                self._upload_payload(self.other_course.id),
                format="multipart",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_cannot_verify_payments(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/verify-screenshots",
                [],
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_put_payment_status(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).put(
                f"/api/v1/user-payments/{self.own_payment.id}",
                {"status": UserPayment.Status.VERIFIED},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_cannot_verify_payments(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).post(
                "/api/v1/verify-screenshots",
                [],
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_manager_can_access_unpaid_summary_school_wide(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).post(
                "/api/v1/user-payments/unpaid-course-summary",
                self._unpaid_summary_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        course_ids = {row["course_id"] for row in resp.json()["data"]}
        self.assertIn(self.course.id, course_ids)
        self.assertIn(self.other_course.id, course_ids)

    def test_teacher_cannot_access_unpaid_for_unassigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/user-payments/unpaid",
                self._unpaid_payload(self.other_course.id),
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_unpaid_summary_scoped_to_connected_courses(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/user-payments/unpaid-course-summary",
                self._unpaid_summary_payload(),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        course_ids = {row["course_id"] for row in resp.json()["data"]}
        self.assertIn(self.course.id, course_ids)
        self.assertNotIn(self.other_course.id, course_ids)

    def test_student_cannot_access_unpaid_endpoints(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            list_resp = self._client(self.student).post(
                "/api/v1/user-payments/unpaid",
                self._unpaid_payload(self.course.id),
                format="json",
            )
            summary_resp = self._client(self.student).post(
                "/api/v1/user-payments/unpaid-course-summary",
                self._unpaid_summary_payload(),
                format="json",
            )
        self.assertEqual(list_resp.status_code, 403, list_resp.content)
        self.assertEqual(summary_resp.status_code, 403, summary_resp.content)

    def test_payment_view_all_without_unpaid_permission_denied(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            list_resp = self._client(self.payment_view_all_only).post(
                "/api/v1/user-payments/unpaid",
                self._unpaid_payload(self.course.id),
                format="json",
            )
            summary_resp = self._client(self.payment_view_all_only).post(
                "/api/v1/user-payments/unpaid-course-summary",
                self._unpaid_summary_payload(),
                format="json",
            )
        self.assertEqual(list_resp.status_code, 403, list_resp.content)
        self.assertEqual(summary_resp.status_code, 403, summary_resp.content)
