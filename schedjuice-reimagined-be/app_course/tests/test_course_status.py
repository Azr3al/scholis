import unittest
from datetime import datetime, time, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import schema_context
from unittest.mock import patch

from app_auth.models import User
from app_course.course_status import (
    apply_effective_status_filter,
    compute_effective_status,
    end_course,
    pause_course,
    reactivate_course,
    resume_course,
    user_can_edit_course_status,
)
from app_course.models import Category, Course, CourseHistory, Event, Program, UserCourse
from app_course.services.aggregate import build_course_aggregates
from app_course.views import CourseEndView, CoursePauseView, CourseReactivateView


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseStatusServiceTest(TestCase):
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
            self.manager = User.objects.filter(roles__contains=[User.UserRole.MANAGER]).first()
            self.teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            self.active_course = Course.objects.create(
                title=f"Active {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=10),
                end_date=self.today + timedelta(days=10),
            )
            self.planned_course = Course.objects.create(
                title=f"Planned {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today + timedelta(days=10),
                end_date=self.today + timedelta(days=40),
            )
            self.ended_course = Course.objects.create(
                title=f"Ended {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=40),
                end_date=self.today - timedelta(days=10),
            )
            if self.teacher:
                UserCourse.objects.create(
                    user=self.teacher,
                    course=self.active_course,
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                )

    def test_compute_effective_status_from_dates(self):
        with schema_context(self.schema_name):
            self.assertEqual(
                compute_effective_status(self.active_course),
                Course.CourseStatus.ACTIVE,
            )
            self.assertEqual(
                compute_effective_status(self.planned_course),
                Course.CourseStatus.PLANNED,
            )
            self.assertEqual(
                compute_effective_status(self.ended_course),
                Course.CourseStatus.ENDED,
            )

    def test_pause_and_resume_override(self):
        with schema_context(self.schema_name):
            pause_course(course=self.active_course, user=self.manager)
            self.active_course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.active_course),
                Course.CourseStatus.PAUSED,
            )
            resume_course(course=self.active_course, user=self.manager)
            self.active_course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.active_course),
                Course.CourseStatus.ACTIVE,
            )

    def test_manual_end_is_terminal_until_dates_change(self):
        with schema_context(self.schema_name):
            end_course(course=self.active_course, user=self.manager)
            self.active_course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.active_course),
                Course.CourseStatus.ENDED,
            )
            self.assertTrue(
                CourseHistory.objects.filter(course=self.active_course).exists()
            )

    def test_teacher_can_edit_assigned_course_status(self):
        with schema_context(self.schema_name):
            if not self.teacher:
                self.skipTest("No teacher fixture")
            self.assertTrue(
                user_can_edit_course_status(self.teacher, self.active_course)
            )

    def test_apply_effective_status_filter(self):
        with schema_context(self.schema_name):
            qs = Course.objects.filter(program=self.prog)
            active_ids = set(
                apply_effective_status_filter(
                    qs, [Course.CourseStatus.ACTIVE]
                ).values_list("id", flat=True)
            )
            self.assertIn(self.active_course.id, active_ids)
            self.assertNotIn(self.planned_course.id, active_ids)
            self.assertNotIn(self.ended_course.id, active_ids)

    def test_aggregate_status_facets_use_effective_status(self):
        with schema_context(self.schema_name):
            base_qs = Course.objects.filter(program=self.prog)
            result = build_course_aggregates(
                base_qs=base_qs,
                request_filter_params=[],
                facets=["status"],
            )
        self.assertGreaterEqual(result["status"]["active"], 1)
        self.assertGreaterEqual(result["status"]["planned"], 1)
        self.assertGreaterEqual(result["status"]["ended"], 1)

    def test_reactivate_date_ended_course_to_active(self):
        with schema_context(self.schema_name):
            new_start = self.today - timedelta(days=2)
            new_end = self.today + timedelta(days=20)
            reactivate_course(
                course=self.ended_course,
                user=self.manager,
                start_date=new_start,
                end_date=new_end,
            )
            self.ended_course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.ended_course),
                Course.CourseStatus.ACTIVE,
            )
            self.assertIsNone(self.ended_course.status_override)

    def test_reactivate_manually_ended_course_clears_override(self):
        with schema_context(self.schema_name):
            end_course(course=self.active_course, user=self.manager)
            self.active_course.refresh_from_db()
            self.assertEqual(self.active_course.status_override, Course.StatusOverride.ENDED)

            new_start = self.today + timedelta(days=5)
            new_end = self.today + timedelta(days=30)
            reactivate_course(
                course=self.active_course,
                user=self.manager,
                start_date=new_start,
                end_date=new_end,
            )
            self.active_course.refresh_from_db()
            self.assertIsNone(self.active_course.status_override)
            self.assertEqual(
                compute_effective_status(self.active_course),
                Course.CourseStatus.PLANNED,
            )
            self.assertFalse(
                CourseHistory.objects.filter(course=self.active_course).exists()
            )

    def test_reactivate_deletes_events_outside_new_range(self):
        with schema_context(self.schema_name):
            in_range = Event.objects.create(
                title="In range",
                course=self.ended_course,
                date=datetime.combine(self.today, time(9, 0)),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            out_of_range = Event.objects.create(
                title="Out of range",
                course=self.ended_course,
                date=datetime.combine(self.today - timedelta(days=100), time(9, 0)),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            new_start = self.today - timedelta(days=1)
            new_end = self.today + timedelta(days=10)
            reactivate_course(
                course=self.ended_course,
                user=self.manager,
                start_date=new_start,
                end_date=new_end,
            )
            self.assertTrue(Event.objects.filter(id=in_range.id).exists())
            self.assertFalse(Event.objects.filter(id=out_of_range.id).exists())

    def test_reactivate_blocked_when_outside_events_have_checkins(self):
        from app_attendance.models import UserEvent

        with schema_context(self.schema_name):
            teacher = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
            out_of_range = Event.objects.create(
                title="Out of range with checkin",
                course=self.ended_course,
                date=datetime.combine(self.today - timedelta(days=100), time(9, 0)),
                time_from=time(9, 0),
                time_to=time(10, 0),
            )
            UserEvent.objects.create(
                user=teacher,
                event=out_of_range,
                checkin_time=timezone.now(),
            )
            new_start = self.today - timedelta(days=1)
            new_end = self.today + timedelta(days=10)
            with self.assertRaises(ValueError):
                reactivate_course(
                    course=self.ended_course,
                    user=self.manager,
                    start_date=new_start,
                    end_date=new_end,
                )
            self.assertTrue(Event.objects.filter(id=out_of_range.id).exists())

    def test_reactivate_raises_when_course_not_ended(self):
        with schema_context(self.schema_name):
            with self.assertRaises(ValueError):
                reactivate_course(
                    course=self.active_course,
                    user=self.manager,
                    start_date=self.today,
                    end_date=self.today + timedelta(days=10),
                )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseStatusEndpointTest(TestCase):
    schema_name = "xschedjuice"
    factory = APIRequestFactory()

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
            self.manager = User.objects.filter(roles__contains=[User.UserRole.MANAGER]).first()
            self.student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
            self.course = Course.objects.create(
                title=f"Course {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=5),
                end_date=self.today + timedelta(days=5),
            )
            self.ended_course = Course.objects.create(
                title=f"Ended {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today - timedelta(days=30),
                end_date=self.today - timedelta(days=5),
            )

    def _request_as(self, user, view_cls, course_id, data=None):
        request = self.factory.post(
            f"/courses/{course_id}/end",
            data=data or {},
            format="json",
        )
        token_user = type(
            "TokenUser",
            (),
            {"id": user.email, "is_authenticated": True},
        )()
        with patch.object(
            TenantBoundJWTStatelessAuthentication,
            "authenticate",
            return_value=(token_user, None),
        ):
            view = view_cls.as_view()
            return view(request, course_id=course_id)

    def test_student_cannot_end_course(self):
        with schema_context(self.schema_name):
            if not self.student:
                self.skipTest("No student fixture")
            response = self._request_as(self.student, CourseEndView, self.course.id)
            self.assertEqual(response.status_code, 403)

    def test_manager_can_end_course(self):
        with schema_context(self.schema_name):
            if not self.manager:
                self.skipTest("No manager fixture")
            response = self._request_as(self.manager, CourseEndView, self.course.id)
            self.assertEqual(response.status_code, 200)
            self.course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.course),
                Course.CourseStatus.ENDED,
            )

    def test_manager_can_pause_course(self):
        with schema_context(self.schema_name):
            if not self.manager:
                self.skipTest("No manager fixture")
            request = self.factory.post(f"/courses/{self.course.id}/pause")
            token_user = type(
                "TokenUser",
                (),
                {"id": self.manager.email, "is_authenticated": True},
            )()
            with patch.object(
                TenantBoundJWTStatelessAuthentication,
                "authenticate",
                return_value=(token_user, None),
            ):
                response = CoursePauseView.as_view()(request, course_id=self.course.id)
            self.assertEqual(response.status_code, 200)
            self.course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.course),
                Course.CourseStatus.PAUSED,
            )

    def test_student_cannot_reactivate_course(self):
        with schema_context(self.schema_name):
            if not self.student:
                self.skipTest("No student fixture")
            payload = {
                "start_date": str(self.today),
                "end_date": str(self.today + timedelta(days=10)),
            }
            response = self._request_as(
                self.student,
                CourseReactivateView,
                self.ended_course.id,
                data=payload,
            )
            self.assertEqual(response.status_code, 403)

    def test_manager_can_reactivate_ended_course(self):
        with schema_context(self.schema_name):
            if not self.manager:
                self.skipTest("No manager fixture")
            payload = {
                "start_date": str(self.today - timedelta(days=1)),
                "end_date": str(self.today + timedelta(days=14)),
            }
            response = self._request_as(
                self.manager,
                CourseReactivateView,
                self.ended_course.id,
                data=payload,
            )
            self.assertEqual(response.status_code, 200)
            self.ended_course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(self.ended_course),
                Course.CourseStatus.ACTIVE,
            )

    def test_reactivate_active_course_returns_400(self):
        with schema_context(self.schema_name):
            if not self.manager:
                self.skipTest("No manager fixture")
            payload = {
                "start_date": str(self.today),
                "end_date": str(self.today + timedelta(days=10)),
            }
            response = self._request_as(
                self.manager,
                CourseReactivateView,
                self.course.id,
                data=payload,
            )
            self.assertEqual(response.status_code, 400)
