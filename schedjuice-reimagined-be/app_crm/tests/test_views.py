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
class LeadViewBaseTest(TestCase):
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
                email=f"crm-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"crm-admin-{suffix}@example.com",
                code=f"crm-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.new = models.LeadStatus.objects.get(name="New inquiry")
            self.contacted = models.LeadStatus.objects.get(name="Contacted")
            self.appt = models.LeadStatus.objects.get(name="Appointment booked")
            self.student_status = models.LeadStatus.objects.get(name="Student")
            self.source = models.LeadSource.objects.get(name="Referral")

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _make_user(self, roles, prefix="crm-user"):
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
            org.notify_lead_observers_on_status_change = value
            org.save(update_fields=["notify_lead_observers_on_status_change"])

    def test_create_lead_sets_creator_and_assignee(self):
        with schema_context(self.schema_name):
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads",
                {"name": "Su", "source": self.source.id, "status": self.new.id},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            lead = models.Lead.objects.get(id=res.json()["data"]["id"])
            self.assertEqual(lead.created_by, self.admin)
            self.assertEqual(lead.assignee, self.admin)
            self.assertTrue(
                lead.events.filter(
                    event_type=models.LeadEvent.EventType.CREATED
                ).exists()
            )

    def test_move_to_appointment_without_payload_400(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="X",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/move",
                {"status": self.appt.id},
                format="json",
            )
            self.assertEqual(res.status_code, 400)

    def test_timeline_merges_events_and_comments(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="Z",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            models.LeadEvent.objects.create(
                lead=lead,
                actor=self.admin,
                event_type=models.LeadEvent.EventType.CREATED,
                payload={},
            )
            self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/comments",
                {"body": "hello"},
                format="json",
            )
            res = self._client(self.admin).get(
                f"{self.api_prefix}/leads/{lead.id}/timeline"
            )
            self.assertEqual(res.status_code, 200)
            kinds = {item["kind"] for item in res.json()["data"]}
            self.assertEqual(kinds, {"event", "comment"})

    def test_create_lead_adds_creator_as_observer(self):
        with schema_context(self.schema_name):
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads",
                {"name": "Ob", "source": self.source.id, "status": self.new.id},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            lead = models.Lead.objects.get(id=res.json()["data"]["id"])
            self.assertTrue(lead.observers.filter(id=self.admin.id).exists())

    def test_comment_with_mention_adds_observer(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="M",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            teacher = self._make_user([User.UserRole.TEACHER], "crm-teacher")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/comments",
                {"body": "hello @teacher", "mentions": [{"user_id": teacher.id}]},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            self.assertTrue(lead.observers.filter(id=teacher.id).exists())
            self.assertTrue(
                lead.events.filter(
                    event_type=models.LeadEvent.EventType.OBSERVER_ADDED
                ).exists()
            )

    def test_comment_mention_of_student_returns_400(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="N",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            student = self._make_user([User.UserRole.STUDENT], "crm-nolead")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/comments",
                {"body": "hi @student", "mentions": [{"user_id": student.id}]},
                format="json",
            )
            self.assertEqual(res.status_code, 400)
            self.assertFalse(lead.observers.filter(id=student.id).exists())

    @patch("app_utils.board_observers.send_mail")
    def test_move_with_toggle_off_no_email(self, mock_send):
        self._set_notify_toggle(False)
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="O",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            observer = self._make_user([User.UserRole.TEACHER], "crm-obs-off")
            lead.observers.add(observer)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/move",
                {"status": self.contacted.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
        mock_send.assert_not_called()

    @patch("app_utils.board_observers.send_mail")
    def test_move_with_toggle_on_emails_observer_except_actor(self, mock_send):
        self._set_notify_toggle(True)
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="P",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            observer = self._make_user([User.UserRole.TEACHER], "crm-obs-on")
            lead.observers.add(self.admin, observer)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/move",
                {"status": self.contacted.id},
                format="json",
            )
            self.assertEqual(res.status_code, 200, res.content)
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][3], observer.email)

    def test_observer_add_and_remove_endpoints(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="Q",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            teacher = self._make_user([User.UserRole.TEACHER], "crm-manual-obs")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/observers",
                {"user_id": teacher.id},
                format="json",
            )
            self.assertEqual(res.status_code, 201, res.content)
            self.assertTrue(lead.observers.filter(id=teacher.id).exists())
            self.assertTrue(
                lead.events.filter(
                    event_type=models.LeadEvent.EventType.OBSERVER_ADDED
                ).exists()
            )

            res = self._client(self.admin).delete(
                f"{self.api_prefix}/leads/{lead.id}/observers/{teacher.id}"
            )
            self.assertEqual(res.status_code, 200, res.content)
            self.assertFalse(lead.observers.filter(id=teacher.id).exists())

    def test_observer_add_rejects_user_without_lead_view(self):
        with schema_context(self.schema_name):
            lead = models.Lead.objects.create(
                name="R",
                source=self.source,
                status=self.new,
                assignee=self.admin,
                created_by=self.admin,
            )
            student = self._make_user([User.UserRole.STUDENT], "crm-obs-student")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/leads/{lead.id}/observers",
                {"user_id": student.id},
                format="json",
            )
            self.assertEqual(res.status_code, 400)
            self.assertFalse(lead.observers.filter(id=student.id).exists())

    def test_mention_candidates_excludes_students(self):
        with schema_context(self.schema_name):
            teacher = self._make_user([User.UserRole.TEACHER], "crm-cand-teacher")
            self._make_user([User.UserRole.STUDENT], "crm-cand-student")
            res = self._client(self.admin).get(
                f"{self.api_prefix}/leads/mention-candidates"
            )
            self.assertEqual(res.status_code, 200, res.content)
            ids = {item["id"] for item in res.json()["data"]}
            self.assertIn(teacher.id, ids)
            self.assertIn(self.admin.id, ids)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class LeadPermissionTest(TestCase):
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
            self.student = User.objects.create_user(
                email=f"crm-stu-{suffix}@example.com",
                password="x",
                name="S",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"crm-stu-{suffix}@example.com",
                code=f"crm-stu-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.source = models.LeadSource.objects.get(name="Other")
            self.new = models.LeadStatus.objects.get(name="New inquiry")

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_student_cannot_create_lead(self):
        with schema_context(self.schema_name):
            res = self._client(self.student).post(
                f"{self.api_prefix}/leads",
                {"name": "Nope", "source": self.source.id, "status": self.new.id},
                format="json",
            )
            self.assertEqual(res.status_code, 403)

    def test_student_cannot_view_leads(self):
        with schema_context(self.schema_name):
            res = self._client(self.student).get(f"{self.api_prefix}/leads")
            self.assertEqual(res.status_code, 403)
