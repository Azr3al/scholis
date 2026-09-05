from datetime import timedelta
from unittest import mock
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


class FieldStewardshipGateTests(TestCase):
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

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:6]
            today = timezone.localdate()
            cat = Category.objects.create(name=f"C {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.teacher = User.objects.create(
                email=f"t-{suffix}@x.io",
                name="T",
                phone_number="1",
                communication_email=f"t-{suffix}@x.io",
                code=f"t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.outsider = User.objects.create(
                email=f"o-{suffix}@x.io",
                name="O",
                phone_number="1",
                communication_email=f"o-{suffix}@x.io",
                code=f"o-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create(
                email=f"s-{suffix}@x.io",
                name="S",
                phone_number="2",
                communication_email=f"s-{suffix}@x.io",
                code=f"s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.admin = User.objects.create(
                email=f"a-{suffix}@x.io",
                name="A",
                phone_number="3",
                communication_email=f"a-{suffix}@x.io",
                code=f"a-{suffix}",
                roles=[User.UserRole.MANAGER],
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

    def test_allowlist_contains_identity_keys(self):
        from app_auth.field_stewardship import STEWARD_USER_KEYS

        for key in (
            "name",
            "alternative_name",
            "phone_number",
            "communication_email",
            "house_number",
            "profile_image",
            "id_photo",
        ):
            self.assertIn(key, STEWARD_USER_KEYS)
        self.assertNotIn("email", STEWARD_USER_KEYS)
        self.assertNotIn("code", STEWARD_USER_KEYS)

    def test_student_self_is_steward(self):
        from app_auth.field_stewardship import user_write_mode

        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.student, self.student), "steward")

    def test_student_self_without_update_own_is_none(self):
        from app_auth.field_stewardship import user_write_mode
        from app_rbac.models import Role, RolePermission

        with schema_context(self.schema_name):
            student_role = Role.objects.get(slug="student")
            RolePermission.objects.filter(
                role=student_role, permission_code="user.update_own"
            ).delete()
            self.assertEqual(user_write_mode(self.student, self.student), "none")

    def test_teacher_self_is_full(self):
        from app_auth.field_stewardship import user_write_mode

        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.teacher, self.teacher), "full")

    def test_connected_teacher_is_steward_on_student(self):
        from app_auth.field_stewardship import (
            course_staff_may_steward_student,
            user_write_mode,
        )

        with schema_context(self.schema_name):
            self.assertTrue(course_staff_may_steward_student(self.teacher, self.student))
            self.assertEqual(user_write_mode(self.teacher, self.student), "steward")

    def test_outsider_teacher_is_none(self):
        from app_auth.field_stewardship import (
            course_staff_may_steward_student,
            user_write_mode,
        )

        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_may_steward_student(self.outsider, self.student)
            )
            self.assertEqual(user_write_mode(self.outsider, self.student), "none")

    def test_classmate_is_none(self):
        from app_auth.field_stewardship import user_write_mode

        with schema_context(self.schema_name):
            suffix = uuid4().hex[:6]
            other = User.objects.create(
                email=f"c-{suffix}@x.io",
                name="C",
                phone_number="4",
                communication_email=f"c-{suffix}@x.io",
                code=f"c-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.assertEqual(user_write_mode(self.student, other), "none")

    def test_manager_on_other_is_full(self):
        from app_auth.field_stewardship import user_write_mode

        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.admin, self.student), "full")

    def test_request_write_keys_ignores_queryish(self):
        from app_auth.field_stewardship import request_write_keys

        self.assertEqual(
            request_write_keys({"name": "A", "expand": [], "fields": ["name"]}),
            {"name"},
        )

    def test_write_source_connected_teacher(self):
        from app_auth.field_stewardship import write_source

        with schema_context(self.schema_name):
            self.assertEqual(
                write_source(self.teacher, self.student, "steward"),
                "connected_teacher",
            )

    def test_model_stores_old_new(self):
        from app_auth.field_stewardship import record_steward_field_changes
        from app_auth.models import UserFieldChange

        with schema_context(self.schema_name):
            n = record_steward_field_changes(
                self.teacher,
                self.student,
                "steward",
                {"name": "S"},
                {"name": "Fixed"},
            )
            self.assertEqual(n, 1)
            row = UserFieldChange.objects.get(user=self.student)
            self.assertEqual(row.field_key, "name")
            self.assertEqual(row.old_value, "S")
            self.assertEqual(row.new_value, "Fixed")
            self.assertEqual(row.source, "connected_teacher")
            self.assertEqual(row.actor_id, self.teacher.id)

    def test_record_skips_unchanged(self):
        from app_auth.field_stewardship import record_steward_field_changes
        from app_auth.models import UserFieldChange

        with schema_context(self.schema_name):
            n = record_steward_field_changes(
                self.teacher,
                self.student,
                "steward",
                {"name": "S"},
                {"name": "S"},
            )
            self.assertEqual(n, 0)
            self.assertFalse(
                UserFieldChange.objects.filter(user=self.student).exists()
            )
