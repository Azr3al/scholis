import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_crm import models
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class IssueViewBaseTest(TestCase):
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
                email=f"issue-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"issue-admin-{suffix}@example.com",
                code=f"issue-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.open_status = models.IssueStatus.objects.get(name="Open")
            self.in_progress = models.IssueStatus.objects.get(name="In progress")

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _make_user(self, roles, prefix="issue-user"):
        suffix = uuid4().hex[:6]
        return User.objects.create_user(
            email=f"{prefix}-{suffix}@example.com",
            password="x",
            name=prefix,
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            communication_email=f"{prefix}-{suffix}@example.com",
            code=f"{prefix}-{suffix}",
            roles=roles,
        )

    def _set_notify_toggle(self, value: bool):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.notify_issue_observers_on_status_change = value
            org.save(update_fields=["notify_issue_observers_on_status_change"])

    def test_create_issue_sets_assignee_observer_and_default_status(self):
        with schema_context(self.schema_name):
            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues",
                {"title": "Broken projector"},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            issue = models.Issue.objects.get(id=res.json()["data"]["id"])
            self.assertEqual(issue.created_by, self.admin)
            self.assertEqual(issue.assignee, self.admin)
            self.assertTrue(issue.observers.filter(id=self.admin.id).exists())
            self.assertEqual(issue.status, self.open_status)
            self.assertTrue(
                issue.events.filter(
                    event_type=models.IssueEvent.EventType.CREATED
                ).exists()
            )

    @patch("app_utils.board_observers.send_mail")
    def test_move_with_toggle_on_emails_observer_except_actor(self, mock_send):
        self._set_notify_toggle(True)
        with schema_context(self.schema_name):
            issue = models.Issue.objects.create(
                title="Leaky roof",
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            observer = self._make_user([User.UserRole.TEACHER], "issue-obs-on")
            issue.observers.add(self.admin, observer)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue.id}/move",
                {"status": self.in_progress.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            issue.refresh_from_db()
            self.assertEqual(issue.status, self.in_progress)
            self.assertTrue(
                issue.events.filter(
                    event_type=models.IssueEvent.EventType.STATUS_CHANGED
                ).exists()
            )
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][3], observer.email)

    @patch("app_utils.board_observers.send_mail")
    def test_move_with_toggle_off_no_email(self, mock_send):
        self._set_notify_toggle(False)
        with schema_context(self.schema_name):
            issue = models.Issue.objects.create(
                title="Broken chair",
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            observer = self._make_user([User.UserRole.TEACHER], "issue-obs-off")
            issue.observers.add(observer)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue.id}/move",
                {"status": self.in_progress.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
        mock_send.assert_not_called()

    def test_comment_with_mention_adds_eligible_observer(self):
        with schema_context(self.schema_name):
            issue = models.Issue.objects.create(
                title="Slow wifi",
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            teacher = self._make_user([User.UserRole.TEACHER], "issue-teacher")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue.id}/comments",
                {"body": "hello @teacher", "mentions": [{"user_id": teacher.id}]},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            self.assertTrue(issue.observers.filter(id=teacher.id).exists())
            self.assertTrue(
                issue.events.filter(
                    event_type=models.IssueEvent.EventType.OBSERVER_ADDED
                ).exists()
            )

    def test_comment_mention_of_ineligible_user_returns_400(self):
        with schema_context(self.schema_name):
            issue = models.Issue.objects.create(
                title="Noisy AC",
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            student = self._make_user([User.UserRole.STUDENT], "issue-student")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/issues/{issue.id}/comments",
                {"body": "hi @student", "mentions": [{"user_id": student.id}]},
                format="json",
            )
            self.assertEqual(res.status_code, 400)
            self.assertFalse(issue.observers.filter(id=student.id).exists())

    def test_update_assignee_records_timeline_event(self):
        with schema_context(self.schema_name):
            issue = models.Issue.objects.create(
                title="Projector bulb",
                status=self.open_status,
                assignee=self.admin,
                created_by=self.admin,
            )
            new_assignee = self._make_user([User.UserRole.TEACHER], "issue-assignee")
            res = self._client(self.admin).put(
                f"{self.api_prefix}/issues/{issue.id}",
                {"assignee": new_assignee.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
            issue.refresh_from_db()
            self.assertEqual(issue.assignee, new_assignee)
            event = issue.events.filter(
                event_type=models.IssueEvent.EventType.ASSIGNEE_CHANGED
            ).first()
            self.assertIsNotNone(event)
            self.assertEqual(event.payload["from"], self.admin.name)
            self.assertEqual(event.payload["to"], new_assignee.name)

    def test_mention_candidates_multi_word_search(self):
        with schema_context(self.schema_name):
            target = User.objects.create_user(
                email=f"htin-wana-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Htin Wana",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"htin-wana-{uuid4().hex[:6]}@example.com",
                code=f"htin-wana-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
            res = self._client(self.admin).get(
                f"{self.api_prefix}/issues/mention-candidates",
                {"q": "Wana Htin"},
            )
            self.assertEqual(res.status_code, 200, res.content)
            ids = {item["id"] for item in res.json()["data"]}
            self.assertIn(target.id, ids)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class IssuePermissionTest(TestCase):
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
                email=f"issue-perm-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"issue-perm-admin-{suffix}@example.com",
                code=f"issue-perm-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"issue-perm-teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"issue-perm-teacher-{suffix}@example.com",
                code=f"issue-perm-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"issue-perm-student-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"issue-perm-student-{suffix}@example.com",
                code=f"issue-perm-student-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.open_status = models.IssueStatus.objects.get(name="Open")

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_student_get_issues_returns_404_when_crm_disabled(self):
        with schema_context(self.schema_name):
            res = self._client(self.student).get(f"{self.api_prefix}/issues")
            self.assertEqual(res.status_code, 404)

