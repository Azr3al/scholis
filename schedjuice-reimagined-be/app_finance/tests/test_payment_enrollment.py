from __future__ import annotations

import unittest

from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_course.models import UserCourse
from app_finance import models
from app_finance.payment_enrollment import ensure_student_enrolled_for_payment
from app_finance.tests.test_multi_course_payment import (
    MultiCoursePaymentFixtureMixin,
    _database_reachable,
)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PaymentEnrollmentHelperTests(MultiCoursePaymentFixtureMixin, TestCase):
    def test_finance_user_can_enroll_student_without_manage_members(self):
        with schema_context(self.schema_name):
            UserCourse.objects.filter(
                user=self.student, course=self.course_c
            ).delete()
            self.assertFalse(
                UserCourse.objects.filter(
                    user=self.student,
                    course=self.course_c,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
            user_course = ensure_student_enrolled_for_payment(
                actor=self.finance,
                student=self.student,
                course=self.course_c,
                tenant=type("T", (), {"schema_name": self.schema_name})(),
            )
            self.assertIsNotNone(user_course.id)
            self.assertTrue(
                UserCourse.objects.filter(
                    user=self.student,
                    course=self.course_c,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )

    def test_enroll_is_idempotent_when_already_enrolled(self):
        with schema_context(self.schema_name):
            existing = UserCourse.objects.get(
                user=self.student, course=self.course_a
            )
            again = ensure_student_enrolled_for_payment(
                actor=self.finance,
                student=self.student,
                course=self.course_a,
                tenant=type("T", (), {"schema_name": self.schema_name})(),
            )
            self.assertEqual(existing.id, again.id)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class EnsureEnrollmentsEndpointTests(MultiCoursePaymentFixtureMixin, TestCase):
    def test_finance_user_can_ensure_enrollment_via_api(self):
        with schema_context(self.schema_name):
            UserCourse.objects.filter(
                user=self.student, course=self.course_c
            ).delete()
            resp = self._client(self.finance).post(
                "/api/v1/user-payments/ensure-enrollments",
                {"user_id": self.student.id, "course_ids": [self.course_c.id]},
                format="json",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            body = resp.json()
            self.assertFalse(body.get("isError"))
            rows = body.get("enrollments") or []
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["course_id"], self.course_c.id)
            self.assertTrue(
                UserCourse.objects.filter(
                    id=rows[0]["user_course_id"],
                    user=self.student,
                    course=self.course_c,
                ).exists()
            )

    def test_second_call_returns_existing_enrollment(self):
        with schema_context(self.schema_name):
            client = self._client(self.finance)
            first = client.post(
                "/api/v1/user-payments/ensure-enrollments",
                {"user_id": self.student.id, "course_ids": [self.course_a.id]},
                format="json",
            )
            second = client.post(
                "/api/v1/user-payments/ensure-enrollments",
                {"user_id": self.student.id, "course_ids": [self.course_a.id]},
                format="json",
            )
            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 200)
            self.assertEqual(
                first.json()["enrollments"][0]["user_course_id"],
                second.json()["enrollments"][0]["user_course_id"],
            )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseUploadAutoEnrollTests(MultiCoursePaymentFixtureMixin, TestCase):
    def _build_multi_course_body(self, *, auto_enroll: bool):
        screenshot = self.make_uploaded_screenshot("pay.gif")
        data = {
            "user": str(self.student.id),
            "courses_count": "2",
            "course_0_id": str(self.course_a.id),
            "course_0_clear_discount": "true",
            "course_1_id": str(self.course_c.id),
            "course_1_clear_discount": "true",
            "screenshots_count": "1",
            "screenshot_0_parsed_amount": "200",
            "screenshot_0_payment_method": str(self.payment_method.id),
            "screenshot_0_transaction_id": "TXN-AUTO-1",
            "screenshot_0_screenshot": screenshot,
            "allocations_count": "2",
            "alloc_0_screenshot_index": "0",
            "alloc_0_course_id": str(self.course_a.id),
            "alloc_0_amount": "150",
            "alloc_1_screenshot_index": "0",
            "alloc_1_course_id": str(self.course_c.id),
            "alloc_1_amount": "50",
            "issued_at": self.issued_at.isoformat(),
            "billing_start_date": self.issued_at.isoformat(),
        }
        if auto_enroll:
            data["course_0_auto_enroll"] = "true"
            data["course_1_auto_enroll"] = "true"
        return data

    def test_upload_without_auto_enroll_rejects_unenrolled_course(self):
        with schema_context(self.schema_name):
            UserCourse.objects.filter(
                user=self.student, course=self.course_c
            ).delete()
            resp = self._client(self.finance).post(
                "/api/v1/scan-transaction-screenshots",
                self._build_multi_course_body(auto_enroll=False),
                format="multipart",
            )
            self.assertEqual(resp.status_code, 403, resp.content)

    def test_upload_with_auto_enroll_creates_enrollment_and_payment(self):
        with schema_context(self.schema_name):
            UserCourse.objects.filter(
                user=self.student, course=self.course_c
            ).delete()
            resp = self._client(self.finance).post(
                "/api/v1/scan-transaction-screenshots",
                self._build_multi_course_body(auto_enroll=True),
                format="multipart",
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            self.assertTrue(
                UserCourse.objects.filter(
                    user=self.student,
                    course=self.course_c,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
            self.assertTrue(
                models.UserPayment.objects.filter(
                    user=self.student, course=self.course_c
                ).exists()
            )
