import os

from django.db import connection, models
from django.db.models import Q, UniqueConstraint
from django.db.models.functions import Lower

from schedjuice_backend.storages import PublicMediaStorage
from utilitas.models import BaseModel


def get_upload_to_path_for_document_templates(instance, filename):
    schema = getattr(connection, "schema_name", "public")
    return os.path.join(schema, "document_templates", filename)


class DocumentTemplate(BaseModel):
    class Scope(models.TextChoices):
        ORG = "org", "org"
        USER = "user", "user"

    name = models.CharField(max_length=128)
    scope = models.CharField(max_length=8, choices=Scope.choices)
    owner = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
    )
    document = models.JSONField(default=dict)
    published_document = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                Lower("name"),
                condition=Q(scope="org"),
                name="uniq_document_template_org_name",
            ),
            UniqueConstraint(
                "owner",
                Lower("name"),
                condition=Q(scope="user"),
                name="uniq_document_template_user_name",
            ),
            models.CheckConstraint(
                check=(
                    Q(scope="org", owner__isnull=True)
                    | Q(scope="user", owner__isnull=False)
                ),
                name="document_template_scope_owner_consistency",
            ),
        ]
        ordering = ["name"]


class DocumentTemplateAsset(BaseModel):
    template = models.ForeignKey(
        DocumentTemplate,
        on_delete=models.CASCADE,
        related_name="assets",
    )
    image = models.ImageField(
        upload_to=get_upload_to_path_for_document_templates,
        storage=PublicMediaStorage(),
    )
