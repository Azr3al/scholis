"""Unit tests for payment assignment helper display names (FM vs HM)."""

from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app_microsoft.payment_assignment_helpers import (
    PaymentAssignmentMonthApiStatus,
    PaymentAssignmentMonthPrecheckFailure,
    classify_precheck_failure,
    fm_payment_assignment_ensure_window,
    get_assignment_display_name,
    get_payment_assignment_month_status,
    payment_assignment_month_in_ensure_window,
    payment_assignment_month_precheck,
)


def _course_fm():
    return SimpleNamespace(start_date=date(2025, 3, 1))


def _course_hm():
    return SimpleNamespace(start_date=date(2025, 1, 16))


class FmPaymentAssignmentEnsureWindowTests(TestCase):
    def test_march_payment_window(self):
        start, end = fm_payment_assignment_ensure_window(2025, 3)
        self.assertEqual(start, date(2025, 2, 20))
        self.assertEqual(end, date(2025, 3, 31))

    def test_january_payment_year_rollover(self):
        start, end = fm_payment_assignment_ensure_window(2025, 1)
        self.assertEqual(start, date(2024, 12, 20))
        self.assertEqual(end, date(2025, 1, 31))

    def test_payment_assignment_month_in_ensure_window_boundaries(self):
        course = _course_fm()
        self.assertFalse(
            payment_assignment_month_in_ensure_window(
                date(2025, 2, 19), 2025, 3, course
            )
        )
        self.assertTrue(
            payment_assignment_month_in_ensure_window(
                date(2025, 2, 20), 2025, 3, course
            )
        )


class GetAssignmentDisplayNameTests(TestCase):
    def test_fm_uses_full_month_name(self):
        course = _course_fm()
        self.assertEqual(
            get_assignment_display_name(course, 2025, 1),
            "January 2025 payment",
        )

    def test_hm_january_pair_matches_frontend_selector(self):
        course = _course_hm()
        self.assertEqual(
            get_assignment_display_name(course, 2025, 1),
            "Jan - Feb 2025 payment",
        )

    def test_hm_november_pair(self):
        course = _course_hm()
        self.assertEqual(
            get_assignment_display_name(course, 2025, 11),
            "Nov - Dec 2025 payment",
        )

    def test_hm_december_wraps_to_january_next_year(self):
        course = _course_hm()
        self.assertEqual(
            get_assignment_display_name(course, 2025, 12),
            "Dec - Jan 2026 payment",
        )


def _cat(eligible: bool = True):
    return SimpleNamespace(name="TestCat", is_payment_assignment_eligible=eligible)


def _course(
    *,
    start: date,
    end: date,
    microsoft_group_id: str | None = "team-1",
    payment_enabled: bool = True,
    category=None,
    cid: int = 1,
):
    return SimpleNamespace(
        id=cid,
        microsoft_group_id=microsoft_group_id,
        is_payment_enabled=payment_enabled,
        category=category or _cat(True),
        start_date=start,
        end_date=end,
    )


class PaymentAssignmentMonthPrecheckTests(TestCase):
    def test_ok_march_fm_course(self):
        c = _course(
            start=date(2025, 2, 1),
            end=date(2025, 12, 31),
        )
        td = date(2025, 3, 1)
        self.assertIsNone(payment_assignment_month_precheck(c, 2025, 3, td))

    def test_no_microsoft_group(self):
        c = _course(
            start=date(2025, 2, 1),
            end=date(2025, 12, 31),
            microsoft_group_id=None,
        )
        self.assertEqual(
            payment_assignment_month_precheck(c, 2025, 3, date(2025, 3, 1)),
            PaymentAssignmentMonthPrecheckFailure.NO_MICROSOFT_GROUP,
        )

    def test_category_not_eligible(self):
        c = _course(
            start=date(2025, 2, 1),
            end=date(2025, 12, 31),
            category=_cat(False),
        )
        self.assertEqual(
            payment_assignment_month_precheck(c, 2025, 3, date(2025, 3, 1)),
            PaymentAssignmentMonthPrecheckFailure.CATEGORY_NOT_ELIGIBLE,
        )

    def test_first_month_skipped(self):
        c = _course(start=date(2025, 3, 1), end=date(2025, 12, 31))
        self.assertEqual(
            payment_assignment_month_precheck(c, 2025, 3, date(2025, 3, 1)),
            PaymentAssignmentMonthPrecheckFailure.FIRST_MONTH_OF_COURSE,
        )

    def test_classify_skipped_vs_not_applicable(self):
        self.assertEqual(
            classify_precheck_failure(
                PaymentAssignmentMonthPrecheckFailure.FIRST_MONTH_OF_COURSE
            ),
            PaymentAssignmentMonthApiStatus.SKIPPED,
        )
        self.assertEqual(
            classify_precheck_failure(
                PaymentAssignmentMonthPrecheckFailure.CATEGORY_NOT_ELIGIBLE
            ),
            PaymentAssignmentMonthApiStatus.NOT_APPLICABLE,
        )


class GetPaymentAssignmentMonthStatusTests(TestCase):
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_created_when_row_exists(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = SimpleNamespace(id=42)
        mock_filter.return_value = chain
        c = _course(start=date(2025, 2, 1), end=date(2025, 12, 31))
        out = get_payment_assignment_month_status(c, 2025, 3)
        self.assertTrue(out["assignment_exists"])
        self.assertEqual(out["payment_assignment_id"], 42)
        self.assertEqual(out["status"], PaymentAssignmentMonthApiStatus.CREATED.value)
        self.assertIsNone(out["precheck_failure"])

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_expected_but_missing_when_precheck_ok(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2025, 2, 1), end=date(2025, 12, 31))
        out = get_payment_assignment_month_status(c, 2025, 3)
        self.assertFalse(out["assignment_exists"])
        self.assertEqual(
            out["status"], PaymentAssignmentMonthApiStatus.EXPECTED_BUT_MISSING.value
        )
        self.assertIsNone(out["creation_window_start"])

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_scheduled_before_fm_creation_window(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2026, 4, 1), end=date(2026, 9, 30))
        org = SimpleNamespace(timezone="UTC")
        out = get_payment_assignment_month_status(
            c,
            2026,
            9,
            org=org,
            today=date(2026, 7, 23),
        )
        self.assertEqual(out["status"], PaymentAssignmentMonthApiStatus.SCHEDULED.value)
        self.assertEqual(out["creation_window_start"], "2026-08-20")

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_expected_but_missing_inside_fm_creation_window(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2026, 4, 1), end=date(2026, 9, 30))
        org = SimpleNamespace(timezone="UTC")
        out = get_payment_assignment_month_status(
            c,
            2026,
            9,
            org=org,
            today=date(2026, 8, 25),
        )
        self.assertEqual(
            out["status"], PaymentAssignmentMonthApiStatus.EXPECTED_BUT_MISSING.value
        )
        self.assertIsNone(out["creation_window_start"])
        self.assertIsNone(out["creation_window_end"])

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_expected_but_missing_on_fm_window_end(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2026, 4, 1), end=date(2026, 9, 30))
        org = SimpleNamespace(timezone="UTC")
        out = get_payment_assignment_month_status(
            c,
            2026,
            9,
            org=org,
            today=date(2026, 9, 30),
        )
        self.assertEqual(
            out["status"], PaymentAssignmentMonthApiStatus.EXPECTED_BUT_MISSING.value
        )
        self.assertIsNone(out["creation_window_end"])

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_missed_after_fm_window_end(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2026, 4, 1), end=date(2026, 9, 30))
        org = SimpleNamespace(timezone="UTC")
        out = get_payment_assignment_month_status(
            c,
            2026,
            9,
            org=org,
            today=date(2026, 10, 1),
        )
        self.assertEqual(out["status"], PaymentAssignmentMonthApiStatus.MISSED.value)
        self.assertEqual(out["creation_window_end"], "2026-09-30")
        self.assertIsNone(out["creation_window_start"])

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_missed_after_hm_window_end(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(start=date(2025, 12, 16), end=date(2026, 11, 30))
        org = SimpleNamespace(timezone="UTC")
        out = get_payment_assignment_month_status(
            c,
            2026,
            2,
            org=org,
            today=date(2026, 3, 1),
        )
        self.assertEqual(out["status"], PaymentAssignmentMonthApiStatus.MISSED.value)
        self.assertEqual(out["creation_window_end"], "2026-02-28")

    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_not_applicable_when_no_row_and_ineligible(self, mock_filter):
        chain = MagicMock()
        chain.first.return_value = None
        mock_filter.return_value = chain
        c = _course(
            start=date(2025, 2, 1),
            end=date(2025, 12, 31),
            category=_cat(False),
        )
        out = get_payment_assignment_month_status(c, 2025, 3)
        self.assertEqual(
            out["status"], PaymentAssignmentMonthApiStatus.NOT_APPLICABLE.value
        )
        self.assertEqual(out["precheck_failure"], "category_not_eligible")


class FindDuplicatePaymentAssignmentsTests(TestCase):
    @patch("app_microsoft.payment_assignment_helpers.MSEducation")
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_case_insensitive_duplicate_detected(self, mock_pa_filter, mock_ms_edu):
        from app_microsoft.payment_assignment_helpers import (
            find_duplicate_payment_assignments_for_course,
        )

        course = SimpleNamespace(
            id=1,
            microsoft_group_id="team-1",
            start_date=date(2025, 3, 1),
        )
        pa = SimpleNamespace(
            year=2026, month_index=9, microsoft_assignment_id="canonical-id"
        )
        mock_pa_filter.return_value = [pa]

        mock_edu = MagicMock()
        mock_ms_edu.return_value = mock_edu
        mock_edu.list_assignments.return_value = [
            {"id": "canonical-id", "displayName": "September 2026 payment"},
            {"id": "orphan-id", "displayName": "September 2026 Payment"},
        ]

        tenant = SimpleNamespace(schema_name="test")
        candidates = find_duplicate_payment_assignments_for_course(course, tenant)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].microsoft_assignment_id, "orphan-id")
        self.assertEqual(candidates[0].keep_microsoft_assignment_id, "canonical-id")

    @patch("app_microsoft.payment_assignment_helpers.MSEducation")
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    def test_no_duplicates_when_single_assignment(self, mock_pa_filter, mock_ms_edu):
        from app_microsoft.payment_assignment_helpers import (
            find_duplicate_payment_assignments_for_course,
        )

        course = SimpleNamespace(
            id=1,
            microsoft_group_id="team-1",
            start_date=date(2025, 3, 1),
        )
        pa = SimpleNamespace(
            year=2026, month_index=9, microsoft_assignment_id="canonical-id"
        )
        mock_pa_filter.return_value = [pa]

        mock_edu = MagicMock()
        mock_ms_edu.return_value = mock_edu
        mock_edu.list_assignments.return_value = [
            {"id": "canonical-id", "displayName": "September 2026 payment"},
        ]

        tenant = SimpleNamespace(schema_name="test")
        candidates = find_duplicate_payment_assignments_for_course(course, tenant)
        self.assertEqual(candidates, [])


class CreatePaymentAssignmentRaceAndLockTests(TestCase):
    @patch("app_microsoft.payment_assignment_helpers.cache")
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    @patch("app_microsoft.payment_assignment_helpers.payment_assignment_month_precheck")
    def test_lock_held_returns_existing_row_without_graph_create(
        self, mock_precheck, mock_pa_filter, mock_cache
    ):
        from app_microsoft.payment_assignment_helpers import (
            create_payment_assignment_for_course_month,
        )

        mock_precheck.return_value = None
        existing_pa = SimpleNamespace(id=99)
        mock_pa_filter.return_value.first.side_effect = [None, existing_pa]
        mock_cache.add.return_value = False

        course = SimpleNamespace(
            id=1,
            microsoft_group_id="team-1",
            start_date=date(2025, 2, 1),
            end_date=date(2025, 12, 31),
            is_payment_enabled=True,
            category=_cat(True),
        )
        tenant = SimpleNamespace(schema_name="test", timezone="UTC")

        with patch("app_microsoft.payment_assignment_helpers.MSEducation") as mock_ms:
            result = create_payment_assignment_for_course_month(
                course, tenant, 2025, 3, date(2025, 3, 1)
            )
            mock_ms.assert_not_called()

        self.assertIs(result, existing_pa)

    @patch("app_microsoft.payment_assignment_helpers.delete_orphan_ms_assignment")
    @patch("app_microsoft.payment_assignment_helpers.cache")
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.create")
    @patch("app_microsoft.payment_assignment_helpers.PaymentAssignment.objects.filter")
    @patch("app_microsoft.payment_assignment_helpers.payment_assignment_month_precheck")
    @patch("app_microsoft.payment_assignment_helpers.MSEducation")
    def test_integrity_error_deletes_orphan_ms_assignment(
        self,
        mock_ms_edu,
        mock_precheck,
        mock_pa_filter,
        mock_pa_create,
        mock_cache,
        mock_delete_orphan,
    ):
        from django.db import IntegrityError

        from app_microsoft.payment_assignment_helpers import (
            create_payment_assignment_for_course_month,
        )

        mock_precheck.return_value = None
        existing_pa = SimpleNamespace(id=99)
        mock_pa_filter.return_value.first.side_effect = [None, existing_pa]
        mock_cache.add.return_value = True
        mock_pa_create.side_effect = IntegrityError()

        mock_edu = MagicMock()
        mock_ms_edu.return_value = mock_edu
        create_resp = MagicMock(status_code=201)
        create_resp.json.return_value = {"id": "new-ms-id"}
        mock_edu.create_assignment.return_value = create_resp
        mock_edu.publish_assignment.return_value = MagicMock(status_code=200)

        course = SimpleNamespace(
            id=1,
            microsoft_group_id="team-1",
            start_date=date(2025, 2, 1),
            end_date=date(2025, 12, 31),
            is_payment_enabled=True,
            category=_cat(True),
        )
        tenant = SimpleNamespace(schema_name="test", timezone="UTC")

        result = create_payment_assignment_for_course_month(
            course, tenant, 2025, 3, date(2025, 3, 1)
        )

        self.assertIs(result, existing_pa)
        mock_delete_orphan.assert_called_once_with(course, tenant, "new-ms-id")
        mock_cache.delete.assert_called()
