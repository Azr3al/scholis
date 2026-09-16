from __future__ import annotations

from rest_framework import serializers
from rest_framework.views import Request

from app_auth.field_stewardship import user_write_mode
from app_auth.models import User, UserFieldChange
from app_auth.user_scoping import user_can_access_user
from app_course.course_scoping import acting_user
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from utilitas.pagination import CustomPagination


class UserFieldChangeSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = UserFieldChange
        fields = (
            "id",
            "field_key",
            "old_value",
            "new_value",
            "source",
            "created_at",
            "actor_id",
            "actor_name",
        )
        read_only_fields = fields

    def get_actor_name(self, obj) -> str | None:
        actor = obj.actor
        return None if actor is None else actor.name


def _can_view_field_history(actor: User, target: User) -> bool:
    if not user_can_access_user(actor, target):
        return False
    if actor.id == target.id:
        return True
    return user_write_mode(actor, target) in {"full", "steward"}


class UserFieldChangeListView(RBACView):
    name = "User field changes"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"
    pagination_class = CustomPagination

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not _can_view_field_history(actor, subject):
            return self.forbidden("Not allowed for this user.")
        qs = (
            UserFieldChange.objects.filter(user=subject)
            .select_related("actor")
            .order_by("-created_at")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = UserFieldChangeSerializer(page, many=True)
        meta = paginator.get_paginated_response()
        return self.ok({"items": ser.data, **meta})
