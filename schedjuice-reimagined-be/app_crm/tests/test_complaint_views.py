import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attachment.models import Attachment
from app_auth.models import User
from app_crm import models
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_crm.complaint_helpers import ANONYMOUS_PARENT_COMPLAINT_TITLE
from app_utility_notifications.utility_notification_helpers import utility_notifications_for_user
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ComplaintViewBaseTest(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"complaint-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"complaint-admin-{suffix}@example.com",
                code=f"complaint-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student_a = self._make_student(f"complaint-student-a-{suffix}")
            self.student_b = self._make_student(f"complaint-student-b-{suffix}")
            self.open_status = models.IssueStatus.objects.get(name="Open")
            self.in_progress_status = models.IssueStatus.objects.get(name="In progress")
            self.done_status = models.IssueStatus.objects.get(name="Done")
            self.cancelled_status = models.IssueStatus.objects.get(name="Cancelled")
        self._set_crm_enabled(True)

    def _make_student(self, prefix: str) -> User:
        return User.objects.create_user(
            email=f"{prefix}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(2000, 1, 1),
            communication_email=f"{prefix}@example.com",
            code=prefix,
            roles=[User.UserRole.STUDENT],
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _set_crm_enabled(self, value: bool):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_crm_enabled = value
            org.save(update_fields=["is_crm_enabled"])

    def _create_attachment(self) -> Attachment:
        return Attachment.objects.create(
            filename="photo.jpg",
            is_image=True,
            table_name="chat",
            size=1024,
        )

    def test_student_create_parent_complaint_sets_source_and_related_student(self):
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Bus late"},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            payload = res.json()["data"]
            issue = models.Issue.objects.get(id=payload["id"])
            self.assertEqual(issue.source, models.IssueSource.PARENT_COMPLAINT)
            self.assertEqual(issue.related_student, self.student_a)
            self.assertEqual(issue.created_by, self.student_a)
            self.assertIsNone(issue.assignee)
            self.assertEqual(issue.description, "Bus late")
            self.assertTrue(issue.comments.filter(body="Bus late").exists())
            self.assertTrue(
                issue.events.filter(
                    event_type=models.IssueEvent.EventType.CREATED
                ).exists()
            )

    def test_student_list_only_own_complaints(self):
        with schema_context(self.schema_name):
            self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Mine"},
                format="json",
            )
            self._client(self.student_b).post(
                f"{self.api_prefix}/issues",
                {"body": "Theirs"},
                format="json",
            )
            res = self._client(self.student_a).get(f"{self.api_prefix}/issues")
            self.assertEqual(res.status_code, 200, res.content)
            rows = res.json()["data"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["related_student"], self.student_a.id)

    def test_student_cannot_view_other_students_complaint(self):
        with schema_context(self.schema_name):
            other = models.Issue.objects.create(
                title="Parent complaint — Other",
                description="Secret",
                source=models.IssueSource.PARENT_COMPLAINT,
                related_student=self.student_b,
                created_by=self.student_b,
                status=self.open_status,
            )
            res = self._client(self.student_a).get(
                f"{self.api_prefix}/issues/{other.id}"
            )
            self.assertEqual(res.status_code, 404)

    def test_student_comment_blocked_when_done(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Needs help"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.status = self.done_status
            issue.save(update_fields=["status"])
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/comments",
                {"body": "Follow up"},
                format="json",
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("Reopen to reply", res.json()["message"])

    def test_student_comment_blocked_when_cancelled(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Needs help"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.status = self.cancelled_status
            issue.save(update_fields=["status"])
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/comments",
                {"body": "Follow up"},
                format="json",
            )
            self.assertEqual(res.status_code, 403)
            self.assertIn("Reopen to reply", res.json()["message"])

    def test_student_forbidden_non_reopen_move(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Open issue"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {"status": self.in_progress_status.id},
                format="json",
            )
            self.assertEqual(res.status_code, 403)

    def test_crm_disabled_student_get_issues_404(self):
        self._set_crm_enabled(False)
        with schema_context(self.schema_name):
            res = self._client(self.student_a).get(f"{self.api_prefix}/issues")
            self.assertEqual(res.status_code, 404)

    def test_student_reopen_when_already_open_returns_400(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Still open"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {"status": self.open_status.id},
                format="json",
            )
            self.assertEqual(res.status_code, 400)

    def test_student_reopen_moves_to_open(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Closed issue"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.status = self.done_status
            issue.save(update_fields=["status"])
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {"status": self.open_status.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            issue.refresh_from_db()
            self.assertEqual(issue.status, self.open_status)

    def test_student_reopen_without_status_uses_default_open(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Done-only list reopen"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.status = self.done_status
            issue.save(update_fields=["status"])

            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            issue.refresh_from_db()
            self.assertEqual(issue.status, self.open_status)

    def test_staff_filter_by_source(self):
        with schema_context(self.schema_name):
            models.Issue.objects.create(
                title="Internal",
                description="Staff only",
                source=models.IssueSource.INTERNAL,
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            models.Issue.objects.create(
                title="Parent complaint — Student",
                description="Parent issue",
                source=models.IssueSource.PARENT_COMPLAINT,
                related_student=self.student_a,
                status=self.open_status,
                created_by=self.student_a,
            )
            res = self._client(self.admin).get(
                f"{self.api_prefix}/issues",
                {"source": models.IssueSource.PARENT_COMPLAINT},
            )
            self.assertEqual(res.status_code, 200, res.content)
            rows = res.json()["data"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["source"], models.IssueSource.PARENT_COMPLAINT)

    @patch("app_crm.complaint_helpers.validate_chat_attachment_refs")
    def test_create_with_attachments_only(self, mock_validate):
        with schema_context(self.schema_name):
            attachment = self._create_attachment()
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"attachments": [{"attachment_id": attachment.id}]},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            issue = models.Issue.objects.get(id=res.json()["data"]["id"])
            comment = issue.comments.first()
            self.assertEqual(comment.attachments, [{"attachment_id": attachment.id}])
            self.assertEqual(issue.description, "Sent an attachment.")
            mock_validate.assert_called_once()

    def test_crm_disabled_returns_404(self):
        self._set_crm_enabled(False)
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Should fail"},
                format="json",
            )
            self.assertEqual(res.status_code, 404)

    def test_student_timeline_is_student_safe(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Timeline test"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            models.IssueEvent.objects.create(
                issue=issue,
                actor=self.admin,
                event_type=models.IssueEvent.EventType.ASSIGNEE_CHANGED,
                payload={"from": "A", "to": "B"},
            )

            res = self._client(self.student_a).get(
                f"{self.api_prefix}/issues/{issue_id}/timeline"
            )
            self.assertEqual(res.status_code, 200, res.content)
            items = res.json()["data"]
            event_types = {
                item["event_type"] for item in items if item["kind"] == "event"
            }
            self.assertNotIn(models.IssueEvent.EventType.ASSIGNEE_CHANGED, event_types)
            self.assertIn(models.IssueEvent.EventType.CREATED, event_types)

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_student_create_notifies_admins(self, mock_enqueue):
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Need help"},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            issue_id = res.json()["data"]["id"]
            mock_enqueue.assert_called_once()
            args, kwargs = mock_enqueue.call_args
            self.assertIn(self.admin.id, args[0])
            self.assertNotIn(self.student_a.id, args[0])
            self.assertEqual(kwargs["data"]["kind"], UtilityNotificationKind.COMPLAINT_NEW.value)
            self.assertEqual(
                kwargs["data"]["href"],
                f"/crm/issues?issue={issue_id}",
            )

    def test_student_create_anonymous_complaint_sets_flag_and_title(self):
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Sensitive issue", "is_anonymous": True},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            payload = res.json()["data"]
            issue = models.Issue.objects.get(id=payload["id"])
            self.assertTrue(issue.is_anonymous)
            self.assertEqual(issue.title, ANONYMOUS_PARENT_COMPLAINT_TITLE)
            self.assertEqual(issue.related_student, self.student_a)
            self.assertEqual(issue.created_by, self.student_a)

    def test_staff_get_anonymous_complaint_redacts_student_identity(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Sensitive issue", "is_anonymous": True},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]

            res = self._client(self.admin).get(f"{self.api_prefix}/issues/{issue_id}")
            self.assertEqual(res.status_code, 200, res.content)
            payload = res.json()["data"]
            self.assertTrue(payload["is_anonymous"])
            self.assertIsNone(payload["related_student"])
            self.assertIsNone(payload["created_by"])

    def test_student_get_anonymous_complaint_sees_own_identity(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Sensitive issue", "is_anonymous": True},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]

            res = self._client(self.student_a).get(f"{self.api_prefix}/issues/{issue_id}")
            self.assertEqual(res.status_code, 200, res.content)
            payload = res.json()["data"]
            self.assertTrue(payload["is_anonymous"])
            self.assertEqual(payload["related_student"], self.student_a.id)
            self.assertEqual(payload["created_by"], self.student_a.id)

    def test_staff_timeline_redacts_student_author_for_anonymous_complaint(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Sensitive issue", "is_anonymous": True},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]

            self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue_id}/comments",
                {"body": "We are reviewing this."},
                format="json",
            )

            res = self._client(self.admin).get(
                f"{self.api_prefix}/issues/{issue_id}/timeline"
            )
            self.assertEqual(res.status_code, 200, res.content)
            items = res.json()["data"]
            student_comments = [
                item
                for item in items
                if item["kind"] == "comment" and item["body"] == "Sensitive issue"
            ]
            staff_comments = [
                item
                for item in items
                if item["kind"] == "comment" and item["body"] == "We are reviewing this."
            ]
            self.assertEqual(len(student_comments), 1)
            self.assertEqual(student_comments[0]["actor"]["name"], "Anonymous")
            self.assertEqual(staff_comments[0]["actor"]["name"], self.admin.name)

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_anonymous_create_notification_omits_student_name(self, mock_enqueue):
        with schema_context(self.schema_name):
            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Need help", "is_anonymous": True},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            mock_enqueue.assert_called_once()
            _args, kwargs = mock_enqueue.call_args
            self.assertEqual(kwargs["body"], "An anonymous parent complaint was filed.")

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_staff_reply_notifies_related_student(self, mock_enqueue):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Initial"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            mock_enqueue.reset_mock()

            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue_id}/comments",
                {"body": "We are looking into this."},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            mock_enqueue.assert_called_once()
            args, kwargs = mock_enqueue.call_args
            self.assertEqual(args[0], [self.student_a.id])
            self.assertEqual(kwargs["data"]["kind"], UtilityNotificationKind.COMPLAINT_REPLY.value)
            self.assertEqual(
                kwargs["data"]["href"],
                f"/complaints/{issue_id}",
            )
            self.assertEqual(kwargs["body"], "We are looking into this.")

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_student_reopen_notifies_admins_when_unassigned(self, mock_enqueue):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Closed soon"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.status = self.done_status
            issue.save(update_fields=["status"])
            mock_enqueue.reset_mock()

            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {"status": self.open_status.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            mock_enqueue.assert_called_once()
            args, kwargs = mock_enqueue.call_args
            self.assertIn(self.admin.id, args[0])
            self.assertEqual(
                kwargs["data"]["kind"],
                UtilityNotificationKind.COMPLAINT_REOPENED.value,
            )

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_student_reopen_notifies_assignee_when_assigned(self, mock_enqueue):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Assigned reopen"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            issue = models.Issue.objects.get(id=issue_id)
            issue.assignee = self.admin
            issue.save(update_fields=["assignee"])
            issue.status = self.done_status
            issue.save(update_fields=["status"])
            mock_enqueue.reset_mock()

            res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues/{issue_id}/move",
                {"status": self.open_status.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            mock_enqueue.assert_called_once()
            args, kwargs = mock_enqueue.call_args
            self.assertEqual(args[0], [self.admin.id])
            self.assertEqual(
                kwargs["data"]["kind"],
                UtilityNotificationKind.COMPLAINT_REOPENED.value,
            )

    @patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")
    def test_assignee_change_notifies_new_assignee(self, mock_enqueue):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Assign me"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]
            mock_enqueue.reset_mock()

            res = self._client(self.admin).put(
                f"{self.api_prefix}/issues/{issue_id}",
                {"assignee": self.admin.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            mock_enqueue.assert_called_once()
            args, kwargs = mock_enqueue.call_args
            self.assertEqual(args[0], [self.admin.id])
            self.assertEqual(
                kwargs["data"]["kind"],
                UtilityNotificationKind.COMPLAINT_ASSIGNED.value,
            )

    def test_complaint_catalog_rows_for_admin_and_student(self):
        with schema_context(self.schema_name):
            create_res = self._client(self.student_a).post(
                f"{self.api_prefix}/issues",
                {"body": "Catalog row test"},
                format="json",
            )
            issue_id = create_res.json()["data"]["id"]

            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue_id}/comments",
                {"body": "Staff reply for catalog"},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)

            catalog_now = datetime.now(timezone.utc)
            admin_rows = utility_notifications_for_user(
                self.admin,
                now=catalog_now,
                tenant_tz="UTC",
            )
            student_rows = utility_notifications_for_user(
                self.student_a,
                now=catalog_now,
                tenant_tz="UTC",
            )

        admin_kinds = {row["kind"] for row in admin_rows}
        student_kinds = {row["kind"] for row in student_rows}
        self.assertIn(UtilityNotificationKind.COMPLAINT_NEW.value, admin_kinds)
        self.assertIn(UtilityNotificationKind.COMPLAINT_REPLY.value, student_kinds)

        new_row = next(
            row
            for row in admin_rows
            if row["kind"] == UtilityNotificationKind.COMPLAINT_NEW.value
        )
        self.assertEqual(new_row["route"], "/crm/issues")
        self.assertEqual(new_row["params"]["issue"], issue_id)

        reply_row = next(
            row
            for row in student_rows
            if row["kind"] == UtilityNotificationKind.COMPLAINT_REPLY.value
        )
        self.assertEqual(reply_row["route"], "/complaints/[id]")
        self.assertEqual(reply_row["params"]["id"], issue_id)
        self.assertEqual(reply_row["body"], "Staff reply for catalog")
