import unittest
from datetime import date, timedelta
from io import StringIO
from uuid import uuid4

from django.core.management import call_command
from django.db import connection, IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_finance.models import (
    PaymentReceipt,
    PaymentReceiptCounter,
    ReceiverSideScreenshot,
    UserPayment,
    UserPaymentGroup,
)
from app_finance.payment_group import rollup_payment_group_status
from app_finance.payment_receipt_number import (
    ensure_receipt_for_payment,
    ensure_receipts_for_payments,
    reconcile_payment_receipt_counter,
)
from app_finance.payment_verify import verify_screenshots_from_rows
from app_finance.services import mark_receiver_side_screenshots_matched
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PaymentReceiptNumberTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(
                schema_name=self.schema_name
            ).first()
        with schema_context(self.schema_name):
            PaymentReceiptCounter.objects.filter(pk=1).delete()
            PaymentReceipt.objects.all().delete()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            self.student = User.objects.create_user(
                email=f"stu-rcpt-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.staff = User.objects.create_user(
                email=f"staff-rcpt-{suffix}@example.com",
                password="x",
                name="Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.other_staff = User.objects.create_user(
                email=f"staff2-rcpt-{suffix}@example.com",
                password="x",
                name="Other Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _create_payment(self, *, status=UserPayment.Status.PENDING_VERIFICATION):
        with schema_context(self.schema_name):
            return UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id=f"rcpt-{uuid4().hex[:8]}",
                parsed_amount=Money(100, "USD"),
                status=status,
            )

    def _create_group(self, *, kind, count=2):
        group = UserPaymentGroup.objects.create(
            user=self.student,
            course=(
                None
                if kind == UserPaymentGroup.GroupKind.MULTI_COURSE
                else self.course
            ),
            group_kind=kind,
        )
        parts = [
            UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course,
                transaction_id=f"grp-{uuid4().hex[:8]}",
                parsed_amount=Money(100, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            for _ in range(count)
        ]
        return group, parts

    def _verify_via_helper(self, part, verifier):
        part.status = UserPayment.Status.VERIFIED
        part.verified_by = verifier
        receipt = ensure_receipt_for_payment(part)
        UserPayment.objects.filter(pk=part.pk).update(
            status=part.status,
            verified_by=verifier,
            receipt=receipt,
        )
        return receipt

    def test_receipt_numbers_are_unique_across_void_and_live_rows(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(
                number=41,
                receipt_date=timezone.now(),
            )
            PaymentReceipt.objects.create(
                number=42,
                receipt_date=timezone.now(),
                is_void=True,
                void_reason="superseded by receipt 41",
            )
            with self.assertRaises(IntegrityError), transaction.atomic():
                PaymentReceipt.objects.create(
                    number=42,
                    receipt_date=timezone.now(),
                )

    def test_standalone_payments_get_sequential_receipt_numbers(self):
        with schema_context(self.schema_name):
            p1 = self._create_payment()
            p1.status = UserPayment.Status.VERIFIED
            p1.save(update_fields=["status"])
            p2 = self._create_payment()
            p2.status = UserPayment.Status.VERIFIED
            p2.save(update_fields=["status"])
            p1.refresh_from_db()
            p2.refresh_from_db()
            self.assertEqual(p1.receipt.number, 1)
            self.assertEqual(p2.receipt.number, 2)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 3
            )

    def test_resaving_a_verified_payment_does_not_allocate_again(self):
        with schema_context(self.schema_name):
            payment = self._create_payment()
            payment.status = UserPayment.Status.VERIFIED
            payment.save(update_fields=["status"])
            payment.refresh_from_db()
            payment.save(update_fields=["remarks"])
            self.assertEqual(PaymentReceipt.objects.count(), 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )

    def test_group_parts_share_one_receipt_and_consume_one_number(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            receipts = [self._verify_via_helper(p, self.staff) for p in parts]
            self.assertEqual(len({r.id for r in receipts}), 1)
            self.assertEqual(receipts[0].number, 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )

    def test_later_part_joins_the_existing_receipt(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            first = self._verify_via_helper(parts[0], self.staff)
            second = self._verify_via_helper(parts[1], self.staff)
            self.assertEqual(first.id, second.id)
            self.assertEqual(PaymentReceipt.objects.count(), 1)

    def test_authorized_by_is_the_verifier_who_completed_the_receipt(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            self._verify_via_helper(parts[0], self.staff)
            receipt = self._verify_via_helper(parts[1], self.other_staff)
            receipt.refresh_from_db()
            self.assertEqual(receipt.authorized_by_id, self.other_staff.id)

    def test_unverified_payment_gets_no_receipt(self):
        with schema_context(self.schema_name):
            payment = self._create_payment()
            self.assertIsNone(ensure_receipt_for_payment(payment))
            self.assertEqual(PaymentReceipt.objects.count(), 0)

    def test_batch_allocation_does_not_double_number_an_unsaved_group(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE, count=3
            )
            for part in parts:
                part.status = UserPayment.Status.VERIFIED
                part.verified_by = self.staff
            changed = ensure_receipts_for_payments(parts)
            self.assertEqual(len(changed), 3)
            self.assertEqual(len({p.receipt_id for p in changed}), 1)
            self.assertEqual(PaymentReceipt.objects.count(), 1)

    def test_receipt_date_is_the_earliest_payment_date_in_the_group(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            early = timezone.now() - timedelta(days=5)
            late = timezone.now()
            UserPayment.objects.filter(pk=parts[0].pk).update(payment_date=late)
            UserPayment.objects.filter(pk=parts[1].pk).update(payment_date=early)
            parts[0].refresh_from_db()
            receipt = self._verify_via_helper(parts[0], self.staff)
            self.assertEqual(receipt.receipt_date, early)

    def test_bulk_verify_gives_a_multi_course_group_one_receipt(self):
        with schema_context(self.schema_name):
            group, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            tid = f"bulk-{uuid4().hex[:8]}"
            UserPayment.objects.filter(
                pk__in=[p.pk for p in parts]
            ).update(transaction_id=tid)
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": tid, "amount": 200}],
                actor=self.staff,
            )
            refreshed = list(
                UserPayment.objects.filter(group_id=group.id).select_related(
                    "receipt"
                )
            )
            self.assertEqual(
                {p.status for p in refreshed},
                {UserPayment.Status.VERIFIED},
            )
            self.assertEqual(len({p.receipt_id for p in refreshed}), 1)
            self.assertEqual(PaymentReceipt.objects.count(), 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )

    def test_receiver_side_match_creates_the_receipt_via_save(self):
        tid = f"rss-{uuid4().hex[:8]}"
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id=tid,
                parsed_amount=Money(50, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            ReceiverSideScreenshot.objects.create(
                transaction_id=tid,
                is_matched=False,
            )
            mark_receiver_side_screenshots_matched(tid, payment, actor=self.staff)
            payment.refresh_from_db()
            self.assertIsNotNone(payment.receipt_id)
            self.assertEqual(payment.receipt.number, 1)
            self.assertEqual(payment.receipt.authorized_by_id, self.staff.id)

    def test_partly_verified_group_is_numbered_but_not_downloadable(self):
        with schema_context(self.schema_name):
            group, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            parts[0].status = UserPayment.Status.VERIFIED
            parts[0].verified_by = self.staff
            parts[0].save(update_fields=["status", "verified_by"])
            parts[0].refresh_from_db()
            self.assertIsNotNone(parts[0].receipt_id)
            statuses = list(
                UserPayment.objects.filter(group_id=group.id).values_list(
                    "status", flat=True
                )
            )
            self.assertNotEqual(
                rollup_payment_group_status(statuses),
                UserPayment.Status.VERIFIED,
            )

    def _verified_payment_with_receipt(self):
        payment = self._create_payment()
        payment.status = UserPayment.Status.VERIFIED
        payment.save(update_fields=["status"])
        payment.refresh_from_db()
        return payment

    def test_reconcile_dry_run_does_not_write(self):
        with schema_context(self.schema_name):
            self._verified_payment_with_receipt()
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 500},
            )
            result = reconcile_payment_receipt_counter(dry_run=True)
            self.assertEqual(result["receipt_count"], 1)
            self.assertEqual(result["previous_next"], 500)
            self.assertEqual(result["new_next"], 2)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 500
            )

    def test_reconcile_realigns_counter_to_highest_issued_number(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(number=41, receipt_date=timezone.now())
            PaymentReceipt.objects.create(
                number=42,
                receipt_date=timezone.now(),
                is_void=True,
                void_reason="superseded by receipt 41",
            )
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 7},
            )
            result = reconcile_payment_receipt_counter(dry_run=False)
            self.assertEqual(result["new_next"], 43)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 43
            )

    def test_reconcile_never_renumbers_existing_receipts(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(number=90, receipt_date=timezone.now())
            reconcile_payment_receipt_counter(dry_run=False)
            self.assertEqual(
                list(PaymentReceipt.objects.values_list("number", flat=True)),
                [90],
            )

    def test_reset_command_dry_run_leaves_counter_alone(self):
        with schema_context(self.schema_name):
            self._verified_payment_with_receipt()
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 99},
            )
        out = StringIO()
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
            dry_run=True,
            stdout=out,
        )
        output = out.getvalue()
        self.assertIn("receipts=1", output)
        self.assertIn("-> 2", output)
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 99
            )

    def test_reset_command_apply_updates_counter(self):
        with schema_context(self.schema_name):
            for _ in range(2):
                self._verified_payment_with_receipt()
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
        )
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 3
            )
