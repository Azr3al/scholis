import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_crm import models, services

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SeedDataTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MoveLeadServiceTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"crm-move-{suffix}@example.com",
                password="x",
                name="Rep2",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"crm-move-{suffix}@example.com",
                code=f"crm-move-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.new = models.LeadStatus.objects.get(name="New inquiry")
            self.contacted = models.LeadStatus.objects.get(name="Contacted")
            self.appt_status = models.LeadStatus.objects.get(name="Appointment booked")
            self.source = models.LeadSource.objects.get(name="Referral")
            self.lead = models.Lead.objects.create(
                name="Aung",
                source=self.source,
                status=self.new,
                assignee=self.user,
                created_by=self.user,
            )

    def test_move_normal_logs_event(self):
        with schema_context(self.schema_name):
            services.move_lead(self.lead, self.contacted, actor=self.user)
            self.lead.refresh_from_db()
            self.assertEqual(self.lead.status, self.contacted)
            ev = self.lead.events.filter(
                event_type=models.LeadEvent.EventType.STATUS_CHANGED
            ).first()
            self.assertEqual(ev.payload["from"], self.new.name)
            self.assertEqual(ev.payload["to"], self.contacted.name)

    def test_move_to_appointment_requires_payload(self):
        with schema_context(self.schema_name):
            with self.assertRaises(services.AppointmentRequired):
                services.move_lead(self.lead, self.appt_status, actor=self.user)

    def test_move_to_appointment_with_payload_creates_appointment(self):
        with schema_context(self.schema_name):
            services.move_lead(
                self.lead,
                self.appt_status,
                actor=self.user,
                appointment={
                    "scheduled_at": "2026-07-02T08:00:00Z",
                    "platform": "ZOOM",
                    "consultant": self.user.id,
                },
            )
            self.lead.refresh_from_db()
            self.assertEqual(self.lead.appointments.count(), 1)
            self.assertTrue(
                self.lead.events.filter(
                    event_type=models.LeadEvent.EventType.APPOINTMENT_BOOKED
                ).exists()
            )
            ev = self.lead.events.filter(
                event_type=models.LeadEvent.EventType.APPOINTMENT_BOOKED
            ).first()
            appt = self.lead.appointments.first()
            self.assertEqual(ev.payload["appointment_id"], appt.id)
            self.assertIn("scheduled_at", ev.payload)
            self.assertEqual(ev.payload["platform"], "ZOOM")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ConvertServiceTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"crm-conv-{suffix}@example.com",
                password="x",
                name="Rep3",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"crm-conv-{suffix}@example.com",
                code=f"crm-conv-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.new = models.LeadStatus.objects.get(name="New inquiry")
            self.student_status = models.LeadStatus.objects.get(name="Student")
            self.source = models.LeadSource.objects.get(name="Other")
            self.lead = models.Lead.objects.create(
                name="Hnin",
                source=self.source,
                status=self.new,
                assignee=self.user,
                created_by=self.user,
            )

    def test_convert_creates_student_user(self):
        with schema_context(self.schema_name):
            student = services.convert_lead_to_student(
                self.lead,
                actor=self.user,
                student_data={"name": "Hnin Student", "email": "hnin@example.com"},
            )
            self.lead.refresh_from_db()
            self.assertEqual(self.lead.converted_user, student)
            self.assertIn(User.UserRole.STUDENT, student.roles)
            self.assertEqual(self.lead.status, self.student_status)
            self.assertTrue(
                self.lead.events.filter(
                    event_type=models.LeadEvent.EventType.CONVERTED
                ).exists()
            )
