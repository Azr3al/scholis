import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from django.utils import timezone
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.join_request_approval import approve_course_join_request
from app_course.models import Category, Course, CourseJoinRequest, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class JoinRequestApprovalAtomicTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )
            cls.org = Organization.objects.filter(schema_name=cls.schema_name).first()
        with schema_context(cls.schema_name):
            seed_rbac()

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            cat = Category.objects.first() or Category.objects.create(
                name=f"JoinAtomicCat-{suffix}"
            )
            self.course = Course.objects.create(
                title=f"Join Atomic Course {suffix}",
                description="Course",
                code=f"JA-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                join_code=f"JA-{suffix}",
                join_code_expiry_date=timezone.now() + timedelta(days=7),
            )
            self.student = User.objects.create_user(
                email=f"student-atomic-{suffix}@join.example",
                password="pw-test-123",
                phone_number="1",
                communication_email=f"student-atomic-{suffix}@join.example",
                name="Student",
                date_of_birth=date(1990, 1, 1),
                code=f"join-atomic-{suffix}",
                roles=[User.UserRole.STUDENT],
                is_active=False,
                is_waiting_for_activation=True,
            )
            self.admin = User.objects.create_user(
                email=f"admin-atomic-{suffix}@join.example",
                password="pw-test-123",
                phone_number="2",
                communication_email=f"admin-atomic-{suffix}@join.example",
                name="Admin",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-atomic-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            jr = CourseJoinRequest.objects.create(
                user=self.student,
                course=self.course,
                status=CourseJoinRequest.Status.PENDING,
            )
            self.join_request_id = jr.id

    def test_membership_event_failure_rolls_back_enrollment_and_activation(self):
        with schema_context(self.schema_name):
            jr = CourseJoinRequest.objects.get(id=self.join_request_id)
            student = jr.user
            with patch(
                "app_course.join_request_approval.record_membership_event",
                side_effect=IntegrityError("forced"),
            ):
                with self.assertRaises(IntegrityError):
                    approve_course_join_request(
                        jr,
                        actor=self.admin,
                        tenant=self.org,
                        send_activation_email=False,
                    )
            jr.refresh_from_db()
            student.refresh_from_db()
            self.assertEqual(jr.status, CourseJoinRequest.Status.PENDING)
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=student.id, course_id=jr.course_id
                ).exists()
            )
            self.assertFalse(student.is_active)
