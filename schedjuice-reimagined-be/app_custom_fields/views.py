from rest_framework.views import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_custom_fields.constants import ALLOWED_DEFINITION_ENTITY_TYPES, ENTITY_TYPE_USER
from app_custom_fields.form_config import build_form_config
from app_custom_fields.models import FieldDefinition, FieldGroup
from app_custom_fields.reorder import ReorderError, apply_reorder
from app_custom_fields.serializers import (
    CustomFieldDefinitionSerializer,
    FieldGroupSerializer,
)
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView


class CustomFieldDefinitionListView(RBACListView):
    model = FieldDefinition
    serializer = CustomFieldDefinitionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "user.view", "POST": "form.manage"}

    def get_queryset(
        self,
        request: Request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        filter_params = {**filter_params, "is_active": True}
        return super().get_queryset(
            request,
            filter_params,
            exclude_params,
            is_csv,
            fields,
            sorts,
            expand,
            filter_ids,
            chained_filter_params,
        )


class CustomFieldDefinitionSearchView(RBACSearchView):
    """POST search for admin data tables (same active-only scope as list)."""

    model = FieldDefinition
    serializer = CustomFieldDefinitionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.view"}

    def get_queryset(
        self,
        request: Request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        filter_params = {**filter_params, "is_active": True}
        return super().get_queryset(
            request,
            filter_params,
            exclude_params,
            is_csv,
            fields,
            sorts,
            expand,
            filter_ids,
            chained_filter_params,
        )


class CustomFieldDefinitionDetailsView(RBACDetailsView):
    model = FieldDefinition
    serializer = CustomFieldDefinitionSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "user.view",
        "PUT": "form.manage",
        "PATCH": "form.manage",
        "DELETE": "form.manage",
    }

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = []
        return (
            FieldDefinition.objects.filter(pk=obj_id, is_active=True)
            .prefetch_related(*prefetch_fields)
            .first()
        )

    def delete(self, request, obj_id: int):
        obj = FieldDefinition.objects.filter(pk=obj_id).first()
        if obj is None:
            return self.send_not_found(obj_id)
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        return self.send_response(
            False,
            "deleted",
            {"data": CustomFieldDefinitionSerializer(obj, context={"request": request}).data},
            status=200,
        )


class FieldGroupListView(RBACListView):
    model = FieldGroup
    serializer = FieldGroupSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "user.view", "POST": "form.manage"}

    def get_queryset(
        self,
        request: Request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        filter_params = {**filter_params, "is_active": True}
        return super().get_queryset(
            request, filter_params, exclude_params, is_csv, fields, sorts, expand,
            filter_ids, chained_filter_params,
        )


class FieldGroupSearchView(RBACSearchView):
    model = FieldGroup
    serializer = FieldGroupSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.view"}

    def get_queryset(
        self,
        request: Request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        filter_params = {**filter_params, "is_active": True}
        return super().get_queryset(
            request, filter_params, exclude_params, is_csv, fields, sorts, expand,
            filter_ids, chained_filter_params,
        )


class FieldGroupDetailsView(RBACDetailsView):
    model = FieldGroup
    serializer = FieldGroupSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "user.view",
        "PUT": "form.manage",
        "PATCH": "form.manage",
        "DELETE": "form.manage",
    }

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = []
        return (
            FieldGroup.objects.filter(pk=obj_id, is_active=True)
            .prefetch_related(*prefetch_fields)
            .first()
        )

    def delete(self, request, obj_id: int):
        obj = FieldGroup.objects.filter(pk=obj_id).first()
        if obj is None:
            return self.send_not_found(obj_id)
        obj.is_active = False
        obj.save(update_fields=["is_active", "updated_at"])
        return self.send_response(
            False,
            "deleted",
            {"data": FieldGroupSerializer(obj, context={"request": request}).data},
            status=200,
        )


class CustomFieldDefinitionReorderView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "form.manage"}

    def post(self, request: Request):
        entity_type = request.data.get("entity_type", ENTITY_TYPE_USER)
        try:
            count = apply_reorder(
                model=FieldDefinition,
                entity_type=entity_type,
                items=request.data.get("items"),
                group_model=FieldGroup,
                allow_group=True,
            )
        except ReorderError as exc:
            return self.bad_request(str(exc))
        return self.ok({"updated": count})


class FieldGroupReorderView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "form.manage"}

    def post(self, request: Request):
        entity_type = request.data.get("entity_type", ENTITY_TYPE_USER)
        try:
            count = apply_reorder(
                model=FieldGroup,
                entity_type=entity_type,
                items=request.data.get("items"),
                group_model=FieldGroup,
                allow_group=False,
            )
        except ReorderError as exc:
            return self.bad_request(str(exc))
        return self.ok({"updated": count})


class FormConfigView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request):
        entity_type = request.query_params.get("entity_type", ENTITY_TYPE_USER)
        if entity_type not in ALLOWED_DEFINITION_ENTITY_TYPES:
            return self.bad_request("Unsupported entity_type.")
        surface = request.query_params.get("surface", "edit")
        if surface not in ("create", "edit", "detail"):
            return self.bad_request("surface must be create, edit, or detail.")
        roles_param = request.query_params.get("roles", "")
        roles = [r for r in roles_param.split(",") if r]
        config = build_form_config(entity_type, surface=surface, roles=roles)
        return self.ok(config)
