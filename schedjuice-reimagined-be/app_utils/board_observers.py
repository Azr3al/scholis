from __future__ import annotations

import logging
from typing import Iterable, Sequence

from django.core.exceptions import ValidationError
from django.db.models import Q

from app_microsoft.mail import send_mail
from app_rbac.models import RolePermission

logger = logging.getLogger(__name__)


def users_with_permission(permission_code: str):
    """Users whose roles include a RolePermission for permission_code (current schema)."""
    from app_auth.models import User

    slugs = list(
        RolePermission.objects.filter(permission_code=permission_code).values_list(
            "role__slug", flat=True
        )
    )
    if not slugs:
        return User.objects.none()
    q = None
    for slug in slugs:
        clause = Q(roles__contains=[slug])
        q = clause if q is None else (q | clause)
    return User.objects.filter(q).distinct()


def mention_user_ids(mentions: Sequence[dict] | None) -> list[int]:
    if not mentions:
        return []
    seen: set[int] = set()
    out: list[int] = []
    for m in mentions:
        uid = m.get("user_id")
        if uid is None:
            continue
        uid = int(uid)
        if uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    return out


def validate_mention_user_ids(user_ids: Iterable[int], *, permission_code: str) -> list[int]:
    ids = list(dict.fromkeys(int(i) for i in user_ids))
    if not ids:
        return []
    eligible = set(
        users_with_permission(permission_code).filter(id__in=ids).values_list("id", flat=True)
    )
    bad = [i for i in ids if i not in eligible]
    if bad:
        raise ValidationError({"mentions": f"Users not allowed to be mentioned: {bad}"})
    return ids


def add_observers_from_mentions(entity, user_ids: Iterable[int], *, actor=None) -> list[int]:
    """Add users as observers; returns newly added user ids. Idempotent."""
    ids = list(dict.fromkeys(int(i) for i in user_ids))
    if not ids:
        return []
    existing = set(entity.observers.filter(id__in=ids).values_list("id", flat=True))
    to_add = [i for i in ids if i not in existing]
    if to_add:
        entity.observers.add(*to_add)
    return to_add


def email_observers_on_status_change(
    *,
    tenant,
    entity,
    actor,
    subject: str,
    body_html: str,
    toggle_attr: str,
) -> None:
    if not getattr(tenant, toggle_attr, False):
        return
    actor_id = getattr(actor, "id", None)
    for user in entity.observers.all():
        if actor_id is not None and user.id == actor_id:
            continue
        email = (getattr(user, "email", None) or "").strip()
        if not email:
            continue
        try:
            send_mail(tenant, subject, body_html, email)
        except Exception:
            logger.exception(
                "Failed status-change email to user=%s entity=%s",
                user.id,
                getattr(entity, "id", None),
            )
