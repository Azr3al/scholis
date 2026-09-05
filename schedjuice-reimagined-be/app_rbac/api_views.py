from django.db import connection

from rest_framework.exceptions import ValidationError

from app_rbac import catalog
from app_rbac.models import Role, RolePermission
from app_rbac.realtime import broadcast_rbac_updated_to_tenant
from app_rbac.views import RBACView


class CatalogView(RBACView):
    required_permissions = {"GET": "rbac.view"}

    def get(self, request):
        data = [
            {
                "code": p.code,
                "label": p.label,
                "sentence": p.sentence,
                "data_class": p.data_class,
                "tier": p.tier,
                "sensitive": p.sensitive,
            }
            for p in catalog.ALL_PERMISSIONS
            if p.code in catalog.TENANT_MATRIX_CODES
        ]
        return self.ok(data)


class RoleListCreateView(RBACView):
    required_permissions = {"GET": "rbac.view", "POST": "rbac.manage"}

    def get(self, request):
        roles = [
            {
                "id": r.id,
                "slug": r.slug,
                "display_name": r.display_name,
                "is_system": r.is_system,
                "is_assignable": r.is_assignable,
                "codes": list(
                    r.role_permissions.values_list("permission_code", flat=True)
                ),
            }
            for r in Role.objects.filter(is_assignable=True).prefetch_related(
                "role_permissions"
            )
        ]
        return self.ok(roles)

    def post(self, request):
        slug = (request.data.get("slug") or "").strip()
        name = (request.data.get("display_name") or "").strip()
        if not slug or not name:
            raise ValidationError("slug and display_name required")
        if Role.objects.filter(slug=slug).exists():
            raise ValidationError("slug already exists")
        role = Role.objects.create(
            slug=slug, display_name=name, is_system=False
        )
        return self.ok({"id": role.id, "slug": role.slug})


class RoleDetailView(RBACView):
    required_permissions = {"PATCH": "rbac.manage", "DELETE": "rbac.manage"}

    def patch(self, request, role_id):
        role = Role.objects.get(id=role_id)
        if "display_name" in request.data:
            role.display_name = request.data["display_name"]
        if "description" in request.data:
            role.description = request.data["description"]
        role.save()
        return self.ok({"id": role.id})

    def delete(self, request, role_id):
        role = Role.objects.get(id=role_id)
        if role.is_system:
            raise ValidationError("System roles cannot be deleted")
        role.delete()
        return self.ok({"deleted": True})


class RolePermissionsView(RBACView):
    required_permissions = {"PUT": "rbac.manage"}

    def put(self, request, role_id):
        role = Role.objects.get(id=role_id)
        codes = set(request.data.get("codes") or [])
        invalid = codes - catalog.TENANT_MATRIX_CODES
        if invalid:
            raise ValidationError(f"Not tenant-editable: {sorted(invalid)}")
        RolePermission.objects.filter(role=role).delete()
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_code=c) for c in codes]
        )
        schema = getattr(connection, "schema_name", None) or "public"
        broadcast_rbac_updated_to_tenant(schema)
        return self.ok({"id": role.id, "codes": sorted(codes)})
