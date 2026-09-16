import unittest
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_organization.models import Organization
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
class CourseRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.c1 = Course.objects.create(
                title=f"C1 {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.c2 = Course.objects.create(
                title=f"C2 {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.c1,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _course_payload(self, title: str):
        return {
            "title": title,
            "category": self.cat.id,
            "program": self.prog.id,
            "start_date": self.today.isoformat(),
            "end_date": (self.today + timedelta(days=30)).isoformat(),
        }

    def test_manager_sees_all_courses_on_search(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).post(
                "/api/v1/courses/search?page=1&size=24",
                {
                    "filter_params": [
                        {
                            "field_name": "id",
                            "operator": "in",
                            "value": f"{self.c1.id},{self.c2.id}",
                        }
                    ]
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertEqual(ids, {self.c1.id, self.c2.id})

    def test_teacher_sees_only_assigned_courses(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/courses?page=1&size=24")
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertEqual(ids, {self.c1.id})

    def test_teacher_cannot_update_unassigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).patch(
                f"/api/v1/courses/{self.c2.id}",
                {"title": f"Blocked {uuid4().hex[:4]}"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_can_update_assigned_course(self):
        new_title = f"Updated {uuid4().hex[:4]}"
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).patch(
                f"/api/v1/courses/{self.c1.id}",
                {"title": new_title},
                format="json",
            )
        self.assertIn(resp.status_code, (200, 202), resp.content)

    def test_teacher_can_add_student_on_assigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                f"/api/v1/courses/{self.c1.id}/students",
                {"user_id": self.student.id},
                format="json",
            )
        self.assertIn(resp.status_code, (200, 201), resp.content)

    def test_teacher_forbidden_on_add_student_unassigned_course(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                f"/api/v1/courses/{self.c2.id}/students",
                {"user_id": self.student.id},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_post_create_forbidden_when_flag_off(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                can_teacher_create_course=False
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/courses",
                self._course_payload(f"New {uuid4().hex[:4]}"),
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_post_create_allowed_when_flag_on(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                can_teacher_create_course=True
            )
        title = f"TeacherCreated {uuid4().hex[:4]}"
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/courses",
                self._course_payload(title),
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_teacher_forbidden_on_campuses(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/campuses?page=1&size=24")
        self.assertEqual(resp.status_code, 403)

    def test_join_code_lookup_is_public(self):
        with schema_context(self.schema_name):
            self.c1.join_code = "TESTJOIN1"
            self.c1.join_code_expiry_date = timezone.now() + timedelta(days=7)
            self.c1.save()
        with self.settings(RBAC_ENFORCE="enforce"):
            client = APIClient()
            client.credentials(HTTP_TENANT=self.schema_name)
            resp = client.get("/api/v1/courses/join/TESTJOIN1")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"]["id"], self.c1.id)

    def _event_setup(self):
        with schema_context(self.schema_name):
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name=f"Main Teacher RBAC {uuid4().hex[:6]}",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            event = Event.objects.create(
                title=f"Session {uuid4().hex[:4]}",
                date=timezone.make_aware(datetime.combine(self.today, time(9, 0))),
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.c1,
            )
            return main_role, event

    def _assign_events_payload(self, user_id, role_id, event):
        return {
            "user_id": user_id,
            "assigned_as_role_id": role_id,
            "new_events": [{"id": event.id}],
            "removed_events": [],
        }

    def test_teacher_self_assign_events_forbidden_without_permission(self):
        with schema_context(self.schema_name):
            RolePermission.objects.filter(
                role__slug="teacher",
                permission_code="course.assign_self_events",
            ).delete()
        main_role, event = self._event_setup()
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                f"/api/v1/courses/{self.c1.id}/assign-events",
                self._assign_events_payload(self.teacher.id, main_role.id, event),
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_self_assign_events_allowed_with_permission(self):
        main_role, event = self._event_setup()
        with schema_context(self.schema_name):
            teacher_role = Role.objects.get(slug="teacher", is_system=True)
            RolePermission.objects.get_or_create(
                role=teacher_role,
                permission_code="course.assign_self_events",
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                f"/api/v1/courses/{self.c1.id}/assign-events",
                self._assign_events_payload(self.teacher.id, main_role.id, event),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_teacher_can_assign_other_teacher_without_self_assign_permission(self):
        main_role, event = self._event_setup()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            other_teacher = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.create(
                user=other_teacher,
                course=self.c1,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                f"/api/v1/courses/{self.c1.id}/assign-events",
                self._assign_events_payload(other_teacher.id, main_role.id, event),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_manager_self_assign_events_allowed_via_manage_all(self):
        main_role, event = self._event_setup()
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).post(
                f"/api/v1/courses/{self.c1.id}/assign-events",
                self._assign_events_payload(self.manager.id, main_role.id, event),
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
