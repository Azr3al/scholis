from datetime import datetime, timedelta, timezone as dt_timezone

from django.test import SimpleTestCase

from app_finance.payment_receipt_backfill import plan_receipt_backfill

BASE = datetime(2026, 5, 1, tzinfo=dt_timezone.utc)
FALLBACK = datetime(2026, 12, 31, tzinfo=dt_timezone.utc)


def _row(**kwargs):
    row = {
        "id": 1,
        "group_id": None,
        "receipt_number": None,
        "payment_date": BASE,
        "created_at": BASE,
        "verified_at": BASE,
        "verified_by_id": None,
    }
    row.update(kwargs)
    return row


class PlanReceiptBackfillTests(SimpleTestCase):
    def test_group_adopts_lowest_number_and_voids_the_surplus(self):
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41),
                _row(id=2, group_id=9, receipt_number=42),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual([r.number for r in plan.receipts], [41])
        self.assertEqual(plan.receipts[0].payment_ids, (1, 2))
        self.assertEqual([v.number for v in plan.voids], [42])
        self.assertEqual(plan.voids[0].void_reason, "superseded by receipt 41")
        self.assertEqual(plan.next_sequence, 43)

    def test_standalone_payment_produces_no_voids(self):
        plan = plan_receipt_backfill(
            [_row(id=5, receipt_number=7)],
            fallback_date=FALLBACK,
        )
        self.assertEqual([r.number for r in plan.receipts], [7])
        self.assertEqual(plan.voids, ())
        self.assertEqual(plan.next_sequence, 8)

    def test_receipt_date_is_earliest_across_all_parts_including_unnumbered(self):
        early = BASE - timedelta(days=3)
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41, payment_date=BASE),
                _row(id=2, group_id=9, receipt_number=None, payment_date=early),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].receipt_date, early)

    def test_only_numbered_payments_are_linked(self):
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41),
                _row(id=2, group_id=9, receipt_number=None),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].payment_ids, (1,))

    def test_authorized_by_is_the_last_verifier(self):
        plan = plan_receipt_backfill(
            [
                _row(
                    id=1,
                    group_id=9,
                    receipt_number=41,
                    verified_at=BASE,
                    verified_by_id=100,
                ),
                _row(
                    id=2,
                    group_id=9,
                    receipt_number=42,
                    verified_at=BASE + timedelta(days=1),
                    verified_by_id=200,
                ),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].authorized_by_id, 200)

    def test_unnumbered_units_are_skipped_entirely(self):
        plan = plan_receipt_backfill(
            [_row(id=1), _row(id=2, group_id=9)],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts, ())
        self.assertEqual(plan.voids, ())
        self.assertEqual(plan.next_sequence, 1)

    def test_fallback_date_used_when_a_unit_has_no_dates(self):
        plan = plan_receipt_backfill(
            [_row(id=1, receipt_number=3, payment_date=None, created_at=None)],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].receipt_date, FALLBACK)
