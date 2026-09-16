from django.test import SimpleTestCase

from app_finance.ocr import extract_payment_notes_text
from app_finance.tests.test_bank_ocr_autofill_fixtures import KBZ_INTERNAL_TRANSFER_TEXT

KPAY_NOTES_TEXT = """
Transfer
Notes:
Zayar Lin San KET 185Fees September
Amount
-82,500.00 Ks
""".strip()


class PaymentNotesExtractionTests(SimpleTestCase):
    def test_kpay_notes_line(self):
        self.assertEqual(
            extract_payment_notes_text("KPAY", KPAY_NOTES_TEXT),
            "Zayar Lin San KET 185Fees September",
        )

    def test_kpay_burmese_label_next_line(self):
        text = "မှတ်ချက်\nYoon thuri ko PET 154"
        self.assertEqual(extract_payment_notes_text("KPAY", text), "Yoon thuri ko PET 154")

    def test_kpay_burmese_label_in_ocr_lines(self):
        lines = [
            {"LineText": "01004264020337951892"},
            {"LineText": "Daw Su Htet Zaw (******7616)"},
            {"LineText": "-87,500.00 Ks"},
            {"LineText": "မှတ်ချက်"},
            {"LineText": "Yoon thuri ko PET 154"},
        ]
        self.assertEqual(
            extract_payment_notes_text("KPAY", "", ocr_lines=lines),
            "Yoon thuri ko PET 154",
        )

    def test_kpay2_burmese_notes(self):
        text = "မှတ်ချက်\nBhone Myat Khant(Ket-183-Sat-Sun)"
        self.assertEqual(
            extract_payment_notes_text("KPAY", text),
            "Bhone Myat Khant(Ket-183-Sat-Sun)",
        )

    def test_kbz_purpose_of_transaction(self):
        text = KBZ_INTERNAL_TRANSFER_TEXT + "\nPurpose of Transaction\nNan Phyu Shinmon KET 150WE"
        self.assertEqual(
            extract_payment_notes_text("KBZ", text),
            "Nan Phyu Shinmon KET 150WE",
        )

    def test_kbz2_hyphenated_purpose(self):
        text = "Purpose of Transaction\nKhit Bhone Khant-KET 184 September"
        self.assertEqual(
            extract_payment_notes_text("KBZ", text),
            "Khit Bhone Khant-KET 184 September",
        )

    def test_cb_reason_english(self):
        self.assertEqual(
            extract_payment_notes_text("CB", "Reason\nLaminnyein Fce 70 September"),
            "Laminnyein Fce 70 September",
        )

    def test_cb_reason_burmese(self):
        self.assertEqual(
            extract_payment_notes_text(
                "CB",
                "အကြောင်းအရာ\nmoe pyae yadanar PET 150 schoolfees",
            ),
            "moe pyae yadanar PET 150 schoolfees",
        )

    def test_cb3_no_reason_field(self):
        self.assertIsNone(
            extract_payment_notes_text(
                "CB",
                "DAW AYE AYE THET\nU AUNG TUN TUN\n82,500.00 MMK",
            )
        )

    def test_aya_description(self):
        self.assertEqual(
            extract_payment_notes_text(
                "AYA",
                "Description\nSaungNadiLin FLYERS207 SchoolFees for September",
            ),
            "SaungNadiLin FLYERS207 SchoolFees for September",
        )

    def test_aya1_description_name_line(self):
        self.assertEqual(
            extract_payment_notes_text(
                "AYA",
                "Description\nKhin Nyeint Htut Su San\nKET 194",
            ),
            "Khin Nyeint Htut Su San",
        )

    def test_aya3_course_title_notes(self):
        self.assertEqual(
            extract_payment_notes_text("AYA", "မှတ်ချက်\nKET reading and writing 2"),
            "KET reading and writing 2",
        )

    def test_empty_when_no_label(self):
        self.assertIsNone(
            extract_payment_notes_text("KPAY", "01004254041818623094\n-74,250.00 Ks")
        )

    def test_does_not_use_beneficiary_name(self):
        self.assertIsNone(
            extract_payment_notes_text(
                "KBZ",
                "Beneficiary Name\nDAW SU HTET ZAW\nAmount\nMMK 165,000.00",
            )
        )
