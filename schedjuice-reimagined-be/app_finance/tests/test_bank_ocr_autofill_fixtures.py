KBZ_INTERNAL_TRANSFER_TEXT = """
INTERNAL TRANSFER - CONFIRM
Transaction with reference number
155259692209166 is in Accepted state.
From Account
14551114500999301
Beneficiary Name
DAW SU HTET ZAW
Amount
MMK 165,000.00
""".strip()

KBZ_FAST_TRANSFER_TEXT = """
FAST TRANSFER - CONFIRM
Transaction with reference number 528195402100099 is in Accepted state.
Beneficiary Name
U AUNG TUN TUN
Amount
MMK 967,750.00
""".strip()

AYA_RECEIPT_TEXT = """
Payment Complete
Transfer to Other AYA Bank Account
Amount
165,000.00
MMK
Transaction No
267969850494
To
AUNG TUN TUN
40040805258
Payment Details
Amount              165,000.00 MMK
Fee                 200.00 MMK
""".strip()

AYA_RECEIPT_97500_TEXT = """
Payment Complete
Transfer to Other AYA Bank Account
97,500.00 MMK
Payment Details
Amount              97,500.00 MMK
Fee                 200.00 MMK
""".strip()

KBZ_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": KBZ_INTERNAL_TRANSFER_TEXT,
            "TextOverlay": {"Lines": []},
        }
    ]
}

AYA_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": AYA_RECEIPT_TEXT,
            "TextOverlay": {"Lines": []},
        }
    ]
}

KPAY_OCR_WITH_15_DIGIT = {
    "ParsedResults": [
        {
            "ParsedText": "01004195030949194273\n-74,250.00 Ks",
            "TextOverlay": {
                "Lines": [
                    {"LineText": "01004195030949194273"},
                    {"LineText": "-74,250.00 Ks"},
                ]
            },
        }
    ]
}

CB_OCR_NO_AMOUNT = {
    "ParsedResults": [
        {
            "ParsedText": """
E-Receipt
Transfer Complete!
Transaction ID FT26211XJPF8
Reason
Salary
""".strip(),
            "TextOverlay": {"Lines": []},
        }
    ]
}
