"""
Backfill UserEvent.hourly_rate_at_calculation for teacher rows that already have
check-in/out times but no frozen hourly rate.
"""
from datetime import datetime

import pytz
from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_course.rate_utils import get_hourly_rate_for_teacher_course
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Backfill hourly_rate_at_calculation on teacher UserEvents that have "
        "checkin/checkout but a null hourly_rate_at_calculation."
    )

    def handle(self, *args, **options):
        with schema_context(get_public_schema_name()):
            organizations = list(Organization.objects.all())

        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(
                    self.style.WARNING(f"Skipping org (no schema_name): {org}")
                )
                continue

            with schema_context(schema_name):
                ues: list[UserEvent] = (
                    UserEvent.objects.filter(
                        checkin_time__isnull=False,
                        checkout_time__isnull=False,
                        hourly_rate_at_calculation__isnull=True,
                        created_at__lte=datetime.now(tz=pytz.UTC),
                        user__roles__contained_by=["teacher"],
                    ).select_related("user", "event", "event__course")
                )
                for i in ues:
                    rate = get_hourly_rate_for_teacher_course(
                        i.user, i.event.course, org
                    )
                    if rate is not None:
                        i.hourly_rate_at_calculation = rate
                UserEvent.objects.bulk_update(ues, ["hourly_rate_at_calculation"])
