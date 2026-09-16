from django.apps import AppConfig


class AppFinanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_finance"

    def ready(self):
        import app_finance.signals  # noqa: F401
