import re
import uuid

from django.db import IntegrityError
from rest_framework.exceptions import ValidationError

ID_VERIFY_CODE_PREFIX = "v_"
ID_VERIFY_CODE_RANDOM_HEX_LEN = 8
MAX_ID_VERIFY_CODE_ATTEMPTS = 10
ID_VERIFY_CODE_PATTERN = re.compile(r"^v_[0-9a-f]{8}$")


def generate_id_verify_code() -> str:
    return f"{ID_VERIFY_CODE_PREFIX}{uuid.uuid4().hex[:ID_VERIFY_CODE_RANDOM_HEX_LEN]}"


def is_id_verify_code(value: str) -> bool:
    return bool(ID_VERIFY_CODE_PATTERN.match(value))


def ensure_id_verify_code(user) -> str | None:
    """Assign id_verify_code on user if missing. Returns the stable code."""
    if not user.pk:
        return None
    if user.id_verify_code:
        return user.id_verify_code

    for _ in range(MAX_ID_VERIFY_CODE_ATTEMPTS):
        user.id_verify_code = generate_id_verify_code()
        try:
            user.save(update_fields=["id_verify_code"])
            return user.id_verify_code
        except IntegrityError:
            user.id_verify_code = None

    raise ValidationError("Could not generate a unique ID verify code.")
