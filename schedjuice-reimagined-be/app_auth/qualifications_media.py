from __future__ import annotations

import copy
from typing import Any

from app_attachment.models import Attachment
from schedjuice_backend.storages import PrivateMediaStorage


def _presign_attachment(attachment_id: int) -> str | None:
    attachment = Attachment.objects.filter(pk=attachment_id).first()
    if attachment is None or not attachment.data:
        return None
    try:
        return PrivateMediaStorage().url(attachment.data.name, expire=3600)
    except Exception:
        return None


def resolve_qualifications_media_urls(doc: Any) -> Any:
    if not doc or not isinstance(doc, dict):
        return doc
    out = copy.deepcopy(doc)

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "image":
            attrs = node.setdefault("attrs", {})
            attachment_id = attrs.get("attachmentId")
            if attachment_id is not None:
                url = _presign_attachment(int(attachment_id))
                if url:
                    attrs["src"] = url
            return
        for child in node.get("content") or []:
            walk(child)

    walk(out)
    return out
