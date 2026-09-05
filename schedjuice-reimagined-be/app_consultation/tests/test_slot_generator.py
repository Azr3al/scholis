import unittest
from datetime import date, datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_consultation.models import ConsultationWeeklyWhitelist
from app_consultation.presets import apply_lwtp_preset, lwtp_schedule_payload
from app_consultation.slot_generator import generate_consultation_slots


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_consultant(schema_name: str) -> User:
    suffix = uuid4().hex[:8]
    with schema_context(schema_name):
        return User.objects.create_user(
            email=f"consult-{suffix}@example.com",
            password="x",
            name="Consultant",
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            communication_email=f"consult-{suffix}@example.com",
            code=f"consult-{suffix}",
            roles=[User.UserRole.TEACHER],
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SlotGeneratorTests(TestCase):
    schema_name = "xschedjuice"
    org_tz = "Asia/Rangoon"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.consultant = _make_consultant(self.schema_name)
        with schema_context(self.schema_name):
            apply_lwtp_preset(self.consultant)
        # Monday 2026-08-10 — far enough out to avoid "today" filtering.
        self.target_date = date(2026, 8, 10)

    def _generate(self, **kwargs):
        tz = ZoneInfo(self.org_tz)
        defaults = {
            "now": datetime.combine(
                self.target_date - timedelta(days=1),
                time(12, 0),
                tzinfo=tz,
            ).astimezone(timezone.utc),
        }
        defaults.update(kwargs)
        with schema_context(self.schema_name):
            return generate_consultation_slots(
                self.target_date,
                self.consultant,
                self.org_tz,
                **defaults,
            )

    def test_lwtp_window_yields_four_slots(self):
        slots = self._generate()
        self.assertEqual([s["slot_time"] for s in slots], ["18:00", "18:30", "19:00", "19:30"])

    def test_busy_block_removes_overlapping_slot(self):
        tz = ZoneInfo(self.org_tz)
        busy_start = datetime.combine(self.target_date, time(18, 30), tzinfo=tz).astimezone(
            timezone.utc
        )
        busy_end = datetime.combine(self.target_date, time(19, 0), tzinfo=tz).astimezone(
            timezone.utc
        )
        slots = self._generate(busy_blocks=[(busy_start, busy_end)])
        self.assertEqual([s["slot_time"] for s in slots], ["18:00", "19:00", "19:30"])

    def test_disabled_day_returns_empty(self):
        with schema_context(self.schema_name):
            whitelist = ConsultationWeeklyWhitelist.objects.get(consultant=self.consultant)
            schedule = lwtp_schedule_payload()
            schedule["monday"]["enabled"] = False
            whitelist.schedule = schedule
            whitelist.save(update_fields=["schedule", "updated_at"])

        self.assertEqual(self._generate(), [])

    def test_partial_window_only_fits_first_slot(self):
        with schema_context(self.schema_name):
            whitelist = ConsultationWeeklyWhitelist.objects.get(consultant=self.consultant)
            schedule = lwtp_schedule_payload()
            schedule["monday"]["windows"] = [{"start": "18:00", "end": "18:45"}]
            whitelist.schedule = schedule
            whitelist.save(update_fields=["schedule", "updated_at"])

        slots = self._generate()
        self.assertEqual([s["slot_time"] for s in slots], ["18:00"])

    def test_no_whitelist_returns_empty(self):
        other = _make_consultant(self.schema_name)
        with schema_context(self.schema_name):
            slots = generate_consultation_slots(
                self.target_date,
                other,
                self.org_tz,
            )
        self.assertEqual(slots, [])

    def test_past_slots_dropped_for_today(self):
        tz = ZoneInfo(self.org_tz)
        today = date(2026, 8, 10)
        now_local = datetime.combine(today, time(18, 15), tzinfo=tz)
        now_utc = now_local.astimezone(timezone.utc)

        with schema_context(self.schema_name):
            slots = generate_consultation_slots(
                today,
                self.consultant,
                self.org_tz,
                now=now_utc,
            )

        self.assertEqual([s["slot_time"] for s in slots], ["18:30", "19:00", "19:30"])

    def test_apply_lwtp_preset_enables_all_weekdays(self):
        with schema_context(self.schema_name):
            whitelist = apply_lwtp_preset(self.consultant)
        for day in lwtp_schedule_payload():
            day_cfg = whitelist.schedule[day]
            self.assertTrue(day_cfg["enabled"])
            self.assertEqual(day_cfg["windows"], [{"start": "18:00", "end": "20:00"}])
