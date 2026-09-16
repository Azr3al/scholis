"""Per-course fault isolation in ensure-payment-assignments sync runs."""

import importlib
from datetime import date
from io import StringIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

_CommandModule = importlib.import_module(
    "app_tasks.management.commands.ensure-payment-assignments"
)
Command = _CommandModule.Command


def _course(cid: int, title: str):
    return SimpleNamespace(
        id=cid,
        title=title,
        start_date=date(2025, 2, 1),
        end_date=date(2025, 12, 31),
        is_payment_enabled=True,
        microsoft_group_id="team-1",
        category=SimpleNamespace(
            name="Cat",
            is_payment_assignment_eligible=True,
        ),
    )


class EnsurePaymentAssignmentsIsolationTests(SimpleTestCase):
    @patch.object(_CommandModule, "is_first_month_of_course", return_value=False)
    @patch.object(_CommandModule, "create_payment_assignment_for_course_month")
    @patch.object(_CommandModule, "PaymentAssignment")
    @patch.object(_CommandModule, "Course")
    @patch.object(_CommandModule, "org_local_today", return_value=date(2025, 7, 23))
    def test_continues_after_course_failure_and_raises_summary(
        self,
        _mock_today,
        mock_course_model,
        mock_pa_model,
        mock_create,
        _mock_first_month,
    ):
        course1 = _course(1, "Fail Course")
        course2 = _course(2, "Ok Course")
        courses_qs = MagicMock()
        courses_qs.__iter__ = MagicMock(return_value=iter([course1, course2]))
        courses_qs.count.return_value = 2
        mock_course_model.objects.filter.return_value.exclude.return_value.select_related.return_value = (
            courses_qs
        )
        mock_pa_model.objects.filter.return_value.exists.return_value = False
        mock_create.side_effect = [
            ValidationError({"MS_ASSIGNMENT_ERROR": "token failed"}),
            SimpleNamespace(id=99),
        ]

        org = SimpleNamespace(
            id=3,
            schema_name="xteachersu",
            is_microsoft_on=True,
            timezone="UTC",
        )
        cmd = Command()
        cmd.stdout = StringIO()

        with patch.object(
            cmd,
            "_get_months_to_ensure_for_course",
            return_value=[(2025, 7)],
        ):
            with self.assertRaises(RuntimeError) as ctx:
                cmd._ensure_payment_assignments_for_tenant(
                    org=org,
                    connection_schema_label="xteachersu",
                    run_sync=True,
                    dry_run=False,
                    dry_run_sync_intent=True,
                    verbose=False,
                )

        self.assertEqual(mock_create.call_count, 2)
        self.assertIn("1 course-month(s) failed", str(ctx.exception))
        self.assertIn("Fail Course", str(ctx.exception))
