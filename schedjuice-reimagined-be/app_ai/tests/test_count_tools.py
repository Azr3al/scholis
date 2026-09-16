import unittest
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_ai.tools.count_course_roster import run_count_course_roster
from app_ai.tools.count_organization import run_count_organization
from app_ai.tools.count_teacher_courses import run_count_teacher_courses
from app_ai.tools.list_user_courses import run_list_user_courses
from app_ai.tools.rbac import (
    require_course_read_breadth,
    require_user_or_course_read_breadth,
    require_user_read_breadth,
)
from app_ai.tools.resolve import (
    resolve_accessible_course,
    resolve_category,
    resolve_staff_user,
)
from app_ai.tools.search_users import run_search_users
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class _CountToolsTestBase(TestCase):
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

    def _create_admin_and_teacher(self):
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
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIToolRbacTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()

    def test_teacher_denied_user_read_breadth(self):
        with schema_context(self.schema_name):
            err = require_user_read_breadth(self.teacher)
        self.assertEqual(err["error"], "permission_denied")

    def test_teacher_denied_user_or_course_read_breadth(self):
        with schema_context(self.schema_name):
            err = require_user_or_course_read_breadth(self.teacher)
        self.assertEqual(err["error"], "permission_denied")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIToolResolveTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"UniqueMathZ99 {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )

    def test_resolve_staff_user_by_id(self):
        with schema_context(self.schema_name):
            result = resolve_staff_user(user_id=self.admin.id, query=None)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.admin.id)

    def test_resolve_course_not_found_for_unscoped_teacher(self):
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            result = resolve_accessible_course(
                user=other, course_id=None, query="NonexistentCourseXYZ"
            )
        self.assertEqual(result["status"], "not_found")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIToolResolveCategoryTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        with schema_context(self.schema_name):
            suffix = uuid4().hex[:4]
            self.ket = Category.objects.create(name=f"KET {suffix}")

    def test_resolve_by_id(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=self.ket.id, query=None)
        self.assertEqual(out["status"], "ok")
        self.assertEqual(out["category"].id, self.ket.id)

    def test_resolve_by_query_single_match(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=None, query="KET")
        self.assertEqual(out["status"], "ok")

    def test_resolve_not_found(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=None, query="ZZZNOHIT999")
        self.assertEqual(out["status"], "not_found")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CountOrganizationToolTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            Course.objects.create(
                title=f"Active {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
            )
            Course.objects.create(
                title=f"Planned {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today + timedelta(days=10),
                end_date=self.today + timedelta(days=40),
                status=Course.CourseStatus.PLANNED,
            )

    def test_admin_can_count_students(self):
        with schema_context(self.schema_name):
            result = run_count_organization({"entity": "students"}, self.admin)
        self.assertIn("count", result)
        self.assertGreaterEqual(result["count"], 0)

    def test_teacher_denied_org_student_count(self):
        with schema_context(self.schema_name):
            result = run_count_organization({"entity": "students"}, self.teacher)
        self.assertEqual(result["error"], "permission_denied")

    @patch("app_ai.tools.count_organization.org_today")
    def test_admin_course_count_active_only(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            active = run_count_organization(
                {"entity": "courses", "course_status": "active"}, self.admin
            )
            all_courses = run_count_organization(
                {"entity": "courses", "course_status": "all"}, self.admin
            )
        self.assertGreater(all_courses["count"], active["count"])

    def test_student_count_defaults_to_actively_enrolled(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            baseline_enrolled = run_count_organization(
                {"entity": "students"}, self.admin
            )["count"]
            baseline_all = run_count_organization(
                {"entity": "students", "include_all_student_accounts": True},
                self.admin,
            )["count"]

            active_course = Course.objects.create(
                title=f"Enrolled {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
            )
            ended_course = Course.objects.create(
                title=f"Ended {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=400),
                end_date=self.today - timedelta(days=30),
                status=Course.CourseStatus.ENDED,
            )

            enrolled = User.objects.create_user(
                email=f"enrolled-{suffix}@e.com",
                password="x",
                name="Enrolled Student",
                phone_number="-",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            User.objects.create_user(
                email=f"no-enroll-{suffix}@e.com",
                password="x",
                name="No Enrollment",
                phone_number="-",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            ended_only = User.objects.create_user(
                email=f"ended-only-{suffix}@e.com",
                password="x",
                name="Ended Only",
                phone_number="-",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=enrolled,
                course=active_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=ended_only,
                course=ended_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

            enrolled_result = run_count_organization(
                {"entity": "students"}, self.admin
            )
            all_accounts_result = run_count_organization(
                {"entity": "students", "include_all_student_accounts": True},
                self.admin,
            )

        self.assertEqual(
            enrolled_result["filters_applied"]["enrollment_scope"],
            "actively_enrolled",
        )
        self.assertEqual(
            all_accounts_result["filters_applied"]["enrollment_scope"],
            "all_accounts",
        )
        self.assertEqual(enrolled_result["count"], baseline_enrolled + 1)
        self.assertEqual(all_accounts_result["count"], baseline_all + 3)
        self.assertLess(enrolled_result["count"], all_accounts_result["count"])

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CountTeacherCoursesToolTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.staff_teacher = User.objects.create_user(
                email=f"staff-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Staff Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            for i in range(2):
                course = Course.objects.create(
                    title=f"TCourse {i} {uuid4().hex[:4]}",
                    category=self.cat,
                    program=self.prog,
                    start_date=self.today,
                    end_date=self.today + timedelta(days=30),
                    status=Course.CourseStatus.ACTIVE,
                )
                UserCourse.objects.create(
                    user=self.staff_teacher,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )

    def test_admin_counts_teacher_courses_by_user_id(self):
        with schema_context(self.schema_name):
            result = run_count_teacher_courses(
                {"user_id": self.staff_teacher.id, "course_status": "active"},
                self.admin,
            )
        self.assertEqual(result["count"], 2)

    def test_teacher_denied(self):
        with schema_context(self.schema_name):
            result = run_count_teacher_courses(
                {"user_id": self.staff_teacher.id}, self.teacher
            )
        self.assertEqual(result["error"], "permission_denied")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CountCourseRosterToolTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.roster_teacher = User.objects.create_user(
                email=f"rostert-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Roster Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student One",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"RosterCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.roster_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_roster_teacher_sees_counts(self):
        with schema_context(self.schema_name):
            result = run_count_course_roster(
                {"course_id": self.course.id, "member_type": "all"},
                self.roster_teacher,
            )
        self.assertEqual(result["students"], 1)
        self.assertEqual(result["staff"], 1)

    def test_non_roster_teacher_cannot_access_course(self):
        with schema_context(self.schema_name):
            result = run_count_course_roster(
                {"course_id": self.course.id}, self.other_teacher
            )
        self.assertEqual(result["error"], "not_found")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SearchUsersScopingTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.isolated_student = User.objects.create_user(
                email=f"iso-{uuid4().hex[:6]}@e.com",
                password="x",
                name="IsolatedStudentXYZ",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=f"ScopeCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.isolated_student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_teacher_search_only_finds_co_enrolled_users(self):
        with schema_context(self.schema_name):
            results = run_search_users(
                {"query": "IsolatedStudentXYZ", "role": "student"},
                self.teacher,
            )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.isolated_student.id)

    def test_teacher_cannot_find_unrelated_student(self):
        with schema_context(self.schema_name):
            unrelated = User.objects.create_user(
                email=f"unrel-{uuid4().hex[:6]}@e.com",
                password="x",
                name="UnrelatedStudentABC",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            results = run_search_users(
                {"query": "UnrelatedStudentABC", "role": "student"},
                self.teacher,
            )
        result_ids = {row["id"] for row in results}
        self.assertNotIn(unrelated.id, result_ids)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ListUserCoursesToolTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Bruce Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.staff_teacher = User.objects.create_user(
                email=f"staff-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Staff Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.main_teacher_role = AssignedAsRole.objects.create(
                name=f"Main Teacher {uuid4().hex[:4]}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.active_course = Course.objects.create(
                title=f"ActiveCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
            )
            self.planned_course = Course.objects.create(
                title=f"PlannedCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.PLANNED,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.active_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.planned_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.staff_teacher,
                course=self.active_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.main_teacher_role,
            )

    def test_admin_lists_student_active_courses(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.student.id, "course_status": "active"},
                self.admin,
            )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["courses"][0]["course_id"], self.active_course.id)
        self.assertEqual(result["courses"][0]["assigned_as"], "student")
        self.assertNotIn("assigned_as_role", result["courses"][0])

    def test_admin_lists_staff_courses_with_role(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.staff_teacher.id, "course_status": "active"},
                self.admin,
            )
        self.assertEqual(result["count"], 1)
        course_row = result["courses"][0]
        self.assertEqual(course_row["assigned_as"], "teacher")
        self.assertEqual(course_row["assigned_as_role"]["name"], self.main_teacher_role.name)
        self.assertEqual(
            course_row["assigned_as_role"]["seniority"],
            AssignedAsRole.Seniority.MAIN_TEACHER,
        )

    def test_admin_lists_student_courses_by_query(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"query": "Bruce Student", "course_status": "all"},
                self.admin,
            )
        self.assertEqual(result["count"], 2)

    def test_teacher_can_list_co_enrolled_student_courses(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.active_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            result = run_list_user_courses(
                {"user_id": self.student.id, "course_status": "active"},
                self.teacher,
            )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["courses"][0]["course_id"], self.active_course.id)

    def test_teacher_cannot_list_unrelated_student(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.student.id, "course_status": "active"},
                self.teacher,
            )
        self.assertEqual(result["error"], "permission_denied")

    def test_validation_requires_exactly_one_lookup(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses({}, self.admin)
        self.assertEqual(result["error"], "validation_error")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ListUserCoursesLargeStaffListTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.heavy_staff = User.objects.create_user(
                email=f"heavy-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Heavy Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT {uuid4().hex[:4]}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.at_role = AssignedAsRole.objects.create(
                name=f"AT {uuid4().hex[:4]}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            self.other_role = AssignedAsRole.objects.create(
                name=f"Other {uuid4().hex[:4]}",
                seniority=AssignedAsRole.Seniority.OTHER,
            )
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.mt_course = self._create_course("MT Course")
            self.at_course = self._create_course("AT Course")
            for i in range(50):
                course = self._create_course(f"Other Course {i}")
                UserCourse.objects.create(
                    user=self.heavy_staff,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    assigned_as_role=self.other_role,
                )
            UserCourse.objects.create(
                user=self.heavy_staff,
                course=self.mt_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserCourse.objects.create(
                user=self.heavy_staff,
                course=self.at_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )

    def _create_course(self, title: str) -> Course:
        return Course.objects.create(
            title=f"{title} {uuid4().hex[:4]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today,
            end_date=self.today + timedelta(days=30),
            status=Course.CourseStatus.ACTIVE,
        )

    def test_defaults_to_mt_at_when_more_than_fifty_active_assignments(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {"user_id": self.heavy_staff.id, "course_status": "active"},
                self.admin,
            )
        self.assertTrue(result["large_list_filtered"])
        self.assertEqual(result["total_active_assignments"], 52)
        self.assertEqual(result["assignment_scope"], "default")
        self.assertEqual(result["count"], 2)
        seniorities = {
            row["assigned_as_role"]["seniority"] for row in result["courses"]
        }
        self.assertEqual(
            seniorities,
            {
                AssignedAsRole.Seniority.MAIN_TEACHER,
                AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            },
        )

    def test_full_scope_returns_all_assignments_up_to_limit(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {
                    "user_id": self.heavy_staff.id,
                    "course_status": "active",
                    "assignment_scope": "full",
                },
                self.admin,
            )
        self.assertFalse(result["large_list_filtered"])
        self.assertEqual(result["count"], 50)
        self.assertTrue(result["truncated"])

    def test_non_main_scope_returns_other_assignments_only(self):
        with schema_context(self.schema_name):
            result = run_list_user_courses(
                {
                    "user_id": self.heavy_staff.id,
                    "course_status": "active",
                    "assignment_scope": "non_main",
                },
                self.admin,
            )
        self.assertTrue(result["large_list_filtered"])
        self.assertEqual(result["count"], 50)
        for row in result["courses"]:
            self.assertEqual(
                row["assigned_as_role"]["seniority"],
                AssignedAsRole.Seniority.OTHER,
            )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AssistantUserLookupFilterTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.active_course = Course.objects.create(
                title=f"ActiveCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
            )
            self.ended_course = Course.objects.create(
                title=f"EndedCourse {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=date(2020, 1, 1),
                end_date=date(2020, 6, 1),
                status=Course.CourseStatus.ENDED,
            )
            self.active_student = User.objects.create_user(
                email=f"active-{uuid4().hex[:6]}@e.com",
                password="x",
                name="ActiveStudentLookup",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.active_student,
                course=self.active_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.alumni_student = User.objects.create_user(
                email=f"alumni-{uuid4().hex[:6]}@e.com",
                password="x",
                name="AlumniStudentLookup",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
                is_active=True,
            )
            UserCourse.objects.create(
                user=self.alumni_student,
                course=self.ended_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.resigned_staff = User.objects.create_user(
                email=f"resigned-{uuid4().hex[:6]}@e.com",
                password="x",
                name="ResignedStaffLookup",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                is_active=False,
                resigned_at=timezone.now(),
            )

    def test_search_excludes_alumni_student(self):
        with schema_context(self.schema_name):
            results = run_search_users(
                {"query": "AlumniStudentLookup", "role": "student"},
                self.admin,
            )
        self.assertEqual(results, [])

    def test_search_finds_actively_enrolled_student(self):
        with schema_context(self.schema_name):
            results = run_search_users(
                {"query": "ActiveStudentLookup", "role": "student"},
                self.admin,
            )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.active_student.id)

    def test_search_excludes_resigned_staff(self):
        with schema_context(self.schema_name):
            results = run_search_users(
                {"query": "ResignedStaffLookup", "role": "staff"},
                self.admin,
            )
        self.assertEqual(results, [])

    def test_resolve_staff_user_excludes_resigned_staff(self):
        with schema_context(self.schema_name):
            result = resolve_staff_user(query="ResignedStaffLookup")
        self.assertEqual(result["status"], "not_found")

    def test_resolve_staff_user_includes_custom_rbac_role(self):
        with schema_context(self.schema_name):
            custom_staff = User.objects.create_user(
                email=f"neki-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Htoo Myat Minn Search",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[
                    User.UserRole.TEACHER,
                    User.UserRole.MANAGER,
                    User.UserRole.ADMIN,
                    "telegram-beta-tester",
                ],
            )
            result = resolve_staff_user(query="htoo myat minn search")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, custom_staff.id)

    def test_search_staff_role_includes_custom_rbac_role(self):
        with schema_context(self.schema_name):
            custom_staff = User.objects.create_user(
                email=f"neki-search-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Neki Custom Role",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER, "telegram-beta-tester"],
            )
            results = run_search_users(
                {"query": "Neki Custom Role", "role": "staff"},
                self.admin,
            )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], custom_staff.id)

    def test_alumni_actor_self_reference_still_works(self):
        with schema_context(self.schema_name):
            rows = run_search_users({"query": "me"}, self.alumni_student)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.alumni_student.id)
