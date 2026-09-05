"""Fernet encryption for Microsoft OAuth MSAL token caches."""

from __future__ import annotations

from utilitas.token_crypto import (
    TokenEncryptionError,
    decrypt_token as _decrypt,
    encrypt_token as _encrypt,
)

_MS_KEY = "MS_TOKEN_ENCRYPTION_KEY"


def encrypt_msal_cache(plaintext: str | None) -> str:
    return _encrypt(plaintext, key_setting=_MS_KEY)


def decrypt_msal_cache(ciphertext: str | None) -> str:
    return _decrypt(ciphertext, key_setting=_MS_KEY)


__all__ = ["TokenEncryptionError", "encrypt_msal_cache", "decrypt_msal_cache"]
