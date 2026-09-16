from datetime import datetime

import pytz
from django.utils import timezone

from app_course.models import Course


def get_course_by_join_code(join_code: str) -> Course | None:
    normalized = (join_code or "").strip()
    if not normalized:
        return None
    return Course.objects.filter(join_code__iexact=normalized).first()


def is_join_code_expired(course: Course, *, now: datetime | None = None) -> bool:
    if course.join_code_expiry_date is None:
        return False
    current = now or timezone.now()
    expiry = course.join_code_expiry_date
    if timezone.is_naive(expiry):
        expiry = timezone.make_aware(expiry, timezone=pytz.UTC)
    return expiry < current


def is_join_code_usable(course: Course, *, now: datetime | None = None) -> bool:
    if not course.is_join_code_enabled:
        return False
    return not is_join_code_expired(course, now=now)
