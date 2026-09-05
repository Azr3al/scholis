import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_course.models import Category, Course, Program, ProgramLevel, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ResolveIdCardClassNameTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from app_auth.id_card_class import resolve_id_card_class_name

        self.resolve = resolve_id_card_class_name
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat-{suffix}", sort_order=1)
            self.program_with_levels = Program.objects.create(
                name=f"P-levels-{suffix}",
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            self.program_flat = Program.objects.create(name=f"P-flat-{suffix}")
            self.level = ProgramLevel.objects.create(
                program=self.program_with_levels,
                name="Year 1",
                sort_order=1,
            )
            self.student = User.objects.create_user(
                email=f"cls-{suffix}@example.com",
                password="x",
                name="Class Student",
                phone_number="1",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"cls-{suffix}@example.com",
                code=f"STU-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.course_level = Course.objects.create(
                title=f"Year 1 A-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program_with_levels,
                level=self.level,
            )
            self.course_no_level = Course.objects.create(
                title=f"Flat Course-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program_flat,
            )
            self.level2 = ProgramLevel.objects.create(
                program=self.program_with_levels,
                name="Year 2",
                sort_order=2,
            )
            self.course_level2 = Course.objects.create(
                title=f"Year 2 A-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program_with_levels,
                level=self.level2,
            )

    def _enroll(self, course, *, dropped=False):
        if dropped:
            return
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_auto_one_level_enrollment_returns_level_name(self):
        self._enroll(self.course_level)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertEqual(self.resolve(fresh), "Year 1")

    def test_auto_zero_qualifying_returns_none(self):
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(self.resolve(fresh))

    def test_auto_two_level_enrollments_returns_none(self):
        self._enroll(self.course_level)
        self._enroll(self.course_level2)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(self.resolve(fresh))

    def test_auto_course_without_level_returns_none(self):
        self._enroll(self.course_no_level)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(self.resolve(fresh))

    def test_auto_dropped_enrollment_returns_none(self):
        self._enroll(self.course_level, dropped=True)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(self.resolve(fresh))

    def test_override_non_empty_string(self):
        self._enroll(self.course_level)
        with schema_context(self.schema_name):
            self.student.id_card_class_name = "Year 2"
            self.student.save()
            fresh = User.objects.get(pk=self.student.pk)
            self.assertEqual(self.resolve(fresh), "Year 2")

    def test_override_empty_string_hides(self):
        self._enroll(self.course_level)
        with schema_context(self.schema_name):
            self.student.id_card_class_name = ""
            self.student.save()
            fresh = User.objects.get(pk=self.student.pk)
            self.assertIsNone(self.resolve(fresh))


class ResolveIdCardClassNamesBatchTests(ResolveIdCardClassNameTests):
    def setUp(self):
        super().setUp()
        from app_auth.id_card_class import resolve_id_card_class_names

        self.resolve_batch = resolve_id_card_class_names

    def test_batch_multiple_users_one_enrollment_each(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            student_b = User.objects.create_user(
                email=f"cls-b-{suffix}@example.com",
                password="x",
                name="Student B",
                phone_number="2",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"cls-b-{suffix}@example.com",
                code=f"STU-B-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course_level,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=student_b,
                course=self.course_level2,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            fresh_a = User.objects.get(pk=self.student.pk)
            fresh_b = User.objects.get(pk=student_b.pk)
            result = self.resolve_batch([fresh_a, fresh_b])
        self.assertEqual(result[fresh_a.pk], "Year 1")
        self.assertEqual(result[fresh_b.pk], "Year 2")

    def test_batch_mixed_override_and_auto_resolve(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            student_b = User.objects.create_user(
                email=f"cls-ov-{suffix}@example.com",
                password="x",
                name="Override Student",
                phone_number="3",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"cls-ov-{suffix}@example.com",
                code=f"STU-OV-{suffix}",
                roles=[User.UserRole.STUDENT],
                id_card_class_name="Custom Override",
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course_level,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            fresh_a = User.objects.get(pk=self.student.pk)
            fresh_b = User.objects.get(pk=student_b.pk)
            result = self.resolve_batch([fresh_a, fresh_b])
        self.assertEqual(result[fresh_a.pk], "Year 1")
        self.assertEqual(result[fresh_b.pk], "Custom Override")

    def test_batch_uses_constant_query_count(self):
        from django.test.utils import CaptureQueriesContext

        suffix = uuid4().hex[:6]
        users = []
        with schema_context(self.schema_name):
            for i in range(5):
                student = User.objects.create_user(
                    email=f"cls-perf-{suffix}-{i}@example.com",
                    password="x",
                    name=f"Perf {i}",
                    phone_number=f"4{i}",
                    date_of_birth=date(2010, 1, 1),
                    communication_email=f"cls-perf-{suffix}-{i}@example.com",
                    code=f"STU-P-{suffix}-{i}",
                    roles=[User.UserRole.STUDENT],
                )
                UserCourse.objects.create(
                    user=student,
                    course=self.course_level,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                users.append(User.objects.get(pk=student.pk))
            with CaptureQueriesContext(connection) as ctx:
                result = self.resolve_batch(users)
        self.assertEqual(len(result), 5)
        self.assertLessEqual(len(ctx.captured_queries), 2)


class UserSerializerIdCardClassTests(ResolveIdCardClassNameTests):
    def test_serializer_exposes_id_card_class_display(self):
        self._enroll(self.course_level)
        with schema_context(self.schema_name):
            fresh = User.objects.get(pk=self.student.pk)
            data = UserSerializer(fresh).data
        self.assertIn("id_card_class_name", data)
        self.assertIn("id_card_class_display", data)
        self.assertIsNone(data["id_card_class_name"])
        self.assertEqual(data["id_card_class_display"], "Year 1")

    def test_serializer_display_respects_override(self):
        with schema_context(self.schema_name):
            self.student.id_card_class_name = "Custom Class"
            self.student.save()
            fresh = User.objects.get(pk=self.student.pk)
            data = UserSerializer(fresh).data
        self.assertEqual(data["id_card_class_name"], "Custom Class")
        self.assertEqual(data["id_card_class_display"], "Custom Class")
