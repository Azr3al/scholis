from __future__ import annotations

from datetime import date

from django.utils import timezone as django_tz
from rest_framework.exceptions import ValidationError

from app_attendance.marking_services import _tenant_local_date
from app_attendance.models import LeaveRequest


class LeaveOverlapError(Exception):
    def __init__(
        self,
        *,
        existing_request_id: int,
        existing_request_status: str,
        message: str = "You already have a leave request for these dates.",
    ):
        self.existing_request_id = existing_request_id
        self.existing_request_status = existing_request_status
        self.message = message
        super().__init__(message)


def tenant_today(tenant) -> date:
    return _tenant_local_date(django_tz.now(), tenant)


def validate_leave_dates(*, start_date: date, end_date: date, tenant) -> None:
    today = tenant_today(tenant)

    if start_date < today:
        raise ValidationError(
            {
                "start_date": "Start date must be today or a future date.",
            }
        )

    if end_date < start_date:
        raise ValidationError(
            {
                "end_date": "End date must be on or after the start date.",
            }
        )


def find_overlapping_leave_request(
    student,
    start_date: date,
    end_date: date,
    *,
    exclude_id=None,
) -> LeaveRequest | None:
    qs = LeaveRequest.objects.filter(
        student=student,
        status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED],
        start_date__lte=end_date,
        end_date__gte=start_date,
    )
    if exclude_id is not None:
        qs = qs.exclude(id=exclude_id)
    return qs.first()
