"""
Fernet-based encryption for Zoom OAuth tokens on ``ZoomAccount`` /
``UserZoomOAuth``.
"""
from __future__ import annotations

from utilitas.token_crypto import (
    TokenEncryptionError,
    decrypt_token as _decrypt,
    encrypt_token as _encrypt,
)

_ZOOM_KEY = "ZOOM_TOKEN_ENCRYPTION_KEY"


def encrypt_token(plaintext: str | None) -> str:
    return _encrypt(plaintext, key_setting=_ZOOM_KEY)


def decrypt_token(ciphertext: str | None) -> str:
    return _decrypt(ciphertext, key_setting=_ZOOM_KEY)


__all__ = ["TokenEncryptionError", "encrypt_token", "decrypt_token"]
