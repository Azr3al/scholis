"""Signed, long-lived tokens that back the public ID-card verify link.

Mirrors the recording-share JWT pattern (PyJWT HS256 + the shared ``JWT`` secret),
but carries no expiry because a printed badge is long-lived. The ``purpose`` claim
prevents tokens minted for other features from being accepted here.
"""

import jwt
from decouple import config

ID_VERIFY_PURPOSE = "id-verify"


class InvalidIdVerifyToken(Exception):
    """Raised when a token is malformed, tampered, or has the wrong purpose."""


def _secret() -> str:
    return config("JWT")


def encode_id_verify_token(*, uid: int, schema: str) -> str:
    return jwt.encode(
        {"purpose": ID_VERIFY_PURPOSE, "uid": uid, "schema": schema},
        _secret(),
        algorithm="HS256",
    )


def decode_id_verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError as exc:
        raise InvalidIdVerifyToken(str(exc)) from exc

    if payload.get("purpose") != ID_VERIFY_PURPOSE:
        raise InvalidIdVerifyToken("wrong purpose")
    if "uid" not in payload or "schema" not in payload:
        raise InvalidIdVerifyToken("missing claims")
    return payload
