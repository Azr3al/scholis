from django.urls import path
from app_tools import views

urlpatterns = [
    path("detect-ai", views.AIDetectorView.as_view(), name="detect-ai"),
    path("email-templates", views.EmailTemplateListView.as_view()),
    path("email-templates/<int:obj_id>", views.EmailTemplateDetailsView.as_view()),
    path("email-templates/<int:obj_id>/send", views.EmailTemplateSendView.as_view()),
    path("email-templates/search", views.EmailTemplateSearchView.as_view()),
    path("user-emails", views.UserEmailListView.as_view()),
    path("user-emails/<int:obj_id>", views.UserEmailDetailsView.as_view()),
    path("user-emails/<int:obj_id>/send", views.UserEmailSendView.as_view()),
    path("user-emails/search", views.UserEmailSearchView.as_view()),
    path("user-emails/bulk-update", views.UserEmailBulkUpdateView.as_view()),
    path("full-text-search", views.FullTextSearch.as_view(), name="full-text-search"),
    path("birthdays", views.BirthdayView.as_view(), name="birthdays"),

]
