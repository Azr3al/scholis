from __future__ import annotations

MAX_DOC_VIDEO_BYTES = 500 * 1024 * 1024
MAX_DOC_IMAGE_BYTES = 10 * 1024 * 1024

_ALLOWED_IMAGE_CONTENT_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp"}
)


class MediaUploadValidationError(Exception):
    pass


def classify_upload(upload) -> str:
    content_type = (getattr(upload, "content_type", "") or "").lower()
    size = upload.size

    if content_type.startswith("video/"):
        if size > MAX_DOC_VIDEO_BYTES:
            raise MediaUploadValidationError("Video exceeds 500 MB limit.")
        return "video"

    if content_type in _ALLOWED_IMAGE_CONTENT_TYPES:
        if size > MAX_DOC_IMAGE_BYTES:
            raise MediaUploadValidationError("Image exceeds 10 MB limit.")
        return "image"

    raise MediaUploadValidationError(
        "Unsupported file type. Allowed: video/*, image/png, image/jpeg, image/gif, image/webp."
    )


def build_image_markdown_snippet(filename: str, url: str) -> str:
    title = filename or "Image"
    return f"![{title}]({url})"
