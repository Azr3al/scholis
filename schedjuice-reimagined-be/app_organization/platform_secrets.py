from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class PlatformSecretEncryptionError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = (getattr(settings, "PLATFORM_SECRETS_ENCRYPTION_KEY", None) or "").encode(
        "utf-8"
    )
    if not key:
        raise PlatformSecretEncryptionError(
            "PLATFORM_SECRETS_ENCRYPTION_KEY is not set"
        )
    return Fernet(key)


def encrypt_platform_secret(plaintext: str | None) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_platform_secret(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise PlatformSecretEncryptionError("Could not decrypt platform secret") from e
