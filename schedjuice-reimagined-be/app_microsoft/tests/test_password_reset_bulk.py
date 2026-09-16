from unittest.mock import ANY, MagicMock, patch
from uuid import uuid4

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_microsoft.models import MicrosoftRepairJob
from app_microsoft.password_reset_bulk import (
    BulkPasswordResetError,
    MAX_EMAILS,
    MAX_SYNC_COMMIT_EMAILS,
    PASSWORD_RESET_JOB_TIMEOUT_SECONDS,
    commit_emails,
    preview_emails,
    run_password_reset_job,
    start_password_reset_job,
)
from app_organization.models import Organization
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD
from app_rbac.seeding import seed_rbac

class ParseEmailListTests(SimpleTestCase):
    def test_rejects_non_list(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, None)
        self.assertEqual(ctx.exception.code, "missing_emails")

    def test_rejects_empty_list(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, [])
        self.assertEqual(ctx.exception.code, "missing_emails")

    def test_rejects_over_cap(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        emails = [f"u{i}@x.io" for i in range(MAX_EMAILS + 1)]
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, emails)
        self.assertEqual(ctx.exception.code, "too_many_emails")

    def test_rejects_ms_disabled_tenant(self):
        tenant = type("T", (), {"is_microsoft_on": False})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, ["a@x.io"])
        self.assertEqual(ctx.exception.code, "not_supported")

class PreviewEmailsTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.eligible = User.objects.create(
                email=f"eligible-{suffix}@x.io",
                name="Eligible",
                phone_number="1",
                communication_email=f"eligible-{suffix}@x.io",
                code=f"ms-pw-{suffix}-e",
                roles=["student"],
                microsoft_id="ms-graph-id-1",
            )
            self.unlinked = User.objects.create(
                email=f"unlinked-{suffix}@x.io",
                name="Unlinked",
                phone_number="1",
                communication_email=f"unlinked-{suffix}@x.io",
                code=f"ms-pw-{suffix}-u",
                roles=["student"],
                microsoft_id="",
            )

    def test_classifies_eligible_not_found_and_unlinked(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with schema_context(self.schema_name):
            result = preview_emails(
                tenant,
                [
                    self.eligible.email,
                    "missing@x.io",
                    self.unlinked.email,
                ],
            )

        self.assertEqual(result["summary"]["eligible"], 1)
        self.assertEqual(result["summary"]["not_found"], 1)
        self.assertEqual(result["summary"]["no_microsoft_account"], 1)
        statuses = {r["email"]: r["status"] for r in result["results"]}
        self.assertEqual(statuses[self.eligible.email], "eligible")
        self.assertEqual(statuses["missing@x.io"], "not_found")
        self.assertEqual(statuses[self.unlinked.email], "no_microsoft_account")

    def test_dedupes_case_insensitively(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with schema_context(self.schema_name):
            result = preview_emails(
                tenant,
                [self.eligible.email.upper(), self.eligible.email],
            )

        self.assertEqual(result["summary"]["total"], 1)
        self.assertEqual(len(result["results"]), 1)

class CommitEmailsTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.eligible = User.objects.create(
                email=f"commit-eligible-{suffix}@x.io",
                name="Eligible",
                phone_number="1",
                communication_email=f"commit-eligible-{suffix}@x.io",
                code=f"ms-pw-c-{suffix}-e",
                roles=["student"],
                microsoft_id="ms-graph-id-commit",
            )
            self.unlinked = User.objects.create(
                email=f"commit-unlinked-{suffix}@x.io",
                name="Unlinked",
                phone_number="1",
                communication_email=f"commit-unlinked-{suffix}@x.io",
                code=f"ms-pw-c-{suffix}-u",
                roles=["student"],
                microsoft_id="",
            )

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_resets_eligible_with_import_password(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {"status": 200}

        with schema_context(self.schema_name):
            result = commit_emails(
                tenant,
                [self.eligible.email, "missing@x.io", self.unlinked.email],
            )

        mock_ms_user_cls.return_value.reset_password.assert_called_once_with(
            self.eligible.microsoft_id,
            tenant,
            password=IMPORT_PASSWORD,
        )
        self.assertEqual(result["summary"]["succeeded"], 1)
        self.assertEqual(result["summary"]["skipped"], 2)
        self.assertEqual(result["summary"]["failed"], 0)

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_custom_password_is_passed_through(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {"status": 200}

        with schema_context(self.schema_name):
            result = commit_emails(tenant, [self.eligible.email], "N0tBanned-Pass!")

        mock_ms_user_cls.return_value.reset_password.assert_called_once_with(
            self.eligible.microsoft_id,
            tenant,
            password="N0tBanned-Pass!",
        )
        self.assertEqual(result["summary"]["succeeded"], 1)

    def test_short_password_rejected(self):
        tenant = MagicMock(is_microsoft_on=True)
        with schema_context(self.schema_name):
            with self.assertRaises(BulkPasswordResetError) as ctx:
                commit_emails(tenant, [self.eligible.email], "short")
        self.assertEqual(ctx.exception.code, "invalid_password")

    def test_blank_password_rejected(self):
        tenant = MagicMock(is_microsoft_on=True)
        with schema_context(self.schema_name):
            with self.assertRaises(BulkPasswordResetError) as ctx:
                commit_emails(tenant, [self.eligible.email], "   ")
        self.assertEqual(ctx.exception.code, "invalid_password")

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_graph_failure_marks_failed_and_continues(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {
            "status": 403,
        }

        with schema_context(self.schema_name):
            result = commit_emails(tenant, [self.eligible.email])

        self.assertEqual(result["summary"]["failed"], 1)
        self.assertEqual(result["results"][0]["status"], "failed")
        self.assertIn("Graph 403", result["results"][0]["reason"])

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_operation_failure_reason_is_surfaced(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {
            "status": 400,
            "reason": "Operation banned password",
        }

        with schema_context(self.schema_name):
            result = commit_emails(tenant, [self.eligible.email])

        self.assertEqual(result["summary"]["failed"], 1)
        self.assertEqual(
            result["results"][0]["reason"], "Operation banned password"
        )

    def test_sync_commit_rejects_over_cap(self):
        tenant = MagicMock(is_microsoft_on=True)
        emails = [f"u{i}@x.io" for i in range(MAX_SYNC_COMMIT_EMAILS + 1)]
        with schema_context(self.schema_name):
            with self.assertRaises(BulkPasswordResetError) as ctx:
                commit_emails(tenant, emails)
        self.assertEqual(ctx.exception.code, "too_many_emails")


class PasswordResetJobTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.eligible = User.objects.create(
                email=f"job-eligible-{suffix}@x.io",
                name="Eligible",
                phone_number="1",
                communication_email=f"job-eligible-{suffix}@x.io",
                code=f"ms-pw-j-{suffix}-e",
                roles=["student"],
                microsoft_id="ms-graph-id-job",
            )
            self.unlinked = User.objects.create(
                email=f"job-unlinked-{suffix}@x.io",
                name="Unlinked",
                phone_number="1",
                communication_email=f"job-unlinked-{suffix}@x.io",
                code=f"ms-pw-j-{suffix}-u",
                roles=["student"],
                microsoft_id="",
            )

    @patch("app_microsoft.password_reset_bulk.run_password_reset_job")
    def test_start_creates_job_with_candidates_and_skipped_seed(self, mock_runner):
        tenant = MagicMock(
            is_microsoft_on=True, schema_name=self.schema_name
        )
        with schema_context(self.schema_name):
            job = start_password_reset_job(
                tenant,
                [self.eligible.email, "missing@x.io", self.unlinked.email],
                "N0tBanned-Pass!",
            )

        self.assertEqual(job.target_type, MicrosoftRepairJob.TargetType.PASSWORD_RESET)
        self.assertEqual(job.status, MicrosoftRepairJob.Status.PENDING)
        self.assertEqual(job.candidate_ids, [self.eligible.id])
        self.assertEqual(job.skipped, 2)
        skipped_rows = {r["email"]: r for r in job.results}
        self.assertEqual(set(skipped_rows), {"missing@x.io", self.unlinked.email})
        self.assertEqual(skipped_rows["missing@x.io"]["reason"], "not_found")
        self.assertEqual(
            skipped_rows[self.unlinked.email]["reason"], "no_microsoft_account"
        )

        mock_runner.delay.assert_called_once()
        args, kwargs = mock_runner.delay.call_args
        self.assertEqual(args[0], job.id)
        self.assertEqual(args[1], self.schema_name)
        self.assertEqual(args[2], "N0tBanned-Pass!")
        self.assertEqual(kwargs.get("timeout"), PASSWORD_RESET_JOB_TIMEOUT_SECONDS)

    @patch("app_microsoft.password_reset_bulk.run_password_reset_job")
    def test_start_defaults_to_import_password(self, mock_runner):
        tenant = MagicMock(
            is_microsoft_on=True, schema_name=self.schema_name
        )
        with schema_context(self.schema_name):
            job = start_password_reset_job(tenant, [self.eligible.email])

        args, _ = mock_runner.delay.call_args
        self.assertEqual(args[2], IMPORT_PASSWORD)
        self.assertEqual(job.candidate_ids, [self.eligible.id])

    def test_start_rejects_invalid_password_before_creating_job(self):
        tenant = MagicMock(
            is_microsoft_on=True, schema_name=self.schema_name
        )
        with schema_context(self.schema_name):
            with self.assertRaises(BulkPasswordResetError) as ctx:
                start_password_reset_job(tenant, [self.eligible.email], "short")
            job_count = MicrosoftRepairJob.objects.count()

        self.assertEqual(ctx.exception.code, "invalid_password")
        self.assertEqual(job_count, 0)

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_resets_eligible_and_finalizes_succeeded(
        self, mock_ms_user_cls, _mock_sleep
    ):
        mock_ms_user_cls.return_value.reset_password.return_value = {"status": 200}
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
                results=[
                    {
                        "email": "missing@x.io",
                        "status": "skipped",
                        "reason": "not_found",
                    }
                ],
                skipped=1,
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.SUCCEEDED)
            self.assertEqual(job.succeeded, 1)
            self.assertEqual(job.failed, 0)
            self.assertEqual(job.skipped, 1)
            self.assertEqual(job.total, 2)
            by_email = {r["email"]: r for r in job.results}
            self.assertEqual(by_email[self.eligible.email]["status"], "succeeded")
            self.assertEqual(by_email["missing@x.io"]["status"], "skipped")

        mock_ms_user_cls.return_value.reset_password.assert_called_once_with(
            self.eligible.microsoft_id,
            ANY,
            password="N0tBanned-Pass!",
        )

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_marks_graph_failures_and_finalizes_failed(
        self, mock_ms_user_cls, _mock_sleep
    ):
        mock_ms_user_cls.return_value.reset_password.return_value = {
            "status": 400,
            "reason": "Operation banned password",
        }
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.FAILED)
            self.assertEqual(job.failed, 1)
            row = job.results[0]
            self.assertEqual(row["email"], self.eligible.email)
            self.assertEqual(row["status"], "failed")
            self.assertEqual(row["reason"], "Operation banned password")

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_survives_token_errors_per_user(
        self, mock_ms_user_cls, _mock_sleep
    ):
        mock_ms_user_cls.return_value.reset_password.side_effect = ValueError(
            "Microsoft service account is not connected for this organization. "
            "Reconnect it in Organization settings."
        )
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.FAILED)
            row = job.results[0]
            self.assertEqual(row["status"], "failed")
            self.assertIn("not connected", row["reason"])

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_reverifies_timed_out_operations(
        self, mock_ms_user_cls, _mock_sleep
    ):
        ms = mock_ms_user_cls.return_value
        ms.reset_password.return_value = {
            "status": 504,
            "reason": (
                "Password reset operation did not complete in time; it may "
                "still apply — verify the account before retrying."
            ),
            "operation_url": "https://graph.microsoft.com/beta/operations/abc",
        }
        ms.check_reset_operation.return_value = (204, None)
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.SUCCEEDED)
            self.assertEqual(job.succeeded, 1)
            self.assertEqual(job.failed, 0)
            row = job.results[0]
            self.assertEqual(row["status"], "succeeded")
            self.assertNotIn("operation_url", row)

        ms.check_reset_operation.assert_called_once_with(
            "https://graph.microsoft.com/beta/operations/abc"
        )

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_keeps_rows_that_are_still_pending(
        self, mock_ms_user_cls, _mock_sleep
    ):
        ms = mock_ms_user_cls.return_value
        ms.reset_password.return_value = {
            "status": 504,
            "reason": "Password reset operation did not complete in time.",
            "operation_url": "https://graph.microsoft.com/beta/operations/xyz",
        }
        ms.check_reset_operation.return_value = (504, "Operation still pending.")
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.FAILED)
            self.assertEqual(job.failed, 1)
            row = job.results[0]
            self.assertEqual(row["status"], "failed")
            self.assertIn("did not complete", row["reason"])

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_skips_terminal_job(self, mock_ms_user_cls, _mock_sleep):
        with schema_context(self.schema_name):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id],
                status=MicrosoftRepairJob.Status.FAILED,
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.FAILED)

        mock_ms_user_cls.assert_not_called()

    @patch("app_microsoft.password_reset_bulk.time.sleep")
    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_runner_stops_when_cancelled_mid_loop(
        self, mock_ms_user_cls, _mock_sleep
    ):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            second = User.objects.create(
                email=f"job-second-{suffix}@x.io",
                name="Second",
                phone_number="1",
                communication_email=f"job-second-{suffix}@x.io",
                code=f"ms-pw-j2-{suffix}",
                roles=["student"],
                microsoft_id="ms-graph-id-job-2",
            )
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[self.eligible.id, second.id],
            )

            def flip_then_succeed(user_id, tenant, *, password=None):
                MicrosoftRepairJob.objects.filter(id=job.id).update(
                    status=MicrosoftRepairJob.Status.FAILED
                )
                return {"status": 200}

            mock_ms_user_cls.return_value.reset_password.side_effect = (
                flip_then_succeed
            )

            run_password_reset_job(job.id, self.schema_name, "N0tBanned-Pass!")

            job.refresh_from_db()
            self.assertEqual(job.status, MicrosoftRepairJob.Status.FAILED)
            self.assertEqual(job.succeeded, 1)
            self.assertEqual(len(job.results), 1)

        self.assertEqual(
            mock_ms_user_cls.return_value.reset_password.call_count, 1
        )

class PasswordResetBulkApiTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    def setUp(self):
        with schema_context(self.admin_schema):
            seed_rbac()
        suffix = uuid4().hex[:8]
        with schema_context(self.admin_schema):
            self.superadmin = User.objects.create(
                email=f"sa-{suffix}@x.io",
                name="Superadmin",
                phone_number="1",
                communication_email=f"sa-{suffix}@x.io",
                code=f"sa-{suffix}",
                roles=["superadmin"],
            )
            self.teacher = User.objects.create(
                email=f"t-{suffix}@x.io",
                name="Teacher",
                phone_number="1",
                communication_email=f"t-{suffix}@x.io",
                code=f"t-{suffix}",
                roles=["teacher"],
            )
        with schema_context(get_public_schema_name()):
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_microsoft_on=True,
            )
            self.customer_org.refresh_from_db()

    def tearDown(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_microsoft_on=False,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.admin_schema)
        return client

    @override_settings(RBAC_ENFORCE="enforce")
    def test_preview_requires_microsoft_repair(self):
        response = self._client(self.teacher).post(
            f"{self.api_prefix}/microsoft/password-reset/preview",
            {
                "emails": ["a@x.io"],
                "organization_id": self.customer_org.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_create_requires_microsoft_repair(self):
        response = self._client(self.teacher).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs",
            {
                "emails": ["a@x.io"],
                "organization_id": self.customer_org.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_microsoft.password_reset_bulk.run_password_reset_job")
    def test_job_create_returns_job_payload(self, mock_runner):
        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs",
            {
                "emails": ["a@x.io", "b@x.io"],
                "organization_id": self.customer_org.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.data["data"]
        self.assertEqual(payload["target_type"], "password_reset")
        self.assertEqual(payload["status"], "pending")
        self.assertEqual(payload["skipped"], 2)  # both emails unresolved
        self.assertEqual(payload["total"], 0)
        mock_runner.delay.assert_called_once()

        detail = self._client(self.superadmin).get(
            f"{self.api_prefix}/microsoft/password-reset/jobs/{payload['id']}",
            {"organization_id": self.customer_org.id},
        )
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["data"]["id"], payload["id"])

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_detail_unknown_id_is_404(self):
        response = self._client(self.superadmin).get(
            f"{self.api_prefix}/microsoft/password-reset/jobs/99999999",
            {"organization_id": self.customer_org.id},
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_cancel_marks_pending_job_failed(self):
        with schema_context(self.customer_schema):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                candidate_ids=[1, 2],
            )

        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs/{job.id}/cancel",
            {"organization_id": self.customer_org.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["status"], "failed")
        self.assertEqual(
            response.data["data"]["error_message"], "Cancelled by operator"
        )
        self.assertIsNotNone(response.data["data"]["finished_at"])

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_cancel_is_noop_on_terminal_job(self):
        with schema_context(self.customer_schema):
            job = MicrosoftRepairJob.objects.create(
                target_type=MicrosoftRepairJob.TargetType.PASSWORD_RESET,
                status=MicrosoftRepairJob.Status.SUCCEEDED,
            )

        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs/{job.id}/cancel",
            {"organization_id": self.customer_org.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["status"], "succeeded")

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_cancel_unknown_id_is_404(self):
        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs/99999999/cancel",
            {"organization_id": self.customer_org.id},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(RBAC_ENFORCE="enforce")
    def test_job_cancel_requires_microsoft_repair(self):
        response = self._client(self.teacher).post(
            f"{self.api_prefix}/microsoft/password-reset/jobs/1/cancel",
            {"organization_id": self.customer_org.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

