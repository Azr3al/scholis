from django.db import transaction
from rest_framework.request import Request
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization import models
from app_organization.id_card_template_serializers import IdCardTemplateSerializer
from app_rbac.views import RBACDetailsView, RBACListView, RBACView
from utilitas.views import TenantBoundJWTStatelessAuthentication


def _get_org(org_id: int):
    with schema_context(get_public_schema_name()):
        return models.Organization.objects.filter(pk=org_id).first()


def _get_template(org_id: int, template_id: int):
    with schema_context(get_public_schema_name()):
        return (
            models.IdCardTemplate.objects.filter(
                pk=template_id,
                organization_id=org_id,
            )
            .select_related("organization")
            .first()
        )


class IdCardTemplateListView(RBACListView):
    name = "Organization ID card template list"
    model = models.IdCardTemplate
    serializer = IdCardTemplateSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "org.configure", "POST": "org.configure"}

    def get(self, request: Request, org_id: int):
        org = _get_org(org_id)
        if org is None:
            return self.send_not_found(org_id)
        audience = request.query_params.get("audience")
        with schema_context(get_public_schema_name()):
            qs = models.IdCardTemplate.objects.filter(organization_id=org_id)
            if audience in (
                models.IdCardTemplate.Audience.STUDENT,
                models.IdCardTemplate.Audience.STAFF,
            ):
                qs = qs.filter(audience=audience)
            qs = qs.order_by("name")
            ser = IdCardTemplateSerializer(
                qs,
                many=True,
                context={"request": request},
            )
        return self.send_response(False, "ok", {"data": ser.data})

    def post(self, request: Request, org_id: int):
        org = _get_org(org_id)
        if org is None:
            return self.send_not_found(org_id)
        data = request.data.copy()
        data["organization"] = org_id
        ser = IdCardTemplateSerializer(data=data, context={"request": request})
        if not ser.is_valid():
            return self.send_response(
                True,
                "invalid_data",
                {"data": ser.errors},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            template = ser.save(organization=org)
        return self.send_response(
            False,
            "created",
            {
                "data": IdCardTemplateSerializer(
                    template,
                    context={"request": request},
                ).data
            },
            status=201,
        )


class IdCardTemplateDetailsView(RBACDetailsView):
    name = "Organization ID card template details"
    model = models.IdCardTemplate
    serializer = IdCardTemplateSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "org.configure",
        "PATCH": "org.configure",
        "DELETE": "org.configure",
    }

    def get(self, request: Request, org_id: int, template_id: int):
        template = _get_template(org_id, template_id)
        if template is None:
            return self.send_not_found(template_id)
        ser = IdCardTemplateSerializer(template, context={"request": request})
        return self.send_response(False, "ok", {"data": ser.data})

    def patch(self, request: Request, org_id: int, template_id: int):
        template = _get_template(org_id, template_id)
        if template is None:
            return self.send_not_found(template_id)
        ser = IdCardTemplateSerializer(
            template,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if not ser.is_valid():
            return self.send_response(
                True,
                "invalid_data",
                {"data": ser.errors},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            template = ser.save()
        return self.send_response(
            False,
            "updated",
            {
                "data": IdCardTemplateSerializer(
                    template,
                    context={"request": request},
                ).data
            },
        )

    def delete(self, request: Request, org_id: int, template_id: int):
        template = _get_template(org_id, template_id)
        if template is None:
            return self.send_not_found(template_id)
        with schema_context(get_public_schema_name()):
            org = template.organization
            remaining = models.IdCardTemplate.objects.filter(
                organization_id=org_id,
                audience=template.audience,
            ).exclude(pk=template_id)
            if not remaining.exists():
                return self.send_response(
                    True,
                    "cannot_delete_last_template",
                    {
                        "details": (
                            "Cannot delete the only template for this audience."
                        )
                    },
                    status=400,
                )
            if org.active_student_id_card_template_id == template_id:
                org.active_student_id_card_template = None
                org.save(update_fields=["active_student_id_card_template"])
            if org.active_staff_id_card_template_id == template_id:
                org.active_staff_id_card_template = None
                org.save(update_fields=["active_staff_id_card_template"])
            template.delete()
        return self.send_response(False, "deleted", {}, status=204)

    def put(self, request: Request, org_id: int, template_id: int):
        return self.send_response(True, "method_not_allowed", {}, status=405)


class IdCardTemplateActivateView(RBACView):
    name = "Activate organization ID card template"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "org.configure"}

    def post(self, request: Request, org_id: int, template_id: int):
        template = _get_template(org_id, template_id)
        if template is None:
            return self.send_not_found(template_id)
        with schema_context(get_public_schema_name()):
            org = template.organization
            if org.id != org_id:
                return self.send_response(
                    True,
                    "forbidden",
                    {"details": "Template does not belong to this organization."},
                    status=403,
                )
            with transaction.atomic():
                if template.audience == models.IdCardTemplate.Audience.STUDENT:
                    org.active_student_id_card_template = template
                    org.save(update_fields=["active_student_id_card_template"])
                else:
                    org.active_staff_id_card_template = template
                    org.save(update_fields=["active_staff_id_card_template"])
            ser = IdCardTemplateSerializer(template, context={"request": request})
        return self.send_response(False, "activated", {"data": ser.data})
