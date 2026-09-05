import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.user_insights_services import (
    DuplicateClusterFilters,
    build_duplicate_clusters,
    load_student_rows,
)
from app_auth.user_merge_services import apply_user_merge, validate_merge_request
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserMergeApplyTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    def setUp(self):
        self.broadcast_patcher = patch("app_auth.views.broadcast_rbac_updated_to_user")
        self.broadcast_patcher.start()
        self.addCleanup(self.broadcast_patcher.stop)
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:8]
            self.admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            shared_phone = f"09{suffix[:8]}"
            self.student_a = User.objects.create(
                email=f"stu-a-{suffix}@x.io",
                name="Student A",
                phone_number=shared_phone,
                communication_email=f"stu-a-{suffix}@x.io",
                code=f"sa-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.student_b = User.objects.create(
                email=f"stu-b-{suffix}@x.io",
                name="Student B",
                phone_number=shared_phone,
                communication_email=f"stu-b-{suffix}@x.io",
                code=f"sb-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            users = load_student_rows(include_inactive=True)
            _, clusters, _ = build_duplicate_clusters(
                users, DuplicateClusterFilters(include_inactive=True, size=1000)
            )
            matching = [
                c
                for c in clusters
                if {self.student_a.id, self.student_b.id}.issubset(set(c["user_ids"]))
            ]
            self.assertEqual(len(matching), 1)
            self.cluster = matching[0]
            today = timezone.localdate()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            self.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            UserCourse.objects.create(
                user=self.student_a,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student_b,
                course=self.course_b,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_merge_apply_moves_user_courses_to_survivor(self):
        with schema_context(self.schema_name):
            body = {
                "cluster_id": self.cluster["cluster_id"],
                "survivor_user_id": self.student_a.id,
                "primary_email": self.student_a.email,
                "microsoft_id": None,
                "absorbed_user_ids": [self.student_b.id],
            }
            merge_req, _, survivor, absorbed = validate_merge_request(body)
            apply_user_merge(
                survivor=survivor,
                absorbed_users=absorbed,
                request=merge_req,
                actor=self.admin,
            )
            self.assertFalse(User.objects.filter(id=self.student_b.id).exists())
            self.assertEqual(
                UserCourse.objects.filter(user=self.student_a).count(),
                2,
            )
