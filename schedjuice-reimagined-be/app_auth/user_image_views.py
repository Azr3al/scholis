from __future__ import annotations

from rest_framework.views import Request

from app_auth.field_stewardship import STEWARD_IMAGE_TYPES
from app_auth.models import User, UserImage
from app_auth.user_image_serializers import (
    ResolvedUserImageSerializer,
    UserImageSerializer,
)
from app_auth.user_images import (
    resolve_user_image,
    user_image_upload_permission,
    user_image_view_permission,
)
from app_auth.user_scoping import check_user_read, user_can_access_user
from app_course.course_scoping import acting_user, user_can_access_course
from app_course.course_student_photos import (
    course_staff_can_upload_student_image,
    user_is_enrolled_student,
)
from app_course.models import Course
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from utilitas.pagination import CustomPagination

MAX_BATCH = 50
URL_EXPIRE = 3600


def _parse_image_type(raw: str | None) -> str | None:
    if raw in {c.value for c in UserImage.ImageType}:
        return raw
    return None


def _require_view_permission(actor: User, image_type: str) -> bool:
    return user_image_view_permission(image_type) in set(effective_permissions(actor))


def _require_upload_permission(actor: User, image_type: str) -> bool:
    return user_image_upload_permission(image_type) in set(effective_permissions(actor))


def _parse_course_id(raw) -> int | None:
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return -1


def _actor_can_upload_user_image(
    actor: User, subject: User, image_type: str, course_id_raw
) -> tuple[bool, str | None, int | None]:
    """
    Return (allowed, bad_request_message, not_found_course_id).
    When course_id is provided, only the course-scoped path applies.
    """
    course_id = _parse_course_id(course_id_raw)
    if course_id is not None:
        if course_id < 0:
            return False, "course_id must be an integer.", None
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return False, None, course_id
        if not user_can_access_course(actor, course):
            return False, None, None
        if not user_is_enrolled_student(course, subject):
            return False, "Student is not enrolled in this course.", None
        if course_staff_can_upload_student_image(actor, course, subject):
            return True, None, None
        return False, None, None

    if actor.id == subject.id and image_type in STEWARD_IMAGE_TYPES:
        return True, None, None
    if _require_upload_permission(actor, image_type):
        return True, None, None
    return False, None, None


class UserImageListCreateView(RBACView):
    name = "User images list/create"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"
    pagination_class = CustomPagination

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        image_type = _parse_image_type(request.query_params.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not user_can_access_user(actor, subject):
            return self.forbidden("Not allowed for this user.")
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        qs = (
            UserImage.objects.filter(user=subject, image_type=image_type)
            .select_related("uploaded_by")
            .order_by("-created_at")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = UserImageSerializer(page, many=True)
        meta = paginator.get_paginated_response()
        return self.ok({"items": ser.data, **meta})

    def post(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        course_id_raw = request.data.get("course_id")
        course_id = _parse_course_id(course_id_raw)
        course_scoped_request = course_id is not None and course_id > 0
        if not user_can_access_user(actor, subject):
            if course_scoped_request:
                course = Course.objects.filter(pk=course_id).first()
                if course is None or not user_can_access_course(actor, course):
                    return self.forbidden("Not allowed for this user.")
            else:
                return self.forbidden("Not allowed for this user.")
        image_type = _parse_image_type(request.data.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        allowed, bad_request_message, missing_course_id = _actor_can_upload_user_image(
            actor, subject, image_type, course_id_raw
        )
        if not allowed:
            if bad_request_message:
                return self.bad_request(bad_request_message)
            if missing_course_id is not None:
                return self.not_found("Course not found.")
            return self.forbidden("Missing permission for this image type.")
        ser = UserImageSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        row = ser.save(user=subject, uploaded_by=actor)
        out = UserImageSerializer(row)
        return self.created(out.data)


class UserImageResolveView(RBACView):
    name = "User image resolve"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        image_type = _parse_image_type(request.query_params.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        check_user_read(actor, subject)
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        resolved = resolve_user_image(subject, image_type, expire=URL_EXPIRE)
        return self.ok(ResolvedUserImageSerializer.from_resolved(resolved))


class UserImageUrlsView(RBACView):
    name = "User image batch URLs"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: Request):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        body = request.data or {}
        raw_ids = body.get("user_ids")
        image_type = _parse_image_type(body.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        if not isinstance(raw_ids, list):
            return self.bad_request("user_ids must be a list.")
        if len(raw_ids) > MAX_BATCH:
            return self.bad_request(f"Maximum {MAX_BATCH} user_ids per request.")
        try:
            user_ids = [int(x) for x in raw_ids]
        except (TypeError, ValueError):
            return self.bad_request("user_ids must be integers.")
        users = {
            u.id: u
            for u in User.objects.filter(pk__in=user_ids).only("id", "id_photo")
        }
        urls: dict[str, str | None] = {}
        sources: dict[str, str | None] = {}
        for uid in user_ids:
            target = users.get(uid)
            if target is None or not user_can_access_user(actor, target):
                continue
            resolved = resolve_user_image(target, image_type, expire=URL_EXPIRE)
            urls[str(uid)] = resolved.url if resolved else None
            sources[str(uid)] = resolved.source if resolved else None
        return self.ok({"urls": urls, "sources": sources})
