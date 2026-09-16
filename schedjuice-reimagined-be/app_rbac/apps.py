# app_rbac/apps.py
from django.apps import AppConfig


class AppRbacConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_rbac"

    def ready(self):
        from app_rbac import signals  # noqa: F401
