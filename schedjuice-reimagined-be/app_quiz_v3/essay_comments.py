"""Essay inline comment helpers — character anchors and full replace payload."""

from __future__ import annotations

from typing import Any, TypedDict

from django.db import transaction
from django.utils import timezone

from app_auth.models import User
from app_quiz_v3 import models as qm

COMMENT_BODY_CAP = 5000
COMMENTS_PER_ESSAY_CAP = 50


def _essay_plain_text(answer: qm.AttemptAnswer) -> str:
    rt = answer.response_text or {}
    if isinstance(rt, dict):
        return str(rt.get("text") or "")
    return ""


def validate_anchor_range(answer: qm.AttemptAnswer, start: int, end: int) -> str | None:
    """Return error code or None if anchors are valid for this answer's essay text."""
    if type(start) is not int or type(end) is not int:
        return "anchor_invalid"
    if start < 0 or end <= start:
        return "anchor_invalid"
    if end > len(_essay_plain_text(answer)):
        return "anchor_out_of_bounds"
    return None


class CommentDiffError(TypedDict):
    index: int
    code: str


class CommentDiffResult(TypedDict):
    created_ids: list[int]
    updated_ids: list[int]
    deleted_ids: list[int]
    errors: list[CommentDiffError]


@transaction.atomic
def apply_comments_diff(
    answer: qm.AttemptAnswer,
    payload: list[dict[str, Any]],
    *,
    by_user: User,
) -> CommentDiffResult:
    """Replace all comments on ``answer`` with ``payload`` (by id) or create new rows."""
    if len(payload) > COMMENTS_PER_ESSAY_CAP:
        return {
            "created_ids": [],
            "updated_ids": [],
            "deleted_ids": [],
            "errors": [{"index": COMMENTS_PER_ESSAY_CAP, "code": "too_many_comments"}],
        }

    existing = {c.id: c for c in qm.EssayComment.objects.filter(attempt_answer=answer)}
    errors: list[CommentDiffError] = []
    payload_ids: set[int] = set()
    creates: list[qm.EssayComment] = []
    updates: list[qm.EssayComment] = []

    for idx, raw in enumerate(payload):
        body = str(raw.get("body") or "")
        if len(body) > COMMENT_BODY_CAP:
            errors.append({"index": idx, "code": "body_too_long"})
            continue
        start, end = raw.get("anchor_start"), raw.get("anchor_end")
        anchor_err = validate_anchor_range(answer, start, end)
        if anchor_err:
            errors.append({"index": idx, "code": anchor_err})
            continue
        cid = raw.get("id")
        if cid is not None:
            try:
                cid_int = int(cid)
            except (TypeError, ValueError):
                errors.append({"index": idx, "code": "unknown_id"})
                continue
            if cid_int not in existing:
                errors.append({"index": idx, "code": "unknown_id"})
                continue
            payload_ids.add(cid_int)
            obj = existing[cid_int]
            obj.anchor_start = start
            obj.anchor_end = end
            obj.body = body
            updates.append(obj)
        else:
            creates.append(
                qm.EssayComment(
                    attempt_answer=answer,
                    anchor_start=start,
                    anchor_end=end,
                    body=body,
                    created_by=by_user,
                )
            )

    if errors:
        return {"created_ids": [], "updated_ids": [], "deleted_ids": [], "errors": errors}

    delete_ids = [cid for cid in existing if cid not in payload_ids]
    if delete_ids:
        qm.EssayComment.objects.filter(id__in=delete_ids).delete()
    now = timezone.now()
    for obj in updates:
        obj.updated_at = now
        obj.save(update_fields=["anchor_start", "anchor_end", "body", "updated_at"])
    qm.EssayComment.objects.bulk_create(creates)

    created_ids = [c.id for c in creates]
    return {
        "created_ids": created_ids,
        "updated_ids": [c.id for c in updates],
        "deleted_ids": delete_ids,
        "errors": [],
    }
