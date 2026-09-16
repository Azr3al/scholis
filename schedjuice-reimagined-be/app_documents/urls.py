from django.urls import path

from app_documents import views

urlpatterns = [
    path(
        "document-templates",
        views.DocumentTemplateListView.as_view(),
        name="document-template-list",
    ),
    path(
        "document-templates/<int:obj_id>",
        views.DocumentTemplateDetailsView.as_view(),
        name="document-template-detail",
    ),
    path(
        "document-templates/<int:obj_id>/publish",
        views.DocumentTemplatePublishView.as_view(),
        name="document-template-publish",
    ),
    path(
        "document-templates/<int:obj_id>/duplicate",
        views.DocumentTemplateDuplicateView.as_view(),
        name="document-template-duplicate",
    ),
    path(
        "document-templates/<int:obj_id>/promote",
        views.DocumentTemplatePromoteView.as_view(),
        name="document-template-promote",
    ),
    path(
        "document-templates/<int:obj_id>/assets",
        views.DocumentTemplateAssetView.as_view(),
        name="document-template-assets",
    ),
]
