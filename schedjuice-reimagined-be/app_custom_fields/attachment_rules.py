"""Preset MIME/extension tables and validation_rules parsing for attachment fields."""

from __future__ import annotations

from rest_framework.exceptions import ValidationError

CUSTOM_FIELD_ATTACHMENT_TABLE = "custom_field"

FILE_TYPE_PRESET_IMAGE = "image"
FILE_TYPE_PRESET_DOCUMENT = "document"
FILE_TYPE_PRESET_IMAGE_DOCUMENT = "image_document"
FILE_TYPE_PRESET_ANY = "any"

FILE_TYPE_PRESETS = frozenset(
    {
        FILE_TYPE_PRESET_IMAGE,
        FILE_TYPE_PRESET_DOCUMENT,
        FILE_TYPE_PRESET_IMAGE_DOCUMENT,
        FILE_TYPE_PRESET_ANY,
    }
)

_IMAGE_MIMES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/heic",
        "image/heif",
    }
)
_IMAGE_EXTENSIONS = frozenset(
    {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"}
)

_DOCUMENT_MIMES = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
    }
)
_DOCUMENT_EXTENSIONS = frozenset({".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".csv"})

_EXTRA_ANY_MIMES = frozenset(
    {
        "video/mp4",
        "audio/mpeg",
        "audio/mp4",
        "application/zip",
    }
)
_EXTRA_ANY_EXTENSIONS = frozenset({".mp4", ".mp3", ".m4a", ".zip"})

MIME_TO_EXTENSIONS: dict[str, frozenset[str]] = {
    "image/jpeg": frozenset({".jpg", ".jpeg"}),
    "image/png": frozenset({".png"}),
    "image/gif": frozenset({".gif"}),
    "image/webp": frozenset({".webp"}),
    "image/heic": frozenset({".heic"}),
    "image/heif": frozenset({".heif"}),
    "application/pdf": frozenset({".pdf"}),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": frozenset(
        {".docx"}
    ),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": frozenset(
        {".xlsx"}
    ),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": frozenset(
        {".pptx"}
    ),
    "text/plain": frozenset({".txt"}),
    "text/csv": frozenset({".csv"}),
    "video/mp4": frozenset({".mp4"}),
    "audio/mpeg": frozenset({".mp3"}),
    "audio/mp4": frozenset({".m4a"}),
    "application/zip": frozenset({".zip"}),
}

DEFAULT_ATTACHMENT_RULES: dict = {
    "max_file_size_mb": 10,
    "max_files": 1,
    "file_type_preset": FILE_TYPE_PRESET_IMAGE_DOCUMENT,
    "allowed_extensions": [],
    "allow_camera_capture": False,
}

MAX_ATTACHMENT_FILE_SIZE_MB = 100
MAX_ATTACHMENT_FILES = 10


def _preset_mimes_and_extensions(preset: str) -> tuple[frozenset[str], frozenset[str]]:
    if preset == FILE_TYPE_PRESET_IMAGE:
        return _IMAGE_MIMES, _IMAGE_EXTENSIONS
    if preset == FILE_TYPE_PRESET_DOCUMENT:
        return _DOCUMENT_MIMES, _DOCUMENT_EXTENSIONS
    if preset == FILE_TYPE_PRESET_IMAGE_DOCUMENT:
        return _IMAGE_MIMES | _DOCUMENT_MIMES, _IMAGE_EXTENSIONS | _DOCUMENT_EXTENSIONS
    if preset == FILE_TYPE_PRESET_ANY:
        return (
            _IMAGE_MIMES | _DOCUMENT_MIMES | _EXTRA_ANY_MIMES,
            _IMAGE_EXTENSIONS | _DOCUMENT_EXTENSIONS | _EXTRA_ANY_EXTENSIONS,
        )
    raise ValueError(f"Unknown preset: {preset}")


def normalize_attachment_rules(rules: dict | None) -> dict:
    merged = {**DEFAULT_ATTACHMENT_RULES, **(rules or {})}
    preset = merged.get("file_type_preset") or FILE_TYPE_PRESET_IMAGE_DOCUMENT
    if preset not in FILE_TYPE_PRESETS:
        preset = FILE_TYPE_PRESET_IMAGE_DOCUMENT
    merged["file_type_preset"] = preset
    merged["max_file_size_mb"] = int(merged.get("max_file_size_mb") or 10)
    merged["max_files"] = int(merged.get("max_files") or 1)
    merged["allow_camera_capture"] = bool(merged.get("allow_camera_capture"))
    exts = merged.get("allowed_extensions") or []
    if not isinstance(exts, list):
        exts = []
    merged["allowed_extensions"] = [
        e if e.startswith(".") else f".{e}" for e in exts if isinstance(e, str) and e
    ]
    return merged


def resolve_allowed_mimes_and_extensions(rules: dict | None) -> tuple[frozenset[str], frozenset[str]]:
    normalized = normalize_attachment_rules(rules)
    mimes, extensions = _preset_mimes_and_extensions(normalized["file_type_preset"])
    custom = normalized.get("allowed_extensions") or []
    if custom:
        custom_set = frozenset(custom)
        extensions = extensions & custom_set
        mimes = frozenset(
            m for m in mimes if MIME_TO_EXTENSIONS.get(m, frozenset()) & extensions
        )
    return mimes, extensions


def max_file_size_bytes(rules: dict | None) -> int:
    mb = normalize_attachment_rules(rules)["max_file_size_mb"]
    return mb * 1024 * 1024


def validate_attachment_definition_rules(rules: dict | None) -> dict:
    """Validate and return normalized attachment validation_rules for a definition."""
    if rules is not None and not isinstance(rules, dict):
        raise ValidationError({"validation_rules": "Must be a JSON object."})

    normalized = normalize_attachment_rules(rules)
    mb = normalized["max_file_size_mb"]
    if mb < 1 or mb > MAX_ATTACHMENT_FILE_SIZE_MB:
        raise ValidationError(
            {
                "validation_rules": (
                    f"max_file_size_mb must be between 1 and {MAX_ATTACHMENT_FILE_SIZE_MB}."
                )
            }
        )
    max_files = normalized["max_files"]
    if max_files < 1 or max_files > MAX_ATTACHMENT_FILES:
        raise ValidationError(
            {
                "validation_rules": (
                    f"max_files must be between 1 and {MAX_ATTACHMENT_FILES}."
                )
            }
        )
    preset = normalized["file_type_preset"]
    if preset not in FILE_TYPE_PRESETS:
        raise ValidationError({"validation_rules": "Unknown file_type_preset."})

    _, preset_extensions = _preset_mimes_and_extensions(preset)
    custom = normalized.get("allowed_extensions") or []
    bad = [e for e in custom if e not in preset_extensions]
    if bad:
        raise ValidationError(
            {
                "validation_rules": (
                    f"allowed_extensions not allowed for preset: {', '.join(sorted(bad))}"
                )
            }
        )
    return normalized
