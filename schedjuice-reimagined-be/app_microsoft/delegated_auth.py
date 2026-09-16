"""Resolve which Microsoft identity should post or edit a Teams announcement."""

from __future__ import annotations

from dataclasses import dataclass

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models_user_microsoft_oauth import UserMicrosoftOAuth
from app_organization.models import MicrosoftDelegatedAccount


class PostedAs:
    USER = "user"
    SERVICE_ACCOUNT = "service_account"


@dataclass(frozen=True)
class Poster:
    kind: str
    credential: object
    user_id: int | None = None

    def matches_stored(self, announcement) -> bool:
        if not announcement.microsoft_teams_posted_as:
            return False
        return (
            self.kind == announcement.microsoft_teams_posted_as
            and self.user_id == announcement.microsoft_teams_posted_by_id
        )


def _active(credential) -> bool:
    return (
        credential is not None
        and credential.status == credential.__class__.Status.ACTIVE
        and bool((credential.msal_cache_ct or "").strip())
    )


def get_org_service_account(tenant) -> MicrosoftDelegatedAccount | None:
    with schema_context(get_public_schema_name()):
        return MicrosoftDelegatedAccount.objects.filter(
            organization_id=tenant.id
        ).first()


def org_service_account_is_active(tenant) -> bool:
    return _active(get_org_service_account(tenant))


def _service_account_poster(tenant) -> tuple[Poster | None, str | None]:
    svc = get_org_service_account(tenant)
    if _active(svc):
        return Poster(PostedAs.SERVICE_ACCOUNT, svc), None
    return None, (
        "Microsoft service account is not connected for this organization. "
        "Reconnect it in Organization settings."
    )


def _user_poster(user_id: int) -> Poster | None:
    cred = UserMicrosoftOAuth.objects.filter(user_id=user_id).first()
    if _active(cred):
        return Poster(PostedAs.USER, cred, user_id)
    return None


def resolve_poster(announcement, tenant, *, force_service_account: bool = False):
    """Return ``(Poster, None)`` or ``(None, human_readable_reason)``."""
    if force_service_account:
        return _service_account_poster(tenant)

    posted_as = announcement.microsoft_teams_posted_as

    if posted_as == PostedAs.USER and announcement.microsoft_teams_posted_by_id:
        poster = _user_poster(announcement.microsoft_teams_posted_by_id)
        if poster:
            return poster, None
        return _service_account_poster(tenant)

    if posted_as == PostedAs.SERVICE_ACCOUNT:
        return _service_account_poster(tenant)

    if announcement.course_id is None:
        return _service_account_poster(tenant)

    if announcement.created_by_id:
        poster = _user_poster(announcement.created_by_id)
        if poster:
            return poster, None

    return _service_account_poster(tenant)


def scopes_for_poster(poster: Poster) -> list[str]:
    from app_microsoft.graph_wrapper.base import POSTER_SCOPES, SERVICE_ACCOUNT_SCOPES

    if poster.kind == PostedAs.USER:
        return list(POSTER_SCOPES)
    return list(SERVICE_ACCOUNT_SCOPES)


def build_meeting_for_poster(tenant, poster: Poster):
    from app_microsoft.graph_wrapper.meeting import MSMeeting

    return MSMeeting(
        tenant,
        credential=poster.credential,
        scopes=scopes_for_poster(poster),
    )


def resolve_teams_meeting_for_actor(tenant, user):
    """Graph client for Teams channel reads/posts; personal OAuth first, then service account."""
    if user is not None and getattr(user, "id", None):
        poster = _user_poster(user.id)
        if poster:
            return build_meeting_for_poster(tenant, poster), None
    poster, err = _service_account_poster(tenant)
    if poster:
        return build_meeting_for_poster(tenant, poster), None
    return None, err
