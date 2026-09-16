import datetime
from decimal import Decimal

from django.test import SimpleTestCase

from app_finance.models import PaymentBank
from app_organization.acca_spreadsheet_import import (
    infer_payment_bank,
    map_csv_row,
    normalize_phone,
    parse_money_usd,
    parse_dmy_date,
    split_enroll_subjects,
)


class AccaImportParsingTests(SimpleTestCase):
    def test_parse_dmy_date(self):
        # DD/MM/YYYY: 12 June 2000
        self.assertEqual(parse_dmy_date("12/6/2000"), datetime.date(2000, 6, 12))
        self.assertEqual(parse_dmy_date("01/12/2000"), datetime.date(2000, 12, 1))

    def test_parse_money_integer_decimal_sci(self):
        self.assertEqual(parse_money_usd("210000"), Decimal("210000"))
        self.assertEqual(parse_money_usd("782325.5"), Decimal("782325.5"))
        self.assertEqual(parse_money_usd("1.00413E+6"), Decimal("1004130"))

    def test_split_enroll_commas_only(self):
        self.assertEqual(split_enroll_subjects("BT, MA, FA"), ["BT", "MA", "FA"])
        self.assertEqual(split_enroll_subjects("AA and FM"), ["AA and FM"])

    def test_infer_payment_bank_uab_before_kbz(self):
        self.assertEqual(infer_payment_bank("UAB transfer 123"), PaymentBank.UAB)
        self.assertEqual(infer_payment_bank("KBZ Bank: 2009600"), PaymentBank.KBZ)
        self.assertEqual(infer_payment_bank("K pay 09 5400211"), PaymentBank.KPAY)
        self.assertEqual(infer_payment_bank("something vague"), PaymentBank.CASH)

    def test_map_csv_row_headers(self):
        raw = {
            "Email Address": " a@b.com ",
            "Student Name": "Ann",
            "NRC/Passport": "12/X",
            "Transfer Amount": "100",
        }
        self.assertEqual(
            map_csv_row(raw),
            {
                "email": "a@b.com",
                "name": "Ann",
                "nrc_passport": "12/X",
                "transfer_amount": "100",
            },
        )

    def test_map_csv_row_google_form_payment_headers(self):
        raw = {
            "Transfer Bank Name": "KBZ Bank: 1",
            "Transaction Numer (or) Description Name": "ref abc",
            "Transfer Amount (Ks)": "210000",
        }
        self.assertEqual(
            map_csv_row(raw),
            {
                "transfer_bank": "KBZ Bank: 1",
                "transaction_note": "ref abc",
                "transfer_amount": "210000",
            },
        )

    def test_map_csv_row_transfer_date_aliases(self):
        raw = {"Transfer Date": "15/3/2026"}
        self.assertEqual(map_csv_row(raw), {"transfer_date": "15/3/2026"})

    def test_normalize_phone_truncates(self):
        long_num = "0" * 600
        self.assertEqual(len(normalize_phone(long_num)), 512)
