from django.db import ProgrammingError
from rest_framework.request import Request

from app_auth.models import User
from app_auth.user_scoping import user_can_access_user
from app_course.course_scoping import acting_user
from app_rbac.views import RBACView
from schedjuice_backend.storages import PrivateMediaStorage

MAX_BATCH = 50
URL_EXPIRE = 3600


def _fetch_users_by_id(user_ids: list[int]) -> tuple[dict[int, User], bool]:
    """
    Return users keyed by id and whether id_photo_thumb is queryable.

    If the thumb column has not been migrated yet, fall back to id + id_photo only.
    """
    base_qs = User.objects.filter(pk__in=user_ids)
    try:
        users = list(base_qs.only("id", "id_photo", "id_photo_thumb"))
        return {u.id: u for u in users}, True
    except ProgrammingError:
        users = list(base_qs.only("id", "id_photo"))
        return {u.id: u for u in users}, False


def _photo_field(user: User, variant: str, *, has_thumb_column: bool):
    if variant == "full":
        return user.id_photo
    if has_thumb_column and user.id_photo_thumb:
        return user.id_photo_thumb
    return user.id_photo


class IdPhotoUrlsView(RBACView):
    model = User
    required_permissions = {"POST": "user.view"}

    def post(self, request: Request):
        body = request.data or {}
        raw_ids = body.get("user_ids")
        variant = body.get("variant", "thumb")

        if not isinstance(raw_ids, list):
            return self.bad_request("user_ids must be a list.")
        if variant not in ("thumb", "full"):
            return self.bad_request("variant must be 'thumb' or 'full'.")
        if len(raw_ids) > MAX_BATCH:
            return self.bad_request(f"Maximum {MAX_BATCH} user_ids per request.")

        try:
            user_ids = [int(x) for x in raw_ids]
        except (TypeError, ValueError):
            return self.bad_request("user_ids must be integers.")

        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        storage = PrivateMediaStorage()
        urls: dict[str, str | None] = {}
        by_id, has_thumb_column = _fetch_users_by_id(user_ids)

        for uid in user_ids:
            target = by_id.get(uid)
            if target is None or not user_can_access_user(actor, target):
                continue
            field = _photo_field(target, variant, has_thumb_column=has_thumb_column)
            if not field:
                urls[str(uid)] = None
                continue
            try:
                urls[str(uid)] = storage.url(field.name, expire=URL_EXPIRE)
            except Exception:
                urls[str(uid)] = None

        return self.ok({"urls": urls})
