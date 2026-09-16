"""TipTap JSON helpers: collect attachment ids and hydrate presigned image URLs for quiz v3."""

from __future__ import annotations

import copy
from typing import Any

from app_quiz_v3.models import Question, Quiz


def _walk_collect_attachment_ids(node: Any, out: set[int]) -> None:
    if not isinstance(node, dict):
        return
    ntype = node.get("type")
    if ntype == "image":
        attrs = node.get("attrs") or {}
        aid = attrs.get("attachmentId")
        if aid is not None:
            try:
                out.add(int(aid))
            except (TypeError, ValueError):
                pass
    for child in node.get("content") or []:
        _walk_collect_attachment_ids(child, out)


def collect_attachment_ids_from_tiptap(value: Any) -> set[int]:
    """Collect attachmentId values from image nodes in a TipTap JSON doc."""
    ids: set[int] = set()
    if value is None:
        return ids
    if isinstance(value, dict):
        _walk_collect_attachment_ids(value, ids)
        return ids
    if isinstance(value, str):
        import json

        t = value.strip()
        if t.startswith("{"):
            try:
                _walk_collect_attachment_ids(json.loads(t), ids)
            except json.JSONDecodeError:
                pass
        return ids
    return ids


def _walk_hydrate_images(node: Any, id_to_url: dict[int, str]) -> None:
    if not isinstance(node, dict):
        return
    ntype = node.get("type")
    if ntype == "image":
        attrs = dict(node.get("attrs") or {})
        aid = attrs.get("attachmentId")
        if aid is not None:
            try:
                pk = int(aid)
            except (TypeError, ValueError):
                pk = None
            if pk is not None and pk in id_to_url:
                attrs["src"] = id_to_url[pk]
                node["attrs"] = attrs
    for child in node.get("content") or []:
        _walk_hydrate_images(child, id_to_url)


def hydrate_tiptap_with_presigned_urls(value: Any, id_to_url: dict[int, str]) -> Any:
    """Return a deep copy of TipTap JSON with image src set from presigned URLs."""
    if value is None:
        return value
    if isinstance(value, str):
        import json

        t = value.strip()
        if not t.startswith("{"):
            return value
        try:
            doc = json.loads(t)
        except json.JSONDecodeError:
            return value
        out = copy.deepcopy(doc)
        _walk_hydrate_images(out, id_to_url)
        return out
    if isinstance(value, dict):
        out = copy.deepcopy(value)
        _walk_hydrate_images(out, id_to_url)
        return out
    return value


def hydrate_quiz_standalone_tiptap(quiz: Quiz, doc: Any) -> Any:
    """Hydrate a single TipTap JSON doc (intro/outro) with presigned image URLs for this quiz."""
    ids = collect_attachment_ids_from_tiptap(doc)
    id_to_url = build_quiz_attachment_url_map(quiz, ids)
    return hydrate_tiptap_with_presigned_urls(doc, id_to_url)


def build_quiz_attachment_url_map(
    quiz: Quiz, attachment_ids: set[int]
) -> dict[int, str]:
    """Map attachment pk -> presigned URL for ids that belong to this quiz (24h)."""
    from app_attachment.models import Attachment
    from app_attachment.views import get_quiz_attachment_presigned_url

    if not attachment_ids:
        return {}
    rows = list(
        Attachment.objects.filter(
            id__in=attachment_ids,
            quiz_id=quiz.id,
            is_deleted=False,
        ).only("id", "data", "filename", "file_type")
    )
    out: dict[int, str] = {}
    for att in rows:
        url = get_quiz_attachment_presigned_url(
            att.data, att.filename, att.file_type or "image/jpeg"
        )
        if url:
            out[att.id] = url
    return out


def tiptap_doc_plaintext(doc: Any) -> str:
    """Extract plain text from TipTap JSON (recursive text nodes)."""
    parts: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "text":
            t = node.get("text")
            if isinstance(t, str):
                parts.append(t)
        for child in node.get("content") or []:
            walk(child)

    if isinstance(doc, dict):
        walk(doc)
    return "".join(parts).strip()


def remap_quiz_fill_blank_ids(doc: Any, uuid_map: dict[str, str]) -> Any:
    """Replace `attrs.blankId` using map old-uuid-string -> new-uuid-string (deep copy)."""
    if not isinstance(doc, dict):
        return doc
    out = copy.deepcopy(doc)

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "quizFillBlank":
            attrs = dict(node.get("attrs") or {})
            bid = attrs.get("blankId")
            if bid is not None:
                key = str(bid)
                if key in uuid_map:
                    attrs["blankId"] = uuid_map[key]
            node["attrs"] = attrs
        for child in node.get("content") or []:
            walk(child)

    walk(out)
    return out


def list_quiz_fill_blank_uuids_in_order(doc: Any) -> list[str]:
    """`quizFillBlank` nodes in document order; `attrs.blankId` strings."""
    out: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "quizFillBlank":
            attrs = node.get("attrs") or {}
            bid = attrs.get("blankId")
            if bid:
                out.append(str(bid))
        for child in node.get("content") or []:
            walk(child)

    if isinstance(doc, dict):
        walk(doc)
    return out


def collect_attachment_ids_for_question(question: Question) -> set[int]:
    """Attachment ids referenced in TipTap on the question, options, and fill-blank acceptable answers."""
    ids = collect_attachment_ids_from_tiptap(question.body)
    for opt in question.options.all():
        ids |= collect_attachment_ids_from_tiptap(opt.body)
    if question.question_type == Question.QuestionType.FILL_IN_BLANK:
        for slot in question.fill_blank_slots.all():
            for ans in slot.acceptable_answers.all():
                ids |= collect_attachment_ids_from_tiptap(ans.body)
    return ids


def hydrate_question_payload_for_quiz(
    quiz: Quiz,
    payload: dict[str, Any],
    *,
    attachment_url_map: dict[int, str] | None = None,
) -> dict[str, Any]:
    """Hydrate question.body and each option / fill acceptable-answer body (TipTap JSON) with presigned image URLs."""
    data = copy.deepcopy(payload)
    ids: set[int] = set()
    body = data.get("body")
    ids |= collect_attachment_ids_from_tiptap(body)
    for opt in data.get("options") or []:
        ids |= collect_attachment_ids_from_tiptap(opt.get("body"))
    for slot in data.get("fill_blank_slots") or []:
        for ans in slot.get("acceptable_answers") or []:
            ids |= collect_attachment_ids_from_tiptap(ans.get("body"))
    if attachment_url_map is not None:
        id_to_url = {i: attachment_url_map[i] for i in ids if i in attachment_url_map}
    else:
        id_to_url = build_quiz_attachment_url_map(quiz, ids)
    if id_to_url:
        data["body"] = hydrate_tiptap_with_presigned_urls(data.get("body"), id_to_url)
        for opt in data.get("options") or []:
            opt["body"] = hydrate_tiptap_with_presigned_urls(opt.get("body"), id_to_url)
        for slot in data.get("fill_blank_slots") or []:
            for ans in slot.get("acceptable_answers") or []:
                ans["body"] = hydrate_tiptap_with_presigned_urls(ans.get("body"), id_to_url)
    return data
