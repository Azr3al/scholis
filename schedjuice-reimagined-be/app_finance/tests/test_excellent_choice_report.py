import unittest
from datetime import date, datetime, timedelta, timezone as dt_timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import (
    Category,
    Course,
    CourseSubject,
    Intake,
    Program,
    Subject,
    UserCourse,
)
from app_finance.excellent_choice_report import (
    excellent_choice_rows,
    excellent_choice_summary_row,
)
from app_finance.models import (
    PaymentBank,
    PaymentMethod,
    PaymentReceipt,
    UserPayment,
    UserPaymentDiscount,
    UserPaymentGroup,
)
from app_finance.payment_receipt_number import ensure_receipt_for_payment
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ExcellentChoiceReportProjectionTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.range_start = self.today.replace(day=1)
        self.range_end = self.today
        with schema_context(self.schema_name):
            PaymentReceipt.objects.all().delete()
            self.staff = User.objects.create_user(
                email=f"ec-staff-{suffix}@example.com",
                password="x",
                name="Verifier Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"ec-stu-{suffix}@example.com",
                password="x",
                name="Aye Aye",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"EC Cat {suffix}")
            prog = Program.objects.create(
                name=f"EC Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            self.intake_a = Intake.objects.create(
                name=f"Jan {suffix}",
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            self.intake_b = Intake.objects.create(
                name=f"Jul {suffix}",
                program=prog,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 12, 31),
            )
            self.subject_math = Subject.objects.create(name=f"Math {suffix}")
            self.subject_phy = Subject.objects.create(name=f"Physics {suffix}")
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=prog,
                intake=self.intake_a,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=prog,
                intake=self.intake_b,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.course_single = Course.objects.create(
                title=f"Course Single {suffix}",
                category=cat,
                program=prog,
                intake=self.intake_a,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            CourseSubject.objects.create(
                course=self.course_a,
                subject=self.subject_math,
                sort_order=0,
            )
            CourseSubject.objects.create(
                course=self.course_b,
                subject=self.subject_phy,
                sort_order=0,
            )
            CourseSubject.objects.create(
                course=self.course_single,
                subject=self.subject_math,
                sort_order=0,
            )
            for course in (self.course_a, self.course_b, self.course_single):
                UserCourse.objects.create(
                    user=self.student,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
            self.kpay = PaymentMethod.objects.create(
                name=f"KPay EC {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.cash = PaymentMethod.objects.create(
                name=f"Cash EC {suffix}",
                payment_bank=PaymentBank.CASH,
            )

    def _verify(self, part: UserPayment):
        part.status = UserPayment.Status.VERIFIED
        part.verified_by = self.staff
        part.payment_date = timezone.now()
        receipt = ensure_receipt_for_payment(part)
        UserPayment.objects.filter(pk=part.pk).update(
            status=part.status,
            verified_by=self.staff,
            payment_date=part.payment_date,
            receipt=receipt,
        )
        return receipt

    def _rows(self, date_from=None, date_to=None, org=None):
        with schema_context(self.schema_name):
            return excellent_choice_rows(
                date_from or self.range_start,
                date_to or self.range_end,
                org=org,
            )

    def _org(self):
        with schema_context(get_public_schema_name()):
            return Organization.objects.filter(schema_name=self.schema_name).first()

    def test_multi_course_group_produces_one_row_with_aligned_lines(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=None,
                group_kind=UserPaymentGroup.GroupKind.MULTI_COURSE,
            )
            part_a = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_a,
                transaction_id="TX-A",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            part_b = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_b,
                transaction_id="TX-B",
                parsed_amount=Money(200, "USD"),
                actual_amount=Money(200, "USD"),
                payment_method=self.cash,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            UserPaymentDiscount.objects.create(
                user_payment=part_a,
                label="Early bird",
                amount=Money(10, "USD"),
            )
            UserPaymentDiscount.objects.create(
                user_payment=part_b,
                label="Sibling",
                amount=Money(20, "USD"),
            )
            self._verify(part_a)
            self._verify(part_b)

        rows = self._rows()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["name"], "Aye Aye")
        self.assertEqual(row["cash_received"], "300")
        self.assertEqual(row["sub"].split("\n"), [self.subject_math.name, self.subject_phy.name])
        self.assertEqual(row["series"].split("\n"), [self.intake_a.name, self.intake_b.name])
        self.assertEqual(row["discount_type"].split("\n"), ["Early bird", "Sibling"])
        self.assertEqual(row["bank_ac"].split("\n"), [self.kpay.name, self.cash.name])
        self.assertEqual(row["transaction_id"].split("\n"), ["TX-A", "TX-B"])
        self.assertEqual(
            row["authorized_person"],
            f"{self.staff.name} ({self.staff.email})",
        )
        self.assertEqual(row["student_user_id"], self.student.id)
        self.assertEqual(row["student_email"], self.student.email)
        self.assertEqual(row["authorized_by_user_id"], self.staff.id)
        self.assertEqual(row["authorized_by_name"], self.staff.name)
        self.assertEqual(row["authorized_by_email"], self.staff.email)

    def test_split_screenshots_comma_joins_transaction_ids_on_one_line(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=self.course_single,
                group_kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS,
            )
            part_a = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_single,
                transaction_id="TX-1",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            part_b = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_single,
                transaction_id="TX-2",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                payment_method=self.cash,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part_a)
            self._verify(part_b)

        row = self._rows()[0]
        self.assertEqual(row["transaction_id"], "TX-1, TX-2")
        self.assertEqual(row["bank_ac"], f"{self.kpay.name}, {self.cash.name}")
        self.assertEqual(row["cash_received"], "100")

    def test_partially_verified_group_is_excluded(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=self.course_single,
                group_kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS,
            )
            part_a = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_single,
                transaction_id="PARTIAL-1",
                parsed_amount=Money(50, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_single,
                transaction_id="PARTIAL-2",
                parsed_amount=Money(50, "USD"),
                payment_method=self.cash,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part_a)

        self.assertEqual(self._rows(), [])

    def test_rows_ordered_by_most_recent_payment_date_first(self):
        tz = ZoneInfo("UTC")
        with schema_context(self.schema_name):
            older_date = timezone.now() - timedelta(days=10)
            newer_date = timezone.now() - timedelta(days=1)

            part_old = UserPayment.objects.create(
                user=self.student,
                course=self.course_single,
                transaction_id="SORT-OLD",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            receipt_old = self._verify(part_old)
            UserPayment.objects.filter(pk=part_old.pk).update(
                payment_date=older_date,
            )
            PaymentReceipt.objects.filter(pk=receipt_old.pk).update(
                receipt_date=older_date,
            )

            part_new = UserPayment.objects.create(
                user=self.student,
                course=self.course_single,
                transaction_id="SORT-NEW",
                parsed_amount=Money(75, "USD"),
                actual_amount=Money(75, "USD"),
                payment_method=self.cash,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            receipt_new = self._verify(part_new)
            UserPayment.objects.filter(pk=part_new.pk).update(
                payment_date=newer_date,
            )
            PaymentReceipt.objects.filter(pk=receipt_new.pk).update(
                receipt_date=newer_date,
            )

        rows = self._rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual(
            rows[0]["date"],
            newer_date.astimezone(tz).date().isoformat(),
        )
        self.assertEqual(
            rows[1]["date"],
            older_date.astimezone(tz).date().isoformat(),
        )

    def test_void_receipt_is_excluded(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(
                number=99991,
                receipt_date=timezone.now(),
                is_void=True,
                void_reason="legacy gap",
            )

        self.assertEqual(self._rows(), [])

    def test_shared_intake_collapses_series_to_one_line(self):
        with schema_context(self.schema_name):
            self.course_b.intake = self.intake_a
            self.course_b.save(update_fields=["intake"])
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=None,
                group_kind=UserPaymentGroup.GroupKind.MULTI_COURSE,
            )
            part_a = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_a,
                transaction_id="S-A",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            part_b = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_b,
                transaction_id="S-B",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part_a)
            self._verify(part_b)

        row = self._rows()[0]
        self.assertEqual(row["series"], self.intake_a.name)
        self.assertEqual(len(row["sub"].split("\n")), 2)

    def test_summary_row_totals_cash_received(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=None,
                group_kind=UserPaymentGroup.GroupKind.MULTI_COURSE,
            )
            part_a = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_a,
                transaction_id="SUM-A",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            part_b = UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course_b,
                transaction_id="SUM-B",
                parsed_amount=Money(200, "USD"),
                actual_amount=Money(200, "USD"),
                payment_method=self.cash,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part_a)
            self._verify(part_b)

        rows = self._rows()
        summary = excellent_choice_summary_row(rows)
        self.assertEqual(summary["date"], "SUM")
        self.assertEqual(summary["voucher_no"], "300")

    def test_display_date_uses_tenant_timezone(self):
        org = self._org()
        self.assertIsNotNone(org)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(pk=org.pk).update(timezone="Asia/Yangon")
            org.refresh_from_db()

        yangon = ZoneInfo("Asia/Yangon")
        payment_dt = datetime(2026, 7, 1, 18, 0, tzinfo=dt_timezone.utc)
        local_day = payment_dt.astimezone(yangon).date()

        with schema_context(self.schema_name):
            part = UserPayment.objects.create(
                user=self.student,
                course=self.course_single,
                transaction_id="TZ-DATE",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part)
            UserPayment.objects.filter(pk=part.pk).update(payment_date=payment_dt)

        rows = self._rows(
            date_from=local_day,
            date_to=local_day,
            org=org,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], local_day.isoformat())

    def test_filter_excludes_payment_outside_tenant_local_range(self):
        org = self._org()
        self.assertIsNotNone(org)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(pk=org.pk).update(timezone="Asia/Yangon")
            org.refresh_from_db()

        yangon = ZoneInfo("Asia/Yangon")
        payment_dt = datetime(2026, 7, 1, 18, 0, tzinfo=dt_timezone.utc)
        local_day = payment_dt.astimezone(yangon).date()
        previous_day = local_day - timedelta(days=1)

        with schema_context(self.schema_name):
            part = UserPayment.objects.create(
                user=self.student,
                course=self.course_single,
                transaction_id="TZ-FILTER",
                parsed_amount=Money(50, "USD"),
                actual_amount=Money(50, "USD"),
                payment_method=self.kpay,
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self._verify(part)
            UserPayment.objects.filter(pk=part.pk).update(payment_date=payment_dt)

        self.assertEqual(
            self._rows(date_from=previous_day, date_to=previous_day, org=org),
            [],
        )
        self.assertEqual(
            len(self._rows(date_from=local_day, date_to=local_day, org=org)),
            1,
        )
