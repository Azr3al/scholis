import unittest
from types import SimpleNamespace
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_role_policy import (
    MissingMainTeacherRole,
    assert_assigned_as_role_seniority_unique,
    is_exclusive_teacher,
    resolve_main_teacher_role,
    resolve_teacher_assigned_as_role,
)
from app_course.models import AssignedAsRole


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class CourseRolePolicyTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_is_exclusive_teacher_only_single_teacher_role(self):
        only = User(roles=[User.UserRole.TEACHER])
        multi = User(roles=[User.UserRole.TEACHER, User.UserRole.ADMIN])
        admin = User(roles=[User.UserRole.ADMIN])
        self.assertTrue(is_exclusive_teacher(only))
        self.assertFalse(is_exclusive_teacher(multi))
        self.assertFalse(is_exclusive_teacher(admin))

    def test_resolve_main_teacher_role_missing_raises(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).delete()
            with self.assertRaises(MissingMainTeacherRole):
                resolve_main_teacher_role()

    def test_resolve_main_teacher_role_picks_lowest_id_when_duplicates(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).delete()
            suffix = uuid4().hex[:6]
            mt1 = AssignedAsRole.objects.create(
                name=f"MT-A-{suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            mt2 = AssignedAsRole.objects.create(
                name=f"MT-B-{suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            got = resolve_main_teacher_role()
            self.assertEqual(got.id, min(mt1.id, mt2.id))

    def test_assert_seniority_unique_blocks_second_mt(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.create(
                name=f"MT-{uuid4().hex[:6]}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            with self.assertRaises(ValidationError):
                assert_assigned_as_role_seniority_unique(
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER
                )

    def test_resolve_teacher_role_forces_mt_when_disabled(self):
        with schema_context(self.schema_name):
            tenant = SimpleNamespace(is_course_role_enabled=False)
            if not AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER
            ).exists():
                AssignedAsRole.objects.create(
                    name=f"MT-{uuid4().hex[:6]}",
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                )
            mt = resolve_main_teacher_role()
            at = AssignedAsRole.objects.filter(
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER
            ).first()
            if at is None:
                at = AssignedAsRole.objects.create(
                    name=f"AT-{uuid4().hex[:6]}",
                    seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                )
            got = resolve_teacher_assigned_as_role(
                tenant=tenant, requested_role_id=at.id
            )
            self.assertEqual(got.id, mt.id)
