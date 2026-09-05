import base64
import logging
from typing import Any

logger = logging.getLogger(__name__)

RASTER_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".heic",
    ".heif",
}
MAX_HOSTED_BYTES = 4 * 1024 * 1024
MAX_IMAGES_PER_MESSAGE = 10
MAX_HOSTED_BYTES_PER_MESSAGE = 3 * 1024 * 1024

MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


def is_raster_image_filename(filename: str) -> bool:
    name = (filename or "").strip().lower()
    dot = name.rfind(".")
    if dot <= 0:
        return False
    return name[dot:] in RASTER_EXTENSIONS


def mime_type_for_filename(filename: str) -> str:
    name = (filename or "").strip().lower()
    dot = name.rfind(".")
    ext = name[dot:] if dot > 0 else ""
    return MIME_BY_EXT.get(ext, "application/octet-stream")


def announcement_has_raster_images(announcement) -> bool:
    return any(
        is_raster_image_filename(att.filename)
        for att in announcement.attachments.all()
    )


def _link_html_for_attachment(att) -> str:
    try:
        url = att.file.url
        return f'<p><a href="{url}">{att.filename}</a></p>'
    except (ValueError, AttributeError):
        return f"<p>{att.filename}</p>"


def _hosted_html_for_temp_id(temp_id: str, filename: str) -> str:
    return (
        f'<p><img src="../hostedContents/{temp_id}/$value" '
        f'alt="{filename}" /></p>'
    )


def _read_attachment_bytes(att) -> bytes | None:
    try:
        with att.file.open("rb") as fh:
            return fh.read()
    except Exception:
        logger.warning(
            "Could not read attachment %s for Teams inline image",
            getattr(att, "id", None),
        )
        return None


def build_hosted_image_entries(attachments) -> tuple[list[str], list[dict[str, Any]]]:
    """Legacy single-message builder; prefer build_image_message_batches for many images."""
    html_parts: list[str] = []
    hosted: list[dict[str, Any]] = []
    temp_id = 0

    for att in attachments:
        if not is_raster_image_filename(att.filename):
            continue
        temp_id += 1
        tid = str(temp_id)
        raw = _read_attachment_bytes(att)
        if raw is None:
            continue

        if len(raw) > MAX_HOSTED_BYTES:
            html_parts.append(_link_html_for_attachment(att))
            continue

        hosted.append(
            {
                "@microsoft.graph.temporaryId": tid,
                "contentBytes": base64.b64encode(raw).decode("ascii"),
                "contentType": mime_type_for_filename(att.filename),
            }
        )
        html_parts.append(_hosted_html_for_temp_id(tid, att.filename))

    return html_parts, hosted


def build_image_message_batches(
    image_attachments,
) -> list[tuple[list[str], list[dict[str, Any]]]]:
    """
    Pack raster images into Teams message batches bounded by count and byte budget.
    Oversized images (> MAX_HOSTED_BYTES) become link HTML and do not use hosted slots.
    Temp ids reset to 1..k within each batch.
    """
    batches: list[tuple[list[str], list[dict[str, Any]]]] = []
    current_html: list[str] = []
    current_hosted: list[dict[str, Any]] = []
    current_hosted_count = 0
    current_hosted_bytes = 0

    def flush_batch() -> None:
        nonlocal current_html, current_hosted, current_hosted_count, current_hosted_bytes
        if current_html or current_hosted:
            batches.append((list(current_html), list(current_hosted)))
        current_html = []
        current_hosted = []
        current_hosted_count = 0
        current_hosted_bytes = 0

    for att in image_attachments:
        if not is_raster_image_filename(att.filename):
            continue

        raw = _read_attachment_bytes(att)
        if raw is None:
            continue

        if len(raw) > MAX_HOSTED_BYTES:
            current_html.append(_link_html_for_attachment(att))
            continue

        if (
            current_hosted_count >= MAX_IMAGES_PER_MESSAGE
            or current_hosted_bytes + len(raw) > MAX_HOSTED_BYTES_PER_MESSAGE
        ):
            flush_batch()

        temp_id = str(len(current_hosted) + 1)
        current_hosted.append(
            {
                "@microsoft.graph.temporaryId": temp_id,
                "contentBytes": base64.b64encode(raw).decode("ascii"),
                "contentType": mime_type_for_filename(att.filename),
            }
        )
        current_html.append(_hosted_html_for_temp_id(temp_id, att.filename))
        current_hosted_count += 1
        current_hosted_bytes += len(raw)

    flush_batch()
    return batches
