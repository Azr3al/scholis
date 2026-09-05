import base64
import json
import unittest
from datetime import timedelta
from uuid import uuid4

from django.core.exceptions import BadRequest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_search_queryset import normalize_user_course_sorts
from app_course.models import Category, Course, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _b64_json(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class StudentRosterOrderTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Roster {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.active = User.objects.create_user(
                email=f"active-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Alice Active",
                roles=[User.UserRole.STUDENT],
            )
            self.other = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Zara Active",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.active,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.other,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_student_roster_order_by_name(self):
        with schema_context(self.schema_name):
            from types import SimpleNamespace

            from app_course.views import UserCourseSearchView

            view = UserCourseSearchView()
            view.request = SimpleNamespace(
                query_params={"student_roster_order": "true"}
            )
            qs = UserCourse.objects.filter(
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ordered = list(view.augment_search_queryset(qs, expand=[], is_csv=False))
            names = [uc.user.name for uc in ordered]
            self.assertEqual(names, ["Alice Active", "Zara Active"])

    def test_normalize_user_course_sorts_maps_name_alias(self):
        self.assertEqual(normalize_user_course_sorts(["name"]), ["user__name"])
        self.assertEqual(normalize_user_course_sorts(["-email"]), ["-user__email"])

    def test_normalize_user_course_sorts_rejects_unknown_field(self):
        with self.assertRaises(BadRequest):
            normalize_user_course_sorts(["foo"])

    def test_student_roster_explicit_sort_overrides_default_order(self):
        with schema_context(self.schema_name):
            from types import SimpleNamespace

            from app_course.views import UserCourseSearchView

            view = UserCourseSearchView()
            view.request = SimpleNamespace(
                query_params={
                    "student_roster_order": "true",
                    "sorts": _b64_json(["-name"]),
                }
            )
            qs = UserCourse.objects.filter(
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).select_related("user")
            ordered = list(view.augment_search_queryset(qs, expand=[], is_csv=False))
            names = [uc.user.name for uc in ordered]
            self.assertEqual(names, ["Zara Active", "Alice Active"])
