from django.urls import path

from app_custom_fields.attachments import (
    CustomFieldAttachmentDownloadUrlView,
    CustomFieldAttachmentUploadView,
)
from app_custom_fields import views

urlpatterns = [
    path(
        "custom-field-definitions/search",
        views.CustomFieldDefinitionSearchView.as_view(),
        name="custom-field-definition-search",
    ),
    path(
        "custom-field-definitions/reorder",
        views.CustomFieldDefinitionReorderView.as_view(),
        name="custom-field-definition-reorder",
    ),
    path(
        "custom-field-definitions",
        views.CustomFieldDefinitionListView.as_view(),
        name="custom-field-definition-list",
    ),
    path(
        "custom-field-definitions/<int:obj_id>",
        views.CustomFieldDefinitionDetailsView.as_view(),
        name="custom-field-definition-details",
    ),
    path(
        "field-groups/search",
        views.FieldGroupSearchView.as_view(),
        name="field-group-search",
    ),
    path(
        "field-groups/reorder",
        views.FieldGroupReorderView.as_view(),
        name="field-group-reorder",
    ),
    path(
        "field-groups",
        views.FieldGroupListView.as_view(),
        name="field-group-list",
    ),
    path(
        "field-groups/<int:obj_id>",
        views.FieldGroupDetailsView.as_view(),
        name="field-group-details",
    ),
    path(
        "form-config",
        views.FormConfigView.as_view(),
        name="form-config",
    ),
    path(
        "custom-field-attachments",
        CustomFieldAttachmentUploadView.as_view(),
        name="custom-field-attachment-upload",
    ),
    path(
        "custom-field-attachments/<int:attachment_id>/download-url",
        CustomFieldAttachmentDownloadUrlView.as_view(),
        name="custom-field-attachment-download-url",
    ),
]
