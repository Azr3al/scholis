from datetime import timedelta
from unittest import mock
from uuid import uuid4

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User, UserFieldChange
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


class FieldStewardshipApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

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
            self.classmate = User.objects.create(
                email=f"m-{suffix}@x.io",
                name="M",
                phone_number="4",
                communication_email=f"m-{suffix}@x.io",
                code=f"m-{suffix}",
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
            UserCourse.objects.create(
                user=self.classmate,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    @override_settings(RBAC_ENFORCE="enforce")
    def test_connected_teacher_can_fix_name(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Fixed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["name"], "Fixed")
        with schema_context(self.schema_name):
            row = UserFieldChange.objects.get(user_id=student_id)
            self.assertEqual(row.source, "connected_teacher")
            self.assertEqual(row.old_value, "S")
            self.assertEqual(row.new_value, "Fixed")
            self.assertEqual(row.actor_id, self.teacher.id)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_outsider_teacher_forbidden(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.outsider).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Nope"},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.content)
        with schema_context(self.schema_name):
            self.assertFalse(
                UserFieldChange.objects.filter(user_id=student_id).exists()
            )

    @override_settings(RBAC_ENFORCE="enforce")
    def test_connected_teacher_cannot_send_code(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
            old_code = self.student.code
            old_name = self.student.name
        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "X", "code": "Z"},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.content)
        with schema_context(self.schema_name):
            student = User.objects.get(pk=student_id)
            self.assertEqual(student.name, old_name)
            self.assertEqual(student.code, old_code)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_student_cannot_rename_classmate(self):
        with schema_context(self.schema_name):
            classmate_id = self.classmate.id
        response = self._client(self.student).put(
            f"{self.api_prefix}/users/{classmate_id}",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_can_still_change_code(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
            new_code = f"new-{uuid4().hex[:6]}"
        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{student_id}",
            {"code": new_code},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["code"], new_code)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_manager_name_change_audits_admin(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.admin).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Office Fix"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        with schema_context(self.schema_name):
            row = UserFieldChange.objects.get(user_id=student_id, field_key="name")
            self.assertEqual(row.source, "admin")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_identical_name_skips_audit(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.teacher).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "S"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        with schema_context(self.schema_name):
            self.assertEqual(
                UserFieldChange.objects.filter(user_id=student_id).count(), 0
            )

    @override_settings(RBAC_ENFORCE="enforce")
    def test_get_exposes_steward_fields_for_connected_teacher(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.teacher).get(
            f"{self.api_prefix}/users/{student_id}"
        )
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["user_write_mode"], "steward")
        self.assertIn("name", data["writable_fields"])

    @override_settings(RBAC_ENFORCE="enforce")
    def test_get_none_for_outsider(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.outsider).get(
            f"{self.api_prefix}/users/{student_id}"
        )
        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_history_connected_teacher(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        self._client(self.teacher).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Fixed"},
            format="json",
        )
        response = self._client(self.teacher).get(
            f"{self.api_prefix}/users/{student_id}/field-changes"
        )
        self.assertEqual(response.status_code, 200, response.content)
        items = response.json()["data"]["items"]
        self.assertEqual(items[0]["field_key"], "name")
        self.assertEqual(items[0]["new_value"], "Fixed")
        self.assertEqual(items[0]["source"], "connected_teacher")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_history_outsider_forbidden(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.outsider).get(
            f"{self.api_prefix}/users/{student_id}/field-changes"
        )
        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_history_classmate_forbidden(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        response = self._client(self.classmate).get(
            f"{self.api_prefix}/users/{student_id}/field-changes"
        )
        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_history_student_own(self):
        with schema_context(self.schema_name):
            student_id = self.student.id
        self._client(self.student).put(
            f"{self.api_prefix}/users/{student_id}",
            {"name": "Self"},
            format="json",
        )
        response = self._client(self.student).get(
            f"{self.api_prefix}/users/{student_id}/field-changes"
        )
        self.assertEqual(response.status_code, 200, response.content)
        items = response.json()["data"]["items"]
        self.assertEqual(items[0]["source"], "self")
