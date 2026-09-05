from __future__ import annotations

from typing import Any, Iterable

from django.core.exceptions import ValidationError
from django.http import Http404

from app_chat.services import validate_chat_attachment_refs
from app_crm.models import Issue, IssueEvent, IssueSource
from app_crm.user_mini import user_mini
from app_rbac.resolution import effective_permissions

ANONYMOUS_ACTOR_MINI = {"id": None, "name": "Anonymous", "email": ""}
ANONYMOUS_PARENT_COMPLAINT_TITLE = "Anonymous parent complaint"

STUDENT_TIMELINE_EVENT_TYPES = frozenset(
    {
        IssueEvent.EventType.CREATED,
        IssueEvent.EventType.STATUS_CHANGED,
    }
)

ATTACHMENT_ONLY_DESCRIPTION = "Sent an attachment."


def validate_complaint_message_body(
    *,
    body: str,
    attachments: list,
    user=None,
) -> str:
    normalized = (body or "").strip()
    if not normalized and not attachments:
        raise ValidationError("Message must include text or at least one attachment.")
    if attachments:
        if user is None:
            raise ValidationError({"attachments": "User is required to validate attachments."})
        validate_chat_attachment_refs(user, attachments)
    return normalized


def build_parent_complaint_title(student, *, is_anonymous: bool = False) -> str:
    if is_anonymous:
        return ANONYMOUS_PARENT_COMPLAINT_TITLE
    name = (getattr(student, "name", None) or "").strip()
    return f"Parent complaint — {name}"


def should_redact_complaint_identity(issue: Issue, request_user) -> bool:
    if request_user is None or is_complaint_student_actor(request_user):
        return False
    return (
        issue.source == IssueSource.PARENT_COMPLAINT
        and bool(getattr(issue, "is_anonymous", False))
    )


def redact_issue_payload_for_staff(data: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(data)
    redacted["related_student"] = None
    redacted["created_by"] = None
    return redacted


def redact_timeline_actor_for_staff(
    item: dict[str, Any],
    *,
    related_student_id: int | None,
) -> dict[str, Any]:
    if related_student_id is None:
        return item
    actor = item.get("actor")
    if not actor or actor.get("id") != related_student_id:
        return item
    redacted = dict(item)
    redacted["actor"] = dict(ANONYMOUS_ACTOR_MINI)
    return redacted


def description_from_complaint_body(body: str, attachments: list) -> str:
    normalized = (body or "").strip()
    if normalized:
        return normalized
    if attachments:
        return ATTACHMENT_ONLY_DESCRIPTION
    return ""


def _student_status_message(payload: dict[str, Any]) -> str:
    to_status = (payload.get("to") or "").strip()
    from_status = (payload.get("from") or "").strip()
    if to_status == "Done":
        return "Your complaint was marked resolved"
    if to_status == "Cancelled":
        return "Your complaint was cancelled"
    if to_status == "Open" and from_status in {"Done", "Cancelled"}:
        return "Your complaint was reopened"
    if to_status:
        return f"Your complaint status changed to {to_status}"
    return "Your complaint status was updated"


def _student_created_message() -> str:
    return "Complaint submitted"


def student_safe_timeline_items(events: Iterable, comments: Iterable) -> list[dict]:
    items: list[dict] = []
    for event in events:
        if event.event_type not in STUDENT_TIMELINE_EVENT_TYPES:
            continue
        item: dict[str, Any] = {
            "kind": "event",
            "id": event.id,
            "event_type": event.event_type,
            "payload": event.payload,
            "actor": user_mini(getattr(event, "actor", None)),
            "created_at": event.created_at,
        }
        if event.event_type == IssueEvent.EventType.CREATED:
            item["message"] = _student_created_message()
        elif event.event_type == IssueEvent.EventType.STATUS_CHANGED:
            item["message"] = _student_status_message(event.payload or {})
        items.append(item)

    for comment in comments:
        items.append(
            {
                "kind": "comment",
                "id": comment.id,
                "body": comment.body,
                "attachments": list(getattr(comment, "attachments", None) or []),
                "actor": user_mini(getattr(comment, "author", None)),
                "created_at": comment.created_at,
            }
        )

    items.sort(key=lambda item: item["created_at"])
    return items


def is_complaint_student_actor(user) -> bool:
    if user is None:
        return False
    is_student = getattr(user, "is_student", None)
    if not callable(is_student) or not is_student():
        return False
    held = set(effective_permissions(user))
    return "complaint.view_own" in held


def crm_enabled_or_404(tenant) -> None:
    if not getattr(tenant, "is_crm_enabled", False):
        raise Http404()
