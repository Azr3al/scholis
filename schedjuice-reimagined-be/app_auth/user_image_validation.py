from __future__ import annotations

from pathlib import Path

from django.core.exceptions import ValidationError

from app_attachment.validation import MIME_TO_ALLOWED_EXTENSIONS, sniff_upload_mime

MAX_USER_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_USER_IMAGE_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})
ALLOWED_USER_IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def validate_user_image_upload(uploaded_file, filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_USER_IMAGE_EXTENSIONS:
        raise ValidationError({"image": f"File extension '{ext}' is not allowed."})

    size = getattr(uploaded_file, "size", 0) or 0
    if size > MAX_USER_IMAGE_BYTES:
        raise ValidationError({"image": "File exceeds 10 MB maximum size."})

    detected_mime = sniff_upload_mime(uploaded_file, filename)
    if detected_mime not in ALLOWED_USER_IMAGE_MIMES:
        raise ValidationError({"image": f"MIME type '{detected_mime}' is not allowed."})

    allowed_exts = MIME_TO_ALLOWED_EXTENSIONS.get(detected_mime)
    if allowed_exts and ext not in allowed_exts:
        raise ValidationError(
            {"image": f"Extension '{ext}' does not match MIME '{detected_mime}'."}
        )
    return detected_mime
