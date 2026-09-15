"""
Fernet-based encryption for Scholis credentials at rest.

An org API key and a webhook signing secret are both bearer secrets: whoever
holds them can read a school's released marks, and the signing secret lets them
forge a delivery that this app will trust. They are encrypted rather than stored
as plain text so that a database dump, a read replica or a support query does not
by itself hand over a live credential.

Follows ``app_zoom.crypto`` -- the same helper, a different settings key, so
rotating one integration's key cannot decrypt another's secrets.
"""
from __future__ import annotations

from utilitas.token_crypto import (
    TokenEncryptionError,
    decrypt_token as _decrypt,
    encrypt_token as _encrypt,
)

_SCHOLIS_KEY = "SCHOLIS_TOKEN_ENCRYPTION_KEY"


def encrypt_secret(plaintext: str | None) -> str:
    return _encrypt(plaintext, key_setting=_SCHOLIS_KEY)


def decrypt_secret(ciphertext: str | None) -> str:
    return _decrypt(ciphertext, key_setting=_SCHOLIS_KEY)


__all__ = ["TokenEncryptionError", "encrypt_secret", "decrypt_secret"]
