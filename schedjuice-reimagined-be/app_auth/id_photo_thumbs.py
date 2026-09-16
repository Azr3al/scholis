from __future__ import annotations

import io
import os

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

THUMB_LONG_EDGE = 128
THUMB_JPEG_QUALITY = 80


def _thumb_filename(full_name: str) -> str:
    base, _ext = os.path.splitext(os.path.basename(full_name))
    return f"{base}_thumb.jpg"


def generate_id_photo_thumb(full_file) -> ContentFile:
    """Return JPEG ContentFile resized to THUMB_LONG_EDGE on the long edge."""
    full_file.open("rb")
    try:
        with Image.open(full_file) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            img.thumbnail(
                (THUMB_LONG_EDGE, THUMB_LONG_EDGE),
                Image.Resampling.LANCZOS,
            )
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=THUMB_JPEG_QUALITY, optimize=True)
    finally:
        full_file.close()
    return ContentFile(buf.getvalue(), name=_thumb_filename(full_file.name))


def _delete_field_file(field) -> None:
    if field:
        field.delete(save=False)


def sync_id_photo_thumb(user, *, save: bool = True) -> None:
    """Generate or clear id_photo_thumb from user.id_photo."""
    if not user.id_photo:
        _delete_field_file(user.id_photo_thumb)
        user.id_photo_thumb = None
        if save:
            user.save(update_fields=["id_photo_thumb"])
        return

    _delete_field_file(user.id_photo_thumb)
    thumb = generate_id_photo_thumb(user.id_photo)
    user.id_photo_thumb.save(thumb.name, thumb, save=False)
    if save:
        user.save(update_fields=["id_photo_thumb"])
