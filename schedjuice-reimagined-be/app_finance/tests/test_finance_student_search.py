import base64
import json
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
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _b64_json(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


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
@override_settings(RBAC_ENFORCE="enforce")
class FinanceStudentSearchTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start, self.month_end = _month_filter_bounds(self.today)
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-search-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.student_thant = User.objects.create_user(
                email=f"thant-{suffix}@example.com",
                password="x",
                name="Thant Htoo Thurain",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.student_other = User.objects.create_user(
                email=f"moe-{suffix}@example.com",
                password="x",
                name="Moe Thar Eaint",
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
            for student in (self.student_thant, self.student_other):
                UserCourse.objects.create(
                    user=student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            self.payment_thant = UserPayment.objects.create(
                user=self.student_thant,
                course=self.course,
                status=UserPayment.Status.PENDING_PAYMENT,
            )
            self.payment_other = UserPayment.objects.create(
                user=self.student_other,
                course=self.course,
                status=UserPayment.Status.PENDING_PAYMENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

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

    def test_user_payment_search_q_filters_by_student_name(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/search",
            {"filter_params": []},
            format="json",
            QUERY_STRING=f"q=Thant H&expand={_b64_json(['user'])}",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        names = {row["user"]["name"] for row in resp.json()["data"]}
        self.assertEqual(names, {"Thant Htoo Thurain"})

    def test_user_payment_search_without_q_returns_multiple_students(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/search",
            {"filter_params": []},
            format="json",
            QUERY_STRING=f"expand={_b64_json(['user'])}",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        names = {row["user"]["name"] for row in resp.json()["data"]}
        self.assertIn("Thant Htoo Thurain", names)
        self.assertIn("Moe Thar Eaint", names)

    def test_unpaid_students_q_filters_by_student_name(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/unpaid",
            self._unpaid_payload(self.course.id),
            format="json",
            QUERY_STRING="q=Thant H",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        names = {row["name"] for row in resp.json()["data"]}
        self.assertEqual(names, {"Thant Htoo Thurain"})

    def test_unpaid_students_without_q_returns_multiple_students(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/unpaid",
            self._unpaid_payload(self.course.id),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        names = {row["name"] for row in resp.json()["data"]}
        self.assertIn("Thant Htoo Thurain", names)
        self.assertIn("Moe Thar Eaint", names)

    def test_unpaid_students_sort_by_user__name_returns_200(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/unpaid",
            self._unpaid_payload(self.course.id),
            format="json",
            QUERY_STRING=f"sorts={_b64_json(['user__name'])}",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_unpaid_students_sort_by_name_alias_returns_200(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/unpaid",
            self._unpaid_payload(self.course.id),
            format="json",
            QUERY_STRING=f"sorts={_b64_json(['name'])}",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_unpaid_students_sort_by_invalid_field_returns_400(self):
        resp = self._client(self.manager).post(
            "/api/v1/user-payments/unpaid",
            self._unpaid_payload(self.course.id),
            format="json",
            QUERY_STRING=f"sorts={_b64_json(['foo'])}",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("details", resp.json())
