import json
import uuid

from django.db import IntegrityError
from rest_framework.exceptions import ValidationError

from app_auth.staff_helpers import user_is_staff

MAX_QUALIFICATIONS_BYTES = 20 * 1024
SLUG_PREFIX = "p_"
SLUG_RANDOM_HEX_LEN = 8
MAX_SLUG_ATTEMPTS = 10


def generate_public_profile_slug() -> str:
    return f"{SLUG_PREFIX}{uuid.uuid4().hex[:SLUG_RANDOM_HEX_LEN]}"


def validate_qualifications_size(value) -> None:
    if value is None:
        return
    if len(json.dumps(value, separators=(",", ":"))) > MAX_QUALIFICATIONS_BYTES:
        raise ValidationError("Qualifications content is too large.")


def should_assign_public_profile_slug(instance, validated_data: dict) -> bool:
    if not user_is_staff(instance) or instance.public_profile_slug:
        return False
    if "qualifications" in validated_data:
        return True
    if "is_public_profile_enabled" in validated_data:
        return True
    if "show_certifications_on_public_profile" in validated_data:
        return True
    if instance.qualifications:
        return True
    return False


def ensure_public_profile_slug(user) -> bool:
    """
    Assign public_profile_slug on user if missing. Returns True if a new slug was set.
    Caller must save when True and slug was only set on the in-memory instance.
    """
    if not user_is_staff(user) or user.public_profile_slug:
        return False

    for _ in range(MAX_SLUG_ATTEMPTS):
        user.public_profile_slug = generate_public_profile_slug()
        try:
            user.save(update_fields=["public_profile_slug"])
            return True
        except IntegrityError:
            user.public_profile_slug = None

    raise ValidationError("Could not generate a unique public profile link.")
