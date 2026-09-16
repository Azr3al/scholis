"""Fernet encryption for per-org Telegram bot tokens stored on `Organization`."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class TokenEncryptionError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = (settings.TELEGRAM_TOKEN_ENCRYPTION_KEY or "").encode("utf-8")
    if not key:
        raise TokenEncryptionError(
            "TELEGRAM_TOKEN_ENCRYPTION_KEY is not set; generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`."
        )
    return Fernet(key)


def encrypt_token(plaintext: str | None) -> str:
    if plaintext is None:
        return ""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise TokenEncryptionError(
            "Could not decrypt Telegram token (rotated key?)."
        ) from e
