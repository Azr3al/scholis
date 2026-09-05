import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_scoping import (
    assign_creator_as_teacher_if_applicable,
    scope_courses_for_user,
    user_can_access_course,
)
from app_course.course_status import user_can_edit_course_status
from app_course.models import Category, Course, Program, UserCourse
from app_course.serializers import CourseSerializer


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseScopingTest(TestCase):
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
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).exclude(roles__contains=[User.UserRole.MANAGER]).first()
            self.manager = User.objects.filter(
                roles__contains=[User.UserRole.MANAGER]
            ).first()

    def _course_payload(self, title: str):
        return {
            "title": title,
            "category": self.cat.id,
            "program": self.prog.id,
            "start_date": self.today,
            "end_date": self.today + timedelta(days=30),
        }

    def test_assign_creator_as_teacher_for_teacher_creator(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            course = Course.objects.create(
                title=f"Creator {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
                created_by=self.teacher,
            )
            assign_creator_as_teacher_if_applicable(self.teacher, course)
            uc = UserCourse.objects.filter(
                user=self.teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            ).first()
            self.assertIsNotNone(uc)

    def test_assign_creator_skips_admin_creator(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.manager)
            course = Course.objects.create(
                title=f"Admin {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
                created_by=self.manager,
            )
            assign_creator_as_teacher_if_applicable(self.manager, course)
            self.assertFalse(
                UserCourse.objects.filter(user=self.manager, course=course).exists()
            )

    def test_course_serializer_create_assigns_teacher_creator(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            request = SimpleNamespace(
                tenant=SimpleNamespace(
                    is_microsoft_on=False,
                    is_teams_creation_enabled=False,
                ),
                user=SimpleNamespace(id=self.teacher.email),
                query_params=SimpleNamespace(getlist=lambda _field: []),
            )
            ser = CourseSerializer(
                data=self._course_payload(f"Ser {uuid4().hex[:4]}"),
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            course = ser.save()
            self.assertEqual(course.created_by_id, self.teacher.id)
            self.assertTrue(
                UserCourse.objects.filter(
                    user=self.teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                ).exists()
            )

    def test_scope_courses_for_user_includes_created_courses(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            course = Course.objects.create(
                title=f"Scoped {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
                created_by=self.teacher,
            )
            ids = list(scope_courses_for_user(self.teacher).values_list("id", flat=True))
            self.assertIn(course.id, ids)

    def test_user_can_access_course_for_creator_without_roster(self):
        with schema_context(self.schema_name):
            self.assertIsNotNone(self.teacher)
            course = Course.objects.create(
                title=f"Access {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
                created_by=self.teacher,
            )
            self.assertTrue(user_can_access_course(self.teacher, course))
            self.assertTrue(user_can_edit_course_status(self.teacher, course))

    def test_scope_courses_includes_program_scope(self):
        with schema_context(self.schema_name):
            other_prog = Program.objects.create(
                name=f"Other {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            dean = User.objects.create(
                email=f"dean-{uuid4().hex[:6]}@test.com",
                phone_number="123",
                communication_email=f"dean-{uuid4().hex[:6]}@test.com",
                name="Dean Scope",
                roles=[User.UserRole.TEACHER],
                password="unused",
            )
            dean.scoped_programs.add(self.prog)
            in_scope = Course.objects.create(
                title=f"InScope {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
            )
            out_scope = Course.objects.create(
                title=f"OutScope {uuid4().hex[:4]}",
                category=self.cat,
                program=other_prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
            )
            ids = set(scope_courses_for_user(dean).values_list("id", flat=True))
            self.assertIn(in_scope.id, ids)
            self.assertNotIn(out_scope.id, ids)
            self.assertTrue(user_can_access_course(dean, in_scope))
            self.assertFalse(user_can_access_course(dean, out_scope))

    def test_scope_courses_includes_category_scope(self):
        with schema_context(self.schema_name):
            other_cat = Category.objects.create(name=f"Cat2 {uuid4().hex[:4]}")
            overseer = User.objects.create(
                email=f"ov-{uuid4().hex[:6]}@test.com",
                phone_number="123",
                communication_email=f"ov-{uuid4().hex[:6]}@test.com",
                name="Category Overseer",
                roles=[User.UserRole.TEACHER],
                password="unused",
            )
            overseer.scoped_categories.add(self.cat)
            in_scope = Course.objects.create(
                title=f"CatIn {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
            )
            out_scope = Course.objects.create(
                title=f"CatOut {uuid4().hex[:4]}",
                category=other_cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
            )
            ids = set(scope_courses_for_user(overseer).values_list("id", flat=True))
            self.assertIn(in_scope.id, ids)
            self.assertNotIn(out_scope.id, ids)
