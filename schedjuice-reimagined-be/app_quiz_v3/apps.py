from django.apps import AppConfig


class AppQuizV3Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_quiz_v3"
    label = "app_quiz_v3"
    verbose_name = "Quiz V3"

    def ready(self):
        import app_quiz_v3.signals  # noqa: F401
