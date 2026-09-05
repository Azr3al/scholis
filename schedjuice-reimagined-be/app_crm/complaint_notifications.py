from __future__ import annotations

import logging
from collections.abc import Iterable

from django.db.models import Q

from app_auth.models import User
from app_crm.models import Issue, IssueSource
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind
from app_utils.push_helpers import enqueue_push_for_user_ids

logger = logging.getLogger(__name__)


def _staff_issue_href(issue_id: int) -> str:
    return f"/crm/issues?issue={issue_id}"


def _student_complaint_href(issue_id: int) -> str:
    return f"/complaints/{issue_id}"


def _student_display_name(issue: Issue) -> str:
    student = issue.related_student
    if student is None:
        return "A student"
    name = (getattr(student, "name", "") or "").strip()
    return name or "A student"


def _comment_body_preview(body: str) -> str:
    text = (body or "").strip()
    if text:
        return text[:120]
    return "Sent a reply."


def _admin_recipient_ids(*, exclude_user_ids: Iterable[int] | None = None) -> list[int]:
    exclude = set(exclude_user_ids or [])
    qs = User.objects.filter(is_active=True).filter(
        Q(roles__contains=[User.UserRole.SUPERADMIN])
        | Q(roles__contains=[User.UserRole.ADMIN])
        | Q(roles__contains=[User.UserRole.MANAGER])
    )
    if exclude:
        qs = qs.exclude(id__in=exclude)
    return list(qs.values_list("id", flat=True))


def _enqueue_complaint_push(
    *,
    user_ids: list[int],
    kind: UtilityNotificationKind,
    title: str,
    body: str,
    href: str,
    issue_id: int,
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
                "issue_id": str(issue_id),
                "href": href,
            },
        )
    except Exception:
        logger.exception(
            "Failed to enqueue complaint push kind=%s issue=%s",
            kind.value,
            issue_id,
        )


def notify_complaint_created(issue: Issue, tenant) -> None:
    del tenant
    if issue.source != IssueSource.PARENT_COMPLAINT:
        return
    if issue.is_anonymous:
        body = "An anonymous parent complaint was filed."
    else:
        body = f"{_student_display_name(issue)} filed a parent complaint."
    exclude = {issue.related_student_id, issue.created_by_id} - {None}
    recipient_ids = _admin_recipient_ids(exclude_user_ids=exclude)
    _enqueue_complaint_push(
        user_ids=recipient_ids,
        kind=UtilityNotificationKind.COMPLAINT_NEW,
        title="New parent complaint",
        body=body,
        href=_staff_issue_href(issue.id),
        issue_id=issue.id,
    )


def notify_complaint_assigned(issue: Issue, tenant, assignee_id: int) -> None:
    del tenant
    if issue.source != IssueSource.PARENT_COMPLAINT or not assignee_id:
        return
    _enqueue_complaint_push(
        user_ids=[assignee_id],
        kind=UtilityNotificationKind.COMPLAINT_ASSIGNED,
        title="Complaint assigned to you",
        body=issue.title,
        href=_staff_issue_href(issue.id),
        issue_id=issue.id,
    )


def notify_complaint_reopened(issue: Issue, tenant) -> None:
    del tenant
    if issue.source != IssueSource.PARENT_COMPLAINT:
        return
    if issue.assignee_id:
        recipient_ids = [issue.assignee_id]
    else:
        recipient_ids = _admin_recipient_ids(
            exclude_user_ids={issue.related_student_id, issue.created_by_id} - {None}
        )
    if issue.is_anonymous:
        body = "An anonymous parent complaint was reopened."
    else:
        body = f"{_student_display_name(issue)} reopened a parent complaint."
    _enqueue_complaint_push(
        user_ids=recipient_ids,
        kind=UtilityNotificationKind.COMPLAINT_REOPENED,
        title="Complaint reopened",
        body=body,
        href=_staff_issue_href(issue.id),
        issue_id=issue.id,
    )


def notify_complaint_reply(issue: Issue, tenant, student_id: int) -> None:
    del tenant
    if issue.source != IssueSource.PARENT_COMPLAINT or not student_id:
        return
    latest = issue.comments.order_by("-created_at", "-id").first()
    preview = _comment_body_preview(getattr(latest, "body", "") if latest else "")
    _enqueue_complaint_push(
        user_ids=[student_id],
        kind=UtilityNotificationKind.COMPLAINT_REPLY,
        title="Reply from school administration",
        body=preview,
        href=_student_complaint_href(issue.id),
        issue_id=issue.id,
    )
