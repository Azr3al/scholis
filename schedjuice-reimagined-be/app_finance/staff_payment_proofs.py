"""Staff payment proof file collection and validation."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from rest_framework.request import Request

STAFF_PAYMENT_PROOF_MAX_FILES = 5

_STAFF_PAYMENT_PROOF_ALLOWED_PREFIXES = ("image/",)
_STAFF_PAYMENT_PROOF_ALLOWED_EXACT = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/csv",
    }
)
_STAFF_PAYMENT_PROOF_ALLOWED_EXTENSIONS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".csv",
    }
)


def collect_staff_payment_proof_files(request: Request) -> list:
    files = []
    if hasattr(request.FILES, "getlist"):
        files.extend(request.FILES.getlist("proofs") or [])
        files.extend(request.FILES.getlist("proof") or [])
    legacy = request.FILES.get("screenshot")
    if legacy is not None:
        files.append(legacy)
    index = 0
    while True:
        key = f"proof_{index}"
        if key not in request.FILES:
            break
        files.append(request.FILES[key])
        index += 1
    return files


def _is_staff_payment_proof_allowed(uploaded) -> bool:
    content_type = (getattr(uploaded, "content_type", None) or "").lower()
    if content_type.startswith("video/"):
        return False
    if content_type.startswith(_STAFF_PAYMENT_PROOF_ALLOWED_PREFIXES):
        return True
    if content_type in _STAFF_PAYMENT_PROOF_ALLOWED_EXACT:
        return True
    name = (getattr(uploaded, "name", None) or "").lower()
    return any(name.endswith(ext) for ext in _STAFF_PAYMENT_PROOF_ALLOWED_EXTENSIONS)


def validate_staff_payment_proof_files(files: list):
    if not files:
        raise ValidationError({"proof": "At least one proof file is required."})
    if len(files) > STAFF_PAYMENT_PROOF_MAX_FILES:
        raise ValidationError(
            {"proof": f"You can upload at most {STAFF_PAYMENT_PROOF_MAX_FILES} proof files."}
        )
    for uploaded in files:
        if not _is_staff_payment_proof_allowed(uploaded):
            raise ValidationError(
                {
                    "proof": (
                        f"{getattr(uploaded, 'name', 'File')} is not allowed. "
                        "Use images, PDF, or Office documents (no videos)."
                    )
                }
            )
    return files


def first_image_proof_file(files: list):
    for uploaded in files:
        content_type = (getattr(uploaded, "content_type", None) or "").lower()
        if content_type.startswith("image/"):
            return uploaded
        name = (getattr(uploaded, "name", None) or "").lower()
        if name.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
            return uploaded
    return None
