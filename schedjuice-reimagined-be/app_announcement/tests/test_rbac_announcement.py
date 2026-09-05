import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, PostType
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AnnouncementRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
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
            self.oversight_teacher = User.objects.create_user(
                email=f"ovr-{suffix}@example.com",
                password="x",
                name="Oversight Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
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
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                created_by=self.admin,
            )
            self.other_course = Course.objects.create(
                title=f"Other {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
                created_by=self.admin,
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.other_role = AssignedAsRole.objects.create(
                name=f"Other {suffix}",
                seniority=AssignedAsRole.Seniority.OTHER,
            )
            with patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=self.teacher,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.mt_role,
                )
                UserCourse.objects.create(
                    user=self.oversight_teacher,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.other_role,
                )
                UserCourse.objects.create(
                    user=self.student,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            self.course_announcement = Announcement.objects.create(
                post_type=PostType.ANNOUNCEMENT,
                title="Existing",
                data="body",
                html_data="body",
                course=self.course,
                created_by=self.admin,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _jwt_client(self, user: User) -> APIClient:
        """Simulate JWTStatelessUserAuthentication where request.user.id is email."""
        token_user = type(
            "TokenUser",
            (),
            {"id": user.email, "is_authenticated": True},
        )()
        client = APIClient()
        client.force_authenticate(user=token_user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_student_cannot_create_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).post(
                "/api/v1/announcements",
                {"title": "Test", "data": "body"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_can_create_course_announcement_with_jwt_email_user_id(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._jwt_client(self.teacher).post(
                "/api/v1/announcements",
                {
                    "title": "Class update",
                    "data": "body",
                    "course": self.course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_teacher_not_on_course_cannot_create_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.other_teacher).post(
                "/api/v1/announcements",
                {
                    "title": "Class update",
                    "data": "body",
                    "course": self.course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_on_course_cannot_create_course_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).post(
                "/api/v1/announcements",
                {
                    "title": "Class update",
                    "data": "body",
                    "course": self.course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_create_org_wide_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/announcements",
                {"title": "Org wide", "data": "body"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_student_cannot_delete_course_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).delete(
                f"/api/v1/announcements/{self.course_announcement.id}",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_not_on_course_cannot_delete_announcement(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.other_teacher).delete(
                f"/api/v1/announcements/{self.course_announcement.id}",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_clear_course_on_update(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).put(
                f"/api/v1/announcements/{self.course_announcement.id}",
                {"title": "Updated", "data": "new body", "course": None},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_set_course_filters_on_update(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).put(
                f"/api/v1/announcements/{self.course_announcement.id}",
                {
                    "title": "Updated",
                    "data": "new body",
                    "course_filters": {"month_type": "ALL"},
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_move_announcement_to_other_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).put(
                f"/api/v1/announcements/{self.course_announcement.id}",
                {
                    "title": "Updated",
                    "data": "new body",
                    "course": self.other_course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teaching_teacher_can_create_without_manage_content_permission(self):
        with schema_context(self.schema_name):
            teacher_role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=teacher_role,
                permission_code="course.manage_content",
            ).delete()

        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/announcements",
                {
                    "title": "Teaching post",
                    "data": "body",
                    "course": self.course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_oversight_teacher_without_manage_content_cannot_create(self):
        with schema_context(self.schema_name):
            teacher_role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=teacher_role,
                permission_code="course.manage_content",
            ).delete()

        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.oversight_teacher).post(
                "/api/v1/announcements",
                {
                    "title": "Oversight post",
                    "data": "body",
                    "course": self.course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_admin_with_announcement_manage_can_create_course_announcement_without_roster(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements",
                {
                    "title": "Admin course post",
                    "data": "body",
                    "course": self.other_course.id,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_admin_can_create_org_wide_with_course_filters(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).post(
                "/api/v1/announcements",
                {
                    "title": "Org broadcast",
                    "data": "body",
                    "send_to_microsoft": True,
                    "course_filters": {"month_type": "ALL", "category_ids": [self.course.category_id]},
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
