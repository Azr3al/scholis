import logging
import random
import string

from django.utils import timezone
from datetime import timedelta

from django.core.management import BaseCommand

from app_course.models import Event

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    def _generate_code(self) -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "".join(random.choices(alphabet, k=6))

    def handle(self, *args, **options):
        logger.info("Running [generate-attendance-codes]")

        current_time = timezone.now()
        check_attendance_time = current_time + timedelta(minutes=15)

        events_to_update = []
        seen_event_ids = set()

        for minute_offset in range(0, 15):
            check_attendance_time = current_time + timedelta(minutes=minute_offset)
            upcoming_events = Event.objects.filter(
                date=check_attendance_time.date(),
                time_from__lte=check_attendance_time.time(),
                time_from__gte=current_time.time(),
            )

            logger.info(f"Found {len(upcoming_events)} events starting within the next 15 minutes")

            for event in upcoming_events:
                if event.id in seen_event_ids:
                    continue
                event.attendance_code = self._generate_code()
                events_to_update.append(event)
                seen_event_ids.add(event.id)

        if events_to_update:
            Event.objects.bulk_update(events_to_update, ["attendance_code"])
            logger.info(f"Updated {len(events_to_update)} events with attendance codes")
        else:
            logger.info("No events to update")
