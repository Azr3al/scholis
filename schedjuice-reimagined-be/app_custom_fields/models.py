"""Field definitions (tenant policy schema) and CustomDataMixin for models.

Indexing note (hot filterable JSON paths): add expression B-tree indexes in
migrations when specific FieldDefinition.is_filterable keys need range/equality
performance. Baseline GIN jsonb_path_ops on custom_data is defined on User.
"""

from django.contrib.postgres.fields import ArrayField
from django.db import models

from app_custom_fields.constants import (
    FILLED_BY_BOTH,
    FILLED_BY_CHOICES,
    REQUIRED_AT_CHOICES,
    REQUIRED_AT_NEVER,
    SOURCE_CHOICES,
    SOURCE_CUSTOM,
)
from utilitas.models import BaseModel


class CustomDataMixin(models.Model):
    """Adds tenant-configurable JSONB storage; use with identical schema per tenant."""

    custom_data = models.JSONField(default=dict, blank=True)

    class Meta:
        abstract = True


class FieldGroup(BaseModel):
    """Tenant-defined section that organizes fields on forms and detail views."""

    entity_type = models.CharField(max_length=128, db_index=True)
    name = models.CharField(max_length=255)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.entity_type}:{self.name}"


class FieldDefinition(BaseModel):
    class FieldType(models.TextChoices):
        TEXT = "text", "text"
        TEXTAREA = "textarea", "textarea"
        NUMBER = "number", "number"
        DATE = "date", "date"
        DATETIME = "datetime", "datetime"
        BOOLEAN = "boolean", "boolean"
        CHOICE = "choice", "choice"
        MULTICHOICE = "multichoice", "multichoice"
        EMAIL = "email", "email"
        URL = "url", "url"
        ATTACHMENT = "attachment", "attachment"

    class FormInputMode(models.TextChoices):
        EDITABLE = "editable", "editable"
        READ_ONLY = "read_only", "read_only"

    source = models.CharField(
        max_length=16, choices=SOURCE_CHOICES, default=SOURCE_CUSTOM, db_index=True
    )
    entity_type = models.CharField(max_length=128, db_index=True)
    field_key = models.SlugField(max_length=100)
    field_label = models.CharField(max_length=255)
    # Null for builtin rows: the registry is authoritative for type/choices.
    field_type = models.CharField(
        max_length=32, choices=FieldType.choices, null=True, blank=True
    )
    is_required = models.BooleanField(default=False)
    is_filterable = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    choices = models.JSONField(
        null=True,
        blank=True,
        help_text='For choice/multichoice: [{"value": "...", "label": "..."}, ...]',
    )
    validation_rules = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    # Policy columns
    required_at = models.CharField(
        max_length=24, choices=REQUIRED_AT_CHOICES, default=REQUIRED_AT_NEVER
    )
    # Unconstrained at the DB/model level (cannot import User.UserRole here without a
    # circular import); validated against User.UserRole in the serializer. Empty = all roles.
    roles = ArrayField(models.CharField(max_length=128), default=list, blank=True)
    filled_by = models.CharField(
        max_length=16, choices=FILLED_BY_CHOICES, default=FILLED_BY_BOTH
    )
    group = models.ForeignKey(
        "app_custom_fields.FieldGroup",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fields",
    )

    show_on_create = models.BooleanField(
        default=True,
        help_text="Show on create forms (subject to filled_by when on form).",
    )
    show_on_edit = models.BooleanField(
        default=True,
        help_text="Show on edit forms (subject to filled_by when on form).",
    )
    show_on_detail = models.BooleanField(
        default=True,
        help_text="Show on read-only detail views.",
    )
    # Retained for the Phase 1 compatibility window; serializer derives it from filled_by.
    form_input_mode = models.CharField(
        max_length=16,
        choices=FormInputMode.choices,
        default=FormInputMode.EDITABLE,
        help_text="Deprecated; derived from filled_by. Kept until FE migrates.",
    )

    class Meta:
        db_table = "app_custom_fields_customfielddefinition"
        ordering = ("sort_order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("entity_type", "field_key"),
                condition=models.Q(is_active=True),
                name="uniq_customfielddefinition_entity_key_active",
            ),
            models.UniqueConstraint(
                fields=("entity_type", "field_label"),
                condition=models.Q(is_active=True),
                name="uniq_customfielddefinition_entity_label_active",
            ),
        ]

    def __str__(self):
        return f"{self.entity_type}:{self.field_key} ({self.field_type or self.source})"


class CustomFieldAttachment(BaseModel):
    """Binds an uploaded Attachment to the field it was uploaded for and the uploader."""

    attachment = models.OneToOneField(
        "app_attachment.Attachment",
        on_delete=models.CASCADE,
        related_name="custom_field_link",
    )
    entity_type = models.CharField(max_length=128, db_index=True)
    field_key = models.SlugField(max_length=100, db_index=True)
    uploaded_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )

    class Meta:
        db_table = "app_custom_fields_customfieldattachment"
