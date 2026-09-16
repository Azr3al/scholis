from django.test import SimpleTestCase

from app_tasks.cron_registry import (
    CRON_JOBS,
    get_triggerable_command_names,
)

class CronRegistryTests(SimpleTestCase):

    def test_non_triggerable_notification_crons(self):
        non_triggerable = {
            j.log_command_name
            for j in CRON_JOBS
            if not j.triggerable
        }
        self.assertIn("send-daily-schedule-digest", non_triggerable)
        self.assertIn("alert-payment-assignment-gaps", non_triggerable)
        self.assertIn("cron-health-check", non_triggerable)

    def test_triggerable_allowlist_excludes_notifications(self):
        allowed = get_triggerable_command_names()
        self.assertIn("process-courses", allowed)
        self.assertIn("sweep_custom_field_attachments", allowed)
        self.assertNotIn("send-class-starting-reminders", allowed)
