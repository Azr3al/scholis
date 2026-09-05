import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_awards.document import EMPTY_AWARD_DOCUMENT
from app_awards.models import AwardTemplate, AwardTitle
from app_awards.services import (
    delete_grant,
    grant_award,
    grant_awards_batch,
    promote_local_title,
    serialize_display_template,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AwardGrantServiceTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def _setup(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        teacher = User.objects.create_user(
            email=f"t-{suffix}@example.com",
            password="x",
            name="T",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.TEACHER],
        )
        student = User.objects.create_user(
            email=f"s-{suffix}@example.com",
            password="x",
            name="S",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.STUDENT],
        )
        cat = Category.objects.create(name=f"Cat {suffix}")
        prog = Program.objects.create(
            name=f"P {suffix}",
            course_creation_method=Program.CourseCreationMethod.MANUAL,
            subject_strategy=Program.SubjectStrategy.NONE,
        )
        course = Course.objects.create(
            title=f"C {suffix}",
            category=cat,
            program=prog,
            start_date=today,
            end_date=today + timedelta(days=60),
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        top1 = AwardTitle.objects.create(
            name="Top 1",
            family=AwardTitle.Family.ACADEMIC_EXCELLENCE,
            origin=AwardTitle.Origin.ADMIN,
            is_pinned=True,
        )
        top2 = AwardTitle.objects.create(
            name="Top 2",
            family=AwardTitle.Family.ACADEMIC_EXCELLENCE,
            origin=AwardTitle.Origin.ADMIN,
            is_pinned=True,
        )
        return teacher, student, course, top1, top2, today

    def test_family_clash_rejected(self):
        with schema_context(self.schema_name):
            teacher, student, course, top1, top2, today = self._setup()
            grant_award(
                course=course,
                title=top1,
                user=student,
                period_kind="month",
                year=today.year,
                month=today.month,
                granted_by=teacher,
            )
            with self.assertRaises(ValidationError) as ctx:
                grant_award(
                    course=course,
                    title=top2,
                    user=student,
                    period_kind="month",
                    year=today.year,
                    month=today.month,
                    granted_by=teacher,
                )
            self.assertIn("family", ctx.exception.detail)

    def test_duplicate_same_period_rejected(self):
        with schema_context(self.schema_name):
            teacher, student, course, top1, _top2, today = self._setup()
            grant_award(
                course=course,
                title=top1,
                user=student,
                period_kind="month",
                year=today.year,
                month=today.month,
                granted_by=teacher,
            )
            with self.assertRaises(ValidationError) as ctx:
                grant_award(
                    course=course,
                    title=top1,
                    user=student,
                    period_kind="month",
                    year=today.year,
                    month=today.month,
                    granted_by=teacher,
                )
            self.assertIn("title", ctx.exception.detail)

    def test_month_and_overall_do_not_collide(self):
        with schema_context(self.schema_name):
            teacher, student, course, top1, _top2, today = self._setup()
            a = grant_award(
                course=course,
                title=top1,
                user=student,
                period_kind="month",
                year=today.year,
                month=today.month,
                granted_by=teacher,
            )
            b = grant_award(
                course=course,
                title=top1,
                user=student,
                period_kind="overall",
                year=None,
                month=None,
                granted_by=teacher,
            )
            self.assertNotEqual(a.id, b.id)

    def test_off_roster_rejected(self):
        with schema_context(self.schema_name):
            teacher, _student, course, top1, _top2, today = self._setup()
            outsider = User.objects.create_user(
                email=f"o-{uuid4().hex[:6]}@example.com",
                password="x",
                name="O",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            with self.assertRaises(ValidationError) as ctx:
                grant_award(
                    course=course,
                    title=top1,
                    user=outsider,
                    period_kind="overall",
                    granted_by=teacher,
                )
            self.assertIn("user", ctx.exception.detail)

    def test_last_local_grant_deletes_title(self):
        with schema_context(self.schema_name):
            teacher, student, course, _top1, _top2, today = self._setup()
            local = AwardTitle.objects.create(
                name=f"Star {uuid4().hex[:4]}",
                origin=AwardTitle.Origin.LOCAL,
                course=course,
            )
            grant = grant_award(
                course=course,
                title=local,
                user=student,
                period_kind="overall",
                granted_by=teacher,
            )
            delete_grant(grant)
            self.assertFalse(AwardTitle.objects.filter(pk=local.pk).exists())

    def test_promote_rewrites_grants_and_is_unpinned(self):
        with schema_context(self.schema_name):
            teacher, student, course, _top1, _top2, _today = self._setup()
            local = AwardTitle.objects.create(
                name=f"Star {uuid4().hex[:4]}",
                origin=AwardTitle.Origin.LOCAL,
                course=course,
            )
            grant = grant_award(
                course=course,
                title=local,
                user=student,
                period_kind="overall",
                granted_by=teacher,
            )
            org = promote_local_title(course, local, teacher)
            self.assertFalse(org.is_pinned)
            self.assertEqual(org.origin, AwardTitle.Origin.PROMOTED)
            self.assertIsNone(org.course_id)
            grant.refresh_from_db()
            self.assertEqual(grant.title_id, org.id)
            self.assertFalse(AwardTitle.objects.filter(pk=local.pk).exists())

    def test_promote_binds_existing_org_name(self):
        with schema_context(self.schema_name):
            teacher, student, course, _top1, _top2, _today = self._setup()
            existing = AwardTitle.objects.create(
                name="Star Student",
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            local = AwardTitle.objects.create(
                name="star student",
                origin=AwardTitle.Origin.LOCAL,
                course=course,
            )
            grant = grant_award(
                course=course,
                title=local,
                user=student,
                period_kind="overall",
                granted_by=teacher,
            )
            bound = promote_local_title(course, local, teacher)
            self.assertEqual(bound.id, existing.id)
            grant.refresh_from_db()
            self.assertEqual(grant.title_id, existing.id)
            self.assertEqual(
                AwardTitle.objects.filter(
                    course__isnull=True, name__iexact="Star Student"
                ).count(),
                1,
            )

    def test_display_template_is_oldest(self):
        with schema_context(self.schema_name):
            _teacher, _student, _course, top1, _top2, _today = self._setup()
            newer = AwardTemplate.objects.create(
                title=top1,
                name="New",
                document=dict(EMPTY_AWARD_DOCUMENT),
            )
            older = AwardTemplate.objects.create(
                title=top1,
                name="Old",
                document=dict(EMPTY_AWARD_DOCUMENT),
            )
            AwardTemplate.objects.filter(pk=older.pk).update(
                created_at=newer.created_at - timedelta(days=1)
            )
            older.refresh_from_db()
            payload = serialize_display_template(top1)
            self.assertEqual(payload["id"], older.id)
            self.assertEqual(payload["name"], "Old")
            self.assertIn("document", payload)
            self.assertIn("background_url", payload)

    def test_display_template_none_for_local_or_missing(self):
        with schema_context(self.schema_name):
            _teacher, _student, course, top1, _top2, _today = self._setup()
            local = AwardTitle.objects.create(
                name="One-off",
                origin=AwardTitle.Origin.LOCAL,
                course=course,
            )
            self.assertIsNone(serialize_display_template(local))
            self.assertIsNone(serialize_display_template(top1))

    def test_batch_partial_family_clash(self):
        with schema_context(self.schema_name):
            teacher, student, course, top1, top2, _today = self._setup()
            suffix = uuid4().hex[:6]
            other = User.objects.create_user(
                email=f"s2-{suffix}@example.com",
                password="x",
                name="S2",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            grant_award(
                course=course,
                title=top1,
                user=student,
                period_kind="overall",
                granted_by=teacher,
            )
            result = grant_awards_batch(
                course=course,
                title_id=top2.id,
                name=None,
                user_ids=[student.id, other.id],
                period_kind="overall",
                year=None,
                month=None,
                granted_by=teacher,
            )
            self.assertEqual(len(result["granted"]), 1)
            self.assertEqual(result["granted"][0]["user"], other.id)
            self.assertEqual(len(result["errors"]), 1)
            self.assertEqual(result["errors"][0]["user"], student.id)
            self.assertIn(top1.name, result["errors"][0]["message"])

    def test_batch_academic_ties_both_granted(self):
        with schema_context(self.schema_name):
            teacher, student, course, top1, _top2, _today = self._setup()
            suffix = uuid4().hex[:6]
            other = User.objects.create_user(
                email=f"s2-{suffix}@example.com",
                password="x",
                name="S2",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            result = grant_awards_batch(
                course=course,
                title_id=top1.id,
                name=None,
                user_ids=[student.id, other.id],
                period_kind="overall",
                year=None,
                month=None,
                granted_by=teacher,
            )
            self.assertEqual(len(result["granted"]), 2)
            self.assertEqual(result["errors"], [])

    def test_batch_empty_user_ids_raises(self):
        with schema_context(self.schema_name):
            teacher, _student, course, top1, _top2, _today = self._setup()
            with self.assertRaises(ValidationError) as cm:
                grant_awards_batch(
                    course=course,
                    title_id=top1.id,
                    name=None,
                    user_ids=[],
                    period_kind="overall",
                    year=None,
                    month=None,
                    granted_by=teacher,
                )
            self.assertIn("user_ids", cm.exception.detail)

    def test_batch_local_all_fail_deletes_title(self):
        with schema_context(self.schema_name):
            teacher, _student, course, _top1, _top2, _today = self._setup()
            suffix = uuid4().hex[:6]
            result = grant_awards_batch(
                course=course,
                title_id=None,
                name=f"One-off {suffix}",
                user_ids=[99999999],
                period_kind="overall",
                year=None,
                month=None,
                granted_by=teacher,
            )
            self.assertEqual(result["granted"], [])
            self.assertTrue(result["errors"])
            self.assertFalse(
                AwardTitle.objects.filter(
                    course=course, name__iexact=f"One-off {suffix}"
                ).exists()
            )
