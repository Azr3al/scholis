"""Tests for Teams payment-assignment instruction HTML."""

from types import SimpleNamespace
from unittest import TestCase

from app_microsoft.payment_assignment_instructions import (
    PAYMENT_ASSIGNMENT_INTRO,
    build_payment_assignment_instructions,
)


def _method(**kwargs):
    defaults = {
        "name": "Account",
        "payment_bank": "KPAY",
        "bank_account_number": None,
        "is_retired": False,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class BuildPaymentAssignmentInstructionsTests(TestCase):
    def test_intro_only_when_no_active_methods(self):
        html = build_payment_assignment_instructions([])
        self.assertIn(PAYMENT_ASSIGNMENT_INTRO, html)
        self.assertNotIn("Pay using one of these accounts", html)
        self.assertNotIn("<h3>", html)

    def test_omits_retired_methods(self):
        html = build_payment_assignment_instructions(
            [
                _method(name="Live KPAY", payment_bank="KPAY", bank_account_number="11"),
                _method(
                    name="Old AYA",
                    payment_bank="AYA",
                    bank_account_number="22",
                    is_retired=True,
                ),
            ]
        )
        self.assertIn("Live KPAY", html)
        self.assertNotIn("Old AYA", html)
        self.assertNotIn("<h3>AYA</h3>", html)

    def test_groups_by_bank_enum_order(self):
        html = build_payment_assignment_instructions(
            [
                _method(name="Yoma acct", payment_bank="YOMA", bank_account_number="3"),
                _method(name="Kpay B", payment_bank="KPAY", bank_account_number="2"),
                _method(name="Kpay A", payment_bank="KPAY", bank_account_number="1"),
            ]
        )
        kpay_at = html.index("<h3>KPAY</h3>")
        yoma_at = html.index("<h3>YOMA</h3>")
        self.assertLess(kpay_at, yoma_at)
        kpay_a = html.index("Kpay A")
        kpay_b = html.index("Kpay B")
        self.assertLess(kpay_a, kpay_b)

    def test_escapes_html_in_name_and_number(self):
        html = build_payment_assignment_instructions(
            [
                _method(
                    name='<script>alert("x")</script>',
                    payment_bank="KPAY",
                    bank_account_number="<b>99</b>",
                )
            ]
        )
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("&lt;b&gt;99&lt;/b&gt;", html)

    def test_cash_without_number_omits_blank_line(self):
        html = build_payment_assignment_instructions(
            [_method(name="Cash desk", payment_bank="CASH", bank_account_number=None)]
        )
        self.assertIn("Cash desk", html)
        self.assertIn("<h3>CASH</h3>", html)
        self.assertNotIn("<br>", html)
