from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app_auth.models import User, UserImage
from schedjuice_backend.storages import PrivateMediaStorage

VALID_IMAGE_TYPES = frozenset({c.value for c in UserImage.ImageType})


def user_image_upload_permission(image_type: str) -> str:
    return f"user_image.upload.{image_type}"


def user_image_view_permission(image_type: str) -> str:
    return f"user_image.view.{image_type}"


@dataclass(frozen=True)
class ResolvedUserImage:
    source: str
    url: str | None
    user_image_id: int | None
    created_at: datetime | None


def _presigned(field, *, expire: int) -> str | None:
    if not field:
        return None
    try:
        return PrivateMediaStorage().url(field.name, expire=expire)
    except Exception:
        return None


def resolve_user_image(
    user: User, image_type: str, *, expire: int = 3600
) -> ResolvedUserImage | None:
    if image_type not in VALID_IMAGE_TYPES:
        return None

    latest = (
        UserImage.objects.filter(user=user, image_type=image_type)
        .order_by("-created_at")
        .first()
    )
    if latest is not None:
        return ResolvedUserImage(
            source="user_image",
            url=_presigned(latest.image, expire=expire),
            user_image_id=latest.id,
            created_at=latest.created_at,
        )

    if image_type == UserImage.ImageType.ID_IMAGE and user.id_photo:
        return ResolvedUserImage(
            source="legacy_id_photo",
            url=_presigned(user.id_photo, expire=expire),
            user_image_id=None,
            created_at=None,
        )

    return None
