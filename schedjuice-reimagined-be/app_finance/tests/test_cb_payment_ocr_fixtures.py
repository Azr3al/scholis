CB_RECEIPT_TEXT_1 = """
E-Receipt
Transfer Complete!
Amount
165,000.00 MMK
Fee
41 MMK
Transaction Date
Jul 07, 2026 | 20:58
Transaction ID
FT26189161K4
Reason
Salary
""".strip()

CB_RECEIPT_TEXT_2 = """
E-Receipt
Transfer Complete!
Amount 165,000.00 MMK
Fee 41 MMK
Transaction ID FT26131M13HZ
""".strip()

CB_RECEIPT_INLINE_AMOUNT = """
Transfer Complete!
Amount              165,000.00 MMK
Fee                 41 MMK
Transaction ID      FT26189161K4
""".strip()

KPAY_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": "12345678901234567890\n50,000.00 ks",
            "TextOverlay": {
                "Lines": [
                    {"LineText": "12345678901234567890"},
                    {"LineText": "50,000.00 ks"},
                ]
            },
        }
    ]
}

KPAY_OCR_SPLIT_KS = {
    "ParsedResults": [
        {
            "ParsedText": (
                "Payment Successful\n"
                "+260,000.00\n"
                "(Ks)\n"
                "Transaction Time\n"
                "Transaction No.\n"
                "15/08/2026 13:49:35\n"
                "01004244071344917047\n"
                "Transfer\n"
                "+260,000.00 s"
            ),
            "TextOverlay": {
                "Lines": [
                    {"LineText": "Payment Successful"},
                    {"LineText": "+260,000.00"},
                    {"LineText": "(Ks)"},
                    {"LineText": "Transaction Time"},
                    {"LineText": "Transaction No."},
                    {"LineText": "15/08/2026 13:49:35"},
                    {"LineText": "01004244071344917047"},
                    {"LineText": "Transfer"},
                    {"LineText": "+260,000.00 s"},
                ]
            },
        }
    ]
}

CB_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": CB_RECEIPT_INLINE_AMOUNT,
            "TextOverlay": {"Lines": []},
        }
    ]
}
