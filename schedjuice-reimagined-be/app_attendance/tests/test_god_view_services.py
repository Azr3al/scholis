import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.god_view_services import (
    CourseMarkingProblemStatus,
    DailyAttendanceStatusFilter,
    GodViewFilters,
    UNREGISTERED_STATUS,
    build_course_marking_gap_detail,
    build_course_marking_gap_rows,
    build_daily_absence_rows,
    build_god_view_detail,
    build_god_view_rows,
    build_monthly_student_detail,
    build_monthly_student_rows,
    parse_god_view_filters,
)
from app_attendance.god_view_sql import fetch_god_view_page
from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.membership_history import record_membership_event
from app_course.models import Category, Course, CourseMembershipEvent, Event, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class GodViewServicesTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            self.student = User.objects.filter(roles__contains=["student"]).first()
            if not self.student:
                self.student = User.objects.create(
                    email=f"stu_{uuid4().hex[:6]}@test.com",
                    name="Test Student",
                    roles=["student"],
                )
            UserCourse.objects.get_or_create(
                user=self.student,
                course=self.course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            ev_date = timezone.make_aware(
                datetime.combine(self.today - timedelta(days=2), datetime.min.time())
            )
            self.event1 = Event.objects.create(
                title="Session 1",
                course=self.course,
                date=ev_date,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            ev_date2 = timezone.make_aware(
                datetime.combine(self.today - timedelta(days=1), datetime.min.time())
            )
            self.event2 = Event.objects.create(
                title="Session 2",
                course=self.course,
                date=ev_date2,
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=self.event1,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=self.event2,
                defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
            )

    def test_attendance_rate_and_streak(self):
        filters = GodViewFilters(
            date_from=self.today - timedelta(days=7),
            date_to=self.today,
            course_id=self.course.id,
            student_id=self.student.id,
        )
        with schema_context(self.schema_name):
            summary, rows = build_god_view_rows(filters)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["scheduled_classes"], 2)
        self.assertEqual(row["present_count"], 1)
        self.assertEqual(row["absent_count"], 1)
        self.assertEqual(row["attendance_rate"], 50.0)
        self.assertEqual(row["recent_absence_streak"], 1)
        self.assertGreater(summary["total_student_course_pairs"], 0)

    def test_absent_with_leave_counts_toward_absent_rate(self):
        with schema_context(self.schema_name):
            UserEvent.objects.update_or_create(
                user=self.student,
                event=self.event2,
                defaults={
                    "attendance_status": UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE
                },
            )
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                course_id=self.course.id,
                student_id=self.student.id,
            )
            _summary, rows = build_god_view_rows(filters)
        row = rows[0]
        self.assertEqual(row["absent_count"], 1)
        self.assertEqual(row["attendance_rate"], 50.0)

    def test_marked_count_includes_absent_with_leave(self):
        from app_attendance.god_view_services import _marked_count_by_event_id

        with schema_context(self.schema_name):
            UserEvent.objects.update_or_create(
                user=self.student,
                event=self.event2,
                defaults={
                    "attendance_status": UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE
                },
            )
            counts = _marked_count_by_event_id(
                [self.event2.id],
                [self.student.id],
            )
        self.assertEqual(counts.get(self.event2.id, 0), 1)

    def test_unregistered_count_when_no_user_event(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(
                user=self.student, event=self.event2
            ).delete()
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                course_id=self.course.id,
                student_id=self.student.id,
            )
            _summary, rows = build_god_view_rows(filters)
        row = rows[0]
        self.assertEqual(row["unregistered_count"], 1)
        self.assertEqual(row["present_count"], 1)

    def test_detail_records(self):
        with schema_context(self.schema_name):
            records = build_god_view_detail(
                self.student.id,
                self.course.id,
                self.today - timedelta(days=7),
                self.today,
            )
        self.assertEqual(len(records), 2)
        statuses = {r["attendance_status"] for r in records}
        self.assertIn(UserEvent.AttendanceStatus.PRESENT, statuses)

    def test_daily_absence_rows_include_absent_and_unregistered(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(
                user=self.student,
                event=self.event2,
            ).delete()
            absent_event = Event.objects.create(
                title="Session 3",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("11:00", "%H:%M").time(),
                time_to=datetime.strptime("12:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=absent_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
            )
            Event.objects.create(
                title="Session 4",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("13:00", "%H:%M").time(),
                time_to=datetime.strptime("14:00", "%H:%M").time(),
            )

            filters = GodViewFilters(date_from=self.today, date_to=self.today)
            summary, rows = build_daily_absence_rows(filters)

        statuses = {row["attendance_status"] for row in rows}
        event_titles = {row["event_title"] for row in rows}
        self.assertIn(UserEvent.AttendanceStatus.ABSENT, statuses)
        self.assertIn(UNREGISTERED_STATUS, statuses)
        self.assertIn("Session 3", event_titles)
        self.assertIn("Session 4", event_titles)
        self.assertEqual(summary["absent_count"], 1)
        self.assertEqual(summary["unregistered_count"], 1)
        self.assertEqual(summary["courses_affected_count"], 1)

    def test_daily_absence_rows_include_present_and_late(self):
        with schema_context(self.schema_name):
            present_event = Event.objects.create(
                title="Present session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("08:00", "%H:%M").time(),
                time_to=datetime.strptime("09:00", "%H:%M").time(),
            )
            late_event = Event.objects.create(
                title="Late session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("09:30", "%H:%M").time(),
                time_to=datetime.strptime("10:30", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=present_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=late_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.LATE},
            )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=self.course.id,
            )
            summary, rows = build_daily_absence_rows(filters)

        statuses = {row["attendance_status"] for row in rows}
        self.assertIn(UserEvent.AttendanceStatus.PRESENT, statuses)
        self.assertIn(UserEvent.AttendanceStatus.LATE, statuses)
        self.assertEqual(summary["present_count"], 1)
        self.assertEqual(summary["late_count"], 1)

    def test_daily_absence_status_filter_returns_subset_with_full_summary(self):
        with schema_context(self.schema_name):
            present_event = Event.objects.create(
                title="Present session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("08:00", "%H:%M").time(),
                time_to=datetime.strptime("09:00", "%H:%M").time(),
            )
            late_event = Event.objects.create(
                title="Late session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("09:30", "%H:%M").time(),
                time_to=datetime.strptime("10:30", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=present_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=late_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.LATE},
            )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=self.course.id,
                daily_status_filter=DailyAttendanceStatusFilter.PRESENT,
            )
            summary, rows = build_daily_absence_rows(filters)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["attendance_status"], UserEvent.AttendanceStatus.PRESENT)
        self.assertEqual(summary["present_count"], 1)
        self.assertEqual(summary["late_count"], 1)

    def test_daily_absence_rows_respect_course_filter(self):
        with schema_context(self.schema_name):
            other_course = Course.objects.create(
                title=f"Other {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.get_or_create(
                user=self.student,
                course=other_course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            other_event = Event.objects.create(
                title="Other course absent",
                course=other_course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=other_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
            )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=self.course.id,
            )
            _summary, rows = build_daily_absence_rows(filters)

        self.assertTrue(all(row["course_id"] == self.course.id for row in rows))

    def test_monthly_student_rows_aggregate_multiple_courses(self):
        with schema_context(self.schema_name):
            other_course = Course.objects.create(
                title=f"Other {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.get_or_create(
                user=self.student,
                course=other_course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            other_event = Event.objects.create(
                title="Other Session",
                course=other_course,
                date=timezone.make_aware(
                    datetime.combine(self.today - timedelta(days=3), datetime.min.time())
                ),
                time_from=datetime.strptime("09:00", "%H:%M").time(),
                time_to=datetime.strptime("10:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=other_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
            )

            filters = GodViewFilters(
                date_from=self.today - timedelta(days=30),
                date_to=self.today,
                student_id=self.student.id,
            )
            summary, rows = build_monthly_student_rows(filters)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["student_id"], self.student.id)
        self.assertEqual(row["course_count"], 2)
        self.assertEqual(row["absent_count"], 2)
        self.assertGreaterEqual(row["scheduled_classes"], 3)
        self.assertIn("worst_course", row)
        self.assertEqual(summary["total_absences"], 2)

    def test_monthly_student_detail_groups_records_by_course(self):
        with schema_context(self.schema_name):
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=30),
                date_to=self.today,
                student_id=self.student.id,
            )
            detail = build_monthly_student_detail(self.student.id, filters)

        self.assertEqual(detail["student_id"], self.student.id)
        self.assertIn("course_breakdown", detail)
        self.assertIn("course_records", detail)
        self.assertTrue(detail["course_breakdown"])

    def test_monthly_student_detail_uses_fixed_query_count(self):
        with schema_context(self.schema_name):
            extra_courses = []
            for _ in range(2):
                course = Course.objects.create(
                    title=f"Bulk {uuid4().hex[:6]}",
                    category=self.cat,
                    program=self.prog,
                    start_date=self.today - timedelta(days=30),
                    end_date=self.today + timedelta(days=30),
                )
                UserCourse.objects.get_or_create(
                    user=self.student,
                    course=course,
                    defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
                )
                event = Event.objects.create(
                    title="Bulk Session",
                    course=course,
                    date=timezone.make_aware(
                        datetime.combine(
                            self.today - timedelta(days=3),
                            datetime.min.time(),
                        )
                    ),
                    time_from=datetime.strptime("09:00", "%H:%M").time(),
                    time_to=datetime.strptime("10:00", "%H:%M").time(),
                )
                UserEvent.objects.update_or_create(
                    user=self.student,
                    event=event,
                    defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
                )
                extra_courses.append(course)

            filters = GodViewFilters(
                date_from=self.today - timedelta(days=30),
                date_to=self.today,
                student_id=self.student.id,
            )

            with self.assertNumQueries(3):
                detail = build_monthly_student_detail(self.student.id, filters)

        self.assertEqual(len(detail["course_records"]), 3)
        self.assertEqual(
            {record["course_id"] for record in detail["course_records"]},
            {self.course.id, extra_courses[0].id, extra_courses[1].id},
        )

    def test_parse_god_view_filters_course_marking_defaults(self):
        filters = parse_god_view_filters(
            {"mode": "course_marking_gaps"},
            {},
        )
        self.assertEqual(filters.problem_status, CourseMarkingProblemStatus.UNREGISTERED)
        self.assertEqual(filters.min_rate, 80.0)

    def test_course_marking_gap_rows_default_80_percent_filter(self):
        with schema_context(self.schema_name):
            extra_students = []
            for i in range(4):
                user = User.objects.create(
                    email=f"stu_gap_{uuid4().hex[:6]}@test.com",
                    name=f"Gap Student {i}",
                    roles=["student"],
                )
                UserCourse.objects.create(
                    user=user,
                    course=self.course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                extra_students.append(user)

            event = Event.objects.create(
                title="Gap Session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("15:00", "%H:%M").time(),
                time_to=datetime.strptime("16:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                min_rate=80.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            summary, rows = build_course_marking_gap_rows(filters)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["course_id"], self.course.id)
        self.assertEqual(row["scheduled_count"], 5)
        self.assertEqual(row["present_count"], 1)
        self.assertEqual(row["unregistered_count"], 4)
        self.assertEqual(row["unregistered_rate"], 80.0)
        self.assertEqual(summary["courses_affected_count"], 1)

    def test_course_marking_gap_rows_aggregate_across_date_range(self):
        with schema_context(self.schema_name):
            range_course = Course.objects.create(
                title=f"Range agg {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            range_student = User.objects.create(
                email=f"range_gap_{uuid4().hex[:6]}@test.com",
                name="Range Gap Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=range_student,
                course=range_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

            yesterday = self.today - timedelta(days=1)
            yesterday_event = Event.objects.create(
                title="Yesterday unmarked",
                course=range_course,
                date=timezone.make_aware(
                    datetime.combine(yesterday, datetime.min.time())
                ),
                time_from=datetime.strptime("11:00", "%H:%M").time(),
                time_to=datetime.strptime("12:00", "%H:%M").time(),
            )
            today_event = Event.objects.create(
                title="Today marked",
                course=range_course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("12:00", "%H:%M").time(),
                time_to=datetime.strptime("13:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=range_student,
                event=today_event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )

            filters = GodViewFilters(
                date_from=yesterday,
                date_to=self.today,
                course_id=range_course.id,
                min_rate=60.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            _summary, rows = build_course_marking_gap_rows(filters)

        self.assertEqual(len(rows), 0)

        with schema_context(self.schema_name):
            filters = GodViewFilters(
                date_from=yesterday,
                date_to=self.today,
                course_id=range_course.id,
                min_rate=40.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            summary, rows = build_course_marking_gap_rows(filters)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["scheduled_count"], 2)
        self.assertEqual(row["present_count"], 1)
        self.assertEqual(row["unregistered_count"], 1)
        self.assertEqual(row["unregistered_rate"], 50.0)
        self.assertEqual(row["event_date_from"], yesterday.isoformat())
        self.assertEqual(row["event_date_to"], self.today.isoformat())
        self.assertEqual(summary["date_from"], yesterday.isoformat())
        self.assertEqual(summary["date_to"], self.today.isoformat())

    def test_course_marking_gap_rows_use_bounded_query_count(self):
        with schema_context(self.schema_name):
            event = Event.objects.create(
                title="Query Count Session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("14:00", "%H:%M").time(),
                time_to=datetime.strptime("15:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                min_rate=80.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            with self.assertNumQueries(5):
                build_course_marking_gap_rows(filters)

    def test_course_marking_gap_counts_unregistered(self):
        with schema_context(self.schema_name):
            event = Event.objects.create(
                title="Mixed Session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("16:00", "%H:%M").time(),
                time_to=datetime.strptime("17:00", "%H:%M").time(),
            )
            UserEvent.objects.update_or_create(
                user=self.student,
                event=event,
                defaults={"attendance_status": UserEvent.AttendanceStatus.UNREGISTERED},
            )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                min_rate=None,
                problem_status=CourseMarkingProblemStatus.ALL,
            )
            _summary, rows = build_course_marking_gap_rows(filters)

        row = next(r for r in rows if r["course_id"] == self.course.id)
        self.assertGreaterEqual(row["unregistered_count"], 1)

    def test_course_marking_gap_dominant_absent_filter(self):
        with schema_context(self.schema_name):
            absent_course = Course.objects.create(
                title=f"Absent heavy {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            students = []
            for i in range(2):
                user = User.objects.create(
                    email=f"abs_dom_{uuid4().hex[:6]}@test.com",
                    name=f"Absent Student {i}",
                    roles=["student"],
                )
                UserCourse.objects.create(
                    user=user,
                    course=absent_course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                students.append(user)

            event = Event.objects.create(
                title="Absent session",
                course=absent_course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("18:00", "%H:%M").time(),
                time_to=datetime.strptime("19:00", "%H:%M").time(),
            )
            for user in students:
                UserEvent.objects.update_or_create(
                    user=user,
                    event=event,
                    defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
                )

            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=absent_course.id,
                min_rate=50.0,
                problem_status=CourseMarkingProblemStatus.ABSENT,
            )
            _summary, rows = build_course_marking_gap_rows(filters)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["dominant_problem"], UserEvent.AttendanceStatus.ABSENT)
        self.assertEqual(rows[0]["absent_count"], 2)

    def test_course_marking_gap_detail_returns_unregistered_students(self):
        with schema_context(self.schema_name):
            event = Event.objects.create(
                title="Detail Session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("17:00", "%H:%M").time(),
                time_to=datetime.strptime("18:00", "%H:%M").time(),
            )
            filters = GodViewFilters(date_from=self.today, date_to=self.today)
            records = build_course_marking_gap_detail(
                self.course.id,
                filters,
                CourseMarkingProblemStatus.UNREGISTERED,
            )

        self.assertTrue(records)
        self.assertTrue(
            any(
                r["attendance_status"] == UNREGISTERED_STATUS
                for r in records
            )
        )

    def test_daily_summary_has_scheduled_sessions_false_when_course_has_no_events(self):
        with schema_context(self.schema_name):
            empty_course = Course.objects.create(
                title=f"Empty {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.get_or_create(
                user=self.student,
                course=empty_course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=empty_course.id,
            )
            summary, rows = build_daily_absence_rows(filters)

        self.assertEqual(rows, [])
        self.assertIs(summary.get("has_scheduled_sessions"), False)

    def test_daily_summary_has_scheduled_sessions_true_when_course_has_events(self):
        with schema_context(self.schema_name):
            Event.objects.create(
                title="Today session",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("14:00", "%H:%M").time(),
                time_to=datetime.strptime("15:00", "%H:%M").time(),
            )
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=self.course.id,
            )
            summary, rows = build_daily_absence_rows(filters)

        self.assertGreater(len(rows), 0)
        self.assertIs(summary.get("has_scheduled_sessions"), True)

    def test_daily_summary_omits_has_scheduled_sessions_without_course_filter(self):
        filters = GodViewFilters(date_from=self.today, date_to=self.today)
        with schema_context(self.schema_name):
            summary, _rows = build_daily_absence_rows(filters)

        self.assertNotIn("has_scheduled_sessions", summary)

    def test_course_marking_gap_summary_has_scheduled_sessions_false(self):
        with schema_context(self.schema_name):
            empty_course = Course.objects.create(
                title=f"Gap empty {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=empty_course.id,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            summary, rows = build_course_marking_gap_rows(filters)

        self.assertEqual(rows, [])
        self.assertIs(summary.get("has_scheduled_sessions"), False)

    def test_course_marking_gap_summary_has_scheduled_sessions_true(self):
        with schema_context(self.schema_name):
            Event.objects.create(
                title="Gap today",
                course=self.course,
                date=timezone.make_aware(
                    datetime.combine(self.today, datetime.min.time())
                ),
                time_from=datetime.strptime("17:00", "%H:%M").time(),
                time_to=datetime.strptime("18:00", "%H:%M").time(),
            )
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                course_id=self.course.id,
                problem_status=CourseMarkingProblemStatus.ALL,
                min_rate=None,
            )
            summary, rows = build_course_marking_gap_rows(filters)

        self.assertGreater(len(rows), 0)
        self.assertIs(summary.get("has_scheduled_sessions"), True)

    def test_removed_student_excluded_from_god_view_rows(self):
        with schema_context(self.schema_name):
            removed_student = User.objects.create(
                email=f"removed_{uuid4().hex[:6]}@test.com",
                name="Removed Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=removed_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            record_membership_event(
                course_id=self.course.id,
                user_id=removed_student.id,
                event_type=CourseMembershipEvent.EventType.REMOVED,
            )
            UserCourse.objects.filter(
                user=removed_student, course=self.course
            ).delete()
            UserEvent.objects.update_or_create(
                user=removed_student,
                event=self.event1,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=30),
                date_to=self.today,
            )
            _summary, rows = build_god_view_rows(filters)
            student_ids = {r["student_id"] for r in rows}
            self.assertNotIn(removed_student.id, student_ids)

    def test_course_marking_gap_summary_omits_flag_without_course_filter(self):
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            problem_status=CourseMarkingProblemStatus.ALL,
            min_rate=None,
        )
        with schema_context(self.schema_name):
            summary, _rows = build_course_marking_gap_rows(filters)

        self.assertNotIn("has_scheduled_sessions", summary)

    def test_parse_stalled_after_marking_and_category_ids(self):
        filters = parse_god_view_filters(
            {
                "mode": "course_marking_gaps",
                "stalled_after_marking": True,
                "category_ids": [1, 2],
                "category_id": 99,
            },
            {},
        )
        self.assertTrue(filters.stalled_after_marking)
        self.assertEqual(filters.category_ids, [1, 2])

    def test_parse_category_ids_empty_list(self):
        filters = parse_god_view_filters(
            {"mode": "course_marking_gaps", "category_ids": []},
            {},
        )
        self.assertEqual(filters.category_ids, [])

    def test_parse_category_ids_omitted_falls_back_to_category_id(self):
        filters = parse_god_view_filters(
            {"mode": "course_marking_gaps", "category_id": 7},
            {},
        )
        self.assertIsNone(filters.category_ids)
        self.assertEqual(filters.category_id, 7)

    def _make_event(self, course, day, title_suffix=""):
        return Event.objects.create(
            title=f"Stall {title_suffix}{uuid4().hex[:4]}",
            course=course,
            date=timezone.make_aware(datetime.combine(day, datetime.min.time())),
            time_from=datetime.strptime("09:00", "%H:%M").time(),
            time_to=datetime.strptime("10:00", "%H:%M").time(),
        )

    def test_stalled_after_marking_matches_prior_mark_and_consecutive_unmarked(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Stall match {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            student = User.objects.create(
                email=f"stall_{uuid4().hex[:6]}@test.com",
                name="Stall Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d0 = self.today - timedelta(days=4)
            d1 = self.today - timedelta(days=2)
            d2 = self.today - timedelta(days=1)
            e0 = self._make_event(course, d0, "marked")
            self._make_event(course, d1, "u1")
            self._make_event(course, d2, "u2")
            UserEvent.objects.update_or_create(
                user=student,
                event=e0,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=d0,
                date_to=d2,
                stalled_after_marking=True,
                min_rate=80.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            _summary, rows = build_course_marking_gap_rows(filters)
            self.assertIn(course.id, {r["course_id"] for r in rows})

    def test_stalled_after_marking_rejects_no_prior_marking(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Stall none {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            student = User.objects.create(
                email=f"stall0_{uuid4().hex[:6]}@test.com",
                name="No Prior",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d1 = self.today - timedelta(days=2)
            d2 = self.today - timedelta(days=1)
            self._make_event(course, d1)
            self._make_event(course, d2)
            filters = GodViewFilters(
                date_from=d1,
                date_to=d2,
                stalled_after_marking=True,
                min_rate=None,
                problem_status=CourseMarkingProblemStatus.ALL,
            )
            _summary, rows = build_course_marking_gap_rows(filters)
            self.assertNotIn(course.id, {r["course_id"] for r in rows})

    def test_stalled_after_marking_rejects_non_consecutive_unmarked(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Stall gap {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            student = User.objects.create(
                email=f"stallg_{uuid4().hex[:6]}@test.com",
                name="Gap Days",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d0 = self.today - timedelta(days=5)
            d1 = self.today - timedelta(days=3)
            d2 = self.today - timedelta(days=1)
            e0 = self._make_event(course, d0, "m")
            self._make_event(course, d1, "u")
            e2 = self._make_event(course, d2, "m2")
            UserEvent.objects.update_or_create(
                user=student,
                event=e0,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            UserEvent.objects.update_or_create(
                user=student,
                event=e2,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=d0,
                date_to=d2,
                stalled_after_marking=True,
                min_rate=None,
                problem_status=CourseMarkingProblemStatus.ALL,
            )
            _summary, rows = build_course_marking_gap_rows(filters)
            self.assertNotIn(course.id, {r["course_id"] for r in rows})

    def test_stalled_after_marking_ignores_min_rate(self):
        with schema_context(self.schema_name):
            course = Course.objects.create(
                title=f"Stall rate {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            student = User.objects.create(
                email=f"stallr_{uuid4().hex[:6]}@test.com",
                name="Rate Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d0 = self.today - timedelta(days=3)
            d1 = self.today - timedelta(days=2)
            d2 = self.today - timedelta(days=1)
            e0 = self._make_event(course, d0)
            self._make_event(course, d1)
            self._make_event(course, d2)
            UserEvent.objects.update_or_create(
                user=student,
                event=e0,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=d0,
                date_to=d2,
                stalled_after_marking=True,
                min_rate=80.0,
                problem_status=CourseMarkingProblemStatus.UNREGISTERED,
            )
            _summary, rows = build_course_marking_gap_rows(filters)
            self.assertIn(course.id, {r["course_id"] for r in rows})

    def test_category_ids_include_filter(self):
        with schema_context(self.schema_name):
            other_cat = Category.objects.create(name=f"Other {uuid4().hex[:4]}")
            kept = Course.objects.create(
                title=f"Keep cat {uuid4().hex[:6]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            dropped = Course.objects.create(
                title=f"Drop cat {uuid4().hex[:6]}",
                category=other_cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today + timedelta(days=30),
            )
            for course in (kept, dropped):
                student = User.objects.create(
                    email=f"catf_{uuid4().hex[:6]}@test.com",
                    name="Cat Filter",
                    roles=["student"],
                )
                UserCourse.objects.create(
                    user=student,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                self._make_event(course, self.today)
            filters = GodViewFilters(
                date_from=self.today,
                date_to=self.today,
                category_ids=[self.cat.id],
                min_rate=None,
                problem_status=CourseMarkingProblemStatus.ALL,
            )
            _summary, rows = build_course_marking_gap_rows(filters)
            ids = {r["course_id"] for r in rows}
            self.assertIn(kept.id, ids)
            self.assertNotIn(dropped.id, ids)

    def test_soft_deleted_userevent_reads_as_unregistered(self):
        with schema_context(self.schema_name):
            UserEvent.all_objects.filter(
                user=self.student, event=self.event1
            ).update(is_deleted=True)
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                course_id=self.course.id,
                student_id=self.student.id,
            )
            _summary, rows = build_god_view_rows(filters)
        row = rows[0]
        self.assertEqual(row["present_count"], 0)
        self.assertEqual(row["unregistered_count"], 1)
        self.assertEqual(row["absent_count"], 1)

    def test_left_at_student_excluded_from_god_view_rows(self):
        with schema_context(self.schema_name):
            left_student = User.objects.create(
                email=f"left_{uuid4().hex[:6]}@test.com",
                name="Left Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=left_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.including_ended.filter(
                user=left_student, course=self.course
            ).update(left_at=timezone.now())
            UserEvent.objects.update_or_create(
                user=left_student,
                event=self.event1,
                defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
            )
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=30),
                date_to=self.today,
                course_id=self.course.id,
            )
            _summary, rows = build_god_view_rows(filters)
            student_ids = {r["student_id"] for r in rows}
            self.assertNotIn(left_student.id, student_ids)
            self.assertIn(self.student.id, student_ids)

    def test_empty_category_ids_returns_no_rows(self):
        filters = GodViewFilters(
            date_from=self.today - timedelta(days=7),
            date_to=self.today,
            category_ids=[],
        )
        with schema_context(self.schema_name):
            summary, rows = build_god_view_rows(filters)
        self.assertEqual(rows, [])
        self.assertEqual(summary["total_student_course_pairs"], 0)

    def test_omitted_category_ids_does_not_filter_courses(self):
        filters = GodViewFilters(
            date_from=self.today - timedelta(days=7),
            date_to=self.today,
            course_id=self.course.id,
            student_id=self.student.id,
            category_ids=None,
        )
        with schema_context(self.schema_name):
            _summary, rows = build_god_view_rows(filters)
        self.assertEqual(len(rows), 1)

    def test_teacher_filter_matches_ended_teacher_enrollment(self):
        with schema_context(self.schema_name):
            teacher = User.objects.create(
                email=f"teach_{uuid4().hex[:6]}@test.com",
                name="Ended Teacher",
                roles=["teacher"],
            )
            UserCourse.objects.create(
                user=teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.including_ended.filter(
                user=teacher, course=self.course
            ).update(left_at=timezone.now())
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                teacher_id=teacher.id,
                student_id=self.student.id,
            )
            _summary, rows = build_god_view_rows(filters)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["course_id"], self.course.id)

    def test_zero_mark_student_is_fully_unregistered(self):
        with schema_context(self.schema_name):
            UserEvent.objects.filter(user=self.student).delete()
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                course_id=self.course.id,
                student_id=self.student.id,
            )
            _summary, rows = build_god_view_rows(filters)
        row = rows[0]
        self.assertEqual(row["scheduled_classes"], 2)
        self.assertEqual(row["unregistered_count"], 2)
        self.assertEqual(row["recent_absence_streak"], 2)
        self.assertEqual(row["last_class_status"], UNREGISTERED_STATUS)

    def test_summary_covers_full_filtered_set_not_the_page(self):
        with schema_context(self.schema_name):
            extra = User.objects.create(
                email=f"page_{uuid4().hex[:6]}@test.com",
                name="Paged Student",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=extra,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            filters = GodViewFilters(
                date_from=self.today - timedelta(days=7),
                date_to=self.today,
                course_id=self.course.id,
            )
            summary, rows, count = fetch_god_view_page(filters, limit=1, offset=0)
        self.assertEqual(len(rows), 1)
        self.assertGreater(summary["total_student_course_pairs"], 1)
        self.assertEqual(count, summary["total_student_course_pairs"])

    def test_sort_keys_are_whitelisted_and_unknown_falls_back(self):
        with schema_context(self.schema_name):
            for sort in (
                "attendance_rate_desc",
                "student_name",
                "recent_risk",
                "attendance_rate_asc",
                "not_a_real_sort",
            ):
                filters = GodViewFilters(
                    date_from=self.today - timedelta(days=7),
                    date_to=self.today,
                    course_id=self.course.id,
                    student_id=self.student.id,
                    sort=sort,
                )
                _summary, rows = build_god_view_rows(filters)
                self.assertEqual(len(rows), 1, msg=sort)
