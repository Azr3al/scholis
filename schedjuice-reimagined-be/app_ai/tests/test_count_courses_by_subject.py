import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.count_courses_by_subject import run_count_courses_by_subject
from app_ai.tools.subject_binder import SUBJECT_ENUM_CAP, bind_subject_analytics_tools
from app_ai.packs import resolve_tools_for_org
from app_auth.models import User
from app_course.models import Category, Course, CourseSubject, Program, Subject
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class SubjectBinderTests(SimpleTestCase):
    def _tool(self):
        return Tool(
            name="count_courses_by_subject",
            description="x",
            parameters=strict_object_schema(
                properties={"subject": {"type": "string"}},
                required=["subject"],
            ),
            run=lambda args, user: {},
        )

    def test_sets_enum_under_cap(self):
        with patch("app_course.models.Subject") as mock_model:
            mock_model.objects.order_by.return_value.values_list.return_value = [
                "IELTS",
                "TOEFL",
            ]
            bound = bind_subject_analytics_tools(None, [self._tool()])
        self.assertEqual(
            bound[0].parameters["properties"]["subject"]["enum"],
            ["IELTS", "TOEFL"],
        )

    def test_omits_enum_over_cap(self):
        names = [f"S{i}" for i in range(SUBJECT_ENUM_CAP + 1)]
        with patch("app_course.models.Subject") as mock_model:
            mock_model.objects.order_by.return_value.values_list.return_value = names
            bound = bind_subject_analytics_tools(None, [self._tool()])
        self.assertNotIn("enum", bound[0].parameters["properties"]["subject"])


class SubjectPackResolveTests(SimpleTestCase):
    def test_subject_pack_includes_tool_when_registered(self):
        org = SimpleNamespace(
            ai_enabled_packs=["subject_analytics"],
            is_staff_points_enabled=False,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertIn("count_courses_by_subject", names)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CountCoursesBySubjectTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_counts_via_fk_and_m2m(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            subj = Subject.objects.create(name=f"IELTS-{uuid4().hex[:4]}")
            today = date.today()
            end = today + timedelta(days=365)
            cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            Course.objects.create(
                title=f"FK-{uuid4().hex[:6]}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=end,
                status=Course.CourseStatus.ACTIVE,
                created_by=admin,
                subject=subj,
            )
            c_m2m = Course.objects.create(
                title=f"M2M-{uuid4().hex[:6]}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=end,
                status=Course.CourseStatus.ACTIVE,
                created_by=admin,
            )
            CourseSubject.objects.create(course=c_m2m, subject=subj, sort_order=0)
            result = run_count_courses_by_subject({"subject": subj.name}, admin)
            self.assertNotIn("error", result)
            self.assertEqual(result["count"], 2)
            self.assertEqual(result["subject"], subj.name)

    def test_unknown_subject_errors(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            result = run_count_courses_by_subject(
                {"subject": "NoSuchSubjectXYZ"}, admin
            )
            self.assertEqual(result["error"], "unknown_subject")
