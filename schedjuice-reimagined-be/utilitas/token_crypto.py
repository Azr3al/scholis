"""Fernet-based encryption for OAuth token caches at rest."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class TokenEncryptionError(RuntimeError):
    pass


def _fernet_for_setting(key_setting: str) -> Fernet:
    key = (getattr(settings, key_setting, None) or "").encode("utf-8")
    if not key:
        raise TokenEncryptionError(
            f"{key_setting} is not set; generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`."
        )
    return Fernet(key)


def encrypt_token(plaintext: str | None, *, key_setting: str) -> str:
    if plaintext is None:
        return ""
    return _fernet_for_setting(key_setting).encrypt(
        plaintext.encode("utf-8")
    ).decode("utf-8")


def decrypt_token(ciphertext: str | None, *, key_setting: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet_for_setting(key_setting).decrypt(
            ciphertext.encode("utf-8")
        ).decode("utf-8")
    except InvalidToken as e:
        raise TokenEncryptionError(
            f"Could not decrypt token for {key_setting} (rotated key?)."
        ) from e
