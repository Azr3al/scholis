from __future__ import annotations

import mimetypes
import zipfile
from pathlib import Path

from django.core.exceptions import ValidationError

from app_chat.contracts import (
    ALLOWED_CHAT_ATTACHMENT_EXTENSIONS,
    ALLOWED_CHAT_ATTACHMENT_MIME_TYPES,
    MAX_CHAT_ATTACHMENT_SIZE_BYTES,
    MIME_TO_ALLOWED_EXTENSIONS,
    normalize_extension,
)

_AUDIO_MP4_FTYP_BRANDS = frozenset({b"M4A ", b"M4B ", b"mp4a", b"qt  "})
_HEIC_FTYP_BRANDS = frozenset({b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"})
_VIDEO_MP4_FTYP_BRANDS = frozenset(
    {b"isom", b"iso2", b"mp41", b"avc1", b"MP4V", b"MSNV", b"3gp4", b"3g2a"}
)

_OOXML_PREFIX_TO_MIME = (
    ("word/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("xl/", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("ppt/", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
)


def _ftyp_brands(sample: bytes) -> set[bytes]:
    if len(sample) < 12 or sample[4:8] != b"ftyp":
        return set()
    major_brand = sample[8:12]
    brands = {major_brand}
    box_size = int.from_bytes(sample[0:4], "big")
    end = min(box_size, len(sample)) if box_size >= 16 else len(sample)
    for offset in range(16, end, 4):
        brands.add(sample[offset : offset + 4])
    return brands


def _detect_ftyp_mime(sample: bytes, filename: str) -> str | None:
    brands = _ftyp_brands(sample)
    if not brands:
        return None
    major_brand = sample[8:12]
    if brands & _HEIC_FTYP_BRANDS:
        ext = normalize_extension(filename)
        if ext == ".heif":
            return "image/heif"
        return "image/heic"
    if brands & _AUDIO_MP4_FTYP_BRANDS:
        return "audio/mp4"
    if major_brand in _VIDEO_MP4_FTYP_BRANDS:
        return "video/mp4"
    ext = normalize_extension(filename)
    if ext == ".m4a":
        return "audio/mp4"
    if brands & _VIDEO_MP4_FTYP_BRANDS:
        return "video/mp4"
    if ext == ".mp4":
        return "video/mp4"
    return "video/mp4"


def _refine_zip_mime(uploaded_file) -> str:
    """Distinguish docx/xlsx/pptx from a plain zip by inspecting container entries."""
    try:
        uploaded_file.seek(0)
        with zipfile.ZipFile(uploaded_file) as zf:
            names = zf.namelist()
    except (zipfile.BadZipFile, OSError):
        return "application/zip"
    finally:
        uploaded_file.seek(0)
    if "[Content_Types].xml" not in names:
        return "application/zip"
    for prefix, mime in _OOXML_PREFIX_TO_MIME:
        if any(n.startswith(prefix) for n in names):
            return mime
    return "application/zip"


def detect_mime_from_bytes(sample: bytes, filename: str) -> str:
    lowered = (filename or "").lower()
    if sample.startswith(b"%PDF"):
        return "application/pdf"
    if sample.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if sample.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if sample.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if sample.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"
    if len(sample) > 12 and sample[4:8] == b"ftyp":
        return _detect_ftyp_mime(sample, filename) or "video/mp4"
    if sample.startswith(b"ID3") or (len(sample) > 2 and sample[:2] == b"\xff\xfb"):
        return "audio/mpeg"
    if sample.startswith(b"RIFF") and b"WAVE" in sample[:16]:
        return "audio/wav"
    if sample.startswith(b"OggS"):
        return "audio/ogg"
    if sample.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "application/zip"

    guessed, _ = mimetypes.guess_type(filename or "")
    if guessed:
        return guessed
    if lowered.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _detect_mime_from_bytes(sample: bytes, filename: str) -> str:
    return detect_mime_from_bytes(sample, filename)


def sniff_upload_mime(uploaded_file, filename: str) -> str:
    sample = uploaded_file.read(4096)
    uploaded_file.seek(0)
    detected = detect_mime_from_bytes(sample, filename)
    if detected == "application/zip":
        return _refine_zip_mime(uploaded_file)
    return detected


def validate_chat_attachment_upload(uploaded_file, filename: str):
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_CHAT_ATTACHMENT_EXTENSIONS:
        raise ValidationError({"file": f"File extension '{ext}' is not allowed."})

    size = getattr(uploaded_file, "size", 0) or 0
    if size > MAX_CHAT_ATTACHMENT_SIZE_BYTES:
        raise ValidationError({"file": "File exceeds 15 MB maximum size."})

    sample = uploaded_file.read(4096)
    uploaded_file.seek(0)
    detected_mime = sniff_upload_mime(uploaded_file, filename)

    if detected_mime not in ALLOWED_CHAT_ATTACHMENT_MIME_TYPES:
        raise ValidationError({"file": f"MIME type '{detected_mime}' is not allowed."})

    allowed_exts = MIME_TO_ALLOWED_EXTENSIONS.get(detected_mime)
    if allowed_exts and ext not in allowed_exts:
        raise ValidationError(
            {
                "file": (
                    f"Extension '{ext}' does not match MIME '{detected_mime}'. "
                    f"Allowed: {sorted(allowed_exts)}"
                )
            }
        )
    return detected_mime


def validate_custom_field_attachment_upload(
    uploaded_file,
    filename: str,
    *,
    max_bytes: int,
    allowed_mimes: frozenset[str],
    allowed_extensions: frozenset[str],
    mime_to_extensions: dict[str, frozenset[str]] | None = None,
):
    ext = Path(filename or "").suffix.lower()
    if ext not in allowed_extensions:
        raise ValidationError({"file": f"File extension '{ext}' is not allowed."})

    size = getattr(uploaded_file, "size", 0) or 0
    if size > max_bytes:
        max_mb = max(1, max_bytes // (1024 * 1024))
        raise ValidationError({"file": f"File exceeds {max_mb} MB maximum size."})

    detected_mime = sniff_upload_mime(uploaded_file, filename)
    if detected_mime not in allowed_mimes:
        raise ValidationError({"file": f"MIME type '{detected_mime}' is not allowed."})

    lookup = mime_to_extensions or MIME_TO_ALLOWED_EXTENSIONS
    allowed_exts = lookup.get(detected_mime)
    if allowed_exts and ext not in allowed_exts:
        raise ValidationError(
            {
                "file": (
                    f"Extension '{ext}' does not match MIME '{detected_mime}'. "
                    f"Allowed: {sorted(allowed_exts)}"
                )
            }
        )
    return detected_mime
