"""Batch-resolve chat attachment metadata for message list endpoints."""

from __future__ import annotations

from typing import Any


def collect_attachment_ids_from_content(content: Any) -> list[int]:
    if not isinstance(content, dict):
        return []
    attachments = content.get("attachments")
    if not isinstance(attachments, list):
        return []
    ids: list[int] = []
    for item in attachments:
        if not isinstance(item, dict):
            continue
        attachment_id = item.get("attachment_id")
        if attachment_id is None:
            continue
        try:
            ids.append(int(attachment_id))
        except (TypeError, ValueError):
            continue
    return ids


def collect_attachment_ids_from_messages(messages) -> list[int]:
    attachment_ids: list[int] = []
    seen: set[int] = set()
    for message in messages:
        for attachment_id in collect_attachment_ids_from_content(message.content):
            if attachment_id not in seen:
                seen.add(attachment_id)
                attachment_ids.append(attachment_id)
        parent = getattr(message, "reply_to", None)
        if parent is not None:
            for attachment_id in collect_attachment_ids_from_content(parent.content):
                if attachment_id not in seen:
                    seen.add(attachment_id)
                    attachment_ids.append(attachment_id)
    return attachment_ids


def build_attachment_rows_by_id(attachment_ids: list[int]) -> dict[int, Any]:
    if not attachment_ids:
        return {}
    from app_attachment.models import Attachment

    return {
        row.id: row
        for row in Attachment.objects.filter(id__in=attachment_ids, is_deleted=False)
    }


def attachment_context_for_messages(messages) -> dict[str, dict[int, Any]]:
    attachment_ids = collect_attachment_ids_from_messages(messages)
    return {"attachment_rows_by_id": build_attachment_rows_by_id(attachment_ids)}
