"""Canonical FM/HM classification from course start_date.day."""
from __future__ import annotations

from django.db.models import QuerySet

from app_course.models import Course

MONTH_TYPE_FM = "FM"
MONTH_TYPE_HM = "HM"
_VALID_MONTH_TYPES = frozenset({MONTH_TYPE_FM, MONTH_TYPE_HM})

HM_START_DAY_THRESHOLD = 13


def is_hm_start_day(day: int) -> bool:
    return day > HM_START_DAY_THRESHOLD


def is_hm_course(course: Course) -> bool:
    return is_hm_start_day(course.start_date.day)


def month_type_for_course(course: Course) -> str:
    return MONTH_TYPE_HM if is_hm_course(course) else MONTH_TYPE_FM


def filter_queryset_by_month_type(qs: QuerySet, month_type: str) -> QuerySet:
    if month_type not in _VALID_MONTH_TYPES:
        raise ValueError(f"month_type must be one of {_VALID_MONTH_TYPES}")
    if month_type == MONTH_TYPE_FM:
        return qs.filter(start_date__day__lte=HM_START_DAY_THRESHOLD)
    return qs.filter(start_date__day__gt=HM_START_DAY_THRESHOLD)
