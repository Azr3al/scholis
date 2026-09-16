"""Queryset annotations for Event list/search."""

from django.db.models import Exists, OuterRef, QuerySet

from app_attendance.models import UserEvent


def annotate_events_has_checkin(queryset: QuerySet) -> QuerySet:
    return queryset.annotate(
        has_checkin=Exists(
            UserEvent.objects.filter(
                event_id=OuterRef("pk"),
                checkin_time__isnull=False,
                is_deleted=False,
            )
        )
    )
