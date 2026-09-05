from django.urls import path

from app_attachment import views

urlpatterns = [
    path("attachments", views.AttachmentListView.as_view(), name="attachment-upload"),
    path("attachments/search", views.AttachmentSearchView.as_view(), name="attachment-search"),
    path("attachments/<int:obj_id>", views.AttachmentDetailsView.as_view(), name="attachment-details"),
]
