import json

from rest_framework.exceptions import ValidationError

from app_course.course_scoping import acting_user
from app_documents import models, serializers, services
from app_documents.models import DocumentTemplateAsset
from app_rbac.views import RBACView


def _parse_document(raw):
    if raw is None or raw == "":
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValidationError({"document": "Must be valid JSON."}) from exc
        if not isinstance(parsed, dict):
            raise ValidationError({"document": "Must be an object."})
        return parsed
    raise ValidationError({"document": "Must be an object."})


def _payload(template, request):
    return serializers.DocumentTemplateSerializer(
        template, context={"request": request}
    ).data


class DocumentTemplateListView(RBACView):
    name = "Document template list"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {
        "GET": "document_template.manage",
        "POST": "document_template.manage",
    }

    def get(self, request):
        qs = services.visible_queryset(acting_user(request)).order_by("name")
        return self.ok(
            serializers.DocumentTemplateSerializer(
                qs, many=True, context={"request": request}
            ).data
        )

    def post(self, request):
        body = request.data or {}
        try:
            template = services.create_document_template(
                scope=body.get("scope"),
                name=body.get("name"),
                actor=acting_user(request),
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.created(_payload(template, request))


class DocumentTemplateDetailsView(RBACView):
    name = "Document template details"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {
        "GET": "document_template.manage",
        "PATCH": "document_template.manage",
        "DELETE": "document_template.manage",
    }

    def _template(self, request, obj_id: int):
        return services.get_template_for(acting_user(request), obj_id)

    def get(self, request, obj_id: int):
        template = self._template(request, obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        return self.ok(_payload(template, request))

    def patch(self, request, obj_id: int):
        template = self._template(request, obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        body = request.data or {}
        try:
            document = (
                _parse_document(body.get("document")) if "document" in body else None
            )
            template = services.save_document_template(
                template,
                name=body.get("name") if "name" in body else None,
                document=document,
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(_payload(template, request))

    def delete(self, request, obj_id: int):
        template = self._template(request, obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        template.delete()
        return self.deleted()


class DocumentTemplatePublishView(RBACView):
    name = "Document template publish"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {"POST": "document_template.manage"}

    def post(self, request, obj_id: int):
        template = services.get_template_for(acting_user(request), obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        try:
            template = services.publish_document_template(template)
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(_payload(template, request))


class DocumentTemplateDuplicateView(RBACView):
    name = "Document template duplicate"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {"POST": "document_template.manage"}

    def post(self, request, obj_id: int):
        template = services.get_template_for(acting_user(request), obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        try:
            copy = services.duplicate_to_private(template, acting_user(request))
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.created(_payload(copy, request))


class DocumentTemplatePromoteView(RBACView):
    name = "Document template promote"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {"POST": "document_template.manage"}

    def post(self, request, obj_id: int):
        template = services.get_template_for(acting_user(request), obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        try:
            promoted = services.promote_to_org(template, acting_user(request))
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.created(_payload(promoted, request))


class DocumentTemplateAssetView(RBACView):
    name = "Document template assets"
    model = models.DocumentTemplate
    serializer = serializers.DocumentTemplateSerializer
    required_permissions = {"POST": "document_template.manage"}

    def post(self, request, obj_id: int):
        template = services.get_template_for(acting_user(request), obj_id)
        if template is None:
            return self.not_found("Document template not found.")
        upload = request.FILES.get("file")
        if upload is None:
            return self.validation_error({"file": "File is required."})
        asset = DocumentTemplateAsset.objects.create(template=template, image=upload)
        url = asset.image.url
        url = request.build_absolute_uri(url)
        return self.created({"url": url})
