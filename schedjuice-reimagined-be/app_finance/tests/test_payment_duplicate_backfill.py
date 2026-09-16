from __future__ import annotations

import unittest

from app_finance.payment_duplicate_backfill import (
    AWAITING_EXTRACTION,
    DUPLICATED,
    MULTI_COURSE,
    PENDING_VERIFICATION,
    plan_group_duplicate_status_backfill,
)


class PlanGroupDuplicateStatusBackfillTests(unittest.TestCase):
    def test_sibling_only_clash_is_corrected_to_pending_verification(self):
        rows = [
            {
                "id": 1,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": "verified",
                "parsed_amount": "150",
                "screenshot": "payments/a.png",
            },
            {
                "id": 2,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": "50",
                "screenshot": "payments/b.png",
            },
        ]
        self.assertEqual(
            plan_group_duplicate_status_backfill(rows),
            {2: PENDING_VERIFICATION},
        )

    def test_external_same_transaction_peer_keeps_duplicated_flag(self):
        rows = [
            {
                "id": 1,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": "verified",
                "parsed_amount": "150",
                "screenshot": "payments/a.png",
            },
            {
                "id": 2,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": "50",
                "screenshot": "payments/b.png",
            },
            {
                "id": 3,
                "group_id": None,
                "group__group_kind": None,
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": "200",
                "screenshot": "payments/c.png",
            },
        ]
        self.assertEqual(plan_group_duplicate_status_backfill(rows), {})

    def test_split_screenshot_group_is_left_alone(self):
        rows = [
            {
                "id": 1,
                "group_id": 10,
                "group__group_kind": "split_screenshots",
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": "100",
                "screenshot": "payments/a.png",
            },
            {
                "id": 2,
                "group_id": 10,
                "group__group_kind": "split_screenshots",
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": "50",
                "screenshot": "payments/b.png",
            },
        ]
        self.assertEqual(plan_group_duplicate_status_backfill(rows), {})

    def test_screenshot_without_amount_maps_to_awaiting_extraction(self):
        rows = [
            {
                "id": 1,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": "pending_verification",
                "parsed_amount": "150",
                "screenshot": "payments/a.png",
            },
            {
                "id": 2,
                "group_id": 10,
                "group__group_kind": MULTI_COURSE,
                "transaction_id": "TXN-1",
                "status": DUPLICATED,
                "parsed_amount": None,
                "screenshot": "payments/b.png",
            },
        ]
        self.assertEqual(
            plan_group_duplicate_status_backfill(rows),
            {2: AWAITING_EXTRACTION},
        )
