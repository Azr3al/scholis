import re

from app_announcement.models import AnnouncementAttachment

_INLINE_ID_RE = re.compile(r'data-attachment-id=["\'](\d+)["\']', re.IGNORECASE)


def parse_inline_attachment_ids(html: str | None) -> list[int]:
    if not html:
        return []
    seen: set[int] = set()
    ordered: list[int] = []
    for match in _INLINE_ID_RE.finditer(html):
        att_id = int(match.group(1))
        if att_id not in seen:
            seen.add(att_id)
            ordered.append(att_id)
    return ordered


def claim_inline_attachments(*, announcement, html_data: str | None, user, course_id: int) -> None:
    ids = parse_inline_attachment_ids(html_data)
    if not ids:
        return
    rows = list(
        AnnouncementAttachment.objects.filter(id__in=ids).select_related("uploaded_by")
    )
    found = {row.id: row for row in rows}
    for att_id in ids:
        row = found.get(att_id)
        if row is None:
            continue
        if row.uploaded_by_id != user.id:
            raise PermissionError("Inline attachment not owned by current user.")
        if row.course_id not in (None, course_id):
            raise PermissionError("Inline attachment course mismatch.")
        if row.announcement_id not in (None, announcement.id):
            raise PermissionError("Inline attachment already linked to another post.")
        if row.announcement_id is None:
            row.announcement_id = announcement.id
            row.save(update_fields=["announcement_id"])


def delete_orphan_staging_attachments(*, user, course_id: int, exclude_ids: set[int]) -> None:
    AnnouncementAttachment.objects.filter(
        announcement__isnull=True,
        course_id=course_id,
        uploaded_by_id=user.id,
    ).exclude(id__in=exclude_ids).delete()
