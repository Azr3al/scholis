from django.apps import AppConfig


class AppUtilsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_utils"

    def ready(self):
        try:
            import app_utils.push_fanout_tasks  # noqa: F401 — register Celery tasks
            from app_utils.expo_compat import patch_expo_notifications

            patch_expo_notifications()
        except ImportError:
            pass  # expo_notifications not installed
