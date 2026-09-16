import json
import logging

from django.apps import AppConfig
from django.db.utils import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)


class AppTasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_tasks"

    def ready(self):
        from django_q.models import Schedule

        from app_tasks.cron_registry import schedule_dicts_for_django_q

        schedules = schedule_dicts_for_django_q()
        try:
            created_schedules = list(Schedule.objects.all().values_list("name", flat=True))
        except (ProgrammingError, OperationalError):
            # Fresh DBs may not have django_q_schedule yet; skip until migrations run.
            return
        to_be_created_schedule_names = [i["name"] for i in schedules if i["name"] not in created_schedules]
        to_be_deleted_schedule_names = [i for i in created_schedules if i not in [j["name"] for j in schedules]]
        if to_be_deleted_schedule_names:
            Schedule.objects.filter(name__in=to_be_deleted_schedule_names).delete()
            print(f"Deleted schedules: {to_be_deleted_schedule_names}")
        for i in to_be_created_schedule_names:
            schedule_object = [item for item in schedules if item["name"] == i]
            if schedule_object:
                schedule_object = dict(schedule_object[0])
            else:
                continue
            custom_func = schedule_object.pop("func", None)
            if custom_func:
                Schedule.objects.create(func=custom_func, **schedule_object)
            else:
                Schedule.objects.create(
                    func="app_tasks.cron_runner.run_cron_command",
                    **schedule_object,
                )
            print(f"Created schedule: {i}")

        # Migrate existing schedules from call_command to run_cron_command wrapper
        Schedule.objects.filter(func="django.core.management.call_command").update(
            func="app_tasks.cron_runner.run_cron_command"
        )

        # Keep stored cron in sync with code (ready() only creates missing schedules).
        Schedule.objects.filter(name="alert-payment-assignment-gaps").update(
            func="app_tasks.payment_assignment_gap_digest.run_payment_assignment_gap_digest_wrapped",
            args="()",
            kwargs={},
            cron="0 2 * * *",
        )
        Schedule.objects.filter(name="ensure-payment-assignments").update(
            func="app_tasks.cron_runner.schedule_ensure_payment_assignments",
            args="()",
            kwargs={},
            cron="5 0 * * *",
        )
        Schedule.objects.filter(name="send-class-starting-reminders").update(
            cron="*/10 * * * *",
        )

        # Ensure cron commands with sync param run async (kwargs may be stored as JSON string)
        async_cron_names = {
            "sync-meeting-attendance",
            "sync-video-attendance",
            "sync-payment-submissions",
        }
        for s in Schedule.objects.filter(name__in=async_cron_names):
            raw = getattr(s, "kwargs", None)
            if isinstance(raw, str):
                try:
                    current_kwargs = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    current_kwargs = {}
            else:
                current_kwargs = raw if isinstance(raw, dict) else {}
            if current_kwargs.get("sync") is not False:
                s.kwargs = {**current_kwargs, "sync": False}
                s.save()
                print(f"Updated schedule {s.name} to run async (sync=False)")
