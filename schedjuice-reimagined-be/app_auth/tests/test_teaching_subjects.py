import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User, UserTeachingSubject
from app_course.models import Category, Program, ProgramLevel, ProgramLevelSubject, Subject
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserTeachingSubjectApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.category = Category.objects.create(
                name=f"Cat-{suffix}",
                sort_order=1,
            )
            self.other_category = Category.objects.create(
                name=f"Other-Cat-{suffix}",
                sort_order=2,
            )
            self.program = Program.objects.create(
                name=f"P-{suffix}",
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            self.level = ProgramLevel.objects.create(
                program=self.program,
                name="Year 7",
                sort_order=1,
                default_category=self.category,
            )
            self.other_level = ProgramLevel.objects.create(
                program=self.program,
                name="Year 8",
                sort_order=2,
                default_category=self.other_category,
            )
            self.math = Subject.objects.create(name=f"Math-{suffix}")
            self.physics = Subject.objects.create(name=f"Physics-{suffix}")
            ProgramLevelSubject.objects.create(
                level=self.level,
                subject=self.math,
                sort_order=0,
            )
            ProgramLevelSubject.objects.create(
                level=self.level,
                subject=self.physics,
                sort_order=1,
            )

            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"tch-{suffix}@example.com",
                code=f"TCH-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"tch2-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="2",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"tch2-{suffix}@example.com",
                code=f"TCH2-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="3",
                date_of_birth=date(2010, 1, 1),
                communication_email=f"stu-{suffix}@example.com",
                code=f"STU-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            if self.admin is None:
                self.admin = User.objects.create_user(
                    email=f"adm-{suffix}@example.com",
                    password="x",
                    name="Admin",
                    phone_number="4",
                    date_of_birth=date(1990, 1, 1),
                    communication_email=f"adm-{suffix}@example.com",
                    code=f"ADM-{suffix}",
                    roles=[User.UserRole.ADMIN],
                )

        org = Organization.objects.filter(schema_name=self.schema_name).first()
        if org is not None:
            org.teaching_subjects_allow_level_category_search = False
            org.save(update_fields=["teaching_subjects_allow_level_category_search"])

    def _set_broad_search(self, enabled: bool):
        org = Organization.objects.filter(schema_name=self.schema_name).first()
        self.assertIsNotNone(org)
        org.teaching_subjects_allow_level_category_search = enabled
        org.save(update_fields=["teaching_subjects_allow_level_category_search"])

    def _post_row(self, user, payload):
        return self.client.post(
            f"{self.api_prefix}/users/{user.id}/teaching-subjects",
            payload,
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def test_student_subject_not_found(self):
        self.client.force_authenticate(user=self.student)
        res = self._post_row(
            self.student,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        self.assertEqual(res.status_code, 404)

    def test_admin_self_create_list_delete_subject(self):
        self.client.force_authenticate(user=self.admin)
        res = self._post_row(
            self.admin,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["data"]["entity_type"], "subject")
        self.assertEqual(res.data["data"]["subject"]["name"], self.math.name)

        list_res = self.client.get(
            f"{self.api_prefix}/users/{self.admin.id}/teaching-subjects",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.data["data"]), 1)

        row_id = list_res.data["data"][0]["id"]
        del_res = self.client.delete(
            f"{self.api_prefix}/users/{self.admin.id}/teaching-subjects/{row_id}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(del_res.status_code, 204)

    def test_unrelated_teacher_forbidden(self):
        self.client.force_authenticate(user=self.other_teacher)
        res = self._post_row(
            self.teacher,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        self.assertEqual(res.status_code, 403)

    def test_duplicate_row_rejected(self):
        self.client.force_authenticate(user=self.teacher)
        self._post_row(
            self.teacher,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        res = self._post_row(
            self.teacher,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        self.assertEqual(res.status_code, 400)

    def test_admin_can_manage_other_teacher(self):
        self.client.force_authenticate(user=self.admin)
        res = self._post_row(
            self.teacher,
            {"entity_type": "subject", "subject_id": self.physics.id},
        )
        self.assertEqual(res.status_code, 201)

    def test_search_subjects_only_when_flag_off(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}/teaching-subjects/search",
            {"q": self.math.name.split("-")[0]},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        self.assertFalse(data["allow_level_category_search"])
        entity_types = {o["entity_type"] for o in data["options"]}
        self.assertEqual(entity_types, {"subject"})
        labels = {o["label"] for o in data["options"]}
        self.assertIn(self.math.name, labels)

    def test_search_includes_levels_and_categories_when_flag_on(self):
        self._set_broad_search(True)
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}/teaching-subjects/search",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        self.assertTrue(data["allow_level_category_search"])
        entity_types = {o["entity_type"] for o in data["options"]}
        self.assertIn("subject", entity_types)
        self.assertIn("program_level", entity_types)
        self.assertIn("category", entity_types)

    def test_level_and_category_create_rejected_when_flag_off(self):
        self.client.force_authenticate(user=self.teacher)
        level_res = self._post_row(
            self.teacher,
            {"entity_type": "program_level", "program_level_id": self.level.id},
        )
        self.assertEqual(level_res.status_code, 400)
        cat_res = self._post_row(
            self.teacher,
            {"entity_type": "category", "category_id": self.category.id},
        )
        self.assertEqual(cat_res.status_code, 400)

    def test_level_and_category_create_allowed_when_flag_on(self):
        self._set_broad_search(True)
        self.client.force_authenticate(user=self.teacher)
        level_res = self._post_row(
            self.teacher,
            {"entity_type": "program_level", "program_level_id": self.level.id},
        )
        self.assertEqual(level_res.status_code, 201)
        self.assertEqual(level_res.data["data"]["entity_type"], "program_level")

        cat_res = self._post_row(
            self.teacher,
            {"entity_type": "category", "category_id": self.category.id},
        )
        self.assertEqual(cat_res.status_code, 201)
        self.assertEqual(cat_res.data["data"]["entity_type"], "category")

    def test_search_excludes_already_added_items(self):
        self._set_broad_search(True)
        self.client.force_authenticate(user=self.teacher)
        self._post_row(
            self.teacher,
            {"entity_type": "subject", "subject_id": self.math.id},
        )
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}/teaching-subjects/search",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        values = {o["value"] for o in res.data["data"]["options"]}
        self.assertNotIn(f"subject:{self.math.id}", values)

    def test_migration_dedupes_subject_level_pairs(self):
        with schema_context(self.schema_name):
            UserTeachingSubject.objects.create(
                user=self.other_teacher,
                entity_type=UserTeachingSubject.EntityType.SUBJECT,
                subject=self.math,
                sort_order=0,
            )
            count = UserTeachingSubject.objects.filter(
                user=self.other_teacher,
                entity_type=UserTeachingSubject.EntityType.SUBJECT,
                subject=self.math,
            ).count()
            self.assertEqual(count, 1)
