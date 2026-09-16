import copy

from django.db import IntegrityError
from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_documents.document import new_empty_document, next_untitled_name, validate_document
from app_documents.models import DocumentTemplate


def visible_queryset(user) -> QuerySet:
    if not isinstance(user, User):
        return DocumentTemplate.objects.filter(scope=DocumentTemplate.Scope.ORG)
    return DocumentTemplate.objects.filter(
        Q(scope=DocumentTemplate.Scope.ORG) | Q(owner_id=user.pk)
    )


def get_template_for(user, template_id) -> DocumentTemplate | None:
    return visible_queryset(user).filter(pk=template_id).first()


def derived_status(template: DocumentTemplate) -> str:
    if (
        template.published_document is not None
        and template.published_document == template.document
    ):
        return "published"
    return "draft"


def _existing_names(*, scope: str, owner) -> list[str]:
    qs = DocumentTemplate.objects.filter(scope=scope)
    if scope == DocumentTemplate.Scope.USER:
        qs = qs.filter(owner=owner)
    return list(qs.values_list("name", flat=True))


def _name_taken(*, scope: str, owner, name: str, exclude_id=None) -> bool:
    qs = DocumentTemplate.objects.filter(scope=scope, name__iexact=name)
    if scope == DocumentTemplate.Scope.USER:
        qs = qs.filter(owner=owner)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


def create_document_template(*, scope, name, actor) -> DocumentTemplate:
    if scope not in (DocumentTemplate.Scope.ORG, DocumentTemplate.Scope.USER):
        raise ValidationError({"scope": "Must be org or user."})
    owner = actor if scope == DocumentTemplate.Scope.USER else None
    existing = _existing_names(scope=scope, owner=owner)
    resolved = (name or "").strip() or next_untitled_name(existing)
    if _name_taken(scope=scope, owner=owner, name=resolved):
        raise ValidationError({"name": "A template with this name already exists."})
    try:
        return DocumentTemplate.objects.create(
            name=resolved,
            scope=scope,
            owner=owner,
            document=new_empty_document(),
            published_document=None,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise ValidationError(
            {"name": "A template with this name already exists."}
        ) from exc


def save_document_template(
    template: DocumentTemplate,
    *,
    name=None,
    document=None,
) -> DocumentTemplate:
    if document is not None:
        validate_document(document)
        template.document = document
    if name is not None:
        trimmed = str(name).strip()
        if not trimmed:
            raise ValidationError({"name": "Name is required."})
        template.name = trimmed
    try:
        template.save()
    except IntegrityError as exc:
        raise ValidationError(
            {"name": "A template with this name already exists."}
        ) from exc
    return template


def publish_document_template(template: DocumentTemplate) -> DocumentTemplate:
    validate_document(template.document, for_publish=True)
    template.published_document = copy.deepcopy(template.document)
    template.save(update_fields=["published_document", "updated_at"])
    return template


def duplicate_to_private(template: DocumentTemplate, actor) -> DocumentTemplate:
    if template.scope != DocumentTemplate.Scope.ORG:
        raise ValidationError({"scope": "Only org templates can be duplicated."})
    existing = _existing_names(scope=DocumentTemplate.Scope.USER, owner=actor)
    resolved = template.name
    if _name_taken(scope=DocumentTemplate.Scope.USER, owner=actor, name=resolved):
        resolved = next_untitled_name(existing)
    try:
        return DocumentTemplate.objects.create(
            name=resolved,
            scope=DocumentTemplate.Scope.USER,
            owner=actor,
            document=copy.deepcopy(template.document),
            published_document=None,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise ValidationError(
            {"name": "A template with this name already exists."}
        ) from exc


def promote_to_org(template: DocumentTemplate, actor) -> DocumentTemplate:
    if template.scope != DocumentTemplate.Scope.USER:
        raise ValidationError({"scope": "Only private templates can be promoted."})
    if template.owner_id != getattr(actor, "id", None):
        raise ValidationError({"owner": "Only the owner can promote this template."})
    if _name_taken(scope=DocumentTemplate.Scope.ORG, owner=None, name=template.name):
        raise ValidationError({"name": "A template with this name already exists."})
    try:
        return DocumentTemplate.objects.create(
            name=template.name,
            scope=DocumentTemplate.Scope.ORG,
            owner=None,
            document=copy.deepcopy(template.document),
            published_document=None,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise ValidationError(
            {"name": "A template with this name already exists."}
        ) from exc
