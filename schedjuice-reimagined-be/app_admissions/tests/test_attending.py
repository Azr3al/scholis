import unittest
from datetime import date, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, PostType
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_rbac.cache import bump_matrix_generation
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdmissionsAttendingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.suffix = suffix
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            cat = Category.objects.create(name=f"Adm cat {suffix}")
            prog = Program.objects.create(
                name=f"Adm prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.teacher = User.objects.create_user(
                email=f"adm-att-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"adm-att-stu-{suffix}@example.com",
                password="x",
                name="Attending Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.officer = self._admissions_only(suffix)
            self.planned = Course.objects.create(
                title=f"Planned {suffix}",
                category=cat,
                program=prog,
                start_date=today + timedelta(days=10),
                end_date=today + timedelta(days=40),
            )
            self.ended = Course.objects.create(
                title=f"Ended {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=40),
                end_date=today - timedelta(days=10),
            )
            self.active = Course.objects.create(
                title=f"Active {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            self.staff_course = Course.objects.create(
                title=f"Staff {suffix}",
                category=cat,
                program=prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            with patch(
                "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
            ), patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=self.student,
                    course=self.planned,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                UserCourse.objects.create(
                    user=self.student,
                    course=self.ended,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                UserCourse.objects.create(
                    user=self.student,
                    course=self.active,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                UserCourse.objects.create(
                    user=self.student,
                    course=self.staff_course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )
            older = UserPayment.objects.create(
                user=self.student,
                course=self.active,
                transaction_id=f"old-{suffix}",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                status=UserPayment.Status.VERIFIED,
                verified_at=timezone.now() - timedelta(days=2),
                verified_by=self.officer,
            )
            UserPayment.objects.create(
                user=self.student,
                course=self.active,
                transaction_id=f"pend-{suffix}",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            newer = UserPayment.objects.create(
                user=self.student,
                course=self.active,
                transaction_id=f"new-{suffix}",
                parsed_amount=Money(200, "USD"),
                actual_amount=Money(200, "USD"),
                status=UserPayment.Status.VERIFIED,
                verified_at=timezone.now() - timedelta(hours=1),
                verified_by=None,
            )
            older.refresh_from_db()
            newer.refresh_from_db()
            self.older_receipt_number = older.receipt.number
            self.newer_receipt_number = newer.receipt.number
            self.newer_payment_id = newer.id

    def _admissions_only(self, suffix: str) -> User:
        role = Role.objects.create(
            slug=f"admissions-att-{suffix}",
            display_name="Admissions desk",
            is_system=False,
        )
        RolePermission.objects.create(role=role, permission_code="admissions.view")
        bump_matrix_generation(self.schema_name)
        return User.objects.create_user(
            email=f"adm-att-{suffix}@example.com",
            password="x",
            name="Officer",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[role.slug],
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_planned_included_ended_excluded(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(self.student)
        titles = {r["title"] for r in rows}
        self.assertIn(self.planned.title, titles)
        self.assertNotIn(self.ended.title, titles)
        self.assertNotIn(self.staff_course.title, titles)

    def test_latest_payment_null_when_none(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.planned.id
            )
        self.assertIsNone(row["latest_payment"])

    def test_latest_verified_in_setup_serializes_shape(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        pay = row["latest_payment"]
        self.assertEqual(pay["status"], UserPayment.Status.VERIFIED)
        self.assertIsNone(pay["created_by"])
        self.assertIsNone(pay["remarks"])
        self.assertEqual(pay["covered_months"], [])
        self.assertEqual(pay["receipt_number"], self.newer_receipt_number)
        self.assertNotEqual(pay["receipt_number"], self.newer_payment_id)
        self.assertIn("payment_date", pay)
        self.assertNotIn("verified_by", pay)
        self.assertNotIn("verified_at", pay)

    def test_latest_any_status_wins_by_id(self):
        with schema_context(self.schema_name):
            pending = UserPayment.objects.create(
                user=self.student,
                course=self.active,
                transaction_id=f"later-pend-{self.suffix}",
                parsed_amount=Money(75, "USD"),
                actual_amount=Money(75, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
                created_by=self.officer,
                remarks="Paid in two transfers",
            )
            UserPaymentCoveredMonth.objects.create(
                user_payment=pending,
                year=2026,
                month_index=7,
            )
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        pay = row["latest_payment"]
        self.assertEqual(pay["status"], UserPayment.Status.PENDING_VERIFICATION)
        self.assertEqual(
            pay["created_by"],
            {"id": self.officer.id, "name": self.officer.name},
        )
        self.assertEqual(pay["remarks"], "Paid in two transfers")
        self.assertEqual(
            pay["covered_months"],
            [{"year": 2026, "month_index": 7}],
        )
        self.assertNotIn("verified_by", pay)
        self.assertNotIn("verified_at", pay)

    def test_admissions_only_ok(self):
        resp = self._client(self.officer).get(
            f"/api/v1/admissions/people/{self.student.id}/attending"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()["data"]
        self.assertEqual(body["id"], self.student.id)
        titles = {c["title"] for c in body["classes"]}
        self.assertIn(self.planned.title, titles)
        self.assertNotIn(self.ended.title, titles)
        self.assertNotIn(self.staff_course.title, titles)

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).get(
            f"/api/v1/admissions/people/{self.student.id}/attending"
        )
        self.assertEqual(resp.status_code, 403)

    def test_unknown_person_404(self):
        resp = self._client(self.officer).get(
            "/api/v1/admissions/people/999999999/attending"
        )
        self.assertEqual(resp.status_code, 404)

    def test_alumni_sees_ended_classes_only(self):
        with schema_context(self.schema_name):
            alumni = User.objects.create_user(
                email=f"adm-att-al-{self.suffix}@example.com",
                password="x",
                name="Alumni Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            with patch(
                "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
            ):
                UserCourse.objects.create(
                    user=alumni,
                    course=self.ended,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(alumni)
        titles = {r["title"] for r in rows}
        self.assertEqual(titles, {self.ended.title})

    def test_never_enrolled_returns_empty(self):
        with schema_context(self.schema_name):
            ghost = User.objects.create_user(
                email=f"adm-att-gh-{self.suffix}@example.com",
                password="x",
                name="Ghost",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(ghost)
        self.assertEqual(rows, [])

    def test_left_at_membership_omitted(self):
        with schema_context(self.schema_name):
            UserCourse.including_ended.filter(
                user=self.student, course=self.planned
            ).update(left_at=timezone.now())
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(self.student)
        titles = {r["title"] for r in rows}
        self.assertNotIn(self.planned.title, titles)
        self.assertIn(self.active.title, titles)

    def test_class_includes_course_facts_and_mt(self):
        with schema_context(self.schema_name):
            self.active.repeat_every = ["Mon", "Wed"]
            self.active.save(update_fields=["repeat_every"])
            Event.objects.create(
                title=f"Sess {self.suffix}",
                course=self.active,
                date=timezone.now(),
                time_from=time(16, 0),
                time_to=time(17, 30),
            )
            Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=8,
                data="<p>8</p>",
                html_data="<p>8</p>",
                course=self.active,
                created_by=self.officer,
            )
            mt_role = AssignedAsRole.objects.create(
                name=f"MT att {self.suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=False,
            )
            sub_role = AssignedAsRole.objects.create(
                name=f"Sub MT att {self.suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            mt = User.objects.create_user(
                email=f"adm-att-mt-{self.suffix}@example.com",
                password="x",
                name="Aye Aye",
                phone_number="959111",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            sub = User.objects.create_user(
                email=f"adm-att-sub-{self.suffix}@example.com",
                password="x",
                name="Subby",
                phone_number="959222",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            with patch(
                "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
            ), patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
                UserCourse.objects.create(
                    user=mt,
                    course=self.active,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=mt_role,
                )
                UserCourse.objects.create(
                    user=sub,
                    course=self.active,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=sub_role,
                )
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        self.assertEqual(row["status"], Course.CourseStatus.ACTIVE)
        self.assertEqual(row["start_date"], self.active.start_date.isoformat())
        self.assertEqual(row["weekday_pattern"], "Mon Wed")
        self.assertIsNotNone(row["first_event_time_from"])
        self.assertEqual(row["current_unit"], 8)
        self.assertEqual(
            row["main_teachers"],
            [{"id": mt.id, "name": "Aye Aye", "phone_number": "959111"}],
        )

    def test_no_mt_is_empty_list(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.planned.id
            )
        self.assertEqual(row["main_teachers"], [])
        self.assertIsNone(row["current_unit"])
