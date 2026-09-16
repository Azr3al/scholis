from django.apps import AppConfig


class AppHrConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_hr"

    def ready(self):
        from app_hr import signals  # noqa: F401
