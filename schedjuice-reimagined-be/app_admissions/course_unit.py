from __future__ import annotations

from django.db.models import OuterRef, Subquery
from zoneinfo import ZoneInfo

from app_announcement.models import Announcement, PostType

_TZ_NAME_FOR_POSTGRES = {
    "Asia/Rangoon": "Asia/Yangon",
}


def annotate_current_unit(queryset):
    latest = Announcement.objects.filter(
        course_id=OuterRef("pk"),
        post_type=PostType.DAILY_LESSON,
        finished_unit__isnull=False,
    ).order_by("-created_at")
    return queryset.annotate(
        current_unit=Subquery(latest.values("finished_unit")[:1]),
        current_unit_updated_at=Subquery(latest.values("updated_at")[:1]),
    )


def format_current_unit_updated_at(value, tenant=None) -> str | None:
    if value is None:
        return None
    tz_name = "UTC"
    if tenant is not None:
        raw = getattr(tenant, "timezone", None) or "UTC"
        tz_name = _TZ_NAME_FOR_POSTGRES.get(str(raw), str(raw))
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    if hasattr(value, "astimezone"):
        return value.astimezone(tz).date().isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
