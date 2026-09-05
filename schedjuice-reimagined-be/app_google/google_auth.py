from django.conf import settings
from google.auth.transport import requests
from google.oauth2 import id_token


class GoogleTokenVerificationError(Exception):
    pass


def verify_google_id_token(token: str) -> dict:
    client_id = (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip()
    if not client_id:
        raise GoogleTokenVerificationError("Google sign-in is not configured.")

    try:
        return id_token.verify_oauth2_token(
            token,
            requests.Request(),
            audience=client_id,
        )
    except ValueError as exc:
        raise GoogleTokenVerificationError(str(exc)) from exc
