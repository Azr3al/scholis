import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_ai.tools.get_course_roster import run_get_course_roster
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class _GetCourseRosterTestBase(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._telegram_invite_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_admin(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterHappyPathTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.mt_role = AssignedAsRole.objects.create(
                name=f"Main Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.at_role = AssignedAsRole.objects.create(
                name=f"Assistant Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            self.main_teacher = User.objects.create_user(
                email=f"mt-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Main",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.assistant_teacher = User.objects.create_user(
                email=f"at-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Assistant",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Active",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"PET 151 {suffix}",
                code=f"PET151-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.main_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserCourse.objects.create(
                user=self.assistant_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_returns_mt_at_and_active_students_by_query(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"query": self.course.code},
                self.admin,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["course"]["id"], self.course.id)
        self.assertEqual(len(result["main_teachers"]), 1)
        self.assertEqual(result["main_teachers"][0]["name"], "Tr. Main")
        self.assertIn("profile_url", result["main_teachers"][0])
        self.assertEqual(len(result["assistant_teachers"]), 1)
        self.assertEqual(result["assistant_teachers"][0]["name"], "Tr. Assistant")
        self.assertEqual(len(result["students"]), 1)
        self.assertEqual(result["students"][0]["name"], "Student Active")
        self.assertFalse(result["students"][0]["is_removed"])
        self.assertEqual(result["counts"]["main_teachers"], 1)
        self.assertEqual(result["counts"]["assistant_teachers"], 1)
        self.assertEqual(result["counts"]["students"], 1)
        self.assertEqual(result["other_staff"], [])
        self.assertEqual(result["counts"]["other_staff"], 0)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterFilterTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.other_role = AssignedAsRole.objects.create(
                name=f"Other {suffix}",
                seniority=AssignedAsRole.Seniority.OTHER,
            )
            self.other_staff_user = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Other",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.dropped_student = User.objects.create_user(
                email=f"dropped-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Dropped",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.active_student = User.objects.create_user(
                email=f"active-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Active",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.roster_teacher = User.objects.create_user(
                email=f"rostert-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Roster Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"outsider-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Outside Teacher",
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
            self.course = Course.objects.create(
                title=f"FilterCourse {suffix}",
                code=f"FC-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.other_staff_user,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.other_role,
            )
            UserCourse.objects.create(
                user=self.roster_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.active_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            dropped_uc = UserCourse.objects.create(
                user=self.dropped_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_course.membership_history import record_membership_event
            from app_course.models import CourseMembershipEvent

            record_membership_event(
                course_id=self.course.id,
                user_id=self.dropped_student.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
            )
            dropped_uc.delete()

    def test_excludes_dropped_students_by_default(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.admin,
            )
        names = {row["name"] for row in result["students"]}
        self.assertIn("Student Active", names)
        self.assertNotIn("Student Dropped", names)

    def test_include_dropped_students(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "course_id": self.course.id,
                    "include_dropped_students": True,
                },
                self.admin,
            )
        dropped = [row for row in result["students"] if row["name"] == "Student Dropped"]
        self.assertEqual(len(dropped), 1)
        self.assertTrue(dropped[0]["is_removed"])

    def test_excludes_other_staff_by_default(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.admin,
            )
        self.assertEqual(result["other_staff"], [])
        self.assertEqual(result["counts"]["other_staff"], 0)

    def test_include_other_staff(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "course_id": self.course.id,
                    "include_other_staff": True,
                },
                self.admin,
            )
        self.assertEqual(len(result["other_staff"]), 1)
        self.assertEqual(result["other_staff"][0]["name"], "Tr. Other")

    def test_roster_teacher_can_read_full_roster(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.roster_teacher,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["counts"]["students"], 1)

    def test_non_roster_teacher_gets_not_found_by_course_id(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.other_teacher,
            )
        self.assertEqual(result["error"], "not_found")

    def test_validation_requires_exactly_one_lookup(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster({}, self.admin)
        self.assertEqual(result["error"], "validation_error")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterAmbiguousTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course_a = Course.objects.create(
                title=f"CAE 36 Morning {suffix}",
                code=f"CAE36A-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            self.course_b = Course.objects.create(
                title=f"CAE 36 Evening {suffix}",
                code=f"CAE36B-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            self.search_fragment = f"CAE 36 {suffix}"

    def test_ambiguous_course_query_returns_letter_keys(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"query": self.search_fragment},
                self.admin,
            )
        self.assertEqual(result["error"], "ambiguous")
        self.assertGreaterEqual(len(result["candidates"]), 2)
        keys = {candidate["key"] for candidate in result["candidates"]}
        self.assertIn("A", keys)
        self.assertIn("B", keys)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterMemberTypeTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.at_role = AssignedAsRole.objects.create(
                name=f"Assistant Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            self.assistant_teacher = User.objects.create_user(
                email=f"at-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Assistant Only",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Active",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course_with_staff = Course.objects.create(
                title=f"Staff Course {suffix}",
                code=f"STAFF-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            self.course_at_only = Course.objects.create(
                title=f"AT Only {suffix}",
                code=f"ATONLY-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.assistant_teacher,
                course=self.course_with_staff,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course_with_staff,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.assistant_teacher,
                course=self.course_at_only,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )

    def test_member_type_teachers_omits_students(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "course_id": self.course_with_staff.id,
                    "member_type": "teachers",
                },
                self.admin,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["member_type_requested"], "teachers")
        self.assertNotIn("students", result)
        self.assertEqual(len(result["assistant_teachers"]), 1)
        self.assertEqual(result["main_teachers"], [])
        self.assertNotIn("students", result["counts"])

    def test_member_type_teachers_empty_main_teachers(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "query": self.course_at_only.code,
                    "member_type": "teachers",
                },
                self.admin,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["main_teachers"], [])
        self.assertEqual(result["counts"]["main_teachers"], 0)
        self.assertEqual(len(result["assistant_teachers"]), 1)
        self.assertNotIn("students", result)
