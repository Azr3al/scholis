from __future__ import annotations

import base64
import io
import json
import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance import models
from app_finance.models import (
    Discount,
    PaymentBank,
    PaymentMethod,
    PaymentPlan,
)
from app_finance.payment_coverage import sync_user_payment_covered_months
from app_finance.payment_group import (
    create_multi_course_payment_group,
    create_shared_transaction_payment_groups,
    create_user_payment_group_with_parts,
    project_admin_report_rows,
)
from app_finance.payment_verify import verify_screenshots_from_rows
from app_finance.services import extract_receiver_ss_text_data
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _b64_json(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


class MultiCoursePaymentFixtureMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.issued_at = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-mc-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.hr_user = self.finance
            self.teacher = User.objects.create_user(
                email=f"tch-mc-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-mc-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-mc-{suffix}",
                price=Money(200, "USD"),
            )
            cat = Category.objects.create(name=f"Cat mc {suffix}")
            prog = Program.objects.create(
                name=f"P mc {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=prog,
                payment_plan=self.plan,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=prog,
                payment_plan=self.plan,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.course_c = Course.objects.create(
                title=f"Course C {suffix}",
                category=cat,
                program=prog,
                payment_plan=self.plan,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            for course in (self.course_a, self.course_b, self.course_c):
                UserCourse.objects.create(
                    user=self.student,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            self.payment_method = PaymentMethod.objects.create(
                name=f"KPay mc {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.early_bird_discount = Discount.objects.create(
                name=f"Early bird mc {suffix}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
                eligibility_type=Discount.EligibilityType.NONE,
            )
            self.bulk_discount = Discount.objects.create(
                name=f"Bulk mc {suffix}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(10, "USD"),
                scope=Discount.Scope.FIRST_PERIOD,
                eligibility_type=Discount.EligibilityType.NONE,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def make_uploaded_screenshot(self, name: str) -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            (
                b"GIF87a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00"
                b"\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00"
                b"\x00\x02\x02D\x01\x00;"
            ),
            content_type="image/gif",
        )

    def _allocation(self, *, course, amount, screenshot_index=0, transaction_id="TXN-1"):
        return {
            "course": course,
            "screenshot_index": screenshot_index,
            "screenshot": None,
            "parsed_amount": Decimal(amount),
            "payment_method": self.payment_method,
            "transaction_id": transaction_id,
        }


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseGroupCreateTests(MultiCoursePaymentFixtureMixin, TestCase):
    def test_siblings_sharing_a_transaction_are_not_marked_duplicated(self):
        with schema_context(self.schema_name):
            group = create_multi_course_payment_group(
                actor=self.hr_user,
                user=self.student,
                plan_fields={"issued_at": self.issued_at},
                allocations=[
                    self._allocation(course=self.course_a, amount="150"),
                    self._allocation(course=self.course_b, amount="50"),
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            statuses = set(group.parts.values_list("status", flat=True))
            self.assertEqual(
                statuses, {models.UserPayment.Status.PENDING_VERIFICATION}
            )

    def test_group_kind_and_course_identify_a_cross_course_group(self):
        with schema_context(self.schema_name):
            group = create_multi_course_payment_group(
                actor=self.hr_user,
                user=self.student,
                plan_fields={"issued_at": self.issued_at},
                allocations=[
                    self._allocation(course=self.course_a, amount="150"),
                    self._allocation(course=self.course_b, amount="50"),
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            self.assertEqual(
                group.group_kind, models.UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            self.assertIsNone(group.course_id)
            self.assertEqual(
                sorted(group.parts.values_list("course_id", flat=True)),
                sorted([self.course_a.id, self.course_b.id]),
            )

    def test_pricing_lands_on_the_first_row_of_each_course_only(self):
        with schema_context(self.schema_name):
            group = create_multi_course_payment_group(
                actor=self.hr_user,
                user=self.student,
                plan_fields={"issued_at": self.issued_at},
                allocations=[
                    self._allocation(course=self.course_a, amount="100"),
                    self._allocation(
                        course=self.course_a,
                        amount="50",
                        screenshot_index=1,
                        transaction_id="TXN-2",
                    ),
                    self._allocation(course=self.course_b, amount="50"),
                ],
                coverage_by_course={},
                amount_fields_by_course={
                    (self.student.id, self.course_a.id): {
                        "invoiced_amount": Money(150, "USD"),
                    },
                    (self.student.id, self.course_b.id): {
                        "invoiced_amount": Money(50, "USD"),
                    },
                },
            )
            rows = list(group.parts.order_by("id"))
            self.assertEqual(rows[0].invoiced_amount, Money(150, "USD"))
            self.assertIsNone(rows[1].invoiced_amount)
            self.assertEqual(rows[2].invoiced_amount, Money(50, "USD"))

    def test_same_course_and_transaction_twice_is_rejected(self):
        with schema_context(self.schema_name):
            with self.assertRaises(ValueError):
                create_multi_course_payment_group(
                    actor=self.hr_user,
                    user=self.student,
                    plan_fields={"issued_at": self.issued_at},
                    allocations=[
                        self._allocation(course=self.course_a, amount="100"),
                        self._allocation(course=self.course_a, amount="50"),
                    ],
                    coverage_by_course={},
                    amount_fields_by_course={},
                )

    def test_shared_screenshot_is_stored_once_and_reused_by_reference(self):
        with schema_context(self.schema_name):
            upload = self.make_uploaded_screenshot("shared.png")
            group = create_multi_course_payment_group(
                actor=self.hr_user,
                user=self.student,
                plan_fields={"issued_at": self.issued_at},
                allocations=[
                    {
                        **self._allocation(course=self.course_a, amount="150"),
                        "screenshot": upload,
                    },
                    {
                        **self._allocation(course=self.course_b, amount="50"),
                        "screenshot": upload,
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            names = list(
                group.parts.order_by("id").values_list("screenshot", flat=True)
            )
            self.assertEqual(len(set(names)), 1)
            self.assertTrue(names[0])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseUploadEndpointTests(MultiCoursePaymentFixtureMixin, TestCase):
    URL = "/api/v1/scan-transaction-screenshots"

    def _body(self, *, alloc_a="150", alloc_b="50", screenshot_total="200"):
        return {
            "user": self.student.id,
            "courses_count": "2",
            "course_0_id": self.course_a.id,
            "course_1_id": self.course_b.id,
            "screenshots_count": "1",
            "screenshot_0_screenshot": self.make_uploaded_screenshot("s.png"),
            "screenshot_0_parsed_amount": screenshot_total,
            "screenshot_0_payment_method": self.payment_method.id,
            "screenshot_0_transaction_id": "TXN-MC-1",
            "allocations_count": "2",
            "alloc_0_screenshot_index": "0",
            "alloc_0_course_id": self.course_a.id,
            "alloc_0_amount": alloc_a,
            "alloc_1_screenshot_index": "0",
            "alloc_1_course_id": self.course_b.id,
            "alloc_1_amount": alloc_b,
            "issued_at": self.issued_at.isoformat(),
        }

    def test_unbalanced_allocation_is_rejected_naming_the_screenshot(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                self.URL, self._body(alloc_b="40"), format="multipart"
            )
            self.assertEqual(resp.status_code, 400)
            errors = resp.json()["errors"]
            self.assertIn("screenshot_0_parsed_amount", errors)
            self.assertEqual(models.UserPaymentGroup.objects.count(), 0)
            self.assertEqual(models.UserPayment.objects.count(), 0)

    def test_multi_course_upload_without_screenshot_file_succeeds(self):
        with schema_context(self.schema_name):
            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_1_id": self.course_b.id,
                "screenshots_count": "1",
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-NO-SS",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_amount": "150",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": self.course_b.id,
                "alloc_1_amount": "50",
                "issued_at": self.issued_at.isoformat(),
            }
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 200, resp.content)
            group = models.UserPaymentGroup.objects.get()
            for part in group.parts.all():
                self.assertIsNone(part.screenshot.name if part.screenshot else None)

    def test_allocation_referencing_an_unlisted_course_is_rejected(self):
        with schema_context(self.schema_name):
            body = self._body()
            body["alloc_1_course_id"] = self.course_c.id
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 400)
            self.assertIn("alloc_1_course_id", resp.json()["errors"])

    def test_user_without_payment_record_is_denied(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                self.URL, self._body(), format="multipart"
            )
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(models.UserPayment.objects.count(), 0)

    def test_balanced_submission_creates_one_row_per_course_with_own_pricing(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                self.URL, self._body(), format="multipart"
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            group = models.UserPaymentGroup.objects.get()
            self.assertEqual(
                group.group_kind, models.UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            rows = {p.course_id: p for p in group.parts.all()}
            self.assertEqual(rows[self.course_a.id].parsed_amount, Money(150, "USD"))
            self.assertEqual(rows[self.course_b.id].parsed_amount, Money(50, "USD"))
            self.assertIsNotNone(rows[self.course_a.id].invoiced_amount)
            self.assertIsNotNone(rows[self.course_b.id].invoiced_amount)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseVerificationTests(MultiCoursePaymentFixtureMixin, TestCase):
    def _multi_course_group(self, amount_a="150", amount_b="50"):
        return create_multi_course_payment_group(
            actor=self.finance,
            user=self.student,
            plan_fields={"issued_at": self.issued_at},
            allocations=[
                {
                    "course": self.course_a,
                    "screenshot_index": 0,
                    "screenshot": None,
                    "parsed_amount": Decimal(amount_a),
                    "payment_method": self.payment_method,
                    "transaction_id": "TXN-SHARED",
                },
                {
                    "course": self.course_b,
                    "screenshot_index": 0,
                    "screenshot": None,
                    "parsed_amount": Decimal(amount_b),
                    "payment_method": self.payment_method,
                    "transaction_id": "TXN-SHARED",
                },
            ],
            coverage_by_course={},
            amount_fields_by_course={},
        )

    def test_bank_total_matching_the_sibling_sum_verifies_every_course_row(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group()
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": "TXN-SHARED", "amount": "200"}],
                actor=self.finance,
            )
            rows = list(group.parts.order_by("id"))
            self.assertEqual(
                [r.status for r in rows],
                [models.UserPayment.Status.VERIFIED] * 2,
            )
            self.assertEqual(rows[0].actual_amount, Money(150, "USD"))
            self.assertEqual(rows[1].actual_amount, Money(50, "USD"))

    def test_bank_total_below_the_sibling_sum_mismatches_every_course_row(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group()
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": "TXN-SHARED", "amount": "180"}],
                actor=self.finance,
            )
            statuses = set(group.parts.values_list("status", flat=True))
            self.assertEqual(statuses, {models.UserPayment.Status.AMOUNT_MISMATCH})
            self.assertIsNone(group.parts.order_by("id").last().actual_amount)

    def test_paid_to_date_is_isolated_per_course_after_verification(self):
        with schema_context(self.schema_name):
            self._multi_course_group()
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": "TXN-SHARED", "amount": "200"}],
                actor=self.finance,
            )
            rows = [
                {"user": {"id": self.student.id}, "course": {"id": self.course_a.id}},
                {"user": {"id": self.student.id}, "course": {"id": self.course_b.id}},
            ]
            from app_finance.payment_context import attach_course_payment_context

            attach_course_payment_context(rows)
            self.assertEqual(Decimal(rows[0]["paid_to_date"]), Decimal("150"))
            self.assertEqual(Decimal(rows[1]["paid_to_date"]), Decimal("50"))


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseReportRowTests(MultiCoursePaymentFixtureMixin, TestCase):
    def _alloc(self, course, amount, *, screenshot_index=0, tid="TXN-SHARED"):
        return {
            "course": course,
            "screenshot_index": screenshot_index,
            "screenshot": None,
            "parsed_amount": Decimal(amount),
            "payment_method": self.payment_method,
            "transaction_id": tid,
        }

    def _multi_course_group_with_titles(self, amount_fields_by_course=None):
        return create_multi_course_payment_group(
            actor=self.finance,
            user=self.student,
            plan_fields={"issued_at": self.issued_at},
            allocations=[
                self._alloc(self.course_a, "150"),
                self._alloc(self.course_b, "50"),
            ],
            coverage_by_course={},
            amount_fields_by_course=amount_fields_by_course or {},
        )

    def _multi_course_group_with_discounts(self):
        from app_finance.payment_discount_apply import (
            apply_discount_and_amount_fields,
        )

        amount_fields_by_course = {}
        for course, discount in (
            (self.course_a, self.early_bird_discount),
            (self.course_b, self.bulk_discount),
        ):
            amount_fields_by_course[(self.student.id, course.id)] = (
                apply_discount_and_amount_fields(
                    user=self.student,
                    course=course,
                    request_user=self.finance,
                    org=None,
                    discount_ids=[discount.id],
                )
            )
        return self._multi_course_group_with_titles(amount_fields_by_course)

    def _split_screenshot_group(self):
        return create_user_payment_group_with_parts(
            actor=self.finance,
            user=self.student,
            course=self.course_a,
            plan_fields={"issued_at": self.issued_at},
            coverage=None,
            parts=[
                {
                    "screenshot": None,
                    "parsed_amount": Decimal("100"),
                    "payment_method": self.payment_method,
                    "transaction_id": "TXN-SPLIT-1",
                },
                {
                    "screenshot": None,
                    "parsed_amount": Decimal("50"),
                    "payment_method": self.payment_method,
                    "transaction_id": "TXN-SPLIT-2",
                },
            ],
        )

    def test_payment_row_names_the_other_courses_on_a_shared_screenshot(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group_with_titles()
            rows = project_admin_report_rows(
                list(group.parts.select_related("course", "group"))
            )
            group_row = rows[0]
            part_a = next(
                p
                for p in group_row["parts"]
                if p["course"]["id"] == self.course_a.id
            )
            self.assertEqual(
                [c["title"] for c in part_a["shared_screenshot_courses"]],
                [self.course_b.title],
            )

    def test_cross_course_group_row_reports_multiple_and_lists_every_course(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group_with_titles()
            group_row = project_admin_report_rows(
                list(group.parts.select_related("course", "group"))
            )[0]
            self.assertEqual(group_row["course"], {"id": None, "title": "Multiple"})
            self.assertEqual(
                sorted(c["id"] for c in group_row["courses"]),
                sorted([self.course_a.id, self.course_b.id]),
            )
            self.assertEqual(
                group_row["group_kind"],
                models.UserPaymentGroup.GroupKind.MULTI_COURSE,
            )

    def test_cross_course_group_discount_lines_are_labelled_per_course(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group_with_discounts()
            group_row = project_admin_report_rows(
                list(group.parts.select_related("course", "group"))
            )[0]
            labels = [line["label"] for line in group_row["discount_lines"]]
            self.assertTrue(
                any(label.startswith(self.course_a.title) for label in labels)
            )
            self.assertTrue(
                any(label.startswith(self.course_b.title) for label in labels)
            )

    def test_split_screenshot_group_row_keeps_its_single_course(self):
        with schema_context(self.schema_name):
            group = self._split_screenshot_group()
            group_row = project_admin_report_rows(
                list(group.parts.select_related("course", "group"))
            )[0]
            self.assertEqual(group_row["course"]["id"], self.course_a.id)
            self.assertEqual(group_row["courses"], [])

    def test_course_scoped_group_row_lists_sibling_courses_and_transaction_id(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group_with_titles()
            part_a = (
                group.parts.select_related(
                    "course", "group", "user", "payment_method", "receipt"
                )
                .prefetch_related(
                    "covered_months",
                    "payment_discounts",
                    "group__parts__course",
                )
                .get(course=self.course_a)
            )
            group_row = project_admin_report_rows([part_a])[0]
            self.assertEqual(group_row["transaction_id"], "TXN-SHARED")
            self.assertEqual(group_row["course"]["id"], self.course_a.id)
            self.assertEqual(
                [c["title"] for c in group_row["shared_screenshot_courses"]],
                [self.course_b.title],
            )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseSearchSerializerTests(MultiCoursePaymentFixtureMixin, TestCase):
    """`user-payments/search` must carry group identity, or recent transactions
    cannot route to the shared receipt or name the sibling courses."""

    #: Mirrors the field list the recent-transactions page asks for.
    SEARCH_FIELDS = ["id", "group_id", "shared_screenshot_courses"]

    def _search(self):
        return self._client(self.finance).post(
            "/api/v1/user-payments/search",
            {"filter_params": []},
            format="json",
            QUERY_STRING=f"size=-1&fields={_b64_json(self.SEARCH_FIELDS)}",
        )

    def _multi_course_group(self):
        return create_multi_course_payment_group(
            actor=self.finance,
            user=self.student,
            plan_fields={"issued_at": self.issued_at},
            allocations=[
                self._allocation(course=self.course_a, amount="150"),
                self._allocation(course=self.course_b, amount="50"),
            ],
            coverage_by_course={},
            amount_fields_by_course={},
        )

    def test_search_returns_group_id_and_sibling_courses_for_a_group_part(self):
        with schema_context(self.schema_name):
            group = self._multi_course_group()
            part_a = group.parts.get(course=self.course_a)

            resp = self._search()
            self.assertEqual(resp.status_code, 200, resp.content)
            rows = {row["id"]: row for row in resp.json()["data"]}

            row = rows[part_a.id]
            self.assertEqual(row["group_id"], group.id)
            self.assertEqual(
                [c["title"] for c in row["shared_screenshot_courses"]],
                [self.course_b.title],
            )

    def test_search_reports_no_siblings_for_a_standalone_payment(self):
        with schema_context(self.schema_name):
            standalone = models.UserPayment.objects.create(
                user=self.student,
                course=self.course_c,
                payment_method=self.payment_method,
                parsed_amount=Money(200, "USD"),
                transaction_id="TXN-STANDALONE",
                issued_at=self.issued_at,
            )

            resp = self._search()
            self.assertEqual(resp.status_code, 200, resp.content)
            row = next(
                r for r in resp.json()["data"] if r["id"] == standalone.id
            )
            self.assertIsNone(row["group_id"])
            self.assertEqual(row["shared_screenshot_courses"], [])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseOcrDuplicateTests(MultiCoursePaymentFixtureMixin, TestCase):
    def _ocr_detect_payload(self, *, transaction_id: str, amount: int):
        return {
            "bank": "KPAY",
            "transaction_id": transaction_id,
            "amount": [amount],
            "json_ocr_data": {
                "transaction_id": transaction_id,
                "amount": [amount],
            },
        }

    def _multi_course_group_awaiting_ocr(self):
        upload = self.make_uploaded_screenshot("shared.gif")
        return create_multi_course_payment_group(
            actor=self.finance,
            user=self.student,
            plan_fields={"issued_at": self.issued_at},
            allocations=[
                {
                    "course": self.course_a,
                    "screenshot_index": 0,
                    "screenshot": upload,
                    "parsed_amount": None,
                    "payment_method": self.payment_method,
                    "transaction_id": None,
                },
                {
                    "course": self.course_b,
                    "screenshot_index": 0,
                    "screenshot": upload,
                    "parsed_amount": None,
                    "payment_method": self.payment_method,
                    "transaction_id": None,
                },
            ],
            coverage_by_course={},
            amount_fields_by_course={},
        )

    @patch("app_finance.services.mark_receiver_side_screenshots_matched")
    @patch("app_finance.services.image_to_text")
    @patch("app_finance.services.detect_and_extract")
    def test_ocr_does_not_duplicate_sibling_in_same_group(
        self, mock_detect, mock_image, mock_rss
    ):
        mock_image.return_value = {}
        mock_detect.return_value = self._ocr_detect_payload(
            transaction_id="TXN-OCR-SIB", amount=50
        )
        with schema_context(self.schema_name):
            group = self._multi_course_group_awaiting_ocr()
            parts = list(group.parts.order_by("id"))
            parts[0].transaction_id = "TXN-OCR-SIB"
            parts[0].parsed_amount = Money(150, "USD")
            parts[0].status = models.UserPayment.Status.PENDING_VERIFICATION
            parts[0].save()

            extract_receiver_ss_text_data(parts[1].id, self.schema_name)
            parts[1].refresh_from_db()
            self.assertEqual(
                parts[1].status, models.UserPayment.Status.PENDING_VERIFICATION
            )
            self.assertEqual(parts[1].transaction_id, "TXN-OCR-SIB")
            mock_rss.assert_not_called()

    @patch("app_finance.services.mark_receiver_side_screenshots_matched")
    @patch("app_finance.services.image_to_text")
    @patch("app_finance.services.detect_and_extract")
    def test_ocr_does_not_flag_payment_against_itself(
        self, mock_detect, mock_image, mock_rss
    ):
        mock_image.return_value = {}
        mock_detect.return_value = self._ocr_detect_payload(
            transaction_id="TXN-SELF", amount=100
        )
        with schema_context(self.schema_name):
            payment = models.UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                payment_method=self.payment_method,
                screenshot="payments/self.gif",
                transaction_id="TXN-SELF",
                status=models.UserPayment.Status.AWAITING_EXTRACTION,
            )
            extract_receiver_ss_text_data(payment.id, self.schema_name)
            payment.refresh_from_db()
            self.assertEqual(
                payment.status, models.UserPayment.Status.PENDING_VERIFICATION
            )
            mock_rss.assert_called_once()

    @patch("app_finance.services.mark_receiver_side_screenshots_matched")
    @patch("app_finance.services.image_to_text")
    @patch("app_finance.services.detect_and_extract")
    def test_ocr_still_duplicates_against_external_payment(
        self, mock_detect, mock_image, mock_rss
    ):
        mock_image.return_value = {}
        mock_detect.return_value = self._ocr_detect_payload(
            transaction_id="TXN-EXT", amount=50
        )
        with schema_context(self.schema_name):
            models.UserPayment.objects.create(
                user=self.student,
                course=self.course_c,
                payment_method=self.payment_method,
                transaction_id="TXN-EXT",
                parsed_amount=Money(200, "USD"),
                status=models.UserPayment.Status.VERIFIED,
            )
            group = self._multi_course_group_awaiting_ocr()
            part = group.parts.order_by("id").last()
            extract_receiver_ss_text_data(part.id, self.schema_name)
            part.refresh_from_db()
            self.assertEqual(part.status, models.UserPayment.Status.DUPLICATED)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiCourseCoverageUploadTests(MultiCoursePaymentFixtureMixin, TestCase):
    URL = "/api/v1/scan-transaction-screenshots"
    ADMIN_URL = "/api/v1/user-payments/admin-report"

    def _admin_payload(self, *, course_id: int, year: int, month: int) -> dict:
        month_start = timezone.make_aware(datetime(year, month, 1, 12, 0, 0))
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": str(course_id),
                },
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": month_start.isoformat(),
                },
            ],
            "exclude_params": [],
        }

    def test_covered_months_make_upload_visible_in_course_month(self):
        with schema_context(self.schema_name):
            self.course_a.start_date = date(2026, 10, 3)
            self.course_a.end_date = date(2027, 2, 28)
            self.course_a.save(update_fields=["start_date", "end_date"])
            self.course_b.start_date = date(2026, 10, 3)
            self.course_b.end_date = date(2027, 2, 28)
            self.course_b.save(update_fields=["start_date", "end_date"])

            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_0_covered_months": json.dumps(
                    [{"year": 2026, "month_index": 10}]
                ),
                "course_1_id": self.course_b.id,
                "course_1_covered_months": json.dumps(
                    [{"year": 2026, "month_index": 10}]
                ),
                "screenshots_count": "1",
                "screenshot_0_screenshot": self.make_uploaded_screenshot("s.png"),
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-COV-1",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_amount": "150",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": self.course_b.id,
                "alloc_1_amount": "50",
                "issued_at": self.issued_at.isoformat(),
            }
            upload = self._client(self.finance).post(
                self.URL, body, format="multipart"
            )
            self.assertEqual(upload.status_code, 200, upload.content)

            report = self._client(self.finance).post(
                self.ADMIN_URL,
                self._admin_payload(
                    course_id=self.course_a.id, year=2026, month=10
                ),
                format="json",
            )
            self.assertEqual(report.status_code, 200, report.content)
            payload = report.json()
            self.assertTrue(payload["month_applicable"])
            user_ids = [row["user"]["id"] for row in payload["data"]]
            self.assertIn(self.student.id, user_ids)

    def test_malformed_course_covered_months_returns_400(self):
        with schema_context(self.schema_name):
            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_0_covered_months": "not-json",
                "course_1_id": self.course_b.id,
                "screenshots_count": "1",
                "screenshot_0_screenshot": self.make_uploaded_screenshot("s.png"),
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-BAD",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_amount": "150",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": self.course_b.id,
                "alloc_1_amount": "50",
                "issued_at": self.issued_at.isoformat(),
            }
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 400)
            self.assertIn("course_0_covered_months", resp.json()["errors"])

    def test_per_course_installment_already_covered_returns_400_keyed_by_course(
        self,
    ):
        with schema_context(self.schema_name):
            self.course_a.start_date = date(2026, 10, 3)
            self.course_a.end_date = date(2027, 2, 28)
            self.course_a.save(update_fields=["start_date", "end_date"])

            existing = models.UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                parsed_amount=Money(100, "USD"),
                status=models.UserPayment.Status.VERIFIED,
                issued_at=self.issued_at,
            )
            sync_user_payment_covered_months(
                existing, [{"year": 2026, "month_index": 10}]
            )

            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_0_is_installment": "true",
                "course_0_installment_through_month": json.dumps(
                    {"year": 2026, "month_index": 10}
                ),
                "course_1_id": self.course_b.id,
                "course_1_covered_months": json.dumps(
                    [{"year": 2026, "month_index": 10}]
                ),
                "screenshots_count": "1",
                "screenshot_0_screenshot": self.make_uploaded_screenshot("s2.png"),
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-INST-DUP",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_amount": "100",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": self.course_b.id,
                "alloc_1_amount": "100",
                "issued_at": self.issued_at.isoformat(),
            }
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 400, resp.content)
            errors = resp.json()["errors"]
            self.assertIn("course_0_installment_through_month", errors)
            self.assertIn("already covered", str(errors["course_0_installment_through_month"]).lower())

    def test_mixed_coverage_plans_in_one_payment(self):
        with schema_context(self.schema_name):
            self.course_a.start_date = date(2026, 10, 3)
            self.course_a.end_date = date(2027, 2, 28)
            self.course_a.save(update_fields=["start_date", "end_date"])
            self.course_b.start_date = date(2026, 10, 3)
            self.course_b.end_date = date(2027, 2, 28)
            self.course_b.save(update_fields=["start_date", "end_date"])

            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_0_covered_months": json.dumps(
                    [{"year": 2026, "month_index": 10}]
                ),
                "course_1_id": self.course_b.id,
                "course_1_is_installment": "true",
                "course_1_installment_through_month": json.dumps(
                    {"year": 2026, "month_index": 11}
                ),
                "screenshots_count": "1",
                "screenshot_0_screenshot": self.make_uploaded_screenshot("s.png"),
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-MIX-1",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_amount": "100",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": self.course_b.id,
                "alloc_1_amount": "100",
                "issued_at": self.issued_at.isoformat(),
            }
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 200, resp.content)

            group = models.UserPaymentGroup.objects.get()
            part_a = group.parts.get(course=self.course_a)
            part_b = group.parts.get(course=self.course_b)

            self.assertFalse(part_a.is_installment)
            self.assertTrue(part_b.is_installment)
            self.assertEqual(
                list(
                    part_a.covered_months.order_by("year", "month_index").values_list(
                        "year", "month_index"
                    )
                ),
                [(2026, 10)],
            )
            self.assertEqual(
                list(
                    part_b.covered_months.order_by("year", "month_index").values_list(
                        "year", "month_index"
                    )
                ),
                [(2026, 10), (2026, 11)],
            )
            self.assertEqual(group.issued_at.month, 10)
            self.assertEqual(group.issued_at.year, 2026)
            self.assertFalse(group.is_installment)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class BackfillMultiCourseCoverageCommandTests(MultiCoursePaymentFixtureMixin, TestCase):
    def test_backfill_assigns_full_course_range_when_missing_coverage(self):
        with schema_context(self.schema_name):
            self.course_a.start_date = date(2026, 10, 3)
            self.course_a.end_date = date(2026, 12, 31)
            self.course_a.save(update_fields=["start_date", "end_date"])
            group = create_multi_course_payment_group(
                actor=self.finance,
                user=self.student,
                plan_fields={"issued_at": self.issued_at},
                allocations=[
                    self._allocation(course=self.course_a, amount="100"),
                    self._allocation(course=self.course_b, amount="100"),
                ],
                coverage_by_course={
                    (self.student.id, self.course_a.id): None,
                    (self.student.id, self.course_b.id): None,
                },
                amount_fields_by_course={},
            )
            part = group.parts.filter(course=self.course_a).first()
            self.assertEqual(part.covered_months.count(), 0)

            out = io.StringIO()
            call_command(
                "backfill-multi-course-payment-coverage",
                schema_name=self.schema_name,
                dry_run=True,
                stdout=out,
            )
            self.assertIn("Would update", out.getvalue())
            part.refresh_from_db()
            self.assertEqual(part.covered_months.count(), 0)

            call_command(
                "backfill-multi-course-payment-coverage",
                schema_name=self.schema_name,
                stdout=out,
            )
            part.refresh_from_db()
            self.assertGreaterEqual(part.covered_months.count(), 1)
            self.assertEqual(part.issued_at.month, 10)
            self.assertEqual(part.issued_at.year, 2026)

    def test_backfill_assigns_coverage_to_orphaned_standalone_multi_course_payments(
        self,
    ):
        with schema_context(self.schema_name):
            self.course_a.start_date = date(2026, 10, 3)
            self.course_a.end_date = date(2026, 12, 31)
            self.course_a.save(update_fields=["start_date", "end_date"])
            self.course_b.start_date = date(2026, 10, 1)
            self.course_b.end_date = date(2027, 1, 31)
            self.course_b.save(update_fields=["start_date", "end_date"])

            txn = f"TXN-orphan-{uuid4().hex[:8]}"
            issued_at = timezone.make_aware(datetime(2026, 7, 1, 0, 0, 0))
            pay_a = models.UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                created_by=self.finance,
                issued_at=issued_at,
                payment_method=self.payment_method,
                transaction_id=txn,
                status=models.UserPayment.Status.PENDING_VERIFICATION,
                parsed_amount=Money(100, "USD"),
            )
            pay_b = models.UserPayment.objects.create(
                user=self.student,
                course=self.course_b,
                created_by=self.finance,
                issued_at=issued_at,
                payment_method=self.payment_method,
                transaction_id=txn,
                status=models.UserPayment.Status.PENDING_VERIFICATION,
                parsed_amount=Money(100, "USD"),
            )
            self.assertEqual(pay_a.covered_months.count(), 0)
            self.assertEqual(pay_b.covered_months.count(), 0)

            call_command(
                "backfill-multi-course-payment-coverage",
                schema_name=self.schema_name,
            )

            pay_a.refresh_from_db()
            pay_b.refresh_from_db()
            self.assertGreaterEqual(pay_a.covered_months.count(), 1)
            self.assertEqual(pay_a.issued_at.month, 10)
            self.assertEqual(pay_a.issued_at.year, 2026)
            self.assertGreaterEqual(pay_b.covered_months.count(), 1)
            self.assertEqual(pay_b.issued_at.month, 10)
            self.assertEqual(pay_b.issued_at.year, 2026)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class MultiStudentSharedPaymentTests(MultiCoursePaymentFixtureMixin, TestCase):
    URL = "/api/v1/scan-transaction-screenshots"

    def setUp(self):
        super().setUp()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.student_b = User.objects.create_user(
                email=f"stu-mc-b-{suffix}@example.com",
                password="x",
                name="Student B",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            for course in (self.course_a, self.course_b):
                UserCourse.objects.create(
                    user=self.student_b,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )

    def _multi_student_body(self):
        return {
            "user": self.student.id,
            "courses_count": "2",
            "course_0_id": self.course_a.id,
            "course_0_user": self.student.id,
            "course_1_id": self.course_b.id,
            "course_1_user": self.student_b.id,
            "screenshots_count": "1",
            "screenshot_0_screenshot": self.make_uploaded_screenshot("shared.png"),
            "screenshot_0_parsed_amount": "200",
            "screenshot_0_payment_method": self.payment_method.id,
            "screenshot_0_transaction_id": "TXN-SHARED-STU",
            "allocations_count": "2",
            "alloc_0_screenshot_index": "0",
            "alloc_0_course_id": self.course_a.id,
            "alloc_0_user": self.student.id,
            "alloc_0_amount": "150",
            "alloc_1_screenshot_index": "0",
            "alloc_1_course_id": self.course_b.id,
            "alloc_1_user": self.student_b.id,
            "alloc_1_amount": "50",
            "issued_at": self.issued_at.isoformat(),
        }

    def test_shared_transaction_across_students_is_not_marked_duplicated(self):
        with schema_context(self.schema_name):
            groups = create_shared_transaction_payment_groups(
                actor=self.finance,
                plan_fields={"issued_at": self.issued_at},
                student_allocations=[
                    {
                        "user": self.student,
                        "allocations": [
                            self._allocation(
                                course=self.course_a,
                                amount="150",
                                transaction_id="TXN-BATCH-1",
                            ),
                        ],
                    },
                    {
                        "user": self.student_b,
                        "allocations": [
                            self._allocation(
                                course=self.course_b,
                                amount="50",
                                transaction_id="TXN-BATCH-1",
                            ),
                        ],
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            self.assertEqual(len(groups), 2)
            batch_key = groups[0].shared_transaction_key
            self.assertEqual(groups[1].shared_transaction_key, batch_key)
            statuses = set(
                models.UserPayment.objects.filter(
                    group__shared_transaction_key=batch_key
                ).values_list("status", flat=True)
            )
            self.assertEqual(
                statuses, {models.UserPayment.Status.PENDING_VERIFICATION}
            )

    def test_external_duplicate_still_flags_both_students(self):
        with schema_context(self.schema_name):
            models.UserPayment.objects.create(
                user=self.student,
                course=self.course_c,
                payment_method=self.payment_method,
                transaction_id="TXN-EXT-BATCH",
                parsed_amount=Money(200, "USD"),
                status=models.UserPayment.Status.VERIFIED,
            )
            groups = create_shared_transaction_payment_groups(
                actor=self.finance,
                plan_fields={"issued_at": self.issued_at},
                student_allocations=[
                    {
                        "user": self.student,
                        "allocations": [
                            self._allocation(
                                course=self.course_a,
                                amount="150",
                                transaction_id="TXN-EXT-BATCH",
                            ),
                        ],
                    },
                    {
                        "user": self.student_b,
                        "allocations": [
                            self._allocation(
                                course=self.course_b,
                                amount="50",
                                transaction_id="TXN-EXT-BATCH",
                            ),
                        ],
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            statuses = set(
                models.UserPayment.objects.filter(
                    group_id__in=[g.id for g in groups]
                ).values_list("status", flat=True)
            )
            self.assertEqual(statuses, {models.UserPayment.Status.DUPLICATED})

    def test_same_course_for_two_students_creates_two_groups(self):
        with schema_context(self.schema_name):
            groups = create_shared_transaction_payment_groups(
                actor=self.finance,
                plan_fields={"issued_at": self.issued_at},
                student_allocations=[
                    {
                        "user": self.student,
                        "allocations": [
                            self._allocation(
                                course=self.course_a,
                                amount="100",
                                transaction_id="TXN-SAME-COURSE",
                            ),
                        ],
                    },
                    {
                        "user": self.student_b,
                        "allocations": [
                            self._allocation(
                                course=self.course_a,
                                amount="100",
                                transaction_id="TXN-SAME-COURSE",
                            ),
                        ],
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            self.assertEqual(len(groups), 2)
            self.assertEqual(
                {g.user_id for g in groups},
                {self.student.id, self.student_b.id},
            )
            self.assertEqual(
                models.UserPayment.objects.filter(
                    course=self.course_a,
                    group_id__in=[g.id for g in groups],
                ).count(),
                2,
            )

    def test_enrollment_failure_rolls_back_entire_batch(self):
        with schema_context(self.schema_name):
            unenrolled_course = Course.objects.create(
                title=f"Unenrolled {uuid4().hex[:6]}",
                category=self.course_a.category,
                program=self.course_a.program,
                payment_plan=self.plan,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            body = {
                "user": self.student.id,
                "courses_count": "2",
                "course_0_id": self.course_a.id,
                "course_0_user": self.student.id,
                "course_1_id": unenrolled_course.id,
                "course_1_user": self.student_b.id,
                "screenshots_count": "1",
                "screenshot_0_screenshot": self.make_uploaded_screenshot("shared.png"),
                "screenshot_0_parsed_amount": "200",
                "screenshot_0_payment_method": self.payment_method.id,
                "screenshot_0_transaction_id": "TXN-SHARED-STU",
                "allocations_count": "2",
                "alloc_0_screenshot_index": "0",
                "alloc_0_course_id": self.course_a.id,
                "alloc_0_user": self.student.id,
                "alloc_0_amount": "150",
                "alloc_1_screenshot_index": "0",
                "alloc_1_course_id": unenrolled_course.id,
                "alloc_1_user": self.student_b.id,
                "alloc_1_amount": "50",
                "issued_at": self.issued_at.isoformat(),
            }
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(models.UserPaymentGroup.objects.count(), 0)
            self.assertEqual(models.UserPayment.objects.count(), 0)

    def test_cross_student_unbalanced_allocation_is_rejected(self):
        with schema_context(self.schema_name):
            body = self._multi_student_body()
            body["alloc_1_amount"] = "40"
            resp = self._client(self.finance).post(self.URL, body, format="multipart")
            self.assertEqual(resp.status_code, 400)
            self.assertIn("screenshot_0_parsed_amount", resp.json()["errors"])
            self.assertEqual(models.UserPaymentGroup.objects.count(), 0)

    def test_multi_student_upload_endpoint_creates_per_student_groups(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                self.URL, self._multi_student_body(), format="multipart"
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            payload = resp.json()["data"]
            self.assertEqual(len(payload["groups"]), 2)
            self.assertEqual(models.UserPaymentGroup.objects.count(), 2)
            batch_keys = set(
                models.UserPaymentGroup.objects.values_list(
                    "shared_transaction_key", flat=True
                )
            )
            self.assertEqual(len(batch_keys), 1)
            self.assertIsNotNone(next(iter(batch_keys)))

    def test_bank_statement_match_verifies_all_batch_siblings(self):
        from app_finance.services import mark_receiver_side_screenshots_matched

        with schema_context(self.schema_name):
            groups = create_shared_transaction_payment_groups(
                actor=self.finance,
                plan_fields={"issued_at": self.issued_at},
                student_allocations=[
                    {
                        "user": self.student,
                        "allocations": [
                            self._allocation(
                                course=self.course_a,
                                amount="150",
                                transaction_id="TXN-RSS-BATCH",
                            ),
                        ],
                    },
                    {
                        "user": self.student_b,
                        "allocations": [
                            self._allocation(
                                course=self.course_b,
                                amount="50",
                                transaction_id="TXN-RSS-BATCH",
                            ),
                        ],
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            first_part = groups[0].parts.first()
            models.ReceiverSideScreenshot.objects.create(
                transaction_id="TXN-RSS-BATCH",
                is_matched=False,
            )
            mark_receiver_side_screenshots_matched(
                "TXN-RSS-BATCH", first_part, actor=self.finance
            )
            statuses = set(
                models.UserPayment.objects.filter(
                    group__shared_transaction_key=groups[0].shared_transaction_key
                ).values_list("status", flat=True)
            )
            self.assertEqual(statuses, {models.UserPayment.Status.VERIFIED})

    @patch("app_finance.services.mark_receiver_side_screenshots_matched")
    @patch("app_finance.services.image_to_text")
    @patch("app_finance.services.detect_and_extract")
    def test_ocr_does_not_duplicate_sibling_in_same_batch(
        self, mock_detect, mock_image, mock_rss
    ):
        mock_image.return_value = {}
        mock_detect.return_value = {
            "bank": "KPAY",
            "transaction_id": "TXN-OCR-BATCH",
            "amount": [50],
            "json_ocr_data": {
                "transaction_id": "TXN-OCR-BATCH",
                "amount": [50],
            },
        }
        with schema_context(self.schema_name):
            upload = self.make_uploaded_screenshot("shared.gif")
            groups = create_shared_transaction_payment_groups(
                actor=self.finance,
                plan_fields={"issued_at": self.issued_at},
                student_allocations=[
                    {
                        "user": self.student,
                        "allocations": [
                            {
                                "course": self.course_a,
                                "screenshot_index": 0,
                                "screenshot": upload,
                                "parsed_amount": None,
                                "payment_method": self.payment_method,
                                "transaction_id": None,
                            },
                        ],
                    },
                    {
                        "user": self.student_b,
                        "allocations": [
                            {
                                "course": self.course_b,
                                "screenshot_index": 0,
                                "screenshot": upload,
                                "parsed_amount": None,
                                "payment_method": self.payment_method,
                                "transaction_id": None,
                            },
                        ],
                    },
                ],
                coverage_by_course={},
                amount_fields_by_course={},
            )
            parts = list(
                models.UserPayment.objects.filter(
                    group__shared_transaction_key=groups[0].shared_transaction_key
                ).order_by("id")
            )
            parts[0].transaction_id = "TXN-OCR-BATCH"
            parts[0].parsed_amount = Money(150, "USD")
            parts[0].status = models.UserPayment.Status.PENDING_VERIFICATION
            parts[0].save()

            extract_receiver_ss_text_data(parts[1].id, self.schema_name)
            parts[1].refresh_from_db()
            self.assertEqual(
                parts[1].status, models.UserPayment.Status.PENDING_VERIFICATION
            )
            self.assertEqual(parts[1].transaction_id, "TXN-OCR-BATCH")
            mock_rss.assert_not_called()
