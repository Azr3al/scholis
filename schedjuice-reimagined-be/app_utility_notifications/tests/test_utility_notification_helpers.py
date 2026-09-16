import unittest
from datetime import datetime, time, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_announcement.models import Announcement, PostType
from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import AssignedAsRole, Assignment, Category, Course, Event, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_utility_notifications.event_buckets import EventBucket, classify_event
from app_utility_notifications.tenant_time import (
    add_calendar_days_to_tenant_ymd,
    event_instant_in_timezone,
    get_tenant_day_boundaries,
    get_tenant_today_ymd,
)
from app_utility_notifications.utility_notification_helpers import (
    _sort_utility_notifications_newest_first,
    class_starting_soon_push_targets_by_user,
    utility_notifications_for_user,
)
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class EventBucketsParityTest(SimpleTestCase):
    def test_classify_event_in_progress(self):
        now = datetime(2026, 5, 29, 10, 30, tzinfo=timezone.utc)
        ev = type(
            "Ev",
            (),
            {
                "date": "2026-05-29",
                "time_from": "10:00",
                "time_to": "11:00",
            },
        )()
        self.assertEqual(
            classify_event(ev, now, "UTC"),
            EventBucket.IN_PROGRESS,
        )

    def test_classify_event_upcoming(self):
        now = datetime(2026, 5, 29, 9, 0, tzinfo=timezone.utc)
        ev = type(
            "Ev",
            (),
            {
                "date": "2026-05-29",
                "time_from": "10:00",
                "time_to": "11:00",
            },
        )()
        self.assertEqual(classify_event(ev, now, "UTC"), EventBucket.UPCOMING)

    def test_classify_event_completed(self):
        now = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        ev = type(
            "Ev",
            (),
            {
                "date": "2026-05-29",
                "time_from": "10:00",
                "time_to": "11:00",
            },
        )()
        self.assertEqual(classify_event(ev, now, "UTC"), EventBucket.COMPLETED)

    def test_classify_event_returns_none_when_times_missing(self):
        now = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        ev = type("Ev", (), {"date": "2026-05-29", "time_from": "", "time_to": "11:00"})()
        self.assertIsNone(classify_event(ev, now, "UTC"))

class TenantTimeParityTest(SimpleTestCase):
    def test_day_boundaries_and_calendar_shift(self):
        now = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        today = get_tenant_today_ymd("UTC", now)
        self.assertEqual(today, "2026-05-29")
        start, end = get_tenant_day_boundaries(now, "UTC", today)
        self.assertLess(start, end)
        tomorrow = add_calendar_days_to_tenant_ymd(today, "UTC", 1)
        self.assertEqual(tomorrow, "2026-05-30")
        instant = event_instant_in_timezone("2026-05-29", "10:00", "UTC")
        self.assertIsNotNone(instant)
        self.assertEqual(instant.hour, 10)

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class UtilityNotificationHelpersDbTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _create_course_with_event(self, *, event_date: datetime) -> Course:
        category = Category.objects.first()
        course = Course.objects.create(
            title=f"Utility notif {uuid4()}",
            code=f"UN-{uuid4().hex[:8]}",
            category=category,
            program=get_default_program(),
            start_date="2024-01-01",
            end_date="2026-12-31",
        )
        Event.objects.create(
            title="Session",
            date=event_date,
            time_from=time(10, 0),
            time_to=time(11, 0),
            course=course,
        )
        return course

    def test_student_with_events_today_gets_today_schedule_count(self):
        now = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            self.assertIsNotNone(student)
            course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            rows = utility_notifications_for_user(
                student,
                now=now,
                tenant_tz="UTC",
            )
        today_rows = [
            r
            for r in rows
            if r["kind"] == UtilityNotificationKind.TODAY_SCHEDULE.value
        ]
        self.assertEqual(len(today_rows), 1)
        self.assertEqual(today_rows[0]["params"]["count"], 1)
        self.assertEqual(today_rows[0]["route"], "/shortcuts/todays-classes")

    def test_student_gets_attendance_marked_for_absent_with_leave(self):
        now = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        marked_at = datetime(2026, 5, 29, 11, 0, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            self.assertIsNotNone(student)
            course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
            )
            event = Event.objects.get(course=course)
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            ue = UserEvent.objects.create(
                user=student,
                event=event,
                attendance_status=UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE,
            )
            UserEvent.objects.filter(id=ue.id).update(updated_at=marked_at)
            rows = utility_notifications_for_user(
                student,
                now=now,
                tenant_tz="UTC",
            )

        marked_rows = [
            row
            for row in rows
            if row["kind"] == UtilityNotificationKind.ATTENDANCE_MARKED.value
        ]
        self.assertEqual(len(marked_rows), 1)
        self.assertIn("absent with leave", marked_rows[0]["body"])

    def test_teacher_sees_teaching_count_not_student_enrollment(self):
        now = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).exclude(id=teacher.id).first()
            self.assertIsNotNone(teacher)
            self.assertIsNotNone(student)
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (utility notif test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )

            taught_course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 14, 0, tzinfo=timezone.utc),
            )
            enrolled_only_course = self._create_course_with_event(
                event_date=datetime(2026, 5, 29, 15, 0, tzinfo=timezone.utc),
            )

            UserCourse.objects.create(
                user=teacher,
                course=taught_course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=main_role,
            )
            UserCourse.objects.create(
                user=teacher,
                course=enrolled_only_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

            rows = utility_notifications_for_user(
                teacher,
                now=now,
                tenant_tz="UTC",
            )

        today_rows = [
            r
            for r in rows
            if r["kind"] == UtilityNotificationKind.TODAY_SCHEDULE.value
        ]
        self.assertEqual(len(today_rows), 1)
        self.assertEqual(today_rows[0]["params"]["count"], 1)

    def test_teacher_gets_attendance_unmarked_with_route(self):
        now = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        yesterday = datetime(2026, 5, 28, 10, 0, tzinfo=timezone.utc)
        with schema_context(self.schema_name):
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).exclude(id=teacher.id).first()
            self.assertIsNotNone(teacher)
            self.assertIsNotNone(student)
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (attendance unmarked test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )

            course = self._create_course_with_event(event_date=yesterday)
            event = Event.objects.get(course=course)

            UserCourse.objects.create(
                user=teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=main_role,
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserEvent.objects.create(
                user=student,
                event=event,
                attendance_status=UserEvent.AttendanceStatus.UNREGISTERED,
            )

            rows = utility_notifications_for_user(
                teacher,
                now=now,
                tenant_tz="UTC",
            )

        unmarked_rows = [
            r
            for r in rows
            if r["kind"] == UtilityNotificationKind.ATTENDANCE_UNMARKED.value
        ]
        self.assertEqual(len(unmarked_rows), 1)
        row = unmarked_rows[0]
        self.assertEqual(row["route"], "/class/course/attendance/marking/[eventIndex]")
        self.assertEqual(row["params"]["courseId"], course.id)
        self.assertIsInstance(row["params"]["eventIndex"], int)

    def test_admin_unpaid_hidden_for_students(self):
        now = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                transaction_screenshot_strategy=Organization.TransactionScreenshotStrategy.ADMIN_UPLOAD,
            )
        with schema_context(self.schema_name):
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            self.assertIsNotNone(student)
            rows = utility_notifications_for_user(
                student,
                now=now,
                tenant_tz="UTC",
            )
        kinds = {r["kind"] for r in rows}
        self.assertNotIn(UtilityNotificationKind.ADMIN_UNPAID_SUMMARY.value, kinds)
        self.assertNotIn(UtilityNotificationKind.ADMIN_TODAY_OVERVIEW.value, kinds)


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class EndedCourseUtilityNotificationTest(TestCase):
    schema_name = "xschedjuice"
    now = datetime(2026, 5, 29, 9, 30, tzinfo=timezone.utc)

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _create_course(
        self,
        *,
        event_date: datetime,
        end_date: str = "2026-12-31",
        status_override: str | None = None,
    ) -> Course:
        category = Category.objects.first()
        course = Course.objects.create(
            title=f"Ended notif {uuid4()}",
            code=f"EN-{uuid4().hex[:8]}",
            category=category,
            program=get_default_program(),
            start_date="2024-01-01",
            end_date=end_date,
            status_override=status_override,
        )
        Event.objects.create(
            title="Session",
            date=event_date,
            time_from=time(10, 0),
            time_to=time(11, 0),
            course=course,
        )
        return course

    def _student(self) -> User:
        student = User.objects.filter(
            roles__contains=[User.UserRole.STUDENT],
            is_active=True,
        ).first()
        self.assertIsNotNone(student)
        return student

    def _kinds_for(self, user: User) -> set[str]:
        rows = utility_notifications_for_user(
            user,
            now=self.now,
            tenant_tz="UTC",
        )
        return {row["kind"] for row in rows}

    def test_manually_ended_course_skips_class_reminders(self):
        with schema_context(self.schema_name):
            student = self._student()
            course = self._create_course(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
                status_override=Course.StatusOverride.ENDED,
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            kinds = self._kinds_for(student)

        self.assertNotIn(UtilityNotificationKind.TODAY_SCHEDULE.value, kinds)
        self.assertNotIn(UtilityNotificationKind.CLASS_STARTING_SOON.value, kinds)

    def test_date_ended_course_skips_class_reminders(self):
        with schema_context(self.schema_name):
            student = self._student()
            course = self._create_course(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
                end_date="2026-05-28",
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            kinds = self._kinds_for(student)

        self.assertNotIn(UtilityNotificationKind.TODAY_SCHEDULE.value, kinds)
        self.assertNotIn(UtilityNotificationKind.CLASS_STARTING_SOON.value, kinds)

    def test_ended_course_assignment_due_is_omitted(self):
        with schema_context(self.schema_name):
            student = self._student()
            course = self._create_course(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
                status_override=Course.StatusOverride.ENDED,
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            Assignment.objects.create(
                title="Ended course homework",
                course=course,
                instructions={"type": "doc", "content": []},
                due_datetime=datetime(2026, 5, 29, 23, 59, tzinfo=timezone.utc),
                available_datetime=datetime(2026, 5, 28, 0, 0, tzinfo=timezone.utc),
                available_score=10,
            )
            kinds = self._kinds_for(student)

        self.assertNotIn(UtilityNotificationKind.ASSIGNMENT_DUE.value, kinds)

    def test_ended_course_attendance_marked_is_omitted(self):
        with schema_context(self.schema_name):
            student = self._student()
            course = self._create_course(
                event_date=datetime(2026, 5, 28, 10, 0, tzinfo=timezone.utc),
                status_override=Course.StatusOverride.ENDED,
            )
            event = Event.objects.get(course=course)
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserEvent.objects.create(
                user=student,
                event=event,
                attendance_status=UserEvent.AttendanceStatus.ABSENT,
            )
            kinds = self._kinds_for(student)

        self.assertNotIn(UtilityNotificationKind.ATTENDANCE_MARKED.value, kinds)

    def test_ended_course_announcement_still_shows(self):
        with schema_context(self.schema_name):
            student = self._student()
            admin = User.objects.exclude(id=student.id).first()
            self.assertIsNotNone(admin)
            course = self._create_course(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
                status_override=Course.StatusOverride.ENDED,
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            Announcement.objects.create(
                post_type=PostType.ANNOUNCEMENT,
                title="Ended course update",
                data="body",
                html_data="body",
                course=course,
                created_by=admin,
            )
            rows = utility_notifications_for_user(
                student,
                now=self.now,
                tenant_tz="UTC",
            )

        announcement_rows = [
            row
            for row in rows
            if row["kind"] == UtilityNotificationKind.ANNOUNCEMENT_NEW.value
            and row["params"].get("courseId") == course.id
        ]
        self.assertEqual(len(announcement_rows), 1)

    def test_manually_ended_course_omits_class_starting_soon_cron_targets(self):
        with schema_context(self.schema_name):
            student = self._student()
            course = self._create_course(
                event_date=datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc),
                status_override=Course.StatusOverride.ENDED,
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            targets = class_starting_soon_push_targets_by_user(
                now=self.now,
                tenant_tz="UTC",
            )

        self.assertEqual(targets, [])


class UtilityNotificationSortTest(SimpleTestCase):
    def test_sorts_newest_first_then_id_desc(self):
        older = datetime(2026, 5, 29, 8, 0, tzinfo=timezone.utc)
        newer = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "today_schedule:org:2026-05-29",
                "created_at": older,
            },
            {
                "id": "assignment_due:42:2026-05-29",
                "created_at": newer,
            },
            {
                "id": "class_starting_soon:7:2026-05-29",
                "created_at": newer,
            },
        ]
        _sort_utility_notifications_newest_first(rows)
        self.assertEqual(
            [row["id"] for row in rows],
            [
                "class_starting_soon:7:2026-05-29",
                "assignment_due:42:2026-05-29",
                "today_schedule:org:2026-05-29",
            ],
        )
