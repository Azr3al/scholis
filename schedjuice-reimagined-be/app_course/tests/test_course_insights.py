import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.course_insights_services import (
    ISSUE_MISSING_SESSION_DATA,
    ISSUE_NO_ASSISTANT_TEACHER,
    ISSUE_NO_MAIN_TEACHER,
    ISSUE_NO_SCHEDULE,
    ISSUE_NO_STUDENTS,
    ISSUE_OVERLAPPING_EVENTS,
    DataHealthFilters,
    build_data_health_rows,
    evaluate_course_issues,
)
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _aware(day: date, hour: int, minute: int = 0) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CourseDataHealthServicesTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.use_student_attendance = True
            self.org.use_student_checkin = False
            self.org.use_teacher_session_checkin = False
            self.org.course_data_health_session_lookback = 5
            self.org.save(
                update_fields=[
                    "use_student_attendance",
                    "use_student_checkin",
                    "use_teacher_session_checkin",
                    "course_data_health_session_lookback",
                ]
            )
            self.cat = Category.objects.create(name=f"Cat {self.suffix}")
            self.prog = Program.objects.create(
                name=f"P {self.suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT {self.suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.at_role = AssignedAsRole.objects.create(
                name=f"AT {self.suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            self.teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            self.student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            self.manager = User.objects.filter(roles__contains=[User.UserRole.MANAGER]).first()
        self._telegram_patch = patch("app_telegram.signals.dm_invite_link_to_teacher.delay")
        self._telegram_patch.start()

    def tearDown(self):
        self._telegram_patch.stop()
        super().tearDown()

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _create_active_course(self, title: str | None = None) -> Course:
        return Course.objects.create(
            title=title or f"Active {self.suffix}-{uuid4().hex[:4]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=10),
            end_date=self.today + timedelta(days=10),
        )

    def test_no_schedule_when_zero_events(self):
        with schema_context(self.schema_name):
            course = self._create_active_course()
            issues, _ = evaluate_course_issues(
                events=[],
                user_courses=[],
                user_events={},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_NO_SCHEDULE, issues)

    def test_overlapping_events_same_day(self):
        with schema_context(self.schema_name):
            course = self._create_active_course()
            day = self.today - timedelta(days=1)
            events = [
                Event.objects.create(
                    title="A",
                    course=course,
                    date=_aware(day, 9),
                    time_from=time(9, 0),
                    time_to=time(10, 30),
                ),
                Event.objects.create(
                    title="B",
                    course=course,
                    date=_aware(day, 9, 30),
                    time_from=time(9, 30),
                    time_to=time(11, 0),
                ),
            ]
            issues, _ = evaluate_course_issues(
                events=events,
                user_courses=[],
                user_events={},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_OVERLAPPING_EVENTS, issues)

    def test_no_students(self):
        with schema_context(self.schema_name):
            course = self._create_active_course()
            event = Event.objects.create(
                title="S",
                course=course,
                date=_aware(self.today - timedelta(days=1), 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            issues, _ = evaluate_course_issues(
                events=[event],
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events={},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_NO_STUDENTS, issues)

    def test_no_main_teacher(self):
        with schema_context(self.schema_name):
            course = self._create_active_course()
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            issues, _ = evaluate_course_issues(
                events=[],
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events={},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_NO_MAIN_TEACHER, issues)
            self.assertNotIn(ISSUE_NO_ASSISTANT_TEACHER, issues)

    def test_excludes_planned_course(self):
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today + timedelta(days=10),
                end_date=self.today + timedelta(days=40),
            )
            summary, rows = build_data_health_rows(DataHealthFilters(), self.org)
            course_ids = {row["course_id"] for row in rows}
            self.assertNotIn(planned.id, course_ids)
            self.assertGreaterEqual(summary["total_active_courses"], 0)

    def test_missing_session_data_when_student_unregistered(self):
        with schema_context(self.schema_name):
            course = self._create_active_course()
            past_day = self.today - timedelta(days=1)
            event = Event.objects.create(
                title="Past",
                course=course,
                date=_aware(past_day, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ue = UserEvent.objects.create(
                user=self.student,
                event=event,
                attendance_status=UserEvent.AttendanceStatus.UNREGISTERED,
            )
            issues, count = evaluate_course_issues(
                events=[event],
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events={(ue.user_id, ue.event_id): ue},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_MISSING_SESSION_DATA, issues)
            self.assertEqual(count, 1)

    def test_skips_missing_session_data_when_all_modes_off(self):
        with schema_context(self.schema_name):
            self.org.use_student_attendance = False
            self.org.save(update_fields=["use_student_attendance"])
            course = self._create_active_course()
            past_day = self.today - timedelta(days=1)
            event = Event.objects.create(
                title="Past",
                course=course,
                date=_aware(past_day, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            issues, _ = evaluate_course_issues(
                events=[event],
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events={},
                org=self.org,
                today=self.today,
            )
            self.assertNotIn(ISSUE_MISSING_SESSION_DATA, issues)

    def test_lookback_limits_to_n_sessions(self):
        with schema_context(self.schema_name):
            self.org.course_data_health_session_lookback = 2
            self.org.save(update_fields=["course_data_health_session_lookback"])
            course = self._create_active_course()
            UserCourse.objects.create(
                user=self.student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            events = []
            user_events = {}
            for offset in (5, 4, 3, 2, 1):
                day = self.today - timedelta(days=offset)
                event = Event.objects.create(
                    title=f"E{offset}",
                    course=course,
                    date=_aware(day, 9),
                    time_from=time(9, 0),
                    time_to=time(10, 0),
                )
                events.append(event)
                ue = UserEvent.objects.create(
                    user=self.student,
                    event=event,
                    attendance_status=UserEvent.AttendanceStatus.PRESENT
                    if offset > 2
                    else UserEvent.AttendanceStatus.UNREGISTERED,
                )
                user_events[(ue.user_id, ue.event_id)] = ue
            issues, count = evaluate_course_issues(
                events=events,
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events=user_events,
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_MISSING_SESSION_DATA, issues)
            self.assertEqual(count, 2)

    def test_teacher_checkin_requires_any_teacher(self):
        with schema_context(self.schema_name):
            self.org.use_student_attendance = False
            self.org.use_teacher_session_checkin = True
            self.org.save(
                update_fields=["use_student_attendance", "use_teacher_session_checkin"]
            )
            course = self._create_active_course()
            past_day = self.today - timedelta(days=1)
            event = Event.objects.create(
                title="Past",
                course=course,
                date=_aware(past_day, 9),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            mt = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            at = User.objects.exclude(id=mt.id).filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            UserCourse.objects.create(
                user=mt,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserCourse.objects.create(
                user=at,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            mt_ue = UserEvent.objects.create(
                user=mt,
                event=event,
                checkin_time=timezone.now(),
            )
            issues, _ = evaluate_course_issues(
                events=[event],
                user_courses=list(UserCourse.objects.filter(course=course).select_related("assigned_as_role")),
                user_events={(mt_ue.user_id, mt_ue.event_id): mt_ue},
                org=self.org,
                today=self.today,
            )
            self.assertIn(ISSUE_MISSING_SESSION_DATA, issues)

    def test_issue_filter_and_semantics(self):
        with schema_context(self.schema_name):
            only_schedule = self._create_active_course(title=f"NoSched {self.suffix}")
            UserCourse.objects.create(
                user=self.student,
                course=only_schedule,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=only_schedule,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            at_teacher = User.objects.exclude(id=self.teacher.id).filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            UserCourse.objects.create(
                user=at_teacher,
                course=only_schedule,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            both = self._create_active_course(title=f"Both {self.suffix}")
            summary, rows = build_data_health_rows(
                DataHealthFilters(issues=[ISSUE_NO_SCHEDULE, ISSUE_NO_STUDENTS]),
                self.org,
            )
            titles = {row["course_title"] for row in rows}
            self.assertNotIn(only_schedule.title, titles)
            self.assertIn(both.title, titles)
            self.assertGreater(summary["issue_counts"][ISSUE_NO_SCHEDULE], 0)

    def test_api_requires_course_view_all(self):
        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).exclude(
                id=self.manager.id
            ).first()

        with self.settings(RBAC_ENFORCE="enforce"):
            ok = self._client(self.manager).post(
                "/api/v1/courses/insights/search",
                {},
                format="json",
            )
            denied = self._client(teacher).post(
                "/api/v1/courses/insights/search",
                {},
                format="json",
            )
        self.assertEqual(ok.status_code, 200)
        self.assertIn("summary", ok.data["data"])
        self.assertEqual(denied.status_code, 403)
