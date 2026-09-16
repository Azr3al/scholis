from decimal import Decimal

from django.test import SimpleTestCase

from app_finance.student_checkout_allocation import infer_checkout_allocations


class InferCheckoutAllocationsTests(SimpleTestCase):
    def test_one_screenshot_two_payments_proportional(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("60000")},
            {"id": 2, "invoiced_amount": Decimal("40000")},
        ]
        screenshots = [{"index": 0, "parsed_amount": Decimal("100000")}]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        by_pid = {a["payment_id"]: a["amount"] for a in allocs}
        self.assertEqual(by_pid[1], Decimal("60000"))
        self.assertEqual(by_pid[2], Decimal("40000"))

    def test_missing_ocr_amount_uses_invoiced_amounts(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("50000")},
            {"id": 2, "invoiced_amount": Decimal("50000")},
        ]
        screenshots = [{"index": 0, "parsed_amount": None}]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        self.assertEqual(len(allocs), 2)
        self.assertEqual(sum(a["amount"] for a in allocs), Decimal("100000"))

    def test_two_screenshots_greedy_match(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("30000")},
            {"id": 2, "invoiced_amount": Decimal("70000")},
        ]
        screenshots = [
            {"index": 0, "parsed_amount": Decimal("30000")},
            {"index": 1, "parsed_amount": Decimal("70000")},
        ]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        self.assertEqual(
            {(a["screenshot_index"], a["payment_id"]) for a in allocs},
            {(0, 1), (1, 2)},
        )
