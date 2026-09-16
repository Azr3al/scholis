from __future__ import annotations

import logging
from collections.abc import Iterable

from app_attendance.models import LeaveRequest
from app_auth.models import User
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind
from app_utils.board_observers import users_with_permission
from app_utils.push_helpers import enqueue_push_for_user_ids

logger = logging.getLogger(__name__)


def _staff_leave_href(leave_request_id: int) -> str:
    return f"/leave-requests?highlight={leave_request_id}"


def _student_leave_href(leave_request_id: int) -> str:
    return f"/(protected)/leave-requests/{leave_request_id}"


def _student_display_name(leave_request: LeaveRequest) -> str:
    student = leave_request.student
    if student is None:
        return "A student"
    name = (getattr(student, "name", "") or "").strip()
    return name or "A student"


def _leave_date_label(leave_request: LeaveRequest) -> str:
    start = leave_request.start_date
    end = leave_request.end_date
    if start == end:
        return start.strftime("%b %d, %Y")
    return f"{start.strftime('%b %d, %Y')}–{end.strftime('%b %d, %Y')}"


def _denial_reason_preview(reason: str | None) -> str:
    text = (reason or "").strip()
    if text:
        return text[:120]
    return "Your leave request was denied."


def _admin_recipient_ids(*, exclude_user_ids: Iterable[int] | None = None) -> list[int]:
    exclude = set(exclude_user_ids or [])
    qs = users_with_permission("leave.manage_all").filter(is_active=True)
    if exclude:
        qs = qs.exclude(id__in=exclude)
    return list(qs.values_list("id", flat=True))


def _enqueue_leave_push(
    *,
    user_ids: list[int],
    kind: UtilityNotificationKind,
    title: str,
    body: str,
    href: str,
    leave_request_id: int,
) -> None:
    if not user_ids:
        return
    try:
        enqueue_push_for_user_ids(
            user_ids,
            title=title,
            body=body,
            data={
                "type": kind.value,
                "kind": kind.value,
                "leave_request_id": str(leave_request_id),
                "href": href,
            },
        )
    except Exception:
        logger.exception(
            "Failed to enqueue leave push kind=%s leave_request=%s",
            kind.value,
            leave_request_id,
        )


def notify_leave_submitted(leave_request: LeaveRequest, tenant) -> None:
    del tenant
    student_name = _student_display_name(leave_request)
    recipient_ids = _admin_recipient_ids(exclude_user_ids={leave_request.student_id})
    _enqueue_leave_push(
        user_ids=recipient_ids,
        kind=UtilityNotificationKind.LEAVE_SUBMITTED,
        title="New leave request",
        body=f"{student_name} submitted a leave request for {_leave_date_label(leave_request)}.",
        href=_staff_leave_href(leave_request.id),
        leave_request_id=leave_request.id,
    )


def notify_leave_approved(leave_request: LeaveRequest, tenant) -> None:
    del tenant
    _enqueue_leave_push(
        user_ids=[leave_request.student_id],
        kind=UtilityNotificationKind.LEAVE_APPROVED,
        title="Leave request approved",
        body=f"Your leave for {_leave_date_label(leave_request)} was approved.",
        href=_student_leave_href(leave_request.id),
        leave_request_id=leave_request.id,
    )


def notify_leave_denied(leave_request: LeaveRequest, tenant) -> None:
    del tenant
    _enqueue_leave_push(
        user_ids=[leave_request.student_id],
        kind=UtilityNotificationKind.LEAVE_DENIED,
        title="Leave request denied",
        body=_denial_reason_preview(leave_request.denial_reason),
        href=_student_leave_href(leave_request.id),
        leave_request_id=leave_request.id,
    )
